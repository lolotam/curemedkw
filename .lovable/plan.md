## Goal
Translate brand display names to Arabic in the header, and ensure the Partners dropdown in Arabic shows names on the right (RTL) with the logo preview on the left.

## Changes

### 1. `src/lib/brands.ts`
Add an Arabic name field to `BrandMeta`:
```ts
nameAr: string;
shortNameAr?: string;
```
Set values:
- flexitol → فليكسيتول
- kapiva → كابيفا
- nada (NADA) → ندا
- abc (ABC / Australian Bodycare) → keep ABC (user didn't list it; leave as-is)
- lafes → لافز
- hartington → هارتنجتون
- phytophar → فيتوفار
- hualunhongli → هيلون-هونجلاي

### 2. `src/components/site/SiteHeader.tsx`
- Import `useI18n` (already used elsewhere — verify) and pick the localized name helper:
  ```ts
  const displayName = (b) => lang === "ar" ? (b.shortNameAr ?? b.nameAr) : (b.shortName ?? b.name);
  ```
- Use it in:
  - Mobile menu list (line 144)
  - `PartnersMenu` dropdown items (line 187)
- In `PartnersMenu`'s `DropdownMenuContent` inner `<div className="flex">`, add `lang === "ar" && "flex-row-reverse"` so the brand-name column sits on the right and the logo preview on the left in Arabic. Keep widths/borders as-is (the border becomes the right edge of the logo panel automatically; adjust `border-l` → use `border-l` still works since it's on the logo column which is now on the left — switch to `border-r` conditionally to keep the divider between the two halves).

### 3. Out of scope
No changes to routes, slugs, SEO meta, or other pages — only the header's display names and dropdown direction.

## Technical notes
- The app already toggles `document.documentElement.dir="rtl"` for Arabic, but Radix `DropdownMenuContent` is portaled and may not inherit, so explicit `flex-row-reverse` is the reliable fix.
- No DB / backend / i18n JSON changes needed; brand names live in `brands.ts`.
