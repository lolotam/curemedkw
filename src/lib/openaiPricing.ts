/**
 * OpenAI model pricing reference (Standard tier · prices per 1M tokens).
 * Hardcoded from the supplied reference screenshot. Read-only — used by
 * the admin "AI Models" page only. No application logic depends on this.
 */

export type FlagshipRow = {
  model: string;
  short: { input: number | null; cached: number | null; output: number | null };
  long: { input: number | null; cached: number | null; output: number | null };
};

export type StandardRow = {
  model: string;
  input: number | null;
  cached: number | null;
  output: number | null;
};

export const FLAGSHIP_MODELS: FlagshipRow[] = [
  {
    model: "gpt-5.5",
    short: { input: 5.0, cached: 0.5, output: 30.0 },
    long: { input: 10.0, cached: 1.0, output: 45.0 },
  },
  {
    model: "gpt-5.5-pro",
    short: { input: 30.0, cached: null, output: 180.0 },
    long: { input: 60.0, cached: null, output: 270.0 },
  },
  {
    model: "gpt-5.4",
    short: { input: 2.5, cached: 0.25, output: 15.0 },
    long: { input: 5.0, cached: 0.5, output: 22.5 },
  },
  {
    model: "gpt-5.4-mini",
    short: { input: 0.75, cached: 0.075, output: 4.5 },
    long: { input: null, cached: null, output: null },
  },
  {
    model: "gpt-5.4-nano",
    short: { input: 0.2, cached: 0.02, output: 1.25 },
    long: { input: null, cached: null, output: null },
  },
  {
    model: "gpt-5.4-pro",
    short: { input: 30.0, cached: null, output: 180.0 },
    long: { input: 60.0, cached: null, output: 270.0 },
  },
];

export const OTHER_MODELS: StandardRow[] = [
  { model: "gpt-5.2", input: 1.75, cached: 0.175, output: 14.0 },
  { model: "gpt-5.2-pro", input: 21.0, cached: null, output: 168.0 },
  { model: "gpt-5.1", input: 1.25, cached: 0.125, output: 10.0 },
  { model: "gpt-5", input: 1.25, cached: 0.125, output: 10.0 },
  { model: "gpt-5-mini", input: 0.25, cached: 0.025, output: 2.0 },
  { model: "gpt-5-nano", input: 0.05, cached: 0.005, output: 0.4 },
  { model: "gpt-5-pro", input: 15.0, cached: null, output: 120.0 },
  { model: "gpt-4.1", input: 2.0, cached: 0.5, output: 8.0 },
];

export const RESIDENCY_MODELS = [
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
] as const;

export const TIERS = ["Standard", "Batch", "Flex", "Priority"] as const;
export type Tier = (typeof TIERS)[number];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

export function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return usd.format(value);
}