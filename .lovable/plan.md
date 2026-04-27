## Bulk Arabic Translation — All Products

### Current state (verified live from DB)
- **Total products:** 103
- **Need translation (any AR field missing):** **42 products**
- Field-by-field gaps:
  - `name_ar` empty: 22
  - `short_description_ar` empty: 22
  - `long_description_ar` empty: 22
  - `category_ar` empty: 22
  - `usage_ar` empty: 31
  - `benefits_ar` empty: 39
  - `ingredients_ar` empty: 29
- **Categories table:** ✅ All `name_ar` already populated — nothing to do there.

### Approach
Use the existing `supabase/functions/translate-product/index.ts` edge function (already deployed, uses Lovable AI Gateway with `google/gemini-2.5-flash` and structured tool-calling output). It already supports per-product translation by `productId` and persists results to the `products` table.

### Steps

1. **Identify targets** — Query the `products` table for the 42 IDs where any AR field is empty.

2. **Run a Node script in the sandbox** that loops through those 42 IDs and calls the deployed `translate-product` edge function for each one:
   - POST to `https://yjvqzvmyritxegugfhkt.supabase.co/functions/v1/translate-product`
   - Body: `{ productId, persist: true, overwrite: false }`
   - Sequential calls with a small delay (≈600 ms) to stay under Lovable AI rate limits.
   - Per-request retry (up to 2x) on `429` with exponential backoff.
   - Log success / skip / failure for each product.
   - On `402` (credits exhausted), stop immediately and surface the error to you.

3. **Verify coverage** — Re-run the gap query and report final counts. Any product that still has empty AR fields (e.g., due to AI errors) gets a second pass.

4. **Optional spot-check** — Pull 2–3 freshly translated products and display their EN → AR side-by-side so you can sanity-check the Arabic quality.

### Cost & time estimate
- 42 products × ~1 AI call each = 42 Gemini Flash calls.
- Sequential with 600 ms delay ≈ **~1 minute** total runtime.
- Cost is well within the Lovable AI free-tier allowance for Gemini Flash.

### What this plan does NOT change
- No code changes — the UI is already language-aware (falls back to EN when AR is empty) from previous phases.
- No schema changes — only data writes via the existing edge function.
- The `translate-product` function already has `overwrite: false` semantics, so any product that already has `name_ar` populated will be skipped (no risk of clobbering manual translations).

### Deliverable
A summary report: `X translated successfully, Y skipped (already done), Z failed (with reason)`, plus the final post-translation gap count from the DB.
