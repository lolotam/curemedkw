/**
 * 10 text animation presets for hero slide H1 / H2 / CTA.
 * Most are pure CSS classes defined in src/index.css.
 * "typewriter" is special-cased by SlideAnimatedText.
 */

export type SlideAnimationKey =
  | "none"
  | "fade-in"
  | "fade-in-up"
  | "fade-in-down"
  | "slide-in-left"
  | "slide-in-right"
  | "zoom-in"
  | "typewriter"
  | "blur-in"
  | "bounce-in";

export const SLIDE_ANIMATIONS: { value: SlideAnimationKey; label: string }[] = [
  { value: "none",           label: "None" },
  { value: "fade-in",        label: "Fade in" },
  { value: "fade-in-up",     label: "Fade in up" },
  { value: "fade-in-down",   label: "Fade in down" },
  { value: "slide-in-left",  label: "Slide in from left" },
  { value: "slide-in-right", label: "Slide in from right" },
  { value: "zoom-in",        label: "Zoom in" },
  { value: "typewriter",     label: "Typewriter" },
  { value: "blur-in",        label: "Blur in" },
  { value: "bounce-in",      label: "Bounce in" },
];

export function animationClass(key: string | null | undefined): string {
  if (!key || key === "none" || key === "typewriter") return "";
  return `slide-anim-${key}`;
}