import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save, MoveHorizontal, Sparkles, Images, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  usePriceVisibility,
  useUpdatePriceVisibility,
  useSiteSetting,
  useUpdateSiteSetting,
  usePicsartEngineEnabled,
  PICSART_ENGINE_ENABLED_KEY,
  useProductCardHover,
  PRODUCT_CARD_HOVER_KEY,
  DEFAULT_PRODUCT_CARD_HOVER,
  useLoaderPageEnabled,
  LOADER_PAGE_ENABLED_KEY,
  type ProductCardHover,
  type PriceVisibility,
} from "@/lib/db";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import type { BrandKey } from "@/lib/db";
import {
  HOME_CAROUSEL_AUTOSCROLL_KEY,
  DEFAULT_HOME_CAROUSEL_AUTOSCROLL,
  type HomeCarouselAutoscroll,
} from "./AdminLandingPages";
import { ImageCompressionCard } from "@/components/admin/ImageCompressionCard";


export default function AdminFlags() {
  const { data, isLoading } = usePriceVisibility();
  const update = useUpdatePriceVisibility();
  const [draft, setDraft] = useState<PriceVisibility | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  if (isLoading || !draft) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading flags…
      </div>
    );
  }

  const dirty = data ? JSON.stringify(data) !== JSON.stringify(draft) : false;

  const setGlobal = (v: boolean) => setDraft({ ...draft, global: v });
  const setBrand = (b: BrandKey, v: boolean) =>
    setDraft({ ...draft, brands: { ...draft.brands, [b]: v } });

  const save = async () => {
    try {
      await update.mutateAsync(draft);
      toast.success("Flags saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const reset = () => data && setDraft(data);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Site flags</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Site-wide toggles: home page carousel auto-scroll, image compression on upload,
            and price visibility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" onClick={reset}>
              Discard
            </Button>
          )}
          <Button
            onClick={save}
            disabled={!dirty || update.isPending}
            className="bg-brand hover:bg-brand/90 text-white"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save changes
          </Button>
        </div>
      </header>

      <HomeCarouselAutoscrollCard />

      <div className="mb-6">
        <ImageCompressionCard />
      </div>

      <ProductCardHoverCard />

      <PicsartEngineCard />

      <Card className="p-5 mb-6 border-brand/30 bg-brand-soft/40">
        <FlagRow
          icon={draft.global ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          title="Hide all prices (global)"
          description="Overrides every brand. When ON, no prices are shown anywhere on the storefront."
          value={draft.global}
          onChange={setGlobal}
        />
      </Card>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Per-brand price visibility
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {BRAND_LIST.map((b) => {
          const hidden = draft.brands[b.key];
          const overridden = draft.global;
          return (
            <Card key={b.key} className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  <img src={BRANDS[b.key].logo} alt="" className="max-h-10 max-w-10 object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {overridden
                      ? "Hidden by global flag"
                      : hidden
                        ? "Prices hidden — Contact button shown"
                        : "Prices visible"}
                  </p>
                </div>
                <Switch
                  checked={hidden}
                  onCheckedChange={(v) => setBrand(b.key, !!v)}
                  disabled={overridden}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function HomeCarouselAutoscrollCard() {
  const { data: autoscroll = DEFAULT_HOME_CAROUSEL_AUTOSCROLL } =
    useSiteSetting<HomeCarouselAutoscroll>(
      HOME_CAROUSEL_AUTOSCROLL_KEY,
      DEFAULT_HOME_CAROUSEL_AUTOSCROLL,
    );
  const update = useUpdateSiteSetting();

  const setKey = (key: keyof HomeCarouselAutoscroll, value: boolean) => {
    const next = { ...DEFAULT_HOME_CAROUSEL_AUTOSCROLL, ...autoscroll, [key]: value };
    update.mutate(
      { key: HOME_CAROUSEL_AUTOSCROLL_KEY, value: next },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
      },
    );
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <MoveHorizontal className="h-4 w-4 text-brand" />
        <h2 className="font-semibold text-sm">Home page carousels — auto-scroll</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Turn off to pause the auto-scrolling animation. Visitors can still scroll the cards manually.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
          <div>
            <Label className="cursor-pointer">Brands cards carousel</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">Home page brand tiles marquee</p>
          </div>
          <Switch
            checked={!!autoscroll.brands}
            onCheckedChange={(v) => setKey("brands", v)}
            disabled={update.isPending}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
          <div>
            <Label className="cursor-pointer">Category cards carousel</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">Home page categories marquee</p>
          </div>
          <Switch
            checked={!!autoscroll.categories}
            onCheckedChange={(v) => setKey("categories", v)}
            disabled={update.isPending}
          />
        </label>
      </div>
    </Card>
  );
}

function PicsartEngineCard() {
  const { data: enabled = true, isLoading } = usePicsartEngineEnabled();
  const update = useUpdateSiteSetting();

  const setEnabled = (v: boolean) => {
    update.mutate(
      { key: PICSART_ENGINE_ENABLED_KEY, value: v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
      },
    );
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">PICSART upscale engine</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Show the PICSART option in single and bulk upscale dialogs. When off, only the AI engine is available.
          </p>
        </div>
        <Switch
          checked={!!enabled}
          onCheckedChange={(v) => setEnabled(!!v)}
          disabled={isLoading || update.isPending}
        />
      </div>
    </Card>
  );
}

function ProductCardHoverCard() {
  const { data: cfg = DEFAULT_PRODUCT_CARD_HOVER, isLoading } = useProductCardHover();
  const update = useUpdateSiteSetting();
  const [interval, setIntervalVal] = useState<string>(String(cfg.intervalSec ?? 1));

  useEffect(() => {
    setIntervalVal(String(cfg.intervalSec ?? 1));
  }, [cfg.intervalSec]);

  const save = (next: ProductCardHover) => {
    update.mutate(
      { key: PRODUCT_CARD_HOVER_KEY, value: next },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
      },
    );
  };

  const setMode = (mode: "swap" | "loop") => {
    save({ mode, intervalSec: cfg.intervalSec ?? 1 });
  };

  const commitInterval = () => {
    const n = Number(interval);
    if (!Number.isFinite(n) || n <= 0) {
      setIntervalVal(String(cfg.intervalSec ?? 1));
      return;
    }
    const clamped = Math.min(10, Math.max(0.5, n));
    if (clamped === cfg.intervalSec) return;
    save({ mode: cfg.mode, intervalSec: clamped });
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="h-10 w-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <Images className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Product card hover animation</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose how product cards animate when a visitor hovers over them.
          </p>
        </div>
      </div>

      <RadioGroup
        value={cfg.mode}
        onValueChange={(v) => setMode(v as "swap" | "loop")}
        disabled={isLoading || update.isPending}
        className="gap-2"
      >
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 cursor-pointer">
          <RadioGroupItem value="swap" id="hover-swap" className="mt-0.5" />
          <div className="flex-1">
            <Label htmlFor="hover-swap" className="cursor-pointer">First &amp; second image only</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              On hover, fade from the main image to the second gallery image.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 cursor-pointer">
          <RadioGroupItem value="loop" id="hover-loop" className="mt-0.5" />
          <div className="flex-1">
            <Label htmlFor="hover-loop" className="cursor-pointer">Infinite loop through all images</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              While hovered, cycle through every product image and loop back to the first.
            </p>
            {cfg.mode === "loop" && (
              <div className="mt-3 flex items-center gap-2">
                <Label htmlFor="hover-interval" className="text-xs">Seconds between images</Label>
                <Input
                  id="hover-interval"
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={interval}
                  onChange={(e) => setIntervalVal(e.target.value)}
                  onBlur={commitInterval}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-24 h-8"
                />
              </div>
            )}
          </div>
        </label>
      </RadioGroup>
    </Card>
  );
}



function FlagRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="h-10 w-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={(v) => onChange(!!v)} />
    </div>
  );
}
