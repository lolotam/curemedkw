import * as React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Upload, Save, EyeOff, RotateCcw, ExternalLink, LayoutGrid, MousePointerClick, AlertTriangle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRANDS } from "@/lib/brands";
import { SlideStylePanel } from "@/components/admin/SlideStylePanel";
import { SlideLivePreview } from "@/components/admin/SlideLivePreview";
import { HeroIntervalCard } from "@/components/admin/HeroIntervalCard";
import type { BrandKey } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  HERO_PAGES,
  type HeroPageKey,
  type HeroSlide,
  listSlidesForPage,
  createSlide,
  updateSlide,
  deleteSlide,
  uploadHeroMedia,
} from "@/lib/heroSlides";

type Draft = Omit<HeroSlide, "created_at" | "updated_at"> & { _dirty?: boolean; _saving?: boolean };

export default function AdminLandingPageEditor() {
  const { pageKey } = useParams<{ pageKey: string }>();
  const navigate = useNavigate();
  const meta = pageKey ? HERO_PAGES.find((p) => p.key === pageKey) : undefined;
  const { toast } = useToast();
  const [slides, setSlides] = React.useState<Draft[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    try {
      const rows = await listSlidesForPage(meta.key as HeroPageKey, false);
      setSlides(rows);
    } catch (e: any) {
      toast({ title: "Failed to load slides", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [meta, toast]);

  React.useEffect(() => {
    // Reset slides when switching pages so stale data doesn't flash
    setSlides([]);
    if (meta) refresh();
  }, [meta, refresh]);

  const hasUnsaved = slides.some((s) => s._dirty);
  const dirtyCount = slides.filter((s) => s._dirty).length;

  // Warn if the user tries to close/refresh the tab with unsaved drafts.
  React.useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const switchToPage = (key: string) => {
    if (key === pageKey) return;
    if (hasUnsaved && !confirm("You have unsaved changes on this page. Discard them?")) {
      return;
    }
    navigate(`/admin/landing/${key}`);
  };

  const activeCount = slides.filter((s) => s.is_active).length;

  const patchLocal = (id: string, patch: Partial<Draft>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, _dirty: true } : s)));
  };

  const addSlide = async () => {
    if (!meta) return;
    try {
      const max = slides.reduce((m, s) => Math.max(m, s.sort_order), -1);
      const created = await createSlide({
        page_key: meta.key as HeroPageKey,
        media_url: "",
        media_type: "image",
        title_en: "New slide",
        title_ar: "شريحة جديدة",
        subtitle_en: "",
        subtitle_ar: "",
        cta_label_en: "",
        cta_label_ar: "",
        cta_href: "#",
        sort_order: max + 1,
        is_active: true,
        overlay_opacity: 80,
        font_family_en: "Inter",
        font_family_ar: "Cairo",
        h1_font_size: 60,
        h2_font_size: 20,
        cta_font_size: 16,
        h1_animation: "fade-in-up",
        h2_animation: "fade-in-up",
        cta_animation: "fade-in-up",
        text_position_x: 10,
        text_position_y: 50,
        text_align: "left",
      });
      setSlides((prev) => [...prev, created]);
      toast({ title: "Slide added" });
    } catch (e: any) {
      toast({ title: "Failed to add", description: e.message, variant: "destructive" });
    }
  };

  const handleSave = async (s: Draft) => {
    setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: true } : x)));
    try {
      const { id, _dirty, _saving, ...rest } = s as any;
      await updateSlide(s.id, rest);
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _dirty: false, _saving: false } : x)));
      toast({ title: "Saved" });
    } catch (e: any) {
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: false } : x)));
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  // Quietly persist a slide without showing a toast (used by auto-save on blur).
  const autoSaveSlide = React.useCallback(async (slideId: string) => {
    let target: Draft | undefined;
    setSlides((prev) => {
      target = prev.find((x) => x.id === slideId && x._dirty && !x._saving);
      if (!target) return prev;
      return prev.map((x) => (x.id === slideId ? { ...x, _saving: true } : x));
    });
    if (!target) return;
    try {
      const { id, _dirty, _saving, ...rest } = target as any;
      await updateSlide(target.id, rest);
      setSlides((prev) => prev.map((x) => (x.id === slideId ? { ...x, _dirty: false, _saving: false } : x)));
    } catch (e: any) {
      setSlides((prev) => prev.map((x) => (x.id === slideId ? { ...x, _saving: false } : x)));
      toast({ title: "Auto-save failed", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const handleSaveAll = async () => {
    const dirty = slides.filter((s) => s._dirty && !s._saving);
    if (dirty.length === 0) return;
    setSlides((prev) => prev.map((x) => (x._dirty ? { ...x, _saving: true } : x)));
    let okCount = 0;
    const failures: string[] = [];
    await Promise.all(
      dirty.map(async (s) => {
        try {
          const { id, _dirty, _saving, ...rest } = s as any;
          await updateSlide(s.id, rest);
          setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _dirty: false, _saving: false } : x)));
          okCount++;
        } catch (e: any) {
          setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: false } : x)));
          failures.push(e.message ?? "Unknown error");
        }
      })
    );
    if (failures.length === 0) {
      toast({ title: `Saved ${okCount} slide${okCount === 1 ? "" : "s"}` });
    } else {
      toast({
        title: `Saved ${okCount}, failed ${failures.length}`,
        description: failures[0],
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (s: Draft) => {
    if (!confirm("Delete this slide?")) return;
    try {
      await deleteSlide(s.id);
      setSlides((prev) => prev.filter((x) => x.id !== s.id));
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const swap = async (i: number, j: number) => {
    if (j < 0 || j >= slides.length) return;
    const a = slides[i];
    const b = slides[j];
    const aOrder = a.sort_order;
    const bOrder = b.sort_order;
    setSlides((prev) => {
      const copy = [...prev];
      copy[i] = { ...b, sort_order: aOrder };
      copy[j] = { ...a, sort_order: bOrder };
      return copy;
    });
    try {
      await Promise.all([
        updateSlide(a.id, { sort_order: bOrder }),
        updateSlide(b.id, { sort_order: aOrder }),
      ]);
    } catch (e: any) {
      toast({ title: "Reorder failed", description: e.message, variant: "destructive" });
      refresh();
    }
  };

  const handleUpload = async (s: Draft, file: File) => {
    setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: true } : x)));
    try {
      const { url, type } = await uploadHeroMedia(file);
      // Auto-publish on first upload so the hero appears immediately on the live site.
      const shouldActivate = !s.media_url && !s.is_active;
      const patch: any = { media_url: url, media_type: type };
      if (shouldActivate) patch.is_active = true;
      await updateSlide(s.id, patch);
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch, _saving: false, _dirty: false } : x)));
      toast({ title: shouldActivate ? "Media uploaded & published" : "Media uploaded" });
    } catch (e: any) {
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: false } : x)));
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  // Persist Active/Hidden toggle immediately — it's a publish switch, not a draft change.
  const toggleActive = async (s: Draft, value: boolean) => {
    setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: value, _saving: true } : x)));
    try {
      await updateSlide(s.id, { is_active: value });
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, _saving: false } : x)));
      toast({ title: value ? "Slide published" : "Slide hidden" });
    } catch (e: any) {
      setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !value, _saving: false } : x)));
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Sticky toolbar with page dropdown */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-4 mb-6 bg-background/85 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/admin/landing/all">
              <LayoutGrid className="h-4 w-4" /> Browse all
            </Link>
          </Button>

          <div className="flex-1 min-w-[240px] max-w-md">
            <Select value={pageKey ?? ""} onValueChange={switchToPage}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Choose a landing page…">
                  {meta && <PageOption pageKey={meta.key} label={meta.label} route={meta.route} compact />}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HERO_PAGES.map((p) => (
                  <SelectItem key={p.key} value={p.key} className="py-2.5">
                    <PageOption pageKey={p.key} label={p.label} route={p.route} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {meta && (
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 border border-border">
              {slides.length} slides · {activeCount} active
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {dirtyCount > 0 && (
              <Button
                onClick={handleSaveAll}
                size="sm"
                variant="default"
                className="gap-1 bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Save className="h-4 w-4" /> Save all ({dirtyCount})
              </Button>
            )}
            {meta && (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={meta.route} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> View live
                </a>
              </Button>
            )}
            <Button onClick={addSlide} disabled={!meta} className="gap-1">
              <Plus className="h-4 w-4" /> Add slide
            </Button>
          </div>
        </div>
      </div>

      {meta ? (
        <header className="mb-6 flex items-center gap-3">
          <PageBadge pageKey={meta.key} />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">
              Hero slides — {meta.label}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload images or videos. Inactive slides are hidden from the live site.
            </p>
          </div>
        </header>
      ) : null}

      {!meta ? (
        <EmptyPickerState onPick={switchToPage} />
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : slides.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">No slides yet. Add one to start customizing this landing page.</p>
          <Button onClick={addSlide} className="mt-4 gap-1">
            <Plus className="h-4 w-4" /> Add first slide
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <HeroIntervalCard pageKey={meta.key as HeroPageKey} />
          {slides.map((s, i) => (
            <Card key={s.id} className={cn("p-5 transition-colors", s._dirty && "ring-2 ring-amber-400/60 border-amber-300")}>
              <div className="grid lg:grid-cols-[300px,1fr] gap-5">
                {/* Media */}
                <div className="space-y-3">
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    {s.media_url ? (
                      s.media_type === "video" ? (
                        <video src={s.media_url} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                      ) : (
                        <img src={s.media_url} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">No media</span>
                    )}
                    {/* Live overlay preview matching the live hero gradient */}
                    {s.media_url && (s.overlay_opacity ?? 80) > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none transition-opacity"
                        style={{
                          background: `linear-gradient(to right, hsl(var(--background) / ${(s.overlay_opacity ?? 80) / 100}), hsl(var(--background) / ${((s.overlay_opacity ?? 80) / 100) * 0.5}), hsl(var(--background) / ${((s.overlay_opacity ?? 80) / 100) * 0.125}))`,
                        }}
                      />
                    )}
                  </div>
                  <label className="block">
                    <span className="sr-only">Upload media</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(s, f);
                        e.target.value = "";
                      }}
                      id={`upload-${s.id}`}
                    />
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <label htmlFor={`upload-${s.id}`} className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-1" /> Upload image / video
                      </label>
                    </Button>
                  </label>

                  {/* Overlay opacity control */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Overlay opacity</Label>
                      <span className="text-xs font-mono tabular-nums rounded bg-background border border-border px-1.5 py-0.5">
                        {s.overlay_opacity ?? 80}%
                      </span>
                    </div>
                    <Slider
                      value={[s.overlay_opacity ?? 80]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => patchLocal(s.id, { overlay_opacity: v })}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs flex-1"
                        onClick={() => patchLocal(s.id, { overlay_opacity: 0 })}
                      >
                        <EyeOff className="h-3 w-3 mr-1" /> Remove
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs flex-1"
                        onClick={() => patchLocal(s.id, { overlay_opacity: 80 })}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      0% shows the photo in full color. Higher values darken the image so text stays readable.
                    </p>
                  </div>

                  {/* Live preview reflects every change instantly */}
                  <SlideLivePreview slide={s as any} />
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Slide #{i + 1}</span>
                      {s._dirty && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                          <CircleDot className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                          Unsaved
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 ml-2">
                        <Switch checked={s.is_active} onCheckedChange={(v) => toggleActive(s, v)} disabled={s._saving} />
                        <Label className="text-xs">{s.is_active ? "Active" : "Hidden"}</Label>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => swap(i, i - 1)} disabled={i === 0}><ChevronUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => swap(i, i + 1)} disabled={i === slides.length - 1}><ChevronDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Title (English)</Label>
                      <Input value={s.title_en ?? ""} onChange={(e) => patchLocal(s.id, { title_en: e.target.value })} onBlur={() => autoSaveSlide(s.id)} />
                    </div>
                    <div>
                      <Label className="text-xs">Title (Arabic)</Label>
                      <Input value={s.title_ar ?? ""} onChange={(e) => patchLocal(s.id, { title_ar: e.target.value })} onBlur={() => autoSaveSlide(s.id)} dir="rtl" />
                    </div>
                    <div>
                      <Label className="text-xs">Subtitle (English)</Label>
                      <Textarea rows={2} value={s.subtitle_en ?? ""} onChange={(e) => patchLocal(s.id, { subtitle_en: e.target.value })} onBlur={() => autoSaveSlide(s.id)} />
                    </div>
                    <div>
                      <Label className="text-xs">Subtitle (Arabic)</Label>
                      <Textarea rows={2} value={s.subtitle_ar ?? ""} onChange={(e) => patchLocal(s.id, { subtitle_ar: e.target.value })} onBlur={() => autoSaveSlide(s.id)} dir="rtl" />
                    </div>
                    <div>
                      <Label className="text-xs">CTA label (English)</Label>
                      <Input value={s.cta_label_en ?? ""} onChange={(e) => patchLocal(s.id, { cta_label_en: e.target.value })} onBlur={() => autoSaveSlide(s.id)} placeholder="Shop now" />
                    </div>
                    <div>
                      <Label className="text-xs">CTA label (Arabic)</Label>
                      <Input value={s.cta_label_ar ?? ""} onChange={(e) => patchLocal(s.id, { cta_label_ar: e.target.value })} onBlur={() => autoSaveSlide(s.id)} dir="rtl" placeholder="تسوّق الآن" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">CTA link</Label>
                      <Input value={s.cta_href ?? ""} onChange={(e) => patchLocal(s.id, { cta_href: e.target.value })} onBlur={() => autoSaveSlide(s.id)} placeholder="/flexitol or https://…" />
                      {(s.cta_label_en || s.cta_label_ar) && !s.cta_href?.trim() && (
                        <p className="mt-1 text-[11px] text-amber-600 inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          You set a CTA label but no link — the button will appear but won't navigate. Add a path like <code className="font-mono">/flexitol</code> or a full URL.
                        </p>
                      )}
                    </div>
                  </div>

                  <SlideStylePanel slide={s as any} onPatch={(patch) => patchLocal(s.id, patch as Partial<Draft>)} />

                  <div className="flex justify-end">
                    <Button onClick={() => handleSave(s)} disabled={!s._dirty || s._saving} size="sm">
                      {s._saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Helper components ---------- */

function PageOption({
  pageKey,
  label,
  route,
  compact,
}: {
  pageKey: HeroPageKey;
  label: string;
  route: string;
  compact?: boolean;
}) {
  const isMain = pageKey === "curemed";
  const meta = isMain ? null : BRANDS[pageKey as BrandKey];
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      {meta ? (
        <span className="h-7 w-7 rounded-lg bg-white shadow-sm ring-1 ring-black/5 p-0.5 flex items-center justify-center shrink-0">
          <img src={meta.logo} alt="" className="max-h-full max-w-full object-contain" />
        </span>
      ) : (
        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand to-brand/60 text-white shadow-sm flex items-center justify-center font-black text-xs shrink-0">
          C
        </span>
      )}
      <span className={cn("font-medium truncate", compact ? "text-sm" : "text-sm")}>
        {label}
      </span>
      {!compact && (
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {route}
        </span>
      )}
    </span>
  );
}

function PageBadge({ pageKey }: { pageKey: HeroPageKey }) {
  const isMain = pageKey === "curemed";
  const meta = isMain ? null : BRANDS[pageKey as BrandKey];
  return meta ? (
    <div className="h-12 w-12 rounded-xl bg-white shadow-md ring-1 ring-black/5 p-1.5 flex items-center justify-center shrink-0">
      <img src={meta.logo} alt={meta.name} className="max-h-full max-w-full object-contain" />
    </div>
  ) : (
    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand to-brand/60 text-white shadow-md flex items-center justify-center font-black text-xl shrink-0">
      C
    </div>
  );
}

function EmptyPickerState({ onPick }: { onPick: (key: string) => void }) {
  return (
    <Card className="p-10 md:p-14 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-4">
        <MousePointerClick className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold">Pick a landing page</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Choose a brand from the dropdown above, or click one of the quick links below to start adding hero slides.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {HERO_PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p.key)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card hover:bg-muted/50 hover:border-brand/40 transition-colors px-3 py-1.5 text-sm"
          >
            <PageOption pageKey={p.key} label={p.label} route={p.route} compact />
          </button>
        ))}
      </div>
    </Card>
  );
}