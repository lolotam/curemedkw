import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Save, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  BRANDING_FAVICON_KEY,
  BRANDING_LOGO_KEY,
  useBrandingFavicon,
  useBrandingLogo,
  useUpdateSiteSetting,
} from "@/lib/db";

export default function AdminBranding() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ImageIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">Branding</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paste a URL for your site logo and favicon. Changes apply immediately across the site.
          </p>
        </div>
      </header>

      <BrandingField
        title="Site logo"
        description="Used in the site header, footer (main page), and admin login. Recommended: PNG or SVG with transparent background, at least 200px tall."
        settingKey={BRANDING_LOGO_KEY}
        useValue={useBrandingLogo}
        previewClassName="h-20 w-auto max-w-[260px] object-contain"
        previewBg="bg-muted"
      />

      <BrandingField
        title="Favicon"
        description="Shown in the browser tab. Recommended: square PNG, ICO, or SVG (32×32 or larger)."
        settingKey={BRANDING_FAVICON_KEY}
        useValue={useBrandingFavicon}
        previewClassName="h-8 w-8 object-contain"
        previewBg="bg-muted"
      />
    </div>
  );
}

interface FieldProps {
  title: string;
  description: string;
  settingKey: string;
  useValue: () => { data: string | undefined; isLoading: boolean };
  previewClassName: string;
  previewBg: string;
}

function BrandingField({ title, description, settingKey, useValue, previewClassName, previewBg }: FieldProps) {
  const { data: saved, isLoading } = useValue();
  const update = useUpdateSiteSetting();
  const [draft, setDraft] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  // Initialize the draft once data arrives.
  React.useEffect(() => {
    if (!touched) setDraft(saved ?? "");
  }, [saved, touched]);

  const dirty = (saved ?? "") !== draft;
  const trimmed = draft.trim();
  const looksValid = !trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");

  const handleSave = async () => {
    try {
      await update.mutateAsync({ key: settingKey, value: trimmed });
      setTouched(false);
      toast.success(`${title} updated`);
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message ?? "Unknown error" });
    }
  };

  const handleReset = async () => {
    if (!confirm(`Reset ${title.toLowerCase()} to the default?`)) return;
    try {
      await update.mutateAsync({ key: settingKey, value: "" });
      setDraft("");
      setTouched(false);
      toast.success(`${title} reset to default`);
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message ?? "Unknown error" });
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="grid md:grid-cols-[1fr,auto] gap-4 items-start">
        <div className="space-y-2">
          <Label className="text-xs">Image URL</Label>
          <Input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
            placeholder="https://example.com/logo.png"
            disabled={isLoading}
          />
          {!looksValid && (
            <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              URL should start with https:// or / (for files in the public folder).
            </p>
          )}
          {saved && (
            <p className="text-[11px] text-muted-foreground break-all">
              Currently saved: <span className="font-mono">{saved}</span>
            </p>
          )}
        </div>

        <div className={`rounded-lg border border-border ${previewBg} p-3 flex items-center justify-center min-w-[120px] min-h-[88px]`}>
          {trimmed ? (
            <img
              src={trimmed}
              alt="Preview"
              className={previewClassName}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
            />
          ) : (
            <span className="text-[11px] text-muted-foreground">No image</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={update.isPending || (!saved && !draft)}
          className="gap-1"
        >
          <RotateCcw className="h-4 w-4" /> Reset to default
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || update.isPending || !looksValid}
          className="gap-1"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </Card>
  );
}