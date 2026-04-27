/**
 * Curated Google Fonts available to the slide editor.
 * The font files are loaded once via index.html.
 */

export interface SlideFontOption {
  /** Stored value (matches the family name loaded from Google Fonts). */
  value: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** CSS font-family string used at render time. */
  css: string;
}

export const ENGLISH_FONTS: SlideFontOption[] = [
  { value: "Inter",            label: "Inter (Modern Sans)",      css: "'Inter', system-ui, sans-serif" },
  { value: "Roboto",           label: "Roboto (Clean Sans)",      css: "'Roboto', system-ui, sans-serif" },
  { value: "Poppins",          label: "Poppins (Geometric)",      css: "'Poppins', system-ui, sans-serif" },
  { value: "Montserrat",       label: "Montserrat (Bold Sans)",   css: "'Montserrat', system-ui, sans-serif" },
  { value: "Playfair Display", label: "Playfair Display (Serif)", css: "'Playfair Display', Georgia, serif" },
  { value: "Lora",             label: "Lora (Editorial Serif)",   css: "'Lora', Georgia, serif" },
  { value: "Oswald",           label: "Oswald (Condensed)",       css: "'Oswald', Impact, sans-serif" },
  { value: "Raleway",          label: "Raleway (Elegant Sans)",   css: "'Raleway', system-ui, sans-serif" },
  { value: "Merriweather",     label: "Merriweather (Classic)",   css: "'Merriweather', Georgia, serif" },
  { value: "Bebas Neue",       label: "Bebas Neue (Display)",     css: "'Bebas Neue', Impact, sans-serif" },
];

export const ARABIC_FONTS: SlideFontOption[] = [
  { value: "Cairo",              label: "Cairo (مودرن)",                 css: "'Cairo', sans-serif" },
  { value: "Tajawal",            label: "Tajawal (تجوال)",               css: "'Tajawal', sans-serif" },
  { value: "Almarai",            label: "Almarai (المراعي)",             css: "'Almarai', sans-serif" },
  { value: "Amiri",              label: "Amiri (أميري - تقليدي)",        css: "'Amiri', serif" },
  { value: "Noto Naskh Arabic",  label: "Noto Naskh Arabic (نسخ)",       css: "'Noto Naskh Arabic', serif" },
  { value: "Markazi Text",       label: "Markazi Text (مركزي)",          css: "'Markazi Text', serif" },
  { value: "Reem Kufi",          label: "Reem Kufi (كوفي)",              css: "'Reem Kufi', sans-serif" },
  { value: "Lateef",             label: "Lateef (لطيف)",                 css: "'Lateef', serif" },
  { value: "Scheherazade New",   label: "Scheherazade (شهرزاد)",         css: "'Scheherazade New', serif" },
  { value: "Changa",             label: "Changa (شنقا)",                 css: "'Changa', sans-serif" },
];

export function fontCss(family: string | null | undefined, lang: "en" | "ar"): string {
  const list = lang === "ar" ? ARABIC_FONTS : ENGLISH_FONTS;
  const hit = list.find((f) => f.value === family);
  if (hit) return hit.css;
  return list[0].css;
}