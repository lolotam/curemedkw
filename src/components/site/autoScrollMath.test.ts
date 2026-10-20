import { describe, expect, it } from "vitest";
import { advance, toLogical, toPhysical } from "@/components/site/autoScrollMath";

describe("toLogical / toPhysical", () => {
  it("leaves LTR offsets untouched", () => {
    expect(toLogical(120, false)).toBe(120);
    expect(toPhysical(120, false)).toBe(120);
  });

  it("negates RTL offsets, which run from 0 down to -(scrollWidth - clientWidth)", () => {
    expect(toLogical(-450, true)).toBe(450);
    expect(toPhysical(450, true)).toBe(-450);
  });

  it("round-trips a position in both directions", () => {
    expect(toLogical(toPhysical(321.5, false), false)).toBe(321.5);
    expect(toLogical(toPhysical(321.5, true), true)).toBe(321.5);
  });
});

describe("advance", () => {
  // The marquee lost a whole frame of movement whenever a step was worth
  // less than half a pixel, because scrollLeft reads back whole pixels.
  it("keeps sub-pixel steps instead of losing them", () => {
    let position = 0;
    for (let step = 0; step < 120; step += 1) {
      position = advance(position, 55 / 120, 5000);
    }
    expect(position).toBeCloseTo(55, 5);
  });

  it("wraps forward past the period", () => {
    expect(advance(4900, 200, 5000)).toBeCloseTo(100, 5);
  });

  it("wraps backward below zero", () => {
    expect(advance(100, -200, 5000)).toBeCloseTo(4900, 5);
  });

  it("leaves the position alone when the period is not positive", () => {
    expect(advance(123, 50, 0)).toBe(123);
    expect(advance(123, 50, -10)).toBe(123);
  });
});
