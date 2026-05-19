Add an output-size selector to the AI upscale flow (single + bulk) and wire it through to OpenAI's `/v1/images/edits` `size` form field. OpenRouter and Google calls are untouched.

Note: the existing comment in `callOpenAI` says "`size` is not valid on /edits". That comment was written for the legacy DALL·E-2 path; gpt-image-* does accept `size` on `/edits`. The comment will be updated.

## Changes

### 1. `src/lib/jobs/upscaleJobs.ts`
- Add `outputSize?: "1024x1024" | "1536x1536" | "2048x2048"` to `UpscaleConfig`.
- In `startUpscale` (AI branch), pass `outputSize: config.outputSize || "1024x1024"` into the `supabase.functions.invoke("upscale-image-ai", { body: ... })` body.

### 2. `src/lib/jobs/bulkUpscaleJobs.ts`
- In `runOne` AI branch, same: pass `outputSize: config.outputSize || "1024x1024"` in invoke body.

### 3. `supabase/functions/upscale-image-ai/index.ts`
- Parse and validate `outputSize` from request body: allow only `"1024x1024" | "1536x1536" | "2048x2048"`, default `"1024x1024"`.
- Change `callOpenAI` signature to accept `outputSize` and `fd.append("size", outputSize)` in the FormData.
- Update the misleading comment about `size`.
- Do NOT pass `outputSize` to `callOpenRouter` or `callGoogle`.

### 4. `src/components/admin/ImageUpscaleDialog.tsx`
- Add `const [outputSize, setOutputSize] = useState<"1024x1024"|"1536x1536"|"2048x2048">("1024x1024")`.
- Render a small `RadioGroup` (3 chips: 1K / 1.5K / 2K) only when `engine === "ai"`, placed just above the "Extra instructions" field.
- Pass `outputSize` to `startUpscale` config.

### 5. `src/components/admin/BulkImageUpscaleDialog.tsx`
- Same state + selector + config wiring as #4.

## Out of scope
- No DB migration.
- No OpenRouter/Google changes.
- No new admin flag.
- Self-hosted deploy of `upscale-image-ai` is a server-side step the user runs after merge.

## Files touched
- `src/lib/jobs/upscaleJobs.ts`
- `src/lib/jobs/bulkUpscaleJobs.ts`
- `supabase/functions/upscale-image-ai/index.ts`
- `src/components/admin/ImageUpscaleDialog.tsx`
- `src/components/admin/BulkImageUpscaleDialog.tsx`
