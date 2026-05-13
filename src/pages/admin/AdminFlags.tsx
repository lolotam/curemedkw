import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save, MoveHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  usePriceVisibility,
  useUpdatePriceVisibility,
  useSiteSetting,
  useUpdateSiteSetting,
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
