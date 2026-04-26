## Goal

Replace the current OpenAI pricing reference page at `/admin/models` with a real **AI Model configuration** page. The 3 model selectors (Primary + 2 fallbacks) currently living inside `ProductImportFromUrl.tsx` will be moved here as the single source of truth, with **OpenRouter** shown as the provider and the full OpenRouter model list available as a searchable submenu under each slot.

## Changes

### 1. New shared store: `src/lib/aiModels.ts` (new file)
- Export `AI_MODEL_STORAGE_KEYS = ["ai-import-model", "ai-import-model-2", "ai-import-model-3"]` (re-using the existing localStorage keys so currently-saved choices are preserved).
- Export `DEFAULT_AI_MODELS = ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001", "anthropic/claude-3.5-haiku"]`.
- Export `useAiModels()` hook → reads/writes the 3 model IDs to `localStorage` and broadcasts changes via a `storage` event + a tiny custom-event so the importer card re-reads on change.
- Export `getAiModels()` (sync) for non-React code paths.

### 2. Rewrite `src/pages/admin/AdminModels.tsx`
Drop everything currently in the file (FlagshipTable, OtherModelsTable, EmptyTier, the Tabs over Standard/Batch/Flex/Priority, all imports from `openaiPricing`).

New layout (full-width admin page, matching other admin pages’ padding):

- **Header**: "AI Models" + sub-text "Configure which model handles AI product imports. Models are tried top-to-bottom — if Primary fails or is rate-limited, Fallback #2 then Fallback #3 runs automatically."
- **Provider card**: a single read-only row showing **OpenRouter** with its logo/icon (`Sparkles` from lucide), an "Active" badge, and a small note "API key configured via Lovable Cloud secret `OPENROUTER_API_KEY`."
- **Model slots** — 3 stacked Cards (`Primary AI model`, `Fallback model #2`, `Fallback model #3`). Each card contains:
  - Slot label + numeric chip (1/2/3)
  - A `Popover` + `Command` searchable submenu (same component pattern already used in `ProductImportFromUrl.tsx`) listing every model from `useOpenRouterModels()`
  - Below the picker, a small meta strip showing the selected model's `name`, `id`, `context_length`, and per-1M prompt/completion price from the OpenRouter `pricing` field
  - "Reset to default" link button per slot
- **Footer actions**: "Reset all to defaults" button.

Loading state shows skeletons; if `useOpenRouterModels()` errors, show an inline error with retry.

### 3. Refactor `src/components/admin/ProductImportFromUrl.tsx`
- Remove the local `useState` for the 3 model IDs, the `STORAGE_KEYS` / `DEFAULT_MODELS` / `SLOT_LABELS` constants, the `renderModelPicker` function, and the entire 3-column model picker grid at the bottom of the card.
- Import `useAiModels` from `src/lib/aiModels.ts` and read the 3 IDs from there.
- Keep the URL input + "Scrape & fill" button + status text exactly as today.
- Replace the model-picker grid with a small read-only summary line: "Using: `<primary>` → `<fb2>` → `<fb3>` · [Configure in AI Models →](/admin/models)" (link via `react-router` `Link`).

### 4. Sidebar (`src/components/admin/AdminLayout.tsx`)
- Rename the nav entry label from `AI Models` to `AI Models` (unchanged label, but update the description meaning). No structural change — route stays `/admin/models`.

### 5. Cleanup
- `src/lib/openaiPricing.ts` is no longer imported anywhere. Leave the file in place (no deletion needed) so this PR stays scoped to the page restructure. It can be removed in a follow-up.

## Files

**New**
- `src/lib/aiModels.ts`

**Edited**
- `src/pages/admin/AdminModels.tsx` (complete rewrite)
- `src/components/admin/ProductImportFromUrl.tsx` (remove embedded pickers, read from shared store, add link to settings)

**Untouched**
- Routes in `src/App.tsx` (route already exists)
- Edge functions (`extract-product`, `openrouter-models`) — already accept `model` + `fallbackModels` and already proxy OpenRouter

## Result

- `/admin/models` becomes the **single place** to choose Primary / Fallback #2 / Fallback #3 OpenRouter models.
- Each slot has a searchable submenu of every OpenRouter model with name, id, context length and pricing.
- The product importer card stays focused on the URL → scrape flow and just shows which models are active with a link back to settings.
- No database or edge-function changes required.
