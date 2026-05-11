# AI Upscaler with Editable Prompt

Extend the existing upscaler dialog so the admin can choose between **PICSART** (current) and **AI image model** (new). The AI option reuses the three image slots already configured in `/admin/models` (Primary → Fallback #2 → Fallback #3) with automatic fallback. The system prompt sent to the AI is editable from the admin dashboard.

## 1. Admin: editable upscaling prompt

- New row in `site_settings` with key `ai_upscale_prompt`, holding the prompt template.
- Default prompt:
  > "Upscale this product image to a higher resolution. Preserve every product detail exactly: shape, colors, packaging text, logos, branding, materials, lighting and background. Do NOT add, remove, restyle or reinterpret anything. Output a clean, sharp, photorealistic version of the same image at a larger size."
- Add a card in `src/pages/admin/AdminModels.tsx` (under the Image Models tab) titled **"AI Upscaling Prompt"** with a `<Textarea>` + Save / Reset to default buttons. Persisted via the same `site_settings` upsert pattern already used by `aiModels.ts`.

## 2. Upscale dialog UI (`src/components/admin/ImageUpscaleDialog.tsx`)

- Add a top-level **Engine** selector (RadioGroup): `PICSART` | `AI model`.
- When **PICSART** is selected → show existing controls (mode, factor, format) — unchanged behavior.
- When **AI model** is selected → hide PICSART controls and show:
  - Read-only summary of the 3 image slots in priority order (from `useAiModels().slots.image`), with a link to `/admin/models` to edit.
  - Optional "Extra instructions" textarea appended to the saved prompt (per-image override, not persisted).
- Generate button calls the appropriate edge function based on engine.

## 3. New edge function: `upscale-image-ai`

`supabase/functions/upscale-image-ai/index.ts`:
- Auth + admin check (same pattern as `upscale-image`).
- Inputs: `imageUrl`, `extraInstructions?`.
- Loads `ai_upscale_prompt` and `ai_import_models.image` slots from `site_settings`.
- Fetches source image → base64.
- Iterates slots in order, returning on first success. Provider dispatch:
  - **google** (e.g. `gemini-2.5-flash-image`): call `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `inlineData` part for the source image + text prompt; extract returned `inlineData` image.
  - **openai** (e.g. `gpt-image-1`): call `https://api.openai.com/v1/images/edits` (multipart) with image + prompt + `size=auto`.
  - **openrouter** (e.g. `google/gemini-2.5-flash-image`): call `/api/v1/chat/completions` with multimodal message containing the image and prompt; read base64 image from response.
- On any failure (network, 4xx/5xx, no image returned, content blocked), log and try next slot. If all 3 fail, return 502 with collected errors.
- Upload the returned PNG to the `product-images` bucket under `upscaled-ai/{uuid}.png` and return `{ url, provider, model }` — same response shape as `upscale-image` so the dialog's "Use this image" flow keeps working.

## 4. Frontend wiring

- `ImageUpscaleDialog` calls `supabase.functions.invoke("upscale-image-ai", { body: { imageUrl, extraInstructions } })` when engine = AI.
- Show which provider/model produced the result in the result panel (small caption).
- Toast errors clearly when all fallbacks fail (e.g. "All AI models failed: …").

## 5. Deploy

Deploy the new `upscale-image-ai` edge function. No new secrets required (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY` already configured).

## Technical notes

- Reuse `SlotsByKind`/`useAiModels` for slot config — no schema change to `ai_import_models`.
- The prompt is a single string stored at `site_settings.ai_upscale_prompt.value` (text). Falls back to the hard-coded default if missing.
- AI image models do not change pixel dimensions deterministically the way PICSART does — so the "factor" control is intentionally hidden for the AI engine. A note in the dialog explains this.
- File names follow project convention; no design-token changes; new card uses existing shadcn primitives.
