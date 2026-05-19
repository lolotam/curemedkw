import { describe, expect, it } from "vitest";
import {
  normalizeUpscaleTargetSize,
  pickPicsartFactorForTarget,
  upscaleTargetLabel,
} from "@/lib/upscaleTargets";

describe("upscale target helpers", () => {
  it("normalizes supported target sizes and labels", () => {
    expect(normalizeUpscaleTargetSize(1024)).toBe(1024);
    expect(normalizeUpscaleTargetSize("1536")).toBe(1536);
    expect(normalizeUpscaleTargetSize(999)).toBe(1536);
    expect(upscaleTargetLabel(2048)).toBe("2K");
  });

  it("picks the smallest PICSART factor that reaches the requested target", () => {
    expect(pickPicsartFactorForTarget({ width: 800, height: 600 }, "standard", 1536)).toEqual({
      requestedFactor: 2,
      effectiveFactor: 2,
      clamped: false,
    });

    expect(pickPicsartFactorForTarget({ width: 700, height: 500 }, "standard", 2048)).toEqual({
      requestedFactor: 4,
      effectiveFactor: 4,
      clamped: false,
    });
  });

  it("clamps the factor when the provider pixel cap would be exceeded", () => {
    expect(pickPicsartFactorForTarget({ width: 600, height: 600 }, "ultra", 2048, 5_000_000)).toEqual({
      requestedFactor: 4,
      effectiveFactor: 2,
      clamped: true,
    });
  });
});
