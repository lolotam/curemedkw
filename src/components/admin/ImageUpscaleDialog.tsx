import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";

type Mode = "standard" | "ultra";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string;
  onReplace: (newUrl: string) => void;
}

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;

export default function ImageUpscaleDialog({ open, onOpenChange, imageUrl, onReplace }: Props) {
  const [mode, setMode] = useState<Mode>("standard");
  const [factor, setFactor] = useState<number>(2);
  const [format, setFormat] = useState<"JPG" | "PNG" | "WEBP">("JPG");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const factors = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;

  const reset = () => {
    setResultUrl(null);
  };

  const handleGenerate = async () => {
    if (!imageUrl) return;
    setLoading(true);
    setResultUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("upscale-image", {
        body: { imageUrl, mode, factor, format },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No result URL");
      setResultUrl(data.url);
      toast.success("Upscaled successfully");
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
    setResultUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Upscale image
          </DialogTitle>
          <DialogDescription>
            Increase resolution using Picsart AI. Aspect ratio is preserved.
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
          </div>
        </div>

        <div className="space-y-4 pt-2">
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
