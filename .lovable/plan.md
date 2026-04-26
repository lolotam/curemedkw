## Goal
Replace every brand card image with the corresponding logo you uploaded to the `brands-images` Supabase storage bucket.

## Mapping (storage filename → brand)
| Brand | Storage file |
|---|---|
| Flexitol | `flexitol.png` |
| Kapiva | `kapiva.png` |
| Australian Bodycare | `Australian Bodycare.png` |
| NADA | `NADA.png` |
| Lafe's | `Lafes.png` |
| Hartington | `Hartington.png` |
| Phytophar | `Phytophar.png` |

All 7 files are confirmed present in the public `brands-images` bucket.

## Changes

### `src/lib/brands.ts`
- Remove the 7 local `import * from "@/assets/brand-*.png"` statements.
- Replace each `BRANDS[*].logo` value with the public Supabase URL:
  ```
  https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/brands-images/<filename>
  ```
  (URL-encoding the space in `Australian Bodycare.png` as `Australian%20Bodycare.png`).

That's the only file that needs editing — `SiteHeader`, `SiteFooter`, and `CuremedHome` all read `BRAND_LIST[].logo`, so they'll pick up the new URLs automatically across:
- `/curemed` "Our Brands" cards
- Header brand menu icons
- Footer brand list

## Out of scope
- Not deleting the local `src/assets/brand-*.png` files (harmless, and keeps git history clean).
- No DB or RLS changes — the bucket is already public.