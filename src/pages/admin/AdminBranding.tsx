import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Save, RotateCcw, Loader2, AlertTriangle, Info, CheckCircle2, XCircle, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  BRANDING_FAVICON_KEY,
  BRANDING_LOGO_KEY,
  BRANDING_LOGO_REMOVE_BG_KEY,
  BRANDING_BRAND_LOGO_KEY,
  useBrandingFavicon,
  useBrandingLogo,
  useBrandingLogoRemoveBg,
  useBrandingBrandLogo,
  useUpdateSiteSetting,
  uploadBrandingImage,
} from "@/lib/db";
import { BRAND_LIST } from "@/lib/brands";

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
        showTransparencyCheck
        uploadPrefix="logo"
      />

      <RemoveWhiteBgToggle />

      <BrandingField
        title="Favicon"
        description="Shown in the browser tab. Recommended: square PNG, ICO, or SVG (32×32 or larger)."
        settingKey={BRANDING_FAVICON_KEY}
        useValue={useBrandingFavicon}
        previewClassName="h-8 w-8 object-contain"
        uploadPrefix="favicon"
      />

      <div className="pt-4">
        <h2 className="text-xl font-bold">Per-brand page logos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each brand page can have its own header logo. When a visitor opens a brand page
          (e.g. <span className="font-mono">/flexitol</span>), the header logo automatically
          swaps to that brand's logo. Leave empty to use the global Curemed logo.
        </p>
      </div>

      {BRAND_LIST.map((b) => (
        <BrandingField
          key={b.key}
          title={`${b.name} logo`}
          description={`Shown in the header on /${b.slug} and its sub-pages.`}
          settingKey={BRANDING_BRAND_LOGO_KEY(b.key)}
          useValue={() => useBrandingBrandLogo(b.key)}
          previewClassName="h-20 w-auto max-w-[260px] object-contain"
          showTransparencyCheck
          uploadPrefix={`brand-${b.key}`}
        />
      ))}
    </div>
  );
}

interface FieldProps {
  title: string;
  description: string;
  settingKey: string;
  useValue: () => { data: string | undefined; isLoading: boolean };
  previewClassName: string;
  showTransparencyCheck?: boolean;
  uploadPrefix: string;
}

function BrandingField({ title, description, settingKey, useValue, previewClassName, showTransparencyCheck, uploadPrefix }: FieldProps) {
  const { data: saved, isLoading } = useValue();
  const update = useUpdateSiteSetting();
  const [draft, setDraft] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [contentType, setContentType] = React.useState<string | null>(null);
  const [probing, setProbing] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Initialize the draft once data arrives.
  React.useEffect(() => {
    if (!touched) setDraft(saved ?? "");
  }, [saved, touched]);

  const trimmed = draft.trim();

  // Probe the URL's Content-Type to warn when host serves JPEG (no transparency).
  React.useEffect(() => {
    if (!showTransparencyCheck || !trimmed || !/^https?:\/\//i.test(trimmed)) {
      setContentType(null);
      return;
    }
    let cancelled = false;
    setProbing(true);
    fetch(trimmed, { method: "HEAD" })
      .then((r) => { if (!cancelled) setContentType(r.headers.get("content-type")); })
      .catch(() => { if (!cancelled) setContentType(null); })
      .finally(() => { if (!cancelled) setProbing(false); });
    return () => { cancelled = true; };
  }, [trimmed, showTransparencyCheck]);

  const dirty = (saved ?? "") !== draft;
  const looksValid = !trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");
  const ctLower = (contentType || "").toLowerCase();
  const isJpeg = ctLower.includes("jpeg") || ctLower.includes("jpg");
  const isTransparentCapable = ctLower.includes("png") || ctLower.includes("svg") || ctLower.includes("webp") || ctLower.includes("gif");

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

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file", { description: "Please pick an image (PNG, SVG, WebP, JPEG, ICO)." });
      return;
    }
    const MAX = 4 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("File too large", { description: "Maximum size is 4 MB." });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadBrandingImage(file, uploadPrefix);
      await update.mutateAsync({ key: settingKey, value: url });
      setDraft(url);
      setTouched(false);
      toast.success(`${title} uploaded and saved`);
    } catch (err: any) {
      toast.error("Upload failed", { description: err?.message ?? "Unknown error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Image URL</Label>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
              placeholder="https://example.com/logo.png"
              disabled={isLoading || uploading}
              className="flex-1"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon"
              className="hidden"
              onChange={handleFilePicked}
            />
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || update.isPending}
              className="gap-1 shrink-0"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste a URL above, or upload a file (PNG / SVG / WebP / JPEG / ICO, max 4 MB). Uploads are saved automatically.
          </p>
          {!looksValid && (
            <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              URL should start with https:// or / (for files in the public folder).
            </p>
          )}
          {showTransparencyCheck && trimmed && contentType && (
            <p className={`text-[11px] inline-flex items-center gap-1 ${isJpeg ? "text-amber-600" : "text-muted-foreground"}`}>
              {isJpeg ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              Server returns <span className="font-mono">{contentType}</span>
              {isJpeg && " — JPEG cannot be transparent. Re-upload as PNG/SVG."}
              {!isJpeg && isTransparentCapable && " — format supports transparency."}
            </p>
          )}
          {probing && (
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking image format…
            </p>
          )}
          {saved && (
            <p className="text-[11px] text-muted-foreground break-all">
              Currently saved: <span className="font-mono">{saved}</span>
            </p>
          )}
        </div>

        {showTransparencyCheck ? (
          <div className="space-y-2">
            <Label className="text-xs">Transparency check</Label>
            <div className="grid grid-cols-2 gap-3">
              <PreviewTile label="Checkerboard (true transparency)" tileClass="checkerboard-bg">
                {trimmed ? <img src={trimmed} alt="Preview" className={previewClassName} /> : <EmptyHint />}
              </PreviewTile>
              <PreviewTile label="Dark surface" tileClass="bg-slate-900">
                {trimmed ? <img src={trimmed} alt="Preview" className={previewClassName} /> : <EmptyHint dark />}
              </PreviewTile>
            </div>
            <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5 pt-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                If you see a <strong>white box</strong> behind the logo on either tile, the PNG itself
                is not transparent — re-export it from your design tool with a transparent background,
                or enable the workaround below.
              </span>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted p-3 flex items-center justify-center min-h-[88px]">
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
        )}
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

function PreviewTile({ label, tileClass, children }: { label: string; tileClass: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className={`rounded-lg border border-border ${tileClass} p-3 flex items-center justify-center min-h-[100px]`}>
        {children}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">{label}</p>
    </div>
  );
}

function EmptyHint({ dark }: { dark?: boolean }) {
  return <span className={`text-[11px] ${dark ? "text-slate-400" : "text-muted-foreground"}`}>No image</span>;
}

function RemoveWhiteBgToggle() {
  const { data: enabled = false } = useBrandingLogoRemoveBg();
  const update = useUpdateSiteSetting();

  const onToggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ key: BRANDING_LOGO_REMOVE_BG_KEY, value: next });
      toast.success(next ? "White background removal enabled" : "White background removal disabled");
    } catch (e: any) {
      toast.error("Update failed", { description: e?.message ?? "Unknown error" });
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Workaround: remove white background from logo</h3>
          <p className="text-xs text-muted-foreground max-w-prose">
            If your logo file has a white background baked in (not truly transparent), enable this to
            visually drop the white using a CSS blend mode. <strong>Tradeoff:</strong> very light parts of
            the logo may also disappear and colored logos can look washed out. The proper fix is to
            re-export the logo as a true transparent PNG or SVG.
          </p>
        </div>
        <Switch checked={!!enabled} onCheckedChange={onToggle} disabled={update.isPending} />
      </div>
    </Card>
  );
}