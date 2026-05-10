import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Save, RotateCcw, Loader2, AlertTriangle, Info, CheckCircle2, XCircle, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  BRANDING_FAVICON_KEY,
  BRANDING_LOGO_KEY,
  BRANDING_LOGO_REMOVE_BG_KEY,
  BRANDING_BRAND_LOGO_KEY,
  BRANDING_BRAND_CARD_LOGO_KEY,
  FEATURED_GLASS_OPACITY_KEY,
  LOADER_BAR_KEY,
  LOADER_BAR_DEFAULTS,
  LOADER_VIDEO_KEY,
  LOADER_VIDEO_DEFAULT,
  useLoaderBarSettings,
  useLoaderVideoUrl,
  useBrandingFavicon,
  useBrandingLogo,
  useBrandingLogoRemoveBg,
  useBrandingBrandLogo,
  useBrandingBrandCardLogo,
  useFeaturedGlassOpacity,
  useUpdateSiteSetting,
  uploadBrandingImage,
  uploadBrandingVideo,
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

      <FeaturedGlassOpacityControl />

      <LoaderVideoControl />

      <LoaderBarControl />

      <div className="pt-4">
        <h2 className="text-xl font-bold">Per-brand page logos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each brand has two logos: a <strong>Header logo</strong> shown in the header on that
          brand's pages (e.g. <span className="font-mono">/flexitol</span>), and a{" "}
          <strong>Card logo</strong> shown inside the brand tile in the "Our brands" carousel on{" "}
          <span className="font-mono">/curemed</span>. Leave empty to use the built-in defaults.
        </p>
      </div>

      {BRAND_LIST.map((b) => (
        <div key={b.key} className="space-y-3">
          <h3 className="text-base font-semibold pl-1">{b.name}</h3>
          <BrandingField
            title="Header logo"
            description={`Shown in the site header on /${b.slug} and its sub-pages.`}
            settingKey={BRANDING_BRAND_LOGO_KEY(b.key)}
            useValue={() => useBrandingBrandLogo(b.key)}
            previewClassName="h-20 w-auto max-w-[260px] object-contain"
            showTransparencyCheck
            uploadPrefix={`brand-${b.key}-header`}
          />
          <BrandingField
            title="Card logo"
            description={`Shown inside the ${b.name} tile in the "Our brands" carousel on /curemed.`}
            settingKey={BRANDING_BRAND_CARD_LOGO_KEY(b.key)}
            useValue={() => useBrandingBrandCardLogo(b.key)}
            previewClassName="h-20 w-auto max-w-[260px] object-contain"
            showTransparencyCheck
            uploadPrefix={`brand-${b.key}-card`}
          />
        </div>
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

function LoaderBarControl() {
  const { data: saved } = useLoaderBarSettings();
  const update = useUpdateSiteSetting();
  const initial = saved ?? LOADER_BAR_DEFAULTS;
  const [cfg, setCfg] = React.useState(initial);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!touched && saved) setCfg(saved);
  }, [saved, touched]);

  const commit = (next: typeof initial) => {
    update.mutate(
      { key: LOADER_BAR_KEY, value: next },
      {
        onSuccess: () => {
          setTouched(false);
          toast.success("Loader bar updated");
        },
        onError: (e: any) => toast.error(e?.message || "Failed to update"),
      },
    );
  };

  const reset = () => {
    setTouched(true);
    setCfg(LOADER_BAR_DEFAULTS);
    commit(LOADER_BAR_DEFAULTS);
  };

  const update1 = (patch: Partial<typeof initial>) => {
    setTouched(true);
    setCfg((c) => ({ ...c, ...patch }));
  };

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h3 className="text-base font-semibold">Loading page — gradient progress bar</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          Controls the duration, position and width of the loading bar shown on top of the
          intro video. Same logic as the H1 / H2 / CTA position controls in the hero slides:
          X and Y are percentages of the screen, with 50% being centered.
        </p>
      </div>

      <SliderRow
        label="Animation duration"
        valueLabel={`${(cfg.durationMs / 1000).toFixed(1)} s`}
        min={1000}
        max={8000}
        step={100}
        value={cfg.durationMs}
        onChange={(v) => update1({ durationMs: v })}
        onCommit={(v) => commit({ ...cfg, durationMs: v })}
      />
      <SliderRow
        label="Horizontal position (X)"
        valueLabel={`${cfg.positionX}%`}
        min={0}
        max={100}
        step={1}
        value={cfg.positionX}
        onChange={(v) => update1({ positionX: v })}
        onCommit={(v) => commit({ ...cfg, positionX: v })}
      />
      <SliderRow
        label="Vertical position (Y)"
        valueLabel={`${cfg.positionY}%`}
        min={0}
        max={100}
        step={1}
        value={cfg.positionY}
        onChange={(v) => update1({ positionY: v })}
        onCommit={(v) => commit({ ...cfg, positionY: v })}
      />
      <SliderRow
        label="Bar width"
        valueLabel={`${cfg.widthPx} px`}
        min={120}
        max={600}
        step={10}
        value={cfg.widthPx}
        onChange={(v) => update1({ widthPx: v })}
        onCommit={(v) => commit({ ...cfg, widthPx: v })}
      />

      <div className="space-y-1.5">
        <Label className="text-xs">Position preview</Label>
        <div className="relative w-full aspect-video rounded-lg bg-slate-900 overflow-hidden border border-border">
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${cfg.positionX}%`, top: `${cfg.positionY}%` }}
          >
            <div
              className="h-1 rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] shadow-[0_0_8px_hsl(var(--curemed-blue)/0.7)]"
              style={{ width: Math.max(40, cfg.widthPx / 3) }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={reset} disabled={update.isPending}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to defaults
        </Button>
        {update.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </Card>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">{label}</Label>
        <span className="text-sm font-semibold tabular-nums text-brand">{valueLabel}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? min)}
        onValueCommit={(v) => onCommit(v[0] ?? min)}
      />
    </div>
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

function FeaturedGlassOpacityControl() {
  const { data: saved = 70 } = useFeaturedGlassOpacity();
  const update = useUpdateSiteSetting();
  const [value, setValue] = React.useState<number>(saved);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!touched) setValue(saved);
  }, [saved, touched]);

  const save = (v: number) => {
    update.mutate(
      { key: FEATURED_GLASS_OPACITY_KEY, value: v },
      {
        onSuccess: () => {
          setTouched(false);
          toast.success("Opacity updated");
        },
        onError: (e: any) => toast.error(e?.message || "Failed to update"),
      },
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Featured card — glass strip opacity</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Controls the background transparency of the frosted info strip on featured product
            cards. Lower values reveal more of the product image. Text and price stay fully
            readable.
          </p>
        </div>
        <div className="text-2xl font-bold tabular-nums text-brand">{value}%</div>
      </div>

      <Slider
        value={[value]}
        min={0}
        max={100}
        step={5}
        onValueChange={(v) => {
          setTouched(true);
          setValue(v[0] ?? 0);
        }}
        onValueCommit={(v) => save(v[0] ?? 0)}
      />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTouched(true);
            setValue(70);
            save(70);
          }}
          disabled={update.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to 70%
        </Button>
        {update.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </Card>
  );
}


function LoaderVideoControl() {
  const { data: saved, isLoading } = useLoaderVideoUrl();
  const update = useUpdateSiteSetting();
  const [draft, setDraft] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!touched) setDraft(saved ?? "");
  }, [saved, touched]);

  const trimmed = draft.trim();
  const dirty = (saved ?? "") !== draft;
  const looksValid = !trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");
  const previewUrl = (saved && saved.trim()) || LOADER_VIDEO_DEFAULT;

  const handleSave = async () => {
    try {
      await update.mutateAsync({ key: LOADER_VIDEO_KEY, value: trimmed });
      setTouched(false);
      toast.success("Preloader video updated");
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message ?? "Unknown error" });
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset preloader video to the default?")) return;
    try {
      await update.mutateAsync({ key: LOADER_VIDEO_KEY, value: "" });
      setDraft("");
      setTouched(false);
      toast.success("Preloader video reset to default");
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message ?? "Unknown error" });
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Invalid file", { description: "Please pick a video (MP4, WebM, MOV)." });
      return;
    }
    const MAX = 30 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("File too large", { description: "Maximum size is 30 MB." });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadBrandingVideo(file, "loader-video");
      await update.mutateAsync({ key: LOADER_VIDEO_KEY, value: url });
      setDraft(url);
      setTouched(false);
      toast.success("Preloader video uploaded and saved");
    } catch (err: any) {
      toast.error("Upload failed", { description: err?.message ?? "Unknown error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Preloading page video</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Shown on the splash/loading screen before the home page. Upload an MP4/WebM (max 30 MB)
          or paste a video URL. Saves immediately to the live database.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Video URL</Label>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
            placeholder="https://example.com/loader.mp4"
            disabled={isLoading || uploading}
            className="flex-1"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleFilePicked}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || update.isPending}
            className="gap-1 shrink-0"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Paste a URL above, or upload a file (MP4 / WebM / MOV, max 30 MB). Uploads are saved automatically.
        </p>
        {!looksValid && (
          <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            URL should start with https:// or / (for files in the public folder).
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Live preview</Label>
        <video
          key={previewUrl}
          src={previewUrl}
          controls
          muted
          playsInline
          className="h-44 w-full rounded-lg bg-black object-contain"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || !looksValid || update.isPending || uploading}
          className="gap-1"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save URL
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={update.isPending || uploading}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to default
        </Button>
      </div>
    </Card>
  );
}
