
# Add OpenAI Model Endpoints + Pricing reference page (Admin)

## Goal
Build an **admin-only** page in the Curemed dashboard that displays every OpenAI model endpoint and its prices — exactly as shown in your screenshot. This is a **read-only reference table** (no AI calls, no model registry used by app code, no provider integration). It lives at `/admin/models`.

## Scope check (important)
- **No edge function**, no AI gateway call, no `LOVABLE_API_KEY` usage.
- **No new database table** — the data is static reference content, hardcoded in a TypeScript file. (If later you want to edit prices from the UI, we'd add a `model_pricing` table; not in this plan.)
- **No changes** to Curemed storefront, products, hero slider, brands, or any existing page.
- Note: I checked OpenAI's public pricing page — the models in your screenshot (`gpt-5.5`, `gpt-5.4*`, `gpt-5.2*`, `gpt-5*`, `gpt-4.1`) are not all on openai.com today, but you asked for **exactly what's in the screenshot**, so I'll hardcode those values verbatim and label the page "OpenAI Model Pricing (Standard tier · per 1M tokens)" with a note that values come from the supplied reference.

## Data captured from the screenshot

**Table 1 — Flagship models (Standard tier, prices per 1M tokens, with Short context / Long context split):**

| Model | SC Input | SC Cached | SC Output | LC Input | LC Cached | LC Output |
|---|---|---|---|---|---|---|
| gpt-5.5 | $5.00 | $0.50 | $30.00 | $10.00 | $1.00 | $45.00 |
| gpt-5.5-pro | $30.00 | — | $180.00 | $60.00 | — | $270.00 |
| gpt-5.4 | $2.50 | $0.25 | $15.00 | $5.00 | $0.50 | $22.50 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 | — | — | — |
| gpt-5.4-nano | $0.20 | $0.02 | $1.25 | — | — | — |
| gpt-5.4-pro | $30.00 | — | $180.00 | $60.00 | — | $270.00 |

Plus the footnote: *"Regional processing (data residency) endpoints are charged a 10% uplift for gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, and gpt-5.4-pro."*

**Table 2 — Other models (single-context, prices per 1M tokens):**

| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-5.2 | $1.75 | $0.175 | $14.00 |
| gpt-5.2-pro | $21.00 | — | $168.00 |
| gpt-5.1 | $1.25 | $0.125 | $10.00 |
| gpt-5 | $1.25 | $0.125 | $10.00 |
| gpt-5-mini | $0.25 | $0.025 | $2.00 |
| gpt-5-nano | $0.05 | $0.005 | $0.40 |
| gpt-5-pro | $15.00 | — | $120.00 |
| gpt-4.1 | $2.00 | $0.50 | $8.00 |

A "—" value will be rendered as a muted dash (meaning "not offered for that endpoint").

## Files to create

### 1. `src/lib/openaiPricing.ts` (new)
Typed constants holding the two tables above, plus the residency-uplift footnote and a `TIERS = ["Standard", "Batch", "Flex", "Priority"]` list (only Standard has data; the other tabs are visible but show an "Only Standard tier prices available" placeholder, matching the screenshot's tab UI without inventing numbers).

```ts
export type FlagshipRow = {
  model: string;
  short: { input: number | null; cached: number | null; output: number | null };
  long:  { input: number | null; cached: number | null; output: number | null };
};
export type StandardRow = { model: string; input: number | null; cached: number | null; output: number | null };
export const FLAGSHIP_MODELS: FlagshipRow[] = [ /* 6 rows */ ];
export const OTHER_MODELS: StandardRow[] = [ /* 8 rows */ ];
export const RESIDENCY_NOTE = "Regional processing (data residency) endpoints are charged a 10% uplift for gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, and gpt-5.4-pro.";
export const TIERS = ["Standard", "Batch", "Flex", "Priority"] as const;
```

### 2. `src/pages/admin/AdminModels.tsx` (new)
Read-only React page using existing shadcn primitives (`Card`, `Tabs`, `Table`, `Badge`). Layout mirrors the screenshot:
- Header: **"OpenAI Model Pricing"** + subtitle "Standard tier · prices per 1M tokens" + tier tabs in the top-right (`Standard | Batch | Flex | Priority`) — only Standard is populated.
- **Section 1: Flagship models** — title "Our latest models", subtitle "Prices per 1M tokens.", then a table with grouped headers `Short context` / `Long context`, each containing Input / Cached input / Output. Render `null` cells as `—`.
- The residency-uplift footnote rendered below the flagship table, with `gpt-5.5`, `gpt-5.4-pro`, etc. shown as small `<code>` chips like in the screenshot.
- **Section 2: Other models** — single 4-column table (Model / Input / Cached input / Output).
- Currency formatted with `Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 })` so `$0.075` and `$30.00` both render correctly.
- Numbers right-aligned, model column left-aligned and `font-mono`, matching the screenshot vibe.
- Mobile: tables wrapped in `overflow-x-auto` so they scroll horizontally on narrow screens.

## Files to edit

### 3. `src/components/admin/AdminLayout.tsx`
Add one nav entry between **Landing Pages** and **Messages**:
```ts
import { ..., Sparkles } from "lucide-react";
{ to: "/admin/models", icon: Sparkles, label: "AI Models" },
```

### 4. `src/App.tsx`
Add the route inside the `<Route path="/admin" element={<AdminLayout />}>` block:
```tsx
<Route path="models" element={<AdminModels />} />
```
And add the import: `import AdminModels from "./pages/admin/AdminModels";`

## Out of scope (explicitly NOT changed)
- No Supabase migration, no new table, no edge function, no `supabase/config.toml` change.
- No edits to `CuremedHome.tsx`, `BrandPage.tsx`, `HeroSlider.tsx`, `db.ts`, `admin.ts`, products, messages, subscribers, hero slides.
- No live fetch from openai.com — values come from your screenshot exactly.
- No "Batch / Flex / Priority" pricing numbers will be invented. Those tabs show a "No data for this tier" placeholder unless you provide screenshots for them later.

## Result
Logging into `/admin` and clicking the new **AI Models** sidebar item shows a clean reference page with both pricing tables identical in content to your screenshot. Nothing on the public Curemed site changes.
