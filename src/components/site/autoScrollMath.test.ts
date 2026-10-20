import { describe, expect, it } from "vitest";
import {
  advance,
  copiesNeeded,
  normalizeToMiddle,
  toLogical,
  toPhysical,
} from "./autoScrollMath";

describe("scroll offset normalisation", () => {
  it("keeps LTR offsets untouched", () => {
    expect(toLogical(120, false)).toBe(120);
    expect(toPhysical(120, false)).toBe(120);
  });

  it("negates RTL offsets, where the browser reports them as negative", () => {
    expect(toLogical(-120, true)).toBe(120);
    expect(toPhysical(120, true)).toBe(-120);
  });
});

describe("advance", () => {
  it("keeps a step that is smaller than half a pixel", () => {
    expect(advance(5645, 0.458, 5000)).toBeCloseTo(5645.458, 10);
  });

  it("accumulates sub-pixel steps into a visible distance", () => {
    let position = 5000;
    for (let step = 0; step < 120; step += 1) {
      position = advance(position, 55 / 120, 5000);
    }
    expect(position).toBeCloseTo(5055, 6);
  });

  it("wraps a forward step inside the middle range", () => {
    expect(advance(9999.5, 1, 5000)).toBeCloseTo(5000.5, 10);
  });

  it("wraps a backward step inside the middle range", () => {
    expect(advance(5000.5, -1, 5000)).toBeCloseTo(9999.5, 10);
  });

  it("leaves the position alone when the period is unknown", () => {
    expect(advance(12, 5, 0)).toBe(12);
  });
});

describe("normalizeToMiddle", () => {
  it("moves a position below the range up by whole periods", () => {
    expect(normalizeToMiddle(0, 500)).toBe(500);
    expect(normalizeToMiddle(10, 500)).toBe(510);
  });

  it("moves a position above the range down by whole periods", () => {
    expect(normalizeToMiddle(1500, 500)).toBe(500);
    expect(normalizeToMiddle(1250, 500)).toBe(750);
  });

  it("leaves a position inside the range alone", () => {
    expect(normalizeToMiddle(620.5, 500)).toBeCloseTo(620.5, 10);
  });

  it("leaves the value alone when the period is unknown", () => {
    expect(normalizeToMiddle(120, 0)).toBe(120);
  });
});

describe("copiesNeeded", () => {
  it("renders a single copy when the marquee is disabled", () => {
    expect(copiesNeeded(390, 200, false)).toBe(1);
  });

  it("keeps three copies while the width is not measured yet", () => {
    expect(copiesNeeded(0, 0, true)).toBe(3);
  });

  it("keeps three copies when one copy is wider than the viewport", () => {
    expect(copiesNeeded(390, 512, true)).toBe(3);
  });

  it("adds a copy for every viewport the items do not fill", () => {
    expect(copiesNeeded(390, 100, true)).toBe(6);
    expect(copiesNeeded(400, 100, true)).toBe(6);
    expect(copiesNeeded(401, 100, true)).toBe(7);
  });
});
