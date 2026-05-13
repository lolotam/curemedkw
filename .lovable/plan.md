## Add legacy URL redirects + noindex 404

A SPA can't return real HTTP 301s without server config (Lovable hosting serves `index.html` for any unknown path), so I'll do **client-side 301-equivalent redirects** with React Router's `<Navigate replace>` — Googlebot follows them and consolidates signals. The remaining cleanup is a real `noindex` on the 404 page.

### 1. Add legacy route redirects in `src/App.tsx`

Map old WordPress paths to current routes. Note current routes are `/about` and `/contact` (not `/about-us`/`/contact-us`), and the home is `/curemed`.

| Legacy path | Redirect to |
|---|---|
| `/about-us` and `/about-us/` | `/about` |
| `/contact-us` and `/contact-us/` | `/contact` |
| `/home` | `/curemed` |
| `/products` and `/products/` | `/curemed` |
| `/product-category/:slug` and `/product-category/:slug/` | `/category/:slug` |
| `/product/:slug` and `/product/:slug/` | `/curemed` (no old-slug → UUID lookup table available; sending to home is the safest default) |

Implementation: add a small `Redirect` helper (or inline `<Navigate to="..." replace />` elements) plus a `LegacyCategoryRedirect` / `LegacyProductRedirect` wrapper that reads `useParams()` and forwards the slug. Place these `<Route>` entries **above** the `*` catch-all.

Trailing-slash variants are handled by adding a duplicate `<Route>` for each (React Router 6 treats `/about-us` and `/about-us/` as distinct).

### 2. Make `NotFound` non-indexable in `src/pages/NotFound.tsx`

Add a `<Helmet>` block (project already uses `react-helmet-async` via `Seo.tsx`) that emits:

```html
<title>404 — Page not found | Curemed</title>
<meta name="robots" content="noindex, follow" />
```

Reusing the existing `<Seo />` component is cleanest — it already wraps `<Helmet>`. Add an optional `noindex` prop to `Seo.tsx` if it doesn't have one, then use it from `NotFound`.

### 3. No changes to

- `public/robots.txt` (already correct)
- `public/sitemap.xml` (legacy paths shouldn't be in the sitemap; redirect targets already are)
- `index.html` (sitewide head untouched)
- Backend / DB

### Manual GSC step (you do this, not the code)

In Search Console → Sitemaps: remove the stale `sitemap_index.xml` and submit `https://curemedkw.com/sitemap.xml`. Nothing to change in code for that.

### Verification

After the edits I'll spot-check:
1. `App.tsx` compiles and the new routes appear above `*`.
2. The `NotFound` page renders with `<meta name="robots" content="noindex, follow">` in `document.head`.

Approve and I'll ship the redirects + noindex.