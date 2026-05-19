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
import { useAiModels } from "@/lib/aiModels";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { downloadImage, downloadImagesAsZip } from "@/lib/downloadImage";
import BeforeAfterSlider from "./BeforeAfterSlider";
import {
  startBulkUpscale,
  dismissBulkUpscale,
  useBulkUpscaleJob,
  bulkUpscaleJobIdFor,
  type BulkItem,
  type BulkItemStatus,
} from "@/lib/jobs/bulkUpscaleJobs";
import { logOperation } from "@/lib/logs";
import { useTick } from "@/lib/jobs/jobStore";
import type { UpscaleEngine } from "@/lib/jobs/upscaleJobs";
import { usePicsartEngineEnabled } from "@/lib/db";

type Mode = "standard" | "ultra";

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function TimerBadge({ startedAt, elapsedMs, status }: { startedAt?: number; elapsedMs?: number; status: BulkItemStatus }) {
  useTick(1000);
  const active = status === "loading" && startedAt != null;
  const frozen = status === "done" || status === "error";
  if (!startedAt) return null;
  const ms = frozen && elapsedMs != null ? elapsedMs : active ? Date.now() - startedAt : 0;
  if (ms <= 0 && !active) return null;

  return (
    <span
      className={cn(
        "absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono font-medium backdrop-blur-sm",
        active && "bg-black/60 text-white animate-pulse",
        status === "done" && "bg-emerald-600/80 text-white",
        status === "error" && "bg-destructive/80 text-white",
      )}
    >
      {active && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "done" && <CheckCircle2 className="h-3 w-3" />}
      {status === "error" && <AlertCircle className="h-3 w-3" />}
      {formatMs(ms)}
    </span>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrls: string[];
  baseName?: string;
  storageContext?: { brand?: string; productSlug?: string };
  /** Replace many original URLs at once. urlMap: oldUrl -> newUrl. */
  onReplaceMany: (urlMap: Record<string, string>) => void;
}

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;

export default function BulkImageUpscaleDialog({ open, onOpenChange, imageUrls, baseName = "image", storageContext, onReplaceMany }: Props) {
  const { slots } = useAiModels();
  const { data: picsartEnabled = true } = usePicsartEngineEnabled();

  // Configuration
  const [engine, setEngine] = useState<UpscaleEngine>(picsartEnabled ? "picsart" : "ai");
  const [mode, setMode] = useState<Mode>("standard");
  const [factor, setFactor] = useState<number>(2);
  const [format, setFormat] = useState<"JPG" | "PNG" | "WEBP">("JPG");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [outputSize, setOutputSize] = useState<"1024x1024" | "1536x1536" | "2048x2048">("1024x1024");

  // Force AI engine when PICSART is disabled by admin flag.
  useEffect(() => {
    if (!picsartEnabled && engine === "picsart") setEngine("ai");
  }, [picsartEnabled, engine]);

  // Selection (input phase)
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());
  // Per-item replace selection (output phase)
  const [replaceSelected, setReplaceSelected] = useState<Set<string>>(new Set());
  // Fullscreen compare
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const factors = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;
  const uniqueUrls = useMemo(() => Array.from(new Set(imageUrls.filter((u) => u && !u.startsWith("data:")))), [imageUrls]);

  const jobId = useMemo(() => bulkUpscaleJobIdFor(uniqueUrls, storageContext?.productSlug), [uniqueUrls, storageContext?.productSlug]);
  const job = useBulkUpscaleJob(jobId);
  const items: BulkItem[] = job?.items ?? [];
  const processing = job?.status === "running";

  // Initialize selection when opening fresh (no existing job)
  useEffect(() => {
    if (open && !job) {
      setSelectedSrcs(new Set(uniqueUrls));
      setReplaceSelected(new Set());
      setPreviewIdx(null);
    }
  }, [open, uniqueUrls, job]);

  // Auto-select newly finished items for replacement
  useEffect(() => {
    if (!items.length) return;
    setReplaceSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => {
        if (it.status === "done" && !next.has(it.src)) next.add(it.src);
      });
      return next;
    });
  }, [items]);

  // Toast on completion
  const finished = job && job.status === "done" && job.finishedAt;
  useEffect(() => {
    if (!finished) return;
    const ok = items.filter((i) => i.status === "done").length;
    const fail = items.filter((i) => i.status === "error").length;
    if (ok && !fail) toast.success(`Upscaled ${ok} image(s)`);
    else if (ok && fail) toast.warning(`Upscaled ${ok} — ${fail} failed`);
    else if (fail) toast.error(`All ${fail} upscale(s) failed`);
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSelected = uniqueUrls.length > 0 && selectedSrcs.size === uniqueUrls.length;
  const toggleSelectAll = () => setSelectedSrcs(allSelected ? new Set() : new Set(uniqueUrls));
  const toggleSrc = (src: string) => {
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const handleRun = () => {
    const list = Array.from(selectedSrcs);
    if (!list.length) {
      toast.info("Select at least one image");
      return;
    }
    void startBulkUpscale(jobId, list, {
      engine,
      mode,
      factor,
      format,
      extraInstructions: extraInstructions.trim() || undefined,
      brand: storageContext?.brand,
      productSlug: storageContext?.productSlug,
    });
    setReplaceSelected(new Set());
  };

  const handleStartOver = () => {
    dismissBulkUpscale(jobId);
    setSelectedSrcs(new Set(uniqueUrls));
    setReplaceSelected(new Set());
    setPreviewIdx(null);
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

  const replaceMap = (scope: "selected" | "all") => {
    const targets = scope === "all" ? doneItems : doneItems.filter((it) => replaceSelected.has(it.src));
    if (!targets.length) {
      toast.info("Nothing to replace");
      return;
    }
    const map: Record<string, string> = {};
    targets.forEach((it) => { map[it.src] = it.resultUrl!; });
    logOperation({ category: "ai", operation: "upscale_image", status: "success", metadata: { count: targets.length, engine, factor, mode } });
    onReplaceMany(map);
    toast.success(`Replaced ${targets.length} image(s) — remember to save the product`);
    dismissBulkUpscale(jobId);
    onOpenChange(false);
  };

  const previewItem = previewIdx != null ? doneItems[previewIdx] : null;
  const showSelection = items.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Bulk upscale images
          </DialogTitle>
          <DialogDescription>
            Select images, choose an engine, then compare each result with a draggable before/after slider. Jobs continue running if you close this dialog or switch tabs.
          </DialogDescription>
        </DialogHeader>

        {/* Selection grid */}
        {showSelection && (
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
        {showSelection && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Engine</Label>
              <RadioGroup
                value={engine}
                onValueChange={(v) => setEngine(v as UpscaleEngine)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                {picsartEnabled && (
                  <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="picsart" id="bulk-e-pic" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">PICSART</div>
                      <div className="text-xs text-muted-foreground">Deterministic resolution increase. Best for sharp upscale at a fixed factor.</div>
                    </div>
                  </label>
                )}
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={handleRun} disabled={selectedSrcs.size === 0}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Upscale {selectedSrcs.size} image{selectedSrcs.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {/* Results grid */}
        {!showSelection && (
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
                <Button type="button" variant="ghost" size="sm" onClick={handleStartOver} className="h-8 text-xs" disabled={processing}>
                  Start over
                </Button>
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
                      <div className="relative">
                        <BeforeAfterSlider beforeSrc={it.src} afterSrc={it.resultUrl} />
                        <TimerBadge startedAt={it.startedAt} elapsedMs={it.elapsedMs} status={it.status} />
                      </div>
                    ) : (
                      <div className="relative aspect-square bg-muted">
                        <img src={it.src} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" />
                        <TimerBadge startedAt={it.startedAt} elapsedMs={it.elapsedMs} status={it.status} />
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
                            {it.elapsedMs != null && (
                              <span className="text-muted-foreground/70 font-mono">{formatMs(it.elapsedMs)}</span>
                            )}
                          </span>
                        ) : it.status === "error" && it.elapsedMs != null ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            <span className="font-mono">{formatMs(it.elapsedMs)}</span>
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
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={replaceSelected.size === 0}
                onClick={downloadSelectedResults}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Download selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={doneItems.length === 0}
                onClick={downloadAllResults}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Download all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={replaceSelected.size === 0}
                onClick={() => replaceMap("selected")}
              >
                Replace selected ({replaceSelected.size})
              </Button>
              <Button
                size="sm"
                disabled={doneItems.length === 0}
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
