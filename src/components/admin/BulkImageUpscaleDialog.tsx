import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Cpu, Download, Maximize2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { useAiModels } from "@/lib/aiModels";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { downloadImage, downloadImagesAsZip } from "@/lib/downloadImage";
import BeforeAfterSlider from "./BeforeAfterSlider";

type Mode = "standard" | "ultra";
type Engine = "picsart" | "ai";
type ItemStatus = "pending" | "loading" | "done" | "error";

type Item = {
  src: string;
  status: ItemStatus;
  resultUrl?: string;
  meta?: string;
  error?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrls: string[];
  baseName?: string;
  /** Replace many original URLs at once. urlMap: oldUrl -> newUrl. */
  onReplaceMany: (urlMap: Record<string, string>) => void;
}

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;
const CONCURRENCY = 3;

async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

export default function BulkImageUpscaleDialog({ open, onOpenChange, imageUrls, baseName = "image", onReplaceMany }: Props) {
  const { slots } = useAiModels();

  // Configuration
  const [engine, setEngine] = useState<Engine>("picsart");
  const [mode, setMode] = useState<Mode>("standard");
  const [factor, setFactor] = useState<number>(2);
  const [format, setFormat] = useState<"JPG" | "PNG" | "WEBP">("JPG");
  const [extraInstructions, setExtraInstructions] = useState("");

  // Selection (input phase)
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());
  // Items being / already processed
  const [items, setItems] = useState<Item[]>([]);
  const [processing, setProcessing] = useState(false);
  // Per-item replace selection (output phase)
  const [replaceSelected, setReplaceSelected] = useState<Set<string>>(new Set());
  // Fullscreen compare
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const factors = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;
  const uniqueUrls = useMemo(() => Array.from(new Set(imageUrls.filter((u) => u && !u.startsWith("data:")))), [imageUrls]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedSrcs(new Set(uniqueUrls));
      setItems([]);
      setReplaceSelected(new Set());
      setPreviewIdx(null);
    }
  }, [open, uniqueUrls]);

  const allSelected = uniqueUrls.length > 0 && selectedSrcs.size === uniqueUrls.length;
  const toggleSelectAll = () => {
    setSelectedSrcs(allSelected ? new Set() : new Set(uniqueUrls));
  };
  const toggleSrc = (src: string) => {
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const upscaleOne = async (src: string): Promise<{ url: string; meta: string }> => {
    if (engine === "picsart") {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: { imageUrl: src, mode, factor, format },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No result URL");
      return { url: data.url, meta: `PICSART · ${mode} · ${factor}× · ${format}` };
    } else {
      const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
        body: { imageUrl: src, extraInstructions: extraInstructions.trim() || undefined },
      });
      if (error) throw error;
      if (!data?.url) {
        const details = Array.isArray((data as any)?.details) ? (data as any).details.join(" | ") : "";
        throw new Error(details || "No result URL");
      }
      return {
        url: data.url,
        meta: `${PROVIDER_LABELS[data.provider as keyof typeof PROVIDER_LABELS] ?? data.provider} · ${data.model}`,
      };
    }
  };

  const handleRun = async () => {
    const list = Array.from(selectedSrcs);
    if (!list.length) {
      toast.info("Select at least one image");
      return;
    }
    setProcessing(true);
    const initial: Item[] = list.map((src) => ({ src, status: "pending" as ItemStatus }));
    setItems(initial);
    setReplaceSelected(new Set());

    const update = (src: string, patch: Partial<Item>) => {
      setItems((prev) => prev.map((it) => (it.src === src ? { ...it, ...patch } : it)));
    };

    let okCount = 0;
    let failCount = 0;
    await runPool(list, CONCURRENCY, async (src) => {
      update(src, { status: "loading" });
      try {
        const { url, meta } = await upscaleOne(src);
        update(src, { status: "done", resultUrl: url, meta });
        setReplaceSelected((prev) => new Set(prev).add(src));
        okCount++;
      } catch (e: any) {
        const msg = e?.context?.error || e?.message || "Failed";
        update(src, { status: "error", error: String(msg) });
        failCount++;
      }
    });

    setProcessing(false);
    if (okCount && !failCount) toast.success(`Upscaled ${okCount} image(s)`);
    else if (okCount && failCount) toast.warning(`Upscaled ${okCount} — ${failCount} failed`);
    else toast.error(`All ${failCount} upscale(s) failed`);
  };

  const doneItems = items.filter((it) => it.status === "done" && it.resultUrl);
  const toggleReplace = (src: string) => {
    setReplaceSelected((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };
  const replaceAllSelected = allSelected; // checkbox in results header
  const allDoneSelected = doneItems.length > 0 && replaceSelected.size === doneItems.length;
  const toggleReplaceAll = () => {
    setReplaceSelected(allDoneSelected ? new Set() : new Set(doneItems.map((it) => it.src)));
  };

  const downloadAllResults = () => {
    const urls = doneItems.map((it) => it.resultUrl!);
    if (!urls.length) return;
    downloadImagesAsZip(urls, `${baseName}-upscaled.zip`, `${baseName}-upscaled`);
  };

  const downloadSelectedResults = () => {
    const urls = doneItems.filter((it) => replaceSelected.has(it.src)).map((it) => it.resultUrl!);
    if (!urls.length) {
      toast.info("No images selected");
      return;
    }
    downloadImagesAsZip(urls, `${baseName}-upscaled-selected.zip`, `${baseName}-upscaled`);
  };

  const replaceMap = (mode: "selected" | "all") => {
    const targets = mode === "all" ? doneItems : doneItems.filter((it) => replaceSelected.has(it.src));
    if (!targets.length) {
      toast.info("Nothing to replace");
      return;
    }
    const map: Record<string, string> = {};
    targets.forEach((it) => { map[it.src] = it.resultUrl!; });
    onReplaceMany(map);
    toast.success(`Replaced ${targets.length} image(s) — remember to save the product`);
    onOpenChange(false);
  };

  const previewItem = previewIdx != null ? doneItems[previewIdx] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Bulk upscale images
          </DialogTitle>
          <DialogDescription>
            Select images, choose an engine, then compare each result with a draggable before/after slider.
          </DialogDescription>
        </DialogHeader>

        {/* Selection grid */}
        {items.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Images ({uniqueUrls.length})</p>
              <Button type="button" variant="ghost" size="sm" onClick={toggleSelectAll} className="h-7 text-xs">
                {allSelected ? "Clear" : "Select all"}
              </Button>
            </div>
            {uniqueUrls.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-6 text-center">
                No upscalable images on this product.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {uniqueUrls.map((src) => {
                  const sel = selectedSrcs.has(src);
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => toggleSrc(src)}
                      className={cn(
                        "relative aspect-square rounded-md overflow-hidden border border-border bg-muted focus:outline-none",
                        sel && "ring-2 ring-brand ring-offset-1",
                      )}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <div className="absolute top-1 left-1">
                        <Checkbox checked={sel} className="bg-background/80 backdrop-blur-sm" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Engine + settings */}
        {items.length === 0 && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Engine</Label>
              <RadioGroup
                value={engine}
                onValueChange={(v) => setEngine(v as Engine)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="picsart" id="bulk-e-pic" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">PICSART</div>
                    <div className="text-xs text-muted-foreground">Deterministic resolution increase. Best for sharp upscale at a fixed factor.</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="ai" id="bulk-e-ai" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">AI image model</div>
                    <div className="text-xs text-muted-foreground">Uses Primary → Fallback #2 → #3 from /admin/models.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {engine === "picsart" ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Mode</Label>
                  <RadioGroup
                    value={mode}
                    onValueChange={(v) => {
                      const next = v as Mode;
                      setMode(next);
                      if (next === "standard" && factor === 16) setFactor(8);
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  >
                    <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                      <RadioGroupItem value="standard" id="bulk-m-std" className="mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">Standard</div>
                        <div className="text-xs text-muted-foreground">For sharp images. Up to 8×.</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                      <RadioGroupItem value="ultra" id="bulk-m-ultra" className="mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">Ultra</div>
                        <div className="text-xs text-muted-foreground">AI denoise. Best for low-res / faces. Up to 16×.</div>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Upscale factor</Label>
                    <Select value={String(factor)} onValueChange={(v) => setFactor(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {factors.map((f) => (
                          <SelectItem key={f} value={String(f)}>{f}×</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Output format</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="JPG">JPG</SelectItem>
                        <SelectItem value="PNG">PNG</SelectItem>
                        <SelectItem value="WEBP">WEBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Model fallback chain</p>
                    <Link to="/admin/models" className="text-[11px] text-brand hover:underline">Edit</Link>
                  </div>
                  <ol className="space-y-1 text-xs">
                    {slots.image.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background border border-border text-[10px] font-bold">{i + 1}</span>
                        <Cpu className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{PROVIDER_LABELS[s.provider]}</span>
                        <span className="font-mono text-muted-foreground truncate">{s.model || "(not set)"}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Extra instructions (optional)</Label>
                  <Textarea
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    placeholder="e.g. Keep the background pure white"
                    rows={3}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleRun} disabled={selectedSrcs.size === 0}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Upscale {selectedSrcs.size} image{selectedSrcs.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {/* Results grid */}
        {items.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium">Results</span>
                <span className="text-muted-foreground text-xs">
                  {items.filter((i) => i.status === "done").length} done ·{" "}
                  {items.filter((i) => i.status === "loading" || i.status === "pending").length} processing ·{" "}
                  {items.filter((i) => i.status === "error").length} failed
                </span>
              </div>
              <div className="flex items-center gap-2">
                {doneItems.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={toggleReplaceAll} className="h-8 text-xs">
                    {allDoneSelected ? "Clear" : "Select all"}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((it, idx) => {
                const doneIdx = doneItems.findIndex((d) => d.src === it.src);
                return (
                  <div
                    key={it.src}
                    className={cn(
                      "rounded-lg border border-border bg-background overflow-hidden",
                      replaceSelected.has(it.src) && "ring-2 ring-brand ring-offset-1",
                    )}
                  >
                    {it.status === "done" && it.resultUrl ? (
                      <BeforeAfterSlider beforeSrc={it.src} afterSrc={it.resultUrl} />
                    ) : (
                      <div className="relative aspect-square bg-muted">
                        <img src={it.src} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" />
                        <div className="absolute inset-0 grid place-items-center">
                          {it.status === "loading" || it.status === "pending" ? (
                            <div className="flex flex-col items-center gap-2 rounded-md bg-background/80 px-3 py-2 backdrop-blur-sm">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">
                                {it.status === "loading" ? "Upscaling…" : "Queued"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 rounded-md bg-background/90 px-3 py-2 backdrop-blur-sm max-w-[90%]">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                              <span className="text-[11px] text-destructive text-center line-clamp-3">
                                {it.error || "Failed"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 p-2 border-t border-border">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={replaceSelected.has(it.src)}
                          disabled={it.status !== "done"}
                          onCheckedChange={() => toggleReplace(it.src)}
                        />
                        {it.status === "done" ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3 text-brand" />
                            <span className="truncate max-w-[150px]">{it.meta}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select</span>
                        )}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={it.status !== "done"}
                          onClick={() => setPreviewIdx(doneIdx)}
                          title="Fullscreen compare"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={it.status !== "done" || !it.resultUrl}
                          onClick={() => it.resultUrl && downloadImage(it.resultUrl, `${baseName}-upscaled-${idx + 1}`)}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={processing}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={processing || replaceSelected.size === 0}
                onClick={downloadSelectedResults}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Download selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={processing || doneItems.length === 0}
                onClick={downloadAllResults}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Download all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={processing || replaceSelected.size === 0}
                onClick={() => replaceMap("selected")}
              >
                Replace selected ({replaceSelected.size})
              </Button>
              <Button
                size="sm"
                disabled={processing || doneItems.length === 0}
                onClick={() => replaceMap("all")}
              >
                Replace all ({doneItems.length})
              </Button>
            </div>
          </div>
        )}

        {/* Fullscreen compare overlay */}
        {previewItem && (
          <Dialog open={previewIdx != null} onOpenChange={(o) => !o && setPreviewIdx(null)}>
            <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden">
              <DialogTitle className="sr-only">Compare</DialogTitle>
              <div className="bg-muted/30 p-4">
                <BeforeAfterSlider
                  beforeSrc={previewItem.src}
                  afterSrc={previewItem.resultUrl!}
                  aspectClassName="aspect-[4/3]"
                />
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-background">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => previewItem.resultUrl && downloadImage(previewItem.resultUrl, `${baseName}-upscaled`)}
                  className="gap-1.5"
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button type="button" size="sm" onClick={() => setPreviewIdx(null)}>Close</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
