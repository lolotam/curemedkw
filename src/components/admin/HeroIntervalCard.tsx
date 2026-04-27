import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Timer, Loader2 } from "lucide-react";
import { useSiteSetting, useUpdateSiteSetting } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import type { HeroPageKey } from "@/lib/heroSlides";

type IntervalsMap = Record<string, number>;

interface Props {
  pageKey: HeroPageKey;
}

/**
 * Lets the admin set the auto-advance interval (in seconds) for a single landing page.
 * Stored as `hero_intervals = { [pageKey]: ms }` in site_settings.
 */
export function HeroIntervalCard({ pageKey }: Props) {
  const { data: intervals } = useSiteSetting<IntervalsMap>("hero_intervals", {});
  const { mutateAsync, isPending } = useUpdateSiteSetting();
  const { toast } = useToast();

  const stored = intervals?.[pageKey];
  const initialSec = stored ? Math.round(stored / 100) / 10 : 5.5;
  const [seconds, setSeconds] = React.useState<number>(initialSec);

  React.useEffect(() => {
    setSeconds(stored ? Math.round(stored / 100) / 10 : 5.5);
  }, [stored, pageKey]);

  const dirty = Math.round(seconds * 1000) !== (stored ?? 5500);

  const save = async () => {
    const ms = Math.round(Math.min(60, Math.max(1, seconds)) * 1000);
    const next: IntervalsMap = { ...(intervals ?? {}), [pageKey]: ms };
    try {
      await mutateAsync({ key: "hero_intervals", value: next });
      toast({ title: "Auto-advance interval saved", description: `Slides will change every ${ms / 1000}s.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card className="p-4 mb-5 flex flex-wrap items-end gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-[260px]">
        <span className="h-9 w-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <Timer className="h-5 w-5" />
        </span>
        <div>
          <Label className="text-sm font-semibold">Auto-advance interval</Label>
          <p className="text-xs text-muted-foreground">
            How long each slide shows before the next one. Applies only to this landing page.
          </p>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">Seconds</Label>
          <Input
            type="number"
            step="0.5"
            min={1}
            max={60}
            className="h-9 w-24"
            value={seconds}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setSeconds(v);
            }}
          />
        </div>
        <Button onClick={save} disabled={!dirty || isPending} size="sm" className="gap-1">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </Card>
  );
}