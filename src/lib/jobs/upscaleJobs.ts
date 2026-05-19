import { supabase } from "@/integrations/supabase/clientRuntime";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { normalizeUpscaleTargetSize, upscaleTargetLabel, type UpscaleTargetSize } from "@/lib/upscaleTargets";
import { createJobStore, useJob } from "./jobStore";
import { logOperation } from "@/lib/logs";
import { ensureOpenAISupportedFormat, toAbsoluteImageUrl } from "@/lib/imageConvert";

export type UpscaleEngine = "picsart" | "ai";
export {
  DEFAULT_UPSCALE_TARGET_SIZE,
  UPSCALE_TARGET_OPTIONS,
  normalizeUpscaleTargetSize,
  pickPicsartFactorForTarget,
  upscaleTargetLabel,
  type UpscaleTargetSize,
} from "@/lib/upscaleTargets";

export interface UpscaleConfig {
  engine: UpscaleEngine;
  mode?: "standard" | "ultra";
  factor?: number;
  targetSize?: UpscaleTargetSize;
  format?: "JPG" | "PNG" | "WEBP";
  extraInstructions?: string;
  brand?: string;
  productSlug?: string;
}

export interface UpscaleJob {
  status: "running" | "done" | "error";
  config: UpscaleConfig;
  startedAt: number;
  finishedAt?: number;
  resultUrl?: string;
  meta?: string;
  error?: string;
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
        if (Array.isArray(body.details) && body.details.length) message = String(body.details[0]);
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

const store = createJobStore<UpscaleJob>({
  storageKey: "lov:jobs:upscale",
  onInterruptedReload: (j) =>
    j.status === "running"
      ? { ...j, status: "error", error: "Interrupted by reload", finishedAt: Date.now() }
      : j,
});

const inflight = new Set<string>();

export async function startUpscale(key: string, config: UpscaleConfig): Promise<void> {
  const existing = store.get(key);
  if (existing?.status === "running" && inflight.has(key)) return;

  const startedAt = Date.now();
  const resolvedConfig = { ...config, targetSize: normalizeUpscaleTargetSize(config.targetSize) };
  store.set(key, { status: "running", config: resolvedConfig, startedAt });
  inflight.add(key);

  try {
    const absoluteSrc = toAbsoluteImageUrl(key);
    if (resolvedConfig.engine === "picsart") {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: {
          imageUrl: absoluteSrc,
          mode: resolvedConfig.mode,
          factor: resolvedConfig.factor,
          targetSize: resolvedConfig.targetSize,
          format: resolvedConfig.format,
          brand: resolvedConfig.brand,
          productSlug: resolvedConfig.productSlug,
        },
      });
      if (error) throw error;
      const result = data as PicsartUpscaleResponse | null;
      if (!result?.url) throw new Error("No result URL");
      const usedFactor = Number(result.factor ?? resolvedConfig.factor);
      const targetLabel = upscaleTargetLabel(result.requestedTarget ?? resolvedConfig.targetSize);
      store.set(key, {
        status: "done",
        config: resolvedConfig,
        startedAt,
        finishedAt: Date.now(),
        resultUrl: result.url,
        meta: `PICSART · ${targetLabel} target · ${usedFactor}x · ${resolvedConfig.format}`,
      });
      logOperation({ category: "ai", operation: "upscale_image", status: "success", durationMs: Date.now() - startedAt, metadata: { engine: "picsart", mode: resolvedConfig.mode, factor: usedFactor, targetSize: resolvedConfig.targetSize, format: resolvedConfig.format } });
    } else {
      const imgPayload = await ensureOpenAISupportedFormat(absoluteSrc);
      const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
        body: {
          ...imgPayload,
          targetSize: resolvedConfig.targetSize,
          extraInstructions: resolvedConfig.extraInstructions || undefined,
          brand: resolvedConfig.brand,
          productSlug: resolvedConfig.productSlug,
        },
      });
      if (error) throw error;
      const result = data as AiUpscaleResponse | null;
      if (!result?.url) {
        const details = Array.isArray(result?.details) ? result.details.join(" | ") : "";
        throw new Error(details || "No result URL");
      }
      const provider = result.provider;
      const targetLabel = upscaleTargetLabel(result.requestedTarget ?? resolvedConfig.targetSize);
      const sizeMeta = result.outputSize ? `${targetLabel} max · ${result.outputSize}` : `${targetLabel} max`;
      store.set(key, {
        status: "done",
        config: resolvedConfig,
        startedAt,
        finishedAt: Date.now(),
        resultUrl: result.url,
        meta: `${provider ? PROVIDER_LABELS[provider] ?? provider : "AI"} · ${sizeMeta} · ${result.model ?? "model"}`,
      });
      logOperation({ category: "ai", operation: "upscale_image_ai", status: "success", durationMs: Date.now() - startedAt, metadata: { engine: "ai", provider, model: result.model, targetSize: resolvedConfig.targetSize, outputSize: result.outputSize } });
    }
  } catch (e: unknown) {
    const msg = await functionErrorMessage(e, "Upscale failed");
    store.set(key, {
      status: "error",
      config: resolvedConfig,
      startedAt,
      finishedAt: Date.now(),
      error: String(msg),
    });
    logOperation({ category: "ai", operation: resolvedConfig.engine === "picsart" ? "upscale_image" : "upscale_image_ai", status: "failed", durationMs: Date.now() - startedAt, errorMessage: String(msg), metadata: { engine: resolvedConfig.engine, targetSize: resolvedConfig.targetSize } });
  } finally {
    inflight.delete(key);
  }
}

export function dismissUpscale(key: string) {
  store.remove(key);
}

export function useUpscaleJob(key: string | null | undefined) {
  return useJob(store, key);
}

export const upscaleJobStore = store;
