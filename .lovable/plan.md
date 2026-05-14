## Goal
Add **Anthropic** as a fourth AI provider in `/admin/models` (Chat tab), listing all available Claude models, selectable as Primary / Fallback #2 / Fallback #3, plus a "Test connection" button per slot.

## Steps

### 1. Add `ANTHROPIC_API_KEY` secret
Prompt the user to add their Anthropic API key (from console.anthropic.com → API Keys). Stored as a backend secret used only by edge functions.

### 2. New edge function: `anthropic-models`
- `GET https://api.anthropic.com/v1/models` with headers `x-api-key` + `anthropic-version: 2023-06-01`.
- Return `{ models: [{ id, name, kind: "chat", context_length: null, pricing: null }] }`.
- All Anthropic models are chat-only (no image generation), so kind is always `"chat"`.

### 3. New edge function: `ai-test-connection`
- Body: `{ provider, model }` (admin-only).
- Performs a tiny "ping" call to the chosen provider's chat endpoint and returns `{ ok, latency_ms, error? }`.
- Anthropic ping: `POST /v1/messages` with `max_tokens: 1`, message `"ping"`.
- OpenAI / Google / OpenRouter pings reuse the existing endpoint patterns.

### 4. Frontend: extend provider list
File: `src/lib/aiProviders.ts`
- `Provider = "openrouter" | "openai" | "google" | "anthropic"`
- Add `PROVIDER_LABELS.anthropic = "Anthropic"`, append to `PROVIDERS`, map `FN_BY_PROVIDER.anthropic = "anthropic-models"`.

File: `src/lib/aiModels.ts`
- Add `"anthropic"` to the provider whitelist in `normalizeSlot`.
- Defaults unchanged.

### 5. Frontend: Test button
In `src/pages/admin/AdminModels.tsx`, inside `SlotCard`, add a small **"Test connection"** button next to the Reset link. On click it invokes `ai-test-connection` with the current `{provider, model}` and shows a toast with success/latency or the error.

### 6. Backend dispatch for chat (extract-product)
File: `supabase/functions/extract-product/index.ts`
- Add `"anthropic"` to provider validation list.
- Add `callAnthropic(model)` that calls `POST https://api.anthropic.com/v1/messages` with the existing tool / function-calling schema converted to Anthropic's `tools` format, and parse the `tool_use` block back into `{ args }`.
- Wire it into the `dispatch` switch.

### 7. Image tab unchanged
Anthropic does not produce images; it will only appear in the Chat tab's model list (the existing filter `m.kind === kind` naturally hides it from the Image tab).

## Technical notes
- Anthropic API: `POST /v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Tool use uses `tools: [{name, description, input_schema}]` and responds with a `tool_use` content block containing `input`.
- The models list endpoint requires the same headers and returns `{ data: [{ id, display_name, created_at }] }`.
- Test connection is admin-gated using the existing `user_roles` check pattern (same as `upscale-image-ai`).

## Out of scope
- No changes to image-generation flow.
- No changes to `translate-product` (OpenRouter-only by design).
