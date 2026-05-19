export type UpscaleTargetSize = 1024 | 1536 | 2048;
export type PicsartMode = "standard" | "ultra";

export const DEFAULT_UPSCALE_TARGET_SIZE: UpscaleTargetSize = 1536;

export const UPSCALE_TARGET_OPTIONS: Array<{
  value: UpscaleTargetSize;
  label: string;
  description: string;
  aiDescription: string;
}> = [
  {
    value: 1024,
    label: "1K",
    description: "Target about 1024px on the longest side.",
    aiDescription: "AI outputs 1024×1024 at low quality (~10s, lowest cost).",
  },
  {
    value: 1536,
    label: "1.5K",
    description: "Target about 1536px on the longest side.",
    aiDescription: "AI outputs up to 1536×1024 / 1024×1536 at medium quality (~25s).",
  },
  {
    value: 2048,
    label: "2K",
    description: "Target about 2048px on the longest side.",
    aiDescription: "PICSART only — AI provider caps at 1.5K. Pick 1.5K for AI.",
  },
];

const STANDARD_FACTORS = [2, 4, 6, 8] as const;
const ULTRA_FACTORS = [2, 4, 6, 8, 16] as const;
const MAX_PICSART_PIXELS = 23_000_000;

export function normalizeUpscaleTargetSize(value: unknown): UpscaleTargetSize {
  const n = Number(value);
  return n === 1024 || n === 1536 || n === 2048 ? n : DEFAULT_UPSCALE_TARGET_SIZE;
}

export function upscaleTargetLabel(value: unknown): string {
  const target = normalizeUpscaleTargetSize(value);
  return UPSCALE_TARGET_OPTIONS.find((o) => o.value === target)?.label ?? "1.5K";
}

export function pickPicsartFactorForTarget(
  dims: { width: number; height: number },
  mode: PicsartMode,
  targetSize: UpscaleTargetSize,
  maxPixels = MAX_PICSART_PIXELS,
): { requestedFactor: number; effectiveFactor: number; clamped: boolean } {
  const allowed = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;
  const inputPixels = dims.width * dims.height;
  const longestSide = Math.max(dims.width, dims.height);
  const requestedFactor = allowed.find((factor) => longestSide * factor >= targetSize) ?? allowed[allowed.length - 1];
  const fitting = allowed.filter((factor) => inputPixels * factor * factor <= maxPixels);

  if (!fitting.length) {
    throw new Error("Image is too large to upscale within the provider pixel limit.");
  }

  const fittingAtOrBelowRequest = fitting.filter((factor) => factor <= requestedFactor);
  const effectiveFactor = fitting.includes(requestedFactor)
    ? requestedFactor
    : fittingAtOrBelowRequest[fittingAtOrBelowRequest.length - 1] ?? fitting[fitting.length - 1];

  return {
    requestedFactor,
    effectiveFactor,
    clamped: effectiveFactor !== requestedFactor || longestSide * effectiveFactor < targetSize,
  };
}
