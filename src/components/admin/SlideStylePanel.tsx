import * as React from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ENGLISH_FONTS, ARABIC_FONTS } from "@/lib/slideFonts";
import { SLIDE_ANIMATIONS } from "@/lib/slideAnimations";
import type { HeroSlide } from "@/lib/heroSlides";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";

interface Props {
  // Accepts both saved slides and editor drafts.
  slide: Omit<HeroSlide, "created_at" | "updated_at"> & Partial<Pick<HeroSlide, "created_at" | "updated_at">>;
  onPatch: (patch: Partial<HeroSlide>) => void;
}

export function SlideStylePanel({ slide: s, onPatch }: Props) {
  return (
    <div className="space-y-5 rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="text-sm font-semibold">Style & motion</h4>

      {/* Fonts */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Font · English</Label>
          <Select value={s.font_family_en} onValueChange={(v) => onPatch({ font_family_en: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENGLISH_FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.css }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Font · Arabic</Label>
          <Select value={s.font_family_ar} onValueChange={(v) => onPatch({ font_family_ar: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ARABIC_FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.css }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sizes + Animations grid: H1 / H2 / CTA */}
      <div className="space-y-3">
        <SizeAnimRow
          label="Title (H1)"
          size={s.h1_font_size}
          minSize={20} maxSize={120}
          onSize={(v) => onPatch({ h1_font_size: v })}
          animation={s.h1_animation}
          onAnimation={(v) => onPatch({ h1_animation: v })}
        />
        <SizeAnimRow
          label="Subtitle (H2)"
          size={s.h2_font_size}
          minSize={12} maxSize={48}
          onSize={(v) => onPatch({ h2_font_size: v })}
          animation={s.h2_animation}
          onAnimation={(v) => onPatch({ h2_animation: v })}
        />
        <SizeAnimRow
          label="CTA button"
          size={s.cta_font_size}
          minSize={10} maxSize={32}
          onSize={(v) => onPatch({ cta_font_size: v })}
          animation={s.cta_animation}
          onAnimation={(v) => onPatch({ cta_animation: v })}
        />
      </div>

      {/* Position */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Text position</Label>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              const active = s.text_align === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onPatch({ text_align: a, text_position_x: a === "center" ? 50 : a === "right" ? 90 : 10 })}
                  className={`px-2 py-1 text-xs ${active ? "bg-brand text-white" : "bg-background hover:bg-muted"}`}
                  aria-label={`Align ${a}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Horizontal · {s.text_position_x}%</span>
            <span className="text-[10px]">Move text left ↔ right</span>
          </div>
          <Slider
            value={[s.text_position_x]}
            min={0} max={100} step={1}
            onValueChange={([v]) => onPatch({ text_position_x: v })}
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Vertical · {s.text_position_y}%</span>
            <span className="text-[10px]">Move text up ↕ down</span>
          </div>
          <Slider
            value={[s.text_position_y]}
            min={0} max={100} step={1}
            onValueChange={([v]) => onPatch({ text_position_y: v })}
          />
        </div>
      </div>
    </div>
  );
}

function SizeAnimRow({
  label, size, minSize, maxSize, onSize, animation, onAnimation,
}: {
  label: string;
  size: number;
  minSize: number; maxSize: number;
  onSize: (v: number) => void;
  animation: string;
  onAnimation: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[110px,1fr,140px] sm:grid-cols-[120px,1fr,160px] gap-2 items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Slider value={[size]} min={minSize} max={maxSize} step={1} onValueChange={([v]) => onSize(v)} />
        <Input
          type="number"
          className="h-8 w-16 text-xs"
          value={size}
          min={minSize}
          max={maxSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onSize(Math.min(maxSize, Math.max(minSize, v)));
          }}
        />
      </div>
      <Select value={animation} onValueChange={onAnimation}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SLIDE_ANIMATIONS.map((a) => (
            <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}