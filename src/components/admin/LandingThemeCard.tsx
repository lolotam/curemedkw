import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Layout, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadProductImage, type BrandKey } from "@/lib/db";
import {
  LANDING_THEMES,
  NO_LANDING_THEME,
  findLandingTheme,
  resolveLandingAssets,
  type LandingAssets,
  type LandingSection,
} from "@/lib/landingThemes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  theme: string;
  assets: LandingAssets;
  brand: BrandKey;
  productSlug: string;
  onThemeChange: (theme: string) => void;
  onAssetsChange: (assets: LandingAssets) => void;
}

const ASPECT_CLASS: Record<LandingSection["aspect"], string> = {
  "16/9": "aspect-video",
  "1/1": "aspect-square",
};

// Radix rejects an empty-string SelectItem value, so "no theme" needs a
// sentinel in the dropdown that maps back to the stored empty string.
const DEFAULT_OPTION = "__default__";

export function LandingThemeCard({
  theme,
  assets,
  brand,
  productSlug,
  onThemeChange,
  onAssetsChange,
}: Props) {
  const selected = findLandingTheme(theme);

  const setSection = (sectionId: string, urls: string[]) =>
    onAssetsChange({ ...assets, [sectionId]: urls });

  const selectTheme = (next: string) => {
    onThemeChange(next);
    // Switching themes would otherwise leave URLs for sections that no longer
    // exist, which the storefront ignores but which quietly grow the row.
    onAssetsChange(resolveLandingAssets(findLandingTheme(next), assets));
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layout className="h-4 w-4 text-brand" />
        <h2 className="font-semibold">Landing page</h2>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Page layout</Label>
        <Select
          value={selected ? selected.id : DEFAULT_OPTION}
          onValueChange={(v) => selectTheme(v === DEFAULT_OPTION ? NO_LANDING_THEME : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_OPTION}>Default product page</SelectItem>
            {LANDING_THEMES.map((themeOption) => (
              <SelectItem key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {selected
            ? selected.description
            : "The standard two-column product page with gallery, price and details."}
        </p>
      </div>

      {selected && (
        <div className="space-y-5 border-t border-border pt-4">
          <p className="text-[11px] text-muted-foreground">
            Section headings and text come from this product's own fields — name,
            short description, Benefits, Ingredients and How to use. Upload the
            imagery for each section below. Sections with no images are skipped.
          </p>
          {selected.sections.map((section) => (
            <SectionUploader
              key={section.id}
              section={section}
              urls={assets[section.id] ?? []}
              brand={brand}
              productSlug={productSlug}
              onChange={(urls) => setSection(section.id, urls)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SectionUploader({
  section,
  urls,
  brand,
  productSlug,
  onChange,
}: {
  section: LandingSection;
  urls: string[];
  brand: BrandKey;
  productSlug: string;
  onChange: (urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const full = urls.length >= section.max;

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = section.max - urls.length;
    if (files.length > room) {
      toast.info(`${section.label} holds ${section.max} image(s) — using the first ${room}.`);
    }
    setBusy(true);
    try {
      const uploaded = await Promise.all(
        files.slice(0, room).map((file) =>
          uploadProductImage(file, {
            brand,
            productSlug,
            subfolder: `landing/${section.id}`,
          }),
        ),
      );
      onChange([...urls, ...uploaded]);
      toast.success(`${uploaded.length} image(s) added to ${section.label}`);
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{section.label}</p>
          <p className="text-[11px] text-muted-foreground">{section.hint}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {section.aspect} · {urls.length}/{section.max}
          </span>
          <input
            type="file"
            ref={input}
            accept="image/*"
            multiple={section.max > 1}
            onChange={upload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || full}
            onClick={() => input.current?.click()}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {urls.length === 0 ? (
        <p className="rounded-lg bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          No images — this section will not appear on the page.
        </p>
      ) : (
        <div className={cn("grid gap-2", section.max > 1 ? "grid-cols-3" : "grid-cols-1")}>
          {urls.map((src, i) => (
            <div
              key={src}
              className={cn(
                "group relative overflow-hidden rounded-lg border border-border bg-muted",
                ASPECT_CLASS[section.aspect],
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                {section.max > 1 && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      title="Move earlier"
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      disabled={i === urls.length - 1}
                      onClick={() => move(i, i + 1)}
                      title="Move later"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => onChange(urls.filter((_, idx) => idx !== i))}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
