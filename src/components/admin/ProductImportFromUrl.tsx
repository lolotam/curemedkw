import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, Check, ChevronsUpDown, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  extractProductFields,
  scrapeProductUrl,
  useOpenRouterModels,
  type ExtractedFields,
  type OpenRouterModel,
} from "@/lib/aiImport";

const STORAGE_KEYS = ["ai-import-model", "ai-import-model-2", "ai-import-model-3"] as const;
const DEFAULT_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku",
] as const;
const SLOT_LABELS = ["Primary AI model", "Fallback model #2", "Fallback model #3"] as const;

export interface ProductImportFromUrlProps {
  onImported: (fields: ExtractedFields, images: string[]) => void;
}

export function ProductImportFromUrl({ onImported }: ProductImportFromUrlProps) {
  const [url, setUrl] = useState("");
  const [models3, setModels3] = useState<[string, string, string]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_MODELS] as [string, string, string];
    return [
      localStorage.getItem(STORAGE_KEYS[0]) || DEFAULT_MODELS[0],
      localStorage.getItem(STORAGE_KEYS[1]) || DEFAULT_MODELS[1],
      localStorage.getItem(STORAGE_KEYS[2]) || DEFAULT_MODELS[2],
    ];
  });
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "scraping" | "extracting">("idle");
  const { data: models, isLoading: modelsLoading, error: modelsError } = useOpenRouterModels();

  useEffect(() => {
    if (typeof window === "undefined") return;
    models3.forEach((m, i) => localStorage.setItem(STORAGE_KEYS[i], m));
  }, [models3]);

  const sortedModels = useMemo(() => {
    if (!models) return [];
    return [...models].sort((a, b) => a.id.localeCompare(b.id));
  }, [models]);

  const labelFor = (id: string) => {
    const m = models?.find((x) => x.id === id);
    return m ? `${m.name} (${m.id})` : id;
  };

  const setModelAt = (slot: number, id: string) => {
    setModels3((prev) => {
      const next = [...prev] as [string, string, string];
      next[slot] = id;
      return next;
    });
  };

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

  const renderModelPicker = (slot: number) => (
    <div className="space-y-1.5" key={slot}>
      <Label className="text-xs">{SLOT_LABELS[slot]}</Label>
      <Popover
        open={openSlot === slot}
        onOpenChange={(o) => setOpenSlot(o ? slot : null)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={openSlot === slot}
            className="w-full justify-between font-normal"
            disabled={busy}
          >
            <span className="truncate">
              {modelsLoading ? "Loading models…" : labelFor(models3[slot])}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search models…" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {modelsError ? "Failed to load models" : "No models found"}
              </CommandEmpty>
              <CommandGroup>
                {sortedModels.map((m: OpenRouterModel) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.id} ${m.name}`}
                    onSelect={() => {
                      setModelAt(slot, m.id);
                      setOpenSlot(null);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        models3[slot] === m.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {m.id}
                        {m.context_length ? ` · ${m.context_length.toLocaleString()} ctx` : ""}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

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

      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map(renderModelPicker)}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Defaults: {DEFAULT_MODELS.join(" → ")}. Choices are remembered. Models are tried in order; on
        rate-limit / failure the next one runs automatically.
      </p>
    </Card>
  );
}