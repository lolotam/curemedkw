import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  IMAGE_COMPRESSION_ENABLED_KEY,
  IMAGE_COMPRESSION_QUALITY_KEY,
  useImageCompressionEnabled,
  useImageCompressionQuality,
  useUpdateSiteSetting,
} from "@/lib/db";

export function ImageCompressionCard() {
  const { data: enabledRaw } = useImageCompressionEnabled();
  const { data: qualityRaw } = useImageCompressionQuality();
  const update = useUpdateSiteSetting();
  const enabled = enabledRaw ?? true;
  const savedQuality = typeof qualityRaw === "number" ? qualityRaw : 99;
  const [draft, setDraft] = React.useState(savedQuality);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!touched) setDraft(savedQuality);
  }, [savedQuality, touched]);

  const commitQuality = (v: number) => {
    update.mutate(
      { key: IMAGE_COMPRESSION_QUALITY_KEY, value: v },
      {
        onSuccess: () => {
          setTouched(false);
          toast.success("Compression quality updated");
        },
        onError: (e: any) => toast.error(e?.message || "Failed to update"),
      },
    );
  };

  const toggleEnabled = (v: boolean) => {
    update.mutate(
      { key: IMAGE_COMPRESSION_ENABLED_KEY, value: v },
      {
        onSuccess: () => toast.success(v ? "WebP conversion enabled" : "WebP conversion disabled"),
        onError: (e: any) => toast.error(e?.message || "Failed to update"),
      },
    );
  };

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h3 className="text-base font-semibold">Image compression (WebP)</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          Controls how uploaded images (hero slides, products, branding, avatars) are compressed
          on upload. Disable to keep originals at full fidelity. Higher quality = larger file size.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <Label className="text-sm font-medium">Convert uploads to WebP</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            When off, uploaded images are stored in their original format with no re-encoding.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggleEnabled}
          disabled={update.isPending}
        />
      </div>

      <fieldset disabled={!enabled} className={!enabled ? "opacity-50 space-y-3" : "space-y-3"}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">Quality</Label>
            <span className="text-sm font-semibold tabular-nums text-brand">{draft}%</span>
          </div>
          <Slider
            value={[draft]}
            min={1}
            max={100}
            step={1}
            onValueChange={(v) => { setTouched(true); setDraft(v[0] ?? 1); }}
            onValueCommit={(v) => commitQuality(v[0] ?? 1)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Default is 99% (near-lossless). Lower values produce smaller files but visibly reduce
          quality. Values above 90% are usually visually indistinguishable from the source.
        </p>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setTouched(true); setDraft(99); commitQuality(99); }}
          disabled={update.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to 99%
        </Button>
        {update.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </Card>
  );
}
