import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Loader2, Link2, Settings2 } from "lucide-react";
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

const STORAGE_KEYS = ["ai-import-model", "ai-import-model-2", "ai-import-model-3"] as const;
const DEFAULT_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku",
] as const;
const SLOT_LABELS = ["Primary", "Fallback #2", "Fallback #3"] as const;

export interface ProductImportFromUrlProps {
  onImported: (fields: ExtractedFields, images: string[]) => void;
}

export function ProductImportFromUrl({ onImported }: ProductImportFromUrlProps) {
  const [url, setUrl] = useState("");
  const [models3, setModels3] = useState<[string, string, string]>(() => readConfiguredModels());
  const [phase, setPhase] = useState<"idle" | "scraping" | "extracting">("idle");

  // Re-read whenever the page becomes visible / focused, so changes saved in
  // /admin/models are picked up without a hard reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setModels3(readConfiguredModels());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

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
        model: models3[0],
        fallbackModels: [models3[1], models3[2]],
      });
      onImported(result.fields, scraped.images || []);
      const usedFallback = result.usedModel && result.usedModel !== models3[0];
      toast.success(
        `Imported${scraped.images?.length ? ` with ${scraped.images.length} image(s)` : ""}${usedFallback ? ` using fallback ${result.usedModel}` : ""}. Review and save.`,
      );
      if (usedFallback) {
        toast.message(`Primary model "${models3[0]}" failed — used "${result.usedModel}" instead.`);
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
        Paste a product URL — Firecrawl scrapes the page and an AI model fills every field below.
        If the primary model is rate-limited or fails, the next fallback runs automatically.
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

      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/60 p-3">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Active AI models (in order)
          </p>
          <ol className="space-y-0.5 text-xs">
            {models3.map((m, i) => (
              <li key={i} className="flex gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 w-20">{SLOT_LABELS[i]}</span>
                <span className="font-mono truncate">{m}</span>
              </li>
            ))}
          </ol>
        </div>
        <Button asChild type="button" variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Link to="/admin/models">
            <Settings2 className="h-3.5 w-3.5" /> Configure
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function readConfiguredModels(): [string, string, string] {
  if (typeof window === "undefined") return [...DEFAULT_MODELS] as [string, string, string];
  return [
    localStorage.getItem(STORAGE_KEYS[0]) || DEFAULT_MODELS[0],
    localStorage.getItem(STORAGE_KEYS[1]) || DEFAULT_MODELS[1],
    localStorage.getItem(STORAGE_KEYS[2]) || DEFAULT_MODELS[2],
  ];
}