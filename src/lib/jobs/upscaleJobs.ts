import { supabase } from "@/integrations/supabase/clientRuntime";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { createJobStore, useJob } from "./jobStore";
import { logOperation } from "@/lib/logs";
import { ensureOpenAISupportedFormat, toAbsoluteImageUrl } from "@/lib/imageConvert";

export type UpscaleEngine = "picsart" | "ai";

export interface UpscaleConfig {
  engine: UpscaleEngine;
  mode?: "standard" | "ultra";
  factor?: number;
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
  store.set(key, { status: "running", config, startedAt });
  inflight.add(key);

  try {
    const absoluteSrc = toAbsoluteImageUrl(key);
    if (config.engine === "picsart") {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: {
          imageUrl: absoluteSrc,
          mode: config.mode,
          factor: config.factor,
          format: config.format,
          brand: config.brand,
          productSlug: config.productSlug,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No result URL");
      store.set(key, {
        status: "done",
        config,
        startedAt,
        finishedAt: Date.now(),
        resultUrl: data.url,
        meta: `PICSART · ${config.mode} · ${config.factor}× · ${config.format}`,
      });
      logOperation({ category: "ai", operation: "upscale_image", status: "success", durationMs: Date.now() - startedAt, metadata: { engine: "picsart", mode: config.mode, factor: config.factor, format: config.format } });
    } else {
      const imgPayload = await ensureOpenAISupportedFormat(absoluteSrc);
      const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
        body: {
          ...imgPayload,
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
      store.set(key, {
        status: "done",
        config,
        startedAt,
        finishedAt: Date.now(),
        resultUrl: (data as any).url,
        meta: `${PROVIDER_LABELS[provider] ?? provider} · ${(data as any).model}`,
      });
      logOperation({ category: "ai", operation: "upscale_image_ai", status: "success", durationMs: Date.now() - startedAt, metadata: { engine: "ai", provider, model: (data as any).model } });
    }
  } catch (e: any) {
    let msg = e?.message || "Upscale failed";
    try {
      const ctx = e?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.clone().json();
        if (Array.isArray(body?.details) && body.details.length) msg = body.details[0];
        else if (body?.error) msg = body.error;
      } else if (ctx?.error) {
        msg = ctx.error;
      }
    } catch { /* ignore */ }
    store.set(key, {
      status: "error",
      config,
      startedAt,
      finishedAt: Date.now(),
      error: String(msg),
    });
    logOperation({ category: "ai", operation: config.engine === "picsart" ? "upscale_image" : "upscale_image_ai", status: "failed", durationMs: Date.now() - startedAt, errorMessage: String(msg), metadata: { engine: config.engine } });
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
