import { supabase } from "@/integrations/supabase/clientRuntime";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { createJobStore, useJob, hashKey } from "./jobStore";
import { ensureOpenAISupportedFormat, toAbsoluteImageUrl } from "@/lib/imageConvert";
import {
  normalizeUpscaleTargetSize,
  upscaleTargetLabel,
  type UpscaleConfig,
} from "./upscaleJobs";

export type BulkItemStatus = "pending" | "loading" | "done" | "error";

export interface BulkItem {
  src: string;
  status: BulkItemStatus;
  resultUrl?: string;
  meta?: string;
  error?: string;
  startedAt?: number;
  elapsedMs?: number;
}

export interface BulkUpscaleJob {
  status: "running" | "done";
  config: UpscaleConfig;
  startedAt: number;
  finishedAt?: number;
  items: BulkItem[];
}

interface FunctionErrorContext {
  json?: () => Promise<unknown>;
  clone?: () => FunctionErrorContext;
  error?: unknown;
}

interface FunctionErrorLike {
  message?: unknown;
  context?: FunctionErrorContext;
}

interface PicsartUpscaleResponse {
  url?: string;
  factor?: number;
  requestedTarget?: number;
}

interface AiUpscaleResponse {
  url?: string;
  provider?: keyof typeof PROVIDER_LABELS;
  model?: string;
  outputSize?: string;
  requestedTarget?: number;
  details?: unknown;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const err = error as FunctionErrorLike;
  let message = typeof err.message === "string" ? err.message : fallback;
  try {
    const ctx = err.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await (typeof ctx.clone === "function" ? ctx.clone() : ctx).json();
      if (isRecord(body)) {
        if (Array.isArray(body.details) && body.details.length) message = body.details.join(" | ");
        else if (body.error) message = String(body.error);
      }
    } else if (ctx?.error) {
      message = String(ctx.error);
    }
  } catch {
    // keep the best message we already have
  }
  return message;
}

const store = createJobStore<BulkUpscaleJob>({
  storageKey: "lov:jobs:bulk-upscale",
  onInterruptedReload: (j) => {
    if (j.status !== "running") return j;
    const items = j.items.map((it) =>
      it.status === "loading" || it.status === "pending"
        ? {
            ...it,
            status: "error" as BulkItemStatus,
            error: "Interrupted by reload",
            elapsedMs: it.startedAt ? Date.now() - it.startedAt : 0,
          }
        : it,
    );
    return { ...j, status: "done", items, finishedAt: Date.now() };
  },
});

const inflight = new Set<string>();
const REQUEST_STAGGER_MS = 5_000;

function patchItem(jobId: string, src: string, patch: Partial<BulkItem>) {
  const job = store.get(jobId);
  if (!job) return;
  const items = job.items.map((it) => (it.src === src ? { ...it, ...patch } : it));
  store.set(jobId, { ...job, items });
}

async function runOne(jobId: string, src: string, config: UpscaleConfig) {
  const startedAt = Date.now();
  patchItem(jobId, src, { status: "loading", startedAt });
  try {
    const absoluteSrc = toAbsoluteImageUrl(src);
    let resultUrl: string;
    let meta: string;
    if (config.engine === "picsart") {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: {
          imageUrl: absoluteSrc,
          mode: config.mode,
          factor: config.factor,
          targetSize: config.targetSize,
          format: config.format,
          brand: config.brand,
          productSlug: config.productSlug,
        },
      });
      if (error) throw error;
      const result = data as PicsartUpscaleResponse | null;
      if (!result?.url) throw new Error("No result URL");
      resultUrl = result.url;
      meta = `PICSART · ${upscaleTargetLabel(result.requestedTarget ?? config.targetSize)} target · ${Number(result.factor ?? config.factor)}x · ${config.format}`;
    } else {
      const imgPayload = await ensureOpenAISupportedFormat(absoluteSrc);
      const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
        body: {
          ...imgPayload,
          targetSize: config.targetSize,
          extraInstructions: config.extraInstructions || undefined,
          brand: config.brand,
          productSlug: config.productSlug,
        },
      });
      if (error) throw error;
      const result = data as AiUpscaleResponse | null;
      if (!result?.url) {
        const details = Array.isArray(result?.details) ? result.details.join(" | ") : "";
        throw new Error(details || "No result URL");
      }
      const provider = result.provider;
      resultUrl = result.url;
      const targetLabel = upscaleTargetLabel(result.requestedTarget ?? config.targetSize);
      const sizeMeta = result.outputSize ? `${targetLabel} max · ${result.outputSize}` : `${targetLabel} max`;
      meta = `${provider ? PROVIDER_LABELS[provider] ?? provider : "AI"} · ${sizeMeta} · ${result.model ?? "model"}`;
    }
    patchItem(jobId, src, { status: "done", resultUrl, meta, elapsedMs: Date.now() - startedAt });
  } catch (e: unknown) {
    const msg = await functionErrorMessage(e, "Failed");
    patchItem(jobId, src, { status: "error", error: String(msg), elapsedMs: Date.now() - startedAt });
  }
}

export function bulkUpscaleJobIdFor(srcs: string[], productSlug?: string): string {
  if (productSlug) return `slug:${productSlug}`;
  const sorted = [...srcs].sort().join("|");
  return `hash:${hashKey(sorted)}`;
}

export async function startBulkUpscale(jobId: string, srcs: string[], config: UpscaleConfig): Promise<void> {
  if (inflight.has(jobId)) return;

  const resolvedConfig = { ...config, targetSize: normalizeUpscaleTargetSize(config.targetSize) };
  const items: BulkItem[] = srcs.map((src) => ({ src, status: "pending" as BulkItemStatus }));
  store.set(jobId, { status: "running", config: resolvedConfig, startedAt: Date.now(), items });
  inflight.add(jobId);

  try {
    const runners = srcs.map(async (src, idx) => {
      if (idx > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, idx * REQUEST_STAGGER_MS));
      }
      await runOne(jobId, src, resolvedConfig);
    });
    await Promise.all(runners);
  } finally {
    const cur = store.get(jobId);
    if (cur) store.set(jobId, { ...cur, status: "done", finishedAt: Date.now() });
    inflight.delete(jobId);
  }
}

export function dismissBulkUpscale(jobId: string) {
  store.remove(jobId);
}

export function useBulkUpscaleJob(jobId: string | null | undefined) {
  return useJob(store, jobId);
}

export const bulkUpscaleJobStore = store;
