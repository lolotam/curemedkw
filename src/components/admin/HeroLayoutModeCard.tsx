import * as React from "react";
import { ImageIcon, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSiteSetting, useUpdateSiteSetting } from "@/lib/db";
import { cn } from "@/lib/utils";

type HeroLayoutMode = "fit_viewport" | "aspect_ratio";

const HERO_LAYOUT_SETTING_KEY = "hero_layout_mode";
const DEFAULT_LAYOUT_MODE: HeroLayoutMode = "fit_viewport";

export function HeroLayoutModeCard() {
  const { data: storedMode = DEFAULT_LAYOUT_MODE } = useSiteSetting<HeroLayoutMode>(
    HERO_LAYOUT_SETTING_KEY,
    DEFAULT_LAYOUT_MODE,
  );
  const [mode, setMode] = React.useState<HeroLayoutMode>(storedMode);
  const { mutateAsync, isPending } = useUpdateSiteSetting();
  const { toast } = useToast();

  React.useEffect(() => {
    setMode(storedMode);
  }, [storedMode]);

  const dirty = mode !== storedMode;

  const save = async () => {
    try {
      await mutateAsync({ key: HERO_LAYOUT_SETTING_KEY, value: mode });
      toast({ title: "Hero layout saved", description: "The selected view now applies to every live hero slider." });
    } catch (error) {
      toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <Card className="p-4 mb-5 flex flex-wrap items-end gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-[260px]">
        <span className="h-9 w-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ImageIcon className="h-5 w-5" />
        </span>
        <div>
          <Label className="text-sm font-semibold">Hero view mode</Label>
          <p className="text-xs text-muted-foreground">
            Choose how every live hero slider displays uploaded images and videos.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          variant={mode === "fit_viewport" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("fit_viewport")}
          className={cn(mode === "fit_viewport" && "bg-brand hover:bg-brand/90")}
        >
          Fit viewport
        </Button>
        <Button
          type="button"
          variant={mode === "aspect_ratio" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("aspect_ratio")}
          className={cn(mode === "aspect_ratio" && "bg-brand hover:bg-brand/90")}
        >
          Previous aspect
        </Button>
        <Button onClick={save} disabled={!dirty || isPending} size="sm" className="gap-1">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save layout
        </Button>
      </div>
    </Card>
  );
}
