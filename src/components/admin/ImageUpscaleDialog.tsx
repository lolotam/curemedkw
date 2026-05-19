import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Cpu, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAiModels } from "@/lib/aiModels";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { Link } from "react-router-dom";
import { startUpscale, dismissUpscale, useUpscaleJob, type UpscaleEngine } from "@/lib/jobs/upscaleJobs";
import { useTick } from "@/lib/jobs/jobStore";
import { usePicsartEngineEnabled } from "@/lib/db";

type Mode = "standard" | "ultra";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string;
  onReplace: (newUrl: string) => void;
  storageContext?: { brand?: string; productSlug?: string };
}

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function LiveTimerBadge({ startedAt }: { startedAt: number }) {
  useTick(1000);
  const ms = Date.now() - startedAt;
  return (
    <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-mono font-medium text-white backdrop-blur-sm animate-pulse">
      <Loader2 className="h-3 w-3 animate-spin" />
      {formatMs(ms)}
    </span>
  );
}

export default function ImageUpscaleDialog({ open, onOpenChange, imageUrl, onReplace, storageContext }: Props) {
  const { data: picsartEnabled = true } = usePicsartEngineEnabled();
  const [engine, setEngine] = useState<UpscaleEngine>(picsartEnabled ? "picsart" : "ai");
  const [mode, setMode] = useState<Mode>("standard");
  const [factor, setFactor] = useState<number>(2);
  const [format, setFormat] = useState<"JPG" | "PNG" | "WEBP">("JPG");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [outputSize, setOutputSize] = useState<"1024x1024" | "1536x1536" | "2048x2048">("1024x1024");

  const { slots } = useAiModels();
  const factors = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;

  // Force AI engine when PICSART is disabled by admin flag.
  useEffect(() => {
    if (!picsartEnabled && engine === "picsart") setEngine("ai");
  }, [picsartEnabled, engine]);

  const job = useUpscaleJob(imageUrl);
  const loading = job?.status === "running";
  const resultUrl = job?.status === "done" ? job.resultUrl : undefined;
  const elapsedMs = job?.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : null;
  const lastToastedRef = useToastOnceRef(job);

  const handleGenerate = async () => {
    if (!imageUrl) return;
    void startUpscale(imageUrl, {
      engine,
      mode,
      factor,
      format,
      extraInstructions: extraInstructions.trim() || undefined,
      outputSize,
      brand: storageContext?.brand,
      productSlug: storageContext?.productSlug,
    });
  };

  const handleSave = () => {
    if (!resultUrl) return;
    onReplace(resultUrl);
    toast.success("Image replaced — remember to save the product");
    dismissUpscale(imageUrl);
    onOpenChange(false);
  };

  const handleClear = () => {
    dismissUpscale(imageUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Upscale image
          </DialogTitle>
          <DialogDescription>
            Increase resolution with PICSART, or use an AI image model with automatic fallback. Jobs continue running if you close this dialog or switch tabs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Original</p>
            <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
              {imageUrl ? <img src={imageUrl} alt="Original" className="h-full w-full object-contain" /> : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Result</p>
            <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
              {loading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <LiveTimerBadge startedAt={job!.startedAt} />
                </>
              ) : resultUrl ? (
                <>
                  <img src={resultUrl} alt="Upscaled" className="h-full w-full object-contain" />
                  {elapsedMs != null && (
                    <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-600/80 px-2 py-0.5 text-[11px] font-mono font-medium text-white backdrop-blur-sm">
                      <CheckCircle2 className="h-3 w-3" />
                      {formatMs(elapsedMs)}
                    </span>
                  )}
                </>
              ) : job?.status === "error" ? (
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  <span className="text-xs text-destructive line-clamp-3">{job.error}</span>
                  <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No result yet</span>
              )}
            </div>
            {job?.status === "done" && job.meta && (
              <p className="text-[11px] text-muted-foreground truncate">
                {job.meta}
                {elapsedMs != null && <span className="ml-1 font-mono text-muted-foreground/70">· {formatMs(elapsedMs)}</span>}
              </p>
            )}
          </div>
        </div>

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
                  <RadioGroupItem value="picsart" id="e-pic" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">PICSART</div>
                    <div className="text-xs text-muted-foreground">Deterministic resolution increase. Best for sharp upscale at a fixed factor.</div>
                  </div>
                </label>
              )}
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="ai" id="e-ai" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">AI image model</div>
                  <div className="text-xs text-muted-foreground">Uses Primary → Fallback #2 → #3 from /admin/models with the saved upscaling prompt.</div>
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
                    <RadioGroupItem value="standard" id="m-std" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Standard</div>
                      <div className="text-xs text-muted-foreground">For sharp images. Up to 8×.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="ultra" id="m-ultra" className="mt-0.5" />
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
                  <Link to="/admin/models" className="text-[11px] text-brand hover:underline">Edit in /admin/models</Link>
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
                <Label className="text-sm font-medium">Output size</Label>
                <RadioGroup
                  value={outputSize}
                  onValueChange={(v) => setOutputSize(v as any)}
                  className="grid grid-cols-3 gap-2"
                >
                  {([
                    ["1024x1024", "1K", "1024×1024"],
                    ["1536x1536", "1.5K", "1536×1536"],
                    ["2048x2048", "2K", "2048×2048"],
                  ] as const).map(([val, label, sub]) => (
                    <label
                      key={val}
                      className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer hover:bg-muted/40"
                    >
                      <RadioGroupItem value={val} id={`os-${val}`} className="mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-[11px] text-muted-foreground">{sub}</div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                <p className="text-[11px] text-muted-foreground">
                  Applies to OpenAI gpt-image-* only. OpenRouter / Google ignore this.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Extra instructions (optional)</Label>
                <Textarea
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  placeholder="e.g. Keep the background pure white"
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground">
                  Appended to the saved upscaling prompt. AI models do not change pixel dimensions deterministically.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleGenerate} disabled={loading || !imageUrl} variant="secondary">
            {loading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Upscaling…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Generate</>}
          </Button>
          <Button onClick={handleSave} disabled={!resultUrl}>
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Show a toast exactly once per finished job (when the dialog is open).
 * Avoids spamming on remounts.
 */
function useToastOnceRef(job: ReturnType<typeof useUpscaleJob>) {
  const [lastKey, setLastKey] = useState<string | null>(null);
  useEffect(() => {
    if (!job || job.status === "running") return;
    const key = `${job.startedAt}:${job.status}`;
    if (key === lastKey) return;
    setLastKey(key);
    if (job.status === "done") toast.success("Upscale complete");
    else if (job.status === "error") toast.error(job.error || "Upscale failed");
  }, [job?.status, job?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return lastKey;
}
