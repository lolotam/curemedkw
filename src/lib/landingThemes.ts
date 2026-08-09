/**
 * Landing-page themes for product detail pages.
 *
 * A theme swaps the default two-column product layout for a long-form,
 * conversion-oriented page. The layout and section order come from the theme;
 * every asset comes from the product, so the same theme can be applied to any
 * product without carrying another product's imagery.
 *
 * Kept free of React and Supabase imports so the resolution rules stay
 * unit-testable and can be reused from the admin editor and the storefront.
 */

export const NO_LANDING_THEME = "";

export type LandingAspect = "16/9" | "1/1";

export interface LandingSection {
  id: string;
  /** Admin-facing name, matching the heading the shopper sees. */
  label: string;
  hint: string;
  aspect: LandingAspect;
  /** Upper bound on uploads; the storefront renders one card per asset. */
  max: number;
}

export interface LandingTheme {
  id: string;
  label: string;
  description: string;
  sections: LandingSection[];
}

const GOLD_SECTIONS: LandingSection[] = [
  {
    id: "highlights",
    label: "What makes it different",
    hint: "One wide banner shown under the highlight pillars.",
    aspect: "16/9",
    max: 1,
  },
  {
    id: "benefits",
    label: "Benefits that build over time",
    hint: "Square images for the benefits carousel. Captions come from the product's Benefits list.",
    aspect: "1/1",
    max: 6,
  },
  {
    id: "ingredients",
    label: "Ingredients",
    hint: "One wide banner shown above the ingredient chips.",
    aspect: "16/9",
    max: 1,
  },
  {
    id: "howToUse",
    label: "How to use",
    hint: "Square images for the numbered steps. The text comes from the product's How to use field.",
    aspect: "1/1",
    max: 3,
  },
  {
    id: "reviews",
    label: "Reviews",
    hint: "Square lifestyle images shown above the real customer reviews.",
    aspect: "1/1",
    max: 6,
  },
];

export const LANDING_THEMES: LandingTheme[] = [
  {
    id: "gold_landing",
    label: "Gold landing page",
    description:
      "Full-width landing page with a sticky nav, highlight band, benefits carousel, numbered steps and a closing call to action.",
    sections: GOLD_SECTIONS,
  },
];

export function findLandingTheme(id: unknown): LandingTheme | null {
  if (typeof id !== "string" || !id) return null;
  return LANDING_THEMES.find((theme) => theme.id === id) ?? null;
}

export type LandingAssets = Record<string, string[]>;

/**
 * Normalises the `landing_assets` jsonb into one array per section of the
 * given theme.
 *
 * The stored value is admin-authored jsonb, so it can be absent, null, a
 * non-object, or hold keys for a theme that was since switched. Every one of
 * those resolves to empty arrays rather than throwing — a malformed setting
 * must not take a product page down.
 */
export function resolveLandingAssets(
  theme: LandingTheme | null,
  raw: unknown,
): LandingAssets {
  const out: LandingAssets = {};
  if (!theme) return out;

  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  for (const section of theme.sections) {
    const value = source[section.id];
    const urls = Array.isArray(value) ? value : [];
    out[section.id] = urls
      .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      .slice(0, section.max);
  }
  return out;
}
