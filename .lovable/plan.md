## Restyle "Shop by category" — Static Pillar-Tinted Grid with Hover Ring

Replace the auto‑scrolling marquee in `src/components/site/CategoryCarousel.tsx` with a calm, premium responsive grid that visually echoes the "What we do" pillars section right above it on the home page.

### Layout
- Drop the marquee + duplicated loop entirely (and remove the `cat-marquee` animation usage here).
- Responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` with `gap-5 md:gap-6`.
- Show all active top-level categories (existing `c.isActive && !c.parentId` filter stays).
- Section keeps its current heading + subtitle, centered, with the same padding.

### Pillar tint cycling
Cycle 4 palettes across categories by index `i % 4`, matching the pillars on the home page:
1. **Pharma** — sky (`from-sky-500 to-cyan-400`, blob `bg-sky-400/30`, ring `group-hover:shadow-sky-400/40`, title hover `group-hover:text-sky-600`, badge `bg-sky-500/10 text-sky-700`)
2. **Skincare** — rose/pink (`from-pink-500 to-rose-400`, blob `bg-pink-400/30`, ring `group-hover:shadow-pink-400/40`, title hover `group-hover:text-pink-600`, badge `bg-pink-500/10 text-pink-700`)
3. **Wellness** — emerald (`from-emerald-500 to-teal-400`, blob `bg-emerald-400/30`, ring `group-hover:shadow-emerald-400/40`, title hover `group-hover:text-emerald-600`, badge `bg-emerald-500/10 text-emerald-700`)
4. **Medical** — violet (`from-violet-500 to-indigo-400`, blob `bg-violet-400/30`, ring `group-hover:shadow-violet-400/40`, title hover `group-hover:text-violet-600`, badge `bg-violet-500/10 text-violet-700`)

### Card structure (per category)
Wrapped exactly like the pillar cards so the hover halo reads identically:
```tsx
<div className="group relative">
  {/* gradient halo behind card on hover — same as pillars */}
  <div aria-hidden className={cn("absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-0 blur transition-opacity duration-500 group-hover:opacity-60", grad)} />

  <Link to={`/category/${c.slug}`} className={cn(
    "relative block h-full overflow-hidden rounded-3xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl",
    ring,
  )}>
    {/* decorative tinted blob */}
    <div aria-hidden className={cn("absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl", blob)} />

    {/* square image panel with soft tinted background behind it */}
    <div className={cn("relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br", softTint)}>
      {c.imageUrl
        ? <img src={c.imageUrl} alt={c.nameEn} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-foreground/70">{c.nameEn.charAt(0)}</div>}
    </div>

    {/* name + count pill */}
    <div className="relative mt-4 flex flex-col items-center text-center gap-2">
      <h3 className={cn("font-semibold text-sm md:text-base transition-colors duration-300", titleHover)}>
        {lang === "ar" && c.nameAr ? c.nameAr : c.nameEn}
      </h3>
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", badgeTint)}>
        {count} {count === 1 ? t("categories.product") : t("categories.products")}
      </span>
    </div>
  </Link>
</div>
```
- `softTint` is a gentle gradient like `from-sky-100/60 to-sky-50` per palette (used as the panel behind the image).
- The **gradient halo + lift + ring shadow** are copied from the pillars cards so the hover language matches exactly.
- Image scales to `1.05` on group hover (kept inside `overflow-hidden` so it doesn't break the rounded corners).

### Real product counts
- Add a second hook usage in `CategoryCarousel.tsx`: pull products via `useProducts()` (already exported from `src/lib/db.ts`).
- Build `counts = Map<categoryId, number>` by iterating products, counting BOTH `product.categoryId` and any IDs in `product.categoryIds` (de‑duped per product) so a product with multiple categories is counted in each — matches how `BrandPage.tsx` already counts.
- A category's count also includes any of its **subcategories** (since subcategories are not shown here, their products should still roll up to the parent tile). Implementation: for each category `c` in the active top-level set, sum direct products + products tied to any descendant categories.

### i18n
Add two new keys (in `src/lib/i18n.tsx`) used by the count pill:
- `categories.product` → "product" / "منتج"
- `categories.products` → "products" / "منتجات"

If the existing `t()` API doesn't support pluralization helpers, just pick `products` for `count !== 1` and `product` for `count === 1` in the component (as shown above).

### Cleanup
- The `cat-marquee` keyframe/class in `src/index.css` is only used by this component — leave it in place for now (low risk; can be removed in a follow-up if no other usage is found via `rg`).
- No DB schema changes. No new packages.

### Files to edit
- `src/components/site/CategoryCarousel.tsx` — full rewrite of the rendering body (header stays).
- `src/lib/i18n.tsx` — add `categories.product` / `categories.products` strings (EN + AR).

### Out of scope (not changing in this pass)
- Brand pages' filter sidebar (already done in a prior step).
- The "What we do" pillar section itself.
- Removing the `cat-marquee` CSS keyframes.
