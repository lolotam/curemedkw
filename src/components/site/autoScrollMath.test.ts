import { describe, expect, it } from "vitest";
import {
  accessibleCopyIndex,
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

describe("accessibleCopyIndex", () => {
  it("finds the copy under the centre of the viewport", () => {
    expect(accessibleCopyIndex(500, 100, 500, 4)).toBe(1);
  });

  it("moves on when the centre crosses into the next copy", () => {
    expect(accessibleCopyIndex(900, 200, 500, 4)).toBe(2);
  });

  it("handles a viewport wider than a copy", () => {
    expect(accessibleCopyIndex(100, 1500, 500, 4)).toBe(1);
  });

  it("falls back to the first copy while the period is unknown", () => {
    expect(accessibleCopyIndex(120, 300, 0, 4)).toBe(0);
  });

  it("returns the first copy when there is only one", () => {
    expect(accessibleCopyIndex(120, 300, 500, 1)).toBe(0);
  });

  it("never points at a copy that does not exist", () => {
    expect(accessibleCopyIndex(1900, 0, 500, 3)).toBe(2);
    expect(accessibleCopyIndex(-100, 0, 500, 3)).toBe(0);
  });
});

describe("copiesNeeded", () => {
  it("renders a single copy when the marquee is disabled", () => {
    expect(copiesNeeded(390, 200, false)).toBe(1);
  });

  it("keeps three copies while the width is not measured yet", () => {
    expect(copiesNeeded(0, 0, true)).toBe(3);
  });

  it("keeps four copies when one copy is wider than the viewport", () => {
    expect(copiesNeeded(390, 512, true)).toBe(4);
  });

  it("adds a copy for every viewport the items do not fill", () => {
    expect(copiesNeeded(390, 100, true)).toBe(7);
    expect(copiesNeeded(400, 100, true)).toBe(7);
    expect(copiesNeeded(401, 100, true)).toBe(8);
  });

  it("leaves a full copy of room before either edge", () => {
    const clientWidth = 390;
    const copyWidth = 100;
    const copies = copiesNeeded(clientWidth, copyWidth, true);
    // The row travels in [copyWidth, 2 * copyWidth), so the scroll range has to
    // reach three copies to keep a full copy free at the end.
    expect(copies * copyWidth - clientWidth).toBeGreaterThanOrEqual(3 * copyWidth);
  });
});
