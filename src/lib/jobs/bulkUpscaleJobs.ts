import { supabase } from "@/integrations/supabase/clientRuntime";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { createJobStore, useJob, hashKey } from "./jobStore";
import type { UpscaleConfig } from "./upscaleJobs";

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
const CONCURRENCY = 3;

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
    let resultUrl: string;
    let meta: string;
    if (config.engine === "picsart") {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: {
          imageUrl: src,
          mode: config.mode,
          factor: config.factor,
          format: config.format,
          brand: config.brand,
          productSlug: config.productSlug,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No result URL");
      resultUrl = data.url;
      meta = `PICSART · ${config.mode} · ${config.factor}× · ${config.format}`;
    } else {
      const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
        body: {
          imageUrl: src,
          extraInstructions: config.extraInstructions || undefined,
          brand: config.brand,
          productSlug: config.productSlug,
        },
      });
      if (error) throw error;
      if (!data?.url) {
        const details = Array.isArray((data as any)?.details) ? (data as any).details.join(" | ") : "";
        throw new Error(details || "No result URL");
      }
      const provider = (data as any).provider as keyof typeof PROVIDER_LABELS;
      resultUrl = (data as any).url;
      meta = `${PROVIDER_LABELS[provider] ?? provider} · ${(data as any).model}`;
    }
    patchItem(jobId, src, { status: "done", resultUrl, meta, elapsedMs: Date.now() - startedAt });
  } catch (e: any) {
    const msg = e?.context?.error || e?.message || "Failed";
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

  const items: BulkItem[] = srcs.map((src) => ({ src, status: "pending" as BulkItemStatus }));
  store.set(jobId, { status: "running", config, startedAt: Date.now(), items });
  inflight.add(jobId);

  try {
    let i = 0;
    const runners = Array.from({ length: Math.min(CONCURRENCY, srcs.length) }, async (_, workerIdx) => {
      // Stagger starts: worker 0 fires immediately, worker 1 waits 5s, worker 2 waits 10s.
      // Prevents all 3 requests hitting the self-hosted edge function gateway simultaneously,
      // which causes Kong to drop 2 of the 3 connections under concurrent long-running load.
      if (workerIdx > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, workerIdx * 5_000));
      }
      while (i < srcs.length) {
        const idx = i++;
        await runOne(jobId, srcs[idx], config);
      }
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
