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
} from "@/lib/aiImport";

const STORAGE_KEY = "ai-import-model";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export interface ProductImportFromUrlProps {
  onImported: (fields: ExtractedFields, images: string[]) => void;
}

export function ProductImportFromUrl({ onImported }: ProductImportFromUrlProps) {
  const [url, setUrl] = useState("");
  const [model, setModel] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;
  });
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scraping" | "extracting">("idle");
  const { data: models, isLoading: modelsLoading, error: modelsError } = useOpenRouterModels();

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, model);
  }, [model]);

  const sortedModels = useMemo(() => {
    if (!models) return [];
    return [...models].sort((a, b) => a.id.localeCompare(b.id));
  }, [models]);

  const selectedLabel = useMemo(() => {
    const m = models?.find((x) => x.id === model);
    return m ? `${m.name} (${m.id})` : model;
  }, [model, models]);

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
      const fields = await extractProductFields({
        markdown: scraped.markdown,
        sourceUrl: scraped.sourceUrl,
        model,
      });
      onImported(fields, scraped.images || []);
      toast.success(
        `Imported${scraped.images?.length ? ` with ${scraped.images.length} image(s)` : ""}. Review and save.`,
      );
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

      <div className="space-y-1.5">
        <Label className="text-xs">AI model</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
              disabled={busy}
            >
              <span className="truncate">
                {modelsLoading ? "Loading models…" : selectedLabel}
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
                  {sortedModels.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.id} ${m.name}`}
                      onSelect={() => {
                        setModel(m.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          model === m.id ? "opacity-100" : "opacity-0",
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
        <p className="text-[10px] text-muted-foreground">
          Default: {DEFAULT_MODEL}. Choice is remembered.
        </p>
      </div>
    </Card>
  );
}