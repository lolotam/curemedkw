import { useState } from "react";
import { Sparkles, Loader2, Link2, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  extractProductFields,
  scrapeProductUrl,
  type ExtractedFields,
} from "@/lib/aiImport";
import { useAiModels } from "@/lib/aiModels";

export interface ProductImportFromUrlProps {
  onImported: (fields: ExtractedFields, images: string[]) => void;
}

export function ProductImportFromUrl({ onImported }: ProductImportFromUrlProps) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "scraping" | "extracting">("idle");
  const { models } = useAiModels();

  const run = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter a valid http(s) product URL");
      return;
    }
    try {
      setPhase("scraping");
      const scraped = await scrapeProductUrl(trimmed);
      setPhase("extracting");
      const result = await extractProductFields({
        markdown: scraped.markdown,
        sourceUrl: scraped.sourceUrl,
        model: models[0],
        fallbackModels: [models[1], models[2]],
      });
      onImported(result.fields, scraped.images || []);
      const usedFallback = result.usedModel && result.usedModel !== models[0];
      toast.success(
        `Imported${scraped.images?.length ? ` with ${scraped.images.length} image(s)` : ""}${usedFallback ? ` using fallback ${result.usedModel}` : ""}. Review and save.`,
      );
      if (usedFallback) {
        toast.message(`Primary model "${models[0]}" failed — used "${result.usedModel}" instead.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <Card className="p-6 space-y-4 border-brand/40 bg-gradient-to-br from-brand/5 to-transparent">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="font-semibold">Import from URL (AI)</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Paste a product page URL. Firecrawl scrapes it and an AI model fills in every field below.
        If the primary model is rate-limited or fails, the 2nd then 3rd model is tried automatically.
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

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
        <span className="font-medium text-foreground">Using:</span>
        <code className="font-mono">{models[0]}</code>
        <span>→</span>
        <code className="font-mono">{models[1]}</code>
        <span>→</span>
        <code className="font-mono">{models[2]}</code>
        <Link
          to="/admin/models"
          className="ml-auto inline-flex items-center gap-1 text-brand hover:underline"
        >
          <Settings2 className="h-3 w-3" /> Configure in AI Models
        </Link>
      </div>
    </Card>
  );
}
