import { describe, expect, it } from "vitest";
import {
  advance,
  copiesNeeded,
  toLogical,
  toPhysical,
  wrapManual,
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
    expect(advance(645, 0.458, 5000)).toBeCloseTo(645.458, 10);
  });

  it("accumulates sub-pixel steps into a visible distance", () => {
    let position = 0;
    for (let step = 0; step < 120; step += 1) {
      position = advance(position, 55 / 120, 5000);
    }
    expect(position).toBeCloseTo(55, 6);
  });

  it("wraps a forward step over the period", () => {
    expect(advance(499.5, 1, 500)).toBeCloseTo(0.5, 10);
  });

  it("wraps a backward step over the period", () => {
    expect(advance(0.5, -1, 500)).toBeCloseTo(499.5, 10);
  });

  it("leaves the position alone when the period is unknown", () => {
    expect(advance(12, 5, 0)).toBe(12);
  });
});

describe("wrapManual", () => {
  it("moves the start edge onto the period so the user can keep scrolling", () => {
    expect(wrapManual(0, 500)).toBe(500);
    expect(wrapManual(-10, 500)).toBe(500);
  });

  it("leaves a position inside the period alone", () => {
    expect(wrapManual(120.5, 500)).toBeCloseTo(120.5, 10);
  });

  it("wraps a position past the period forward", () => {
    expect(wrapManual(1234, 500)).toBeCloseTo(234, 10);
  });
});

describe("copiesNeeded", () => {
  it("renders a single copy when the marquee is disabled", () => {
    expect(copiesNeeded(390, 200, false)).toBe(1);
  });

  it("keeps two copies while the width is not measured yet", () => {
    expect(copiesNeeded(0, 0, true)).toBe(2);
  });

  it("keeps two copies when one copy is wider than the viewport", () => {
    expect(copiesNeeded(390, 512, true)).toBe(2);
  });

  it("adds a copy for every viewport the items do not fill", () => {
    expect(copiesNeeded(390, 100, true)).toBe(5);
    expect(copiesNeeded(400, 100, true)).toBe(5);
    expect(copiesNeeded(401, 100, true)).toBe(6);
  });
});
