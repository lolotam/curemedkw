import * as React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Upload, Save, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
  const meta = HERO_PAGES.find((p) => p.key === pageKey);
  const { toast } = useToast();
  const [slides, setSlides] = React.useState<Draft[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  React.useEffect(() => { refresh(); }, [refresh]);

  if (!meta) return <Navigate to="/admin/landing" replace />;

  const patchLocal = (id: string, patch: Partial<Draft>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, _dirty: true } : s)));
  };

  const addSlide = async () => {
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
        cta_href: "",
        sort_order: max + 1,
        is_active: true,
        overlay_opacity: 80,
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
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link to="/admin/landing"><ArrowLeft className="h-4 w-4 mr-1" /> All landing pages</Link>
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">{meta.label} — Hero slides</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload images or videos. Inactive slides are hidden from the live site.</p>
        </div>
        <Button onClick={addSlide}><Plus className="h-4 w-4 mr-1" /> Add slide</Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : slides.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">No slides yet. Add one to start customizing this landing page.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {slides.map((s, i) => (
            <Card key={s.id} className="p-5">
              <div className="grid lg:grid-cols-[280px,1fr] gap-5">
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
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Slide #{i + 1}</span>
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
                      <Input value={s.title_en ?? ""} onChange={(e) => patchLocal(s.id, { title_en: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Title (Arabic)</Label>
                      <Input value={s.title_ar ?? ""} onChange={(e) => patchLocal(s.id, { title_ar: e.target.value })} dir="rtl" />
                    </div>
                    <div>
                      <Label className="text-xs">Subtitle (English)</Label>
                      <Textarea rows={2} value={s.subtitle_en ?? ""} onChange={(e) => patchLocal(s.id, { subtitle_en: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Subtitle (Arabic)</Label>
                      <Textarea rows={2} value={s.subtitle_ar ?? ""} onChange={(e) => patchLocal(s.id, { subtitle_ar: e.target.value })} dir="rtl" />
                    </div>
                    <div>
                      <Label className="text-xs">CTA label (English)</Label>
                      <Input value={s.cta_label_en ?? ""} onChange={(e) => patchLocal(s.id, { cta_label_en: e.target.value })} placeholder="Shop now" />
                    </div>
                    <div>
                      <Label className="text-xs">CTA label (Arabic)</Label>
                      <Input value={s.cta_label_ar ?? ""} onChange={(e) => patchLocal(s.id, { cta_label_ar: e.target.value })} dir="rtl" placeholder="تسوّق الآن" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">CTA link</Label>
                      <Input value={s.cta_href ?? ""} onChange={(e) => patchLocal(s.id, { cta_href: e.target.value })} placeholder="/flexitol or https://…" />
                    </div>
                  </div>

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