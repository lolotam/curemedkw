
# Website Speed Optimization Plan

## 1. Auto-convert images to WebP on upload (biggest impact)

Currently, images are uploaded as-is (PNG, JPG, etc.) to storage. We'll add a client-side conversion step that converts any image to WebP before uploading, reducing file sizes by 25-80%.

**How it works:**
- Create a utility function `convertToWebP(file: File, quality?: number): Promise<File>` that uses the browser's Canvas API to re-encode images as WebP
- Call this function in every upload path before sending to storage:
  - `uploadProductImage()` in db.ts
  - `uploadBrandingImage()` in db.ts
  - `uploadHeroMedia()` in heroSlides.ts (images only, not videos)
  - Avatar upload in Account.tsx
- Quality defaults to 0.82 (good balance of size vs quality)
- Already-WebP files skip conversion

**No backend changes needed** — this is pure client-side using `<canvas>.toBlob('image/webp')`.

## 2. Lazy-load images with native `loading="lazy"`

Some `<img>` tags are missing `loading="lazy"`. We'll audit and add it to all below-the-fold images across components (hero slides, product grids, about page, etc.).

## 3. Code splitting with React.lazy

Currently all 20+ pages are eagerly imported in App.tsx. We'll convert admin pages and less-visited pages to `React.lazy()` imports with `<Suspense>`, so the initial bundle only includes the landing/loading page.

Pages to lazy-load: all admin pages, Auth, Account, Cart, Checkout, OrderConfirmation, AboutUs, ContactUs, ResetPassword.

## 4. Supabase Storage image transform URLs (optional, no code change needed)

Supabase Storage supports on-the-fly image transforms via URL params (e.g. `?width=400&quality=75`). We can use this for thumbnails in product cards to serve smaller images. This is a lightweight change in ProductCard and similar components.

---

## Technical Details

### WebP conversion utility (`src/lib/imageConvert.ts`)
```
convertToWebP(file, quality = 0.82) → Promise<File>
- Skip if already webp
- Load into Image → draw on canvas → toBlob('image/webp', quality)
- Return new File with .webp extension
```

### Modified upload functions
Each upload function gets a 1-line addition: `file = await convertToWebP(file);` before the storage upload call.

### Code splitting pattern
```ts
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
// wrapped in <Suspense fallback={<Loading />}>
```

### Estimated impact
- WebP conversion: 30-70% smaller images
- Code splitting: 40-60% smaller initial JS bundle
- Lazy loading: faster perceived load (fewer network requests upfront)
