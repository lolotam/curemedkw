import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ExtractedFields } from "@/lib/aiImport";
import { startScrape, dismissScrape, useScrapeJob } from "@/lib/jobs/scrapeJobs";

export interface ProductImportFromUrlProps {
  onImported: (fields: ExtractedFields, images: string[], sourceUrl: string) => void;
}

export function ProductImportFromUrl({ onImported }: ProductImportFromUrlProps) {
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const job = useScrapeJob(activeUrl);
  const handledKeyRef = useRef<string | null>(null);

  // When job completes, deliver result exactly once per (url, finishedAt) pair
  useEffect(() => {
    if (!job || !activeUrl) return;
    if (job.status === "done" && job.extracted && job.scraped) {
      const key = `${activeUrl}:${job.finishedAt}`;
      if (handledKeyRef.current === key) return;
      handledKeyRef.current = key;
      const { fields, usedModel, primaryModel } = job.extracted;
      onImported(fields, job.scraped.images || [], job.scraped.sourceUrl || activeUrl);
      const usedFallback = usedModel && primaryModel && usedModel !== primaryModel;
      toast.success(
        `Imported${job.scraped.images?.length ? ` with ${job.scraped.images.length} image(s)` : ""}${usedFallback ? ` using fallback ${usedModel}` : ""}. Review and save.`,
      );
      if (usedFallback) {
        toast.message(`Primary model "${primaryModel}" failed — used "${usedModel}" instead.`);
      }
      dismissScrape(activeUrl);
      setActiveUrl(null);
    } else if (job.status === "error") {
      const key = `${activeUrl}:${job.finishedAt}`;
      if (handledKeyRef.current === key) return;
      handledKeyRef.current = key;
      toast.error(job.error || "Import failed");
    }
  }, [job?.status, job?.finishedAt, activeUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter a valid http(s) product URL");
      return;
    }
    setActiveUrl(trimmed);
    void startScrape(trimmed);
  };

  const phase = job?.status ?? "idle";
  const busy = phase === "scraping" || phase === "extracting";

  return (
    <Card className="p-6 space-y-4 border-brand/40 bg-gradient-to-br from-brand/5 to-transparent">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="font-semibold">Import from URL (AI)</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Paste a product page URL. Firecrawl scrapes it and an AI model fills in every field below.
        If the primary model is rate-limited or fails, the 2nd then 3rd model is tried automatically.
        Jobs continue running if you switch tabs or navigate away.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Product URL</Label>
          <div className="relative">
            <Link2 className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://brand.com/products/example"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9"
              disabled={busy}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={run}
          disabled={busy || !url.trim()}
          className="bg-brand hover:bg-brand/90 text-white gap-1.5 min-w-[180px]"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {phase === "scraping"
            ? "Scraping page…"
            : phase === "extracting"
              ? "Extracting fields…"
              : "Scrape & fill"}
        </Button>
      </div>
    </Card>
  );
}
