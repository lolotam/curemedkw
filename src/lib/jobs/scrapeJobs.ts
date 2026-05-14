import { supabase } from "@/integrations/supabase/clientRuntime";
import { createJobStore, useJob } from "./jobStore";
import type { ExtractResult, ScrapeResult } from "@/lib/aiImport";

export type ScrapePhase = "scraping" | "extracting" | "done" | "error";

export interface ScrapeJob {
  status: ScrapePhase;
  url: string;
  startedAt: number;
  finishedAt?: number;
  scraped?: ScrapeResult;
  extracted?: ExtractResult;
  error?: string;
}

const store = createJobStore<ScrapeJob>({
  storageKey: "lov:jobs:scrape",
  onInterruptedReload: (j) =>
    j.status === "scraping" || j.status === "extracting"
      ? { ...j, status: "error", error: "Interrupted by reload", finishedAt: Date.now() }
      : j,
});

const inflight = new Set<string>();

export async function startScrape(url: string): Promise<void> {
  const existing = store.get(url);
  if (existing && (existing.status === "scraping" || existing.status === "extracting") && inflight.has(url)) return;

  store.set(url, { status: "scraping", url, startedAt: Date.now() });
  inflight.add(url);

  try {
    const { data: sData, error: sErr } = await supabase.functions.invoke("scrape-product", { body: { url } });
    if (sErr) throw new Error((sData as any)?.error || sErr.message);
    if ((sData as any)?.error) throw new Error((sData as any).error);
    const scraped = sData as ScrapeResult;
    store.update(url, { status: "extracting", scraped });

    const { data: eData, error: eErr } = await supabase.functions.invoke("extract-product", {
      body: { markdown: scraped.markdown, sourceUrl: scraped.sourceUrl },
    });
    if (eErr) throw new Error((eData as any)?.error || eErr.message);
    if ((eData as any)?.error) throw new Error((eData as any).error);
    const d = eData as any;
    const extracted: ExtractResult = {
      fields: d.fields,
      usedModel: d.model,
      primaryModel: d.primaryModel ?? "",
      attempts: d.attempts ?? [],
    };
    store.update(url, { status: "done", extracted, finishedAt: Date.now() });
  } catch (e: any) {
    store.update(url, { status: "error", error: e?.message || "Scrape failed", finishedAt: Date.now() });
  } finally {
    inflight.delete(url);
  }
}

export function dismissScrape(url: string) {
  store.remove(url);
}

export function useScrapeJob(url: string | null | undefined) {
  return useJob(store, url);
}

export const scrapeJobStore = store;
