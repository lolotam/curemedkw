import { describe, expect, it } from "vitest";
import {
  LANDING_THEMES,
  findLandingTheme,
  resolveLandingAssets,
} from "@/lib/landingThemes";

const GOLD = LANDING_THEMES[0];

describe("findLandingTheme", () => {
  it.each([
    ["empty string", ""],
    ["unknown id", "not_a_theme"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
    ["an object", { id: "gold_landing" }],
  ])("returns null for %s", (_label, id) => {
    expect(findLandingTheme(id)).toBeNull();
  });

  it("returns the theme for a known id", () => {
    expect(findLandingTheme(GOLD.id)).toBe(GOLD);
  });
});

describe("resolveLandingAssets", () => {
  // A malformed or absent jsonb value must never throw: it is admin-authored
  // and a bad save would otherwise take the whole product page down.
  it.each([
    ["absent value", undefined],
    ["null", null],
    ["a string", "garbage"],
    ["a number", 42],
    ["an array", ["/a.png"]],
    ["an empty object", {}],
    ["a partial object", { benefits: ["/b.png"] }],
  ])("returns an array for every section given %s", (_label, raw) => {
    const assets = resolveLandingAssets(GOLD, raw);
    for (const section of GOLD.sections) {
      expect(Array.isArray(assets[section.id])).toBe(true);
    }
  });

  it("returns no sections when no theme is selected", () => {
    expect(resolveLandingAssets(null, { benefits: ["/b.png"] })).toEqual({});
  });

  it("drops entries that are not usable image URLs", () => {
    const assets = resolveLandingAssets(GOLD, {
      benefits: ["/keep.png", "", "   ", null, 3, { url: "/nope.png" }],
    });
    expect(assets.benefits).toEqual(["/keep.png"]);
  });

  it("caps each section at its documented maximum", () => {
    const tooMany = Array.from({ length: 20 }, (_, i) => `/img-${i}.png`);
    const assets = resolveLandingAssets(
      GOLD,
      Object.fromEntries(GOLD.sections.map((s) => [s.id, tooMany])),
    );
    for (const section of GOLD.sections) {
      expect(assets[section.id]).toHaveLength(section.max);
    }
  });

  it("ignores keys that do not belong to the theme", () => {
    const assets = resolveLandingAssets(GOLD, {
      benefits: ["/b.png"],
      retiredSection: ["/orphan.png"],
    });
    expect(Object.keys(assets).sort()).toEqual(
      GOLD.sections.map((s) => s.id).sort(),
    );
  });
});
