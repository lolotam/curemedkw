# Header restructure: Partners dropdown + About/Contact links

## Goal
Reorganize the main site header so that:
- The individual brand links are grouped under a single new menu item called **Partners** (a dropdown), with every brand as a sub-item.
- **About Us** and **Contact Us** are added back to the header as top-level links.

## Final header layout (left → right)
```
Home | Partners ▾ | About | Contact
        ├ Flexitol
        ├ Kapiva
        ├ ABC (Australian Bodycare)
        ├ NADA
        ├ Lafe's
        ├ Hartington
        └ Phytophar
```
Right side (unchanged): notifications, cart, user, language, theme, mobile toggle.

## Changes

### 1. `src/lib/i18n.tsx`
Add translation keys (EN/AR) appended at the bottom alongside the other `TRANSLATIONS[...] = ...` lines:
- `nav.partners` → "Partners" / "شركاؤنا"
- Reuse existing `nav.about` ("About" / "من نحن") and `nav.contact` ("Contact" / "تواصل معنا").

### 2. `src/components/site/SiteHeader.tsx`
**Desktop nav** (the `<nav className="hidden ... lg:flex">` block): replace the current `BRAND_LIST.map(...)` of brand `NavItem`s with:
- `Home` link (kept).
- A new **Partners** dropdown built with the existing shadcn `DropdownMenu` (already imported). Trigger styled like `NavItem` (bold, uppercase, brand underline on active/hover) with a small chevron. Active state when `location.pathname` starts with any brand slug (`/${b.slug}`). Content lists each `BRAND_LIST` item as a `DropdownMenuItem` linking to `/${b.slug}` (use brand `shortName ?? name`).
- `About` `NavItem` → `/about`.
- `Contact` `NavItem` → `/contact`.

**Mobile menu** (the `lg:hidden` panel): replace brand list with:
- Home
- A "Partners" section header (small uppercase muted label) followed by indented `MobileItem` entries for each brand.
- About → `/about`
- Contact → `/contact`

Keep all closing behavior (`onClick={() => setOpen(false)}`) intact.

### 3. No other files need to change
- Routes `/about` and `/contact` already exist in `src/App.tsx` (lines 60–61).
- `BRAND_LIST` from `src/lib/brands.ts` is already imported and is the source of truth.

## Technical notes
- Use existing `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (already imported in `SiteHeader.tsx`).
- Wrap each `DropdownMenuItem` with `asChild` + `<Link to={...}>` so React Router handles navigation without page reload.
- The Partners trigger uses `cn(...)` with the same classes the current `NavItem` uses so visual style stays consistent (bold, uppercase, brand underline).
- Active detection: `const partnersActive = BRAND_LIST.some(b => location.pathname.startsWith('/' + b.slug));`
- No DB / RLS / edge-function changes.

## Out of scope
- Reordering or restyling the rest of the header (logo, right-side icons).
- Changing brand content, slugs, or routes.
