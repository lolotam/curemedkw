import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  usePriceVisibility,
  useUpdatePriceVisibility,
  type PriceVisibility,
} from "@/lib/db";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import type { BrandKey } from "@/lib/db";

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
            Hide product prices from customers. When hidden, a "Contact us" button replaces the
            price across the storefront.
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