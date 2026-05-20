Double the width of the Partners dropdown and add a logo preview on hover.

### Changes — `src/components/site/SiteHeader.tsx` (PartnersMenu only)

- Change `DropdownMenuContent` width from `w-56` to `w-[28rem]` (≈ double) and add `p-0 overflow-hidden`.
- Inside, render a two-column flex layout:
  - **Left half** (`w-1/2 p-1`): the existing `BRAND_LIST.map(...)` menu items. Each item:
    - Adds `onMouseEnter` / `onFocus` that updates a local `hoveredBrand` state.
    - Keeps current `Link` behavior so clicking the name navigates to `/${b.slug}` (unchanged).
  - **Right half** (`w-1/2 border-l border-border bg-muted/30 flex items-center justify-center p-4`):
    - When `hoveredBrand` is set, render `<Link to={"/" + hoveredBrand.slug}>` containing `<img src={hoveredBrand.logo} alt={hoveredBrand.name} className="max-h-24 max-w-full object-contain" />`. Clickable → brand page.
    - When nothing is hovered yet, default to the first brand in the list as a placeholder so the right pane is never empty.
- Add `const [hoveredBrand, setHoveredBrand] = useState(BRAND_LIST[0]);` at the top of `PartnersMenu`.
- Initialize hover to the first brand on dropdown open via existing items — no extra state machine.

### No other files touched
No DB, no new components, no styling tokens added — uses existing `BRAND_LIST` (already has `.logo`) and current design tokens.