# Restructure `/admin/models`

## Goal

Replace the flat 3-slot list with two tabs, each containing the same 3-slot Primary / Fallback #2 / Fallback #3 structure. Each slot is a card with a **Provider** dropdown (OpenRouter / OpenAI / Google) and a **Model** dropdown filtered to that tab's category (chat or image).

## Tabs & layout

```
[ Chat Models ] [ Image Models ]

  Primary AI model
    Provider: [OpenRouter ▼]   Model: [openai/gpt-4o-mini ▼]
  Fallback model #2
    Provider: [OpenAI ▼]       Model: [gpt-4o ▼]
  Fallback model #3
    Provider: [Google ▼]       Model: [gemini-2.5-flash ▼]
```

Both tabs share the same shape — only the model list differs.

## Providers & model sources

Three separate edge functions back the dropdowns; each is called only when its provider is selected and the response is cached client-side.

| Provider | Function | Endpoint |
|---|---|---|
| OpenRouter | existing `openrouter-models` | `https://openrouter.ai/api/v1/models` |
| OpenAI | new `openai-models` | `https://api.openai.com/v1/models` |
| Google | new `google-models` | `https://generativelanguage.googleapis.com/v1beta/models` |

Each function classifies every model as `chat` or `image` so the UI can filter:

- **OpenRouter**: image if `architecture.output_modalities` includes `image` (or `modality` contains `image`), else chat.
- **OpenAI**: image if id starts with `dall-e`, `gpt-image`; chat if id starts with `gpt-`, `o1`, `o3`, `o4`, `chatgpt-`. Others are skipped.
- **Google**: image if `supportedGenerationMethods` includes `predict` or name contains `image`/`imagen`; chat if it includes `generateContent`.

Required new secrets (the user picked direct APIs):
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY` (Generative Language API key)

`OPENROUTER_API_KEY` already exists.

## Storage

Replace the flat array in `site_settings.ai_import_models` with a structured object, keeping a back-compat read path:

```json
{
  "chat":  [{"provider":"openrouter","model":"openai/gpt-4o-mini"},
            {"provider":"openai","model":"gpt-4o"},
            {"provider":"google","model":"gemini-2.5-flash"}],
  "image": [{"provider":"google","model":"gemini-2.5-flash-image"},
            {"provider":"openai","model":"gpt-image-1"},
            {"provider":"openrouter","model":"google/gemini-2.5-flash-image"}]
}
```

Loader: if the saved value is an array (old format), treat as `chat` slots all using OpenRouter. Image defaults applied if missing.

## Edge function consumers

- `extract-product` keeps reading `site_settings.ai_import_models`. Its loader is updated to pull the `chat` array when the new object format is present (and still accept the legacy array). Routing by provider:
  - `openrouter` → existing OpenRouter call.
  - `openai` → call `https://api.openai.com/v1/chat/completions` with `OPENAI_API_KEY`.
  - `google` → call Gemini `generateContent` with `GOOGLE_API_KEY` and adapt the tool-call payload.
- Picsart upscale is unrelated and stays as-is.
- No existing AI image generation feature uses these models yet, so the **image** chain is stored only — the dropdowns + persistence ship now and the next image-generation feature will read this same setting (documented in code comments).

## Files

New
- `supabase/functions/openai-models/index.ts`
- `supabase/functions/google-models/index.ts`
- `src/lib/aiProviders.ts` — types (`Provider`, `ProviderModel`, `Slot`), per-provider hooks (`useProviderModels(provider)`), filtering helpers (`isChat`, `isImage`).

Edited
- `src/lib/aiModels.ts` — switch persisted shape to `{chat: Slot[], image: Slot[]}`, keep legacy-array migration on read, expose `useAiModels()` returning both arrays + setters `setSlot(category, index, {provider, model})`.
- `src/pages/admin/AdminModels.tsx` — Tabs (`chat` / `image`), reusable `<SlotCard>` with two combobox popovers (provider, then model filtered to tab category). Shows context length / pricing meta only when available (OpenRouter only).
- `supabase/functions/extract-product/index.ts` — read new shape, dispatch by provider.
- `scripts/deploy-self-hosted-functions.sh`, `SELF_HOSTED.md` — register `openai-models`, `google-models`, document the two new secrets.

## Defaults

- Chat: `openrouter:openai/gpt-4o-mini`, `openrouter:google/gemini-2.0-flash-001`, `openrouter:anthropic/claude-3.5-haiku` (matches today).
- Image: `google:gemini-2.5-flash-image`, `openai:gpt-image-1`, `openrouter:google/gemini-2.5-flash-image`.

## Open dependency

Before implementing the edge-function dispatch I will request the two new secrets (`OPENAI_API_KEY`, `GOOGLE_API_KEY`) via the secrets tool. The UI/storage portion can ship without them; the dropdowns just won't populate for those providers until the keys are added.
