# Admin: upload / set Preloader Video URL

## Why

`src/pages/Loading.tsx` currently hardcodes the splash-screen video to a fixed Supabase storage URL. There is no admin control. Add a card on `/admin/branding` so the admin can either upload a video file or paste a URL, saved to `site_settings` and used live by the Loading page.

Saves automatically to the active backend (Lovable Cloud in preview, the self-hosted Supabase on `curemedkw.com`) since both use the same `site_settings` table that already exists in both databases.

## 1. Storage helper — accept video uploads

File: `src/lib/db.ts`

Add a new helper next to `uploadBrandingImage`:

```ts
export async function uploadBrandingVideo(file: File, prefix: string): Promise<string>
```

- Bucket: existing public `hero-media` (already used for splash media).
- Path: `branding/${safePrefix}-${Date.now()}.${ext}`.
- Allowed types: `video/mp4`, `video/webm`, `video/quicktime`.
- Max size: 30 MB (toast on overflow).
- No WebP conversion — upload raw.
- Returns public URL via `getPublicUrl`.

## 2. New site_settings key + hook

File: `src/lib/db.ts`

```ts
export const LOADER_VIDEO_KEY = "loader_video_url";
export const LOADER_VIDEO_DEFAULT =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4";
export function useLoaderVideoUrl()  // useSiteSetting<string>(LOADER_VIDEO_KEY, LOADER_VIDEO_DEFAULT)
```

No DB migration needed — `site_settings` already exists with admin-only write RLS, and the row is created on first save via the existing `useUpdateSiteSetting` upsert.

## 3. Loading page — read from settings

File: `src/pages/Loading.tsx`

Replace the hardcoded `VIDEO_URL` with `const { data: videoUrl } = useLoaderVideoUrl();` and render `<video src={videoUrl ?? LOADER_VIDEO_DEFAULT} …/>`.

## 4. New admin card on /admin/branding

File: `src/pages/admin/AdminBranding.tsx`

Add a new `<LoaderVideoControl />` block placed right above `<LoaderBarControl />` (logical grouping — both are about the splash page). Card contents:

- Title: **Preloading page video**
- Description: *"Shown on the splash/loading screen before the home page. Upload an MP4/WebM (≤ 30 MB) or paste a URL. Saves immediately to the live database."*
- URL `Input` + **Upload** button (triggers hidden `<input type="file" accept="video/*">`).
- Live preview: `<video controls muted className="h-40 rounded-lg bg-black" />` of the current saved URL.
- Save / Reset-to-default buttons (mirrors existing BrandingField UX).
- Validation: URL must start with `https://` or `/`; show inline amber warning if not.

Implement as a self-contained component in the same file (similar to `LoaderBarControl`) — no need to generalize `BrandingField` for video, since transparency-check / probing logic doesn't apply.

## 5. Self-hosted parity note

No code or schema work — `site_settings` already exists on the self-hosted Supabase stack. First save from `/admin/branding` on `curemedkw.com` writes the row directly to that database. Add one short paragraph to `SELF_HOSTED.md` under the existing `site_settings` section listing the new key `loader_video_url` for documentation.

## Out of scope

- No new bucket (reuse `hero-media`, already public).
- No edge function / no migration.
- No change to the loader progress-bar settings.

## Files touched

- `src/lib/db.ts` — `uploadBrandingVideo`, `LOADER_VIDEO_KEY`, `useLoaderVideoUrl`
- `src/pages/Loading.tsx` — read URL from settings
- `src/pages/admin/AdminBranding.tsx` — new `LoaderVideoControl` card
- `SELF_HOSTED.md` — document the new key
