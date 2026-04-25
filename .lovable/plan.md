## Goal

In the **Add / Edit Product** screen, add a **"Import from URL"** panel that:

1. Takes a product page URL.
2. Calls **Firecrawl v2** to scrape the page (markdown + main image + gallery images).
3. Sends the scraped content to an **OpenRouter** chat model (you pick from a dropdown of all available models) using **structured tool-calling** to extract:
   - `name`, `brand`, `category`, `price`
   - `shortDescription`
   - `longDescription` — formatted with section headings and bullet points
   - `size`, `sku`
   - `ingredients[]` (one per line)
   - `benefits[]` (one per line)
   - `usage` (How to use)
4. Auto-fills the form fields (you can still edit before saving).
5. Imports any product images Firecrawl returns into the **Media** card. You keep the existing "Set as main / Delete" controls so you can curate which images stay.

You then click **Save** as usual — nothing is persisted until you save.

---

## Step 1 — Link the Firecrawl connection to this project

Your Firecrawl connection (`Waleed's Firecrawl`) already exists at the workspace level but is not linked to this project, so `FIRECRAWL_API_KEY` isn't injected into edge functions yet. I'll call `standard_connectors--connect` with `connector_id: firecrawl` so the secret becomes available to the new edge functions.

## Step 2 — Add the OpenRouter API key

OpenRouter requires its own API key (not provided by any connector). I'll prompt you via `add_secret` for **`OPENROUTER_API_KEY`**. You'll generate one at https://openrouter.ai/keys and paste it. Nothing else proceeds until you add it.

## Step 3 — Edge function: `scrape-product` (Firecrawl v2)

Path: `supabase/functions/scrape-product/index.ts`

- Input: `{ url: string }`
- Auth: requires logged-in admin (verify JWT + `has_role(uid, 'admin')` via service role client).
- Calls `POST https://api.firecrawl.dev/v2/scrape` with:
  ```json
  {
    "url": "...",
    "formats": ["markdown", "links"],
    "onlyMainContent": true
  }
  ```
- Returns `{ markdown, sourceUrl, title, images: string[] }` where `images` is collected from the page (filtered to absolute http(s) URLs of common image extensions, deduped, capped at ~12).
- Handles 402 (no Firecrawl credits) and 429 with friendly error messages surfaced as toasts.

## Step 4 — Edge function: `openrouter-models`

Path: `supabase/functions/openrouter-models/index.ts`

- `GET` → fetches `https://openrouter.ai/api/v1/models` with `Authorization: Bearer ${OPENROUTER_API_KEY}` and returns a slim list `{ id, name, context_length, pricing }[]` so the dropdown can display **every** OpenRouter model.
- Cached client-side with React Query for 1 hour.

## Step 5 — Edge function: `extract-product` (OpenRouter)

Path: `supabase/functions/extract-product/index.ts`

- Input: `{ markdown: string, sourceUrl: string, model: string }`
- Calls `POST https://openrouter.ai/api/v1/chat/completions` with the chosen model and **OpenAI-compatible function/tool calling** to force a structured JSON response. Schema:
  ```ts
  {
    name, brand: "flexitol"|"kapiva"|"nada"|"abc",
    category, price (number),
    shortDescription,
    longDescription, // markdown with ## headings + bullet lists
    size, sku,
    ingredients: string[],
    benefits: string[],
    usage
  }
  ```
- System prompt instructs the model to:
  - Map detected brand to one of our 4 brand keys; fall back to the closest match.
  - Format `longDescription` as markdown with headings (e.g. `## Overview`, `## Key features`) and bullet lists.
  - Leave fields empty (`""` or `[]`) if the page doesn't contain that info — never invent SKUs or prices.
- Returns the parsed tool-call arguments.

## Step 6 — UI: "Import from URL" card in `AdminProductEditor.tsx`

A new card placed above the **Core** card:

- **Source URL** input
- **AI model** dropdown — populated from `openrouter-models`, with a search box (using existing `Command` component) so you can pick from the full list (hundreds of models). Default = `openai/gpt-4o-mini`. Selection persisted in `localStorage` so you don't pick it every time.
- **Scrape & fill** button → runs the flow:
  1. `scrape-product` → markdown + image URLs
  2. `extract-product` → structured fields
  3. Merges results into the form via `setForm(prev => ({ ...prev, ...extracted }))`
  4. Imports images: first one becomes `mainImage` (only if current main is still the placeholder), the rest are appended to `gallery`. URLs are stored as-is (external Firecrawl URLs); we don't re-upload to your bucket — keeps it instant. You can delete any with the existing × button.
- Loading states with progress text ("Scraping page…" → "Extracting fields with {model}…").
- Errors surfaced as toasts; partial results still applied if extraction succeeds but image fetch fails.

## Step 7 — Small client helper

`src/lib/aiImport.ts` with two thin wrappers around `supabase.functions.invoke('scrape-product', …)` and `supabase.functions.invoke('extract-product', …)`, plus a `useOpenRouterModels()` React Query hook.

---

## Files to create / edit

**Create**
- `supabase/functions/scrape-product/index.ts`
- `supabase/functions/openrouter-models/index.ts`
- `supabase/functions/extract-product/index.ts`
- `src/lib/aiImport.ts`
- `src/components/admin/ProductImportFromUrl.tsx` (the new card)

**Edit**
- `src/pages/admin/AdminProductEditor.tsx` — mount the new card and wire `onImported(partial, images)` to update form state.

**Secrets**
- Link Firecrawl connection to project → `FIRECRAWL_API_KEY` becomes available.
- `add_secret` for `OPENROUTER_API_KEY`.

---

## Notes / trade-offs

- **External image URLs**: imported images point to the original site (fast, zero storage cost). If you'd prefer them re-hosted in your `product-images` bucket, say so and I'll add a server-side download+upload step.
- **Brand mapping**: limited to your 4 existing brands (`flexitol`, `kapiva`, `nada`, `abc`). If the scraped page is a different brand, the AI will pick the closest one and you can change it before saving.
- **Cost**: each import = 1 Firecrawl scrape + 1 OpenRouter call. OpenRouter charges per-model on your key; cheaper models (e.g. `openai/gpt-4o-mini`, `google/gemini-flash-1.5`) work great for this extraction task.