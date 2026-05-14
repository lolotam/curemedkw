import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Cpu } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { useAiModels } from "@/lib/aiModels";
import { PROVIDER_LABELS } from "@/lib/aiProviders";
import { Link } from "react-router-dom";

type Mode = "standard" | "ultra";
type Engine = "picsart" | "ai";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string;
  onReplace: (newUrl: string) => void;
  storageContext?: { brand?: string; productSlug?: string };
}

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;

export default function ImageUpscaleDialog({ open, onOpenChange, imageUrl, onReplace, storageContext }: Props) {
  const [engine, setEngine] = useState<Engine>("picsart");
  const [mode, setMode] = useState<Mode>("standard");
  const [factor, setFactor] = useState<number>(2);
  const [format, setFormat] = useState<"JPG" | "PNG" | "WEBP">("JPG");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<string | null>(null);

  const { slots } = useAiModels();
  const factors = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;

  const reset = () => {
    setResultUrl(null);
    setResultMeta(null);
  };

  const handleGenerate = async () => {
    if (!imageUrl) return;
    setLoading(true);
    setResultUrl(null);
    setResultMeta(null);
    try {
      if (engine === "picsart") {
        const { data, error } = await supabase.functions.invoke("upscale-image", {
          body: { imageUrl, mode, factor, format },
        });
        if (error) throw error;
        if (!data?.url) throw new Error("No result URL");
        setResultUrl(data.url);
        setResultMeta(`PICSART · ${mode} · ${factor}× · ${format}`);
        toast.success("Upscaled successfully");
      } else {
        const { data, error } = await supabase.functions.invoke("upscale-image-ai", {
          body: { imageUrl, extraInstructions: extraInstructions.trim() || undefined },
        });
        if (error) throw error;
        if (!data?.url) {
          const details = Array.isArray((data as any)?.details) ? (data as any).details.join(" | ") : "";
          throw new Error(details || "No result URL");
        }
        setResultUrl(data.url);
        setResultMeta(`${PROVIDER_LABELS[data.provider as keyof typeof PROVIDER_LABELS] ?? data.provider} · ${data.model}`);
        toast.success("AI upscale complete");
      }
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || "Upscale failed";
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!resultUrl) return;
    onReplace(resultUrl);
    toast.success("Image replaced — remember to save the product");
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Upscale image
          </DialogTitle>
          <DialogDescription>
            Increase resolution with PICSART, or use an AI image model with automatic fallback.
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
            <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : resultUrl ? (
                <img src={resultUrl} alt="Upscaled" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No result yet</span>
              )}
            </div>
            {resultMeta && (
              <p className="text-[11px] text-muted-foreground truncate">{resultMeta}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Engine</Label>
            <RadioGroup
              value={engine}
              onValueChange={(v) => setEngine(v as Engine)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="picsart" id="e-pic" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">PICSART</div>
                  <div className="text-xs text-muted-foreground">Deterministic resolution increase. Best for sharp upscale at a fixed factor.</div>
                </div>
              </label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading || !imageUrl} variant="secondary">
            {loading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Upscaling…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Generate</>}
          </Button>
          <Button onClick={handleSave} disabled={!resultUrl || loading}>
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
