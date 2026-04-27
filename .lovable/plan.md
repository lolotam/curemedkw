# Checkout upgrade plan

Two features for `/checkout`:

1. **Edit cart inline** — qty +/−, remove item, live totals.
2. **Hierarchical address** — Country → Governorate → Area cascading dropdowns + Block / Street / Building / Additional details, with full lists for the 8 countries you listed.

---

## 1. New data file — `src/lib/regionsData.ts`

A typed hierarchy `COUNTRIES → governorates → areas`, every entry bilingual (`{ en, ar }`). Compiled from official sources (Wikipedia governorate lists, Saudi Post, UAE Federal Competitiveness, Bahrain CIO, etc.).

Approximate counts per country:

| Country | Governorates | Total areas |
|---|---|---|
| 🇰🇼 Kuwait | 6 (Capital, Hawalli, Farwaniya, Mubarak Al-Kabeer, Ahmadi, Jahra) | ~120 areas (e.g. Hawalli → Salmiya, Rumaithiya, Bayan, Mishref, Jabriya, Salwa, Shaab, Hittin…; Capital → Sharq, Mirqab, Dasman, Qibla, Daiya, Mansouriya, Adailiya, Khaldiya, Shamiya, Faiha, Nuzha, Surra…; Farwaniya → Farwaniya, Khaitan, Riggae, Andalous, Ardiya, Jleeb, Sabah Al-Nasser, Rabia, Ishbiliya, Firdous…; Ahmadi → Fahaheel, Mahboula, Mangaf, Abu Halifa, Fintas, Sabah Al-Salem, Egaila, Wafra…; Jahra → Jahra, Saad Al-Abdullah, Naseem, Oyoun, Qasr, Taima, Sulaibiya…; Mubarak Al-Kabeer → Adan, Qurain, Qusour, Messila, Sabah Al-Salem, Funaitees, Abu Al Hasaniya, Abu Fatira…) |
| 🇦🇪 UAE | 7 emirates | ~70 areas (Dubai → Deira, Bur Dubai, Jumeirah, Marina, JLT, Downtown, Business Bay, Al Barsha, Mirdif, Al Qusais, Discovery Gardens, JVC, Silicon Oasis…; Abu Dhabi → Corniche, Khalidiya, Al Bateen, Al Reem, Yas, Saadiyat, Mussafah, Al Ain, Madinat Zayed…; Sharjah, Ajman, RAK, UAQ, Fujairah core areas) |
| 🇸🇦 Saudi Arabia | 13 provinces | ~80 cities (Riyadh, Jeddah, Mecca, Medina, Dammam, Khobar, Dhahran, Taif, Tabuk, Abha, Khamis Mushait, Hail, Jubail, Yanbu, Najran, Jazan, Qassim/Buraidah/Unaizah, Al-Ahsa/Hofuf, Madinat Yanbu Al-Sinaiyah, Arar, Sakaka…) |
| 🇶🇦 Qatar | 8 municipalities (Doha, Al Rayyan, Al Wakrah, Al Khor, Umm Salal, Al Daayen, Al Shamal, Al Shahaniya) | ~40 areas (West Bay, The Pearl, Lusail, Msheireb, Al Sadd, Bin Mahmoud, Al Waab, Aspire, Education City…) |
| 🇧🇭 Bahrain | 4 governorates (Capital, Muharraq, Northern, Southern) | ~30 areas (Manama, Juffair, Adliya, Seef, Hoora, Riffa, Hamad Town, Isa Town, Sitra, Saar…) |
| 🇴🇲 Oman | 11 governorates | ~30 wilayats (Muscat → Muttrah, Bawshar, Seeb, Al Amerat, Qurm, Madinat Sultan Qaboos…; Dhofar/Salalah; Al Batinah North/South; Dakhiliyah/Nizwa; Sharqiyah N/S/Sur; Buraimi; Musandam/Khasab; Dhahirah/Ibri; Al Wusta) |
| 🇱🇧 Lebanon | 8 governorates (Beirut, Mount Lebanon, North, Akkar, Bekaa, Baalbek-Hermel, South, Nabatieh) | ~50 cities/districts (Beirut → Achrafieh, Hamra, Verdun, Gemmayzeh, Mar Mikhael, Badaro…; Tripoli, Jounieh, Byblos, Tyre, Sidon, Zahlé, Baalbek, Nabatieh…) |
| 🇯🇴 Jordan | 12 governorates | ~40 cities (Amman → Abdoun, Sweifieh, Jabal Amman, Shmeisani, Khalda, Dabouq, Tla Al-Ali, Marj Al-Hamam, Jubeiha…; Zarqa, Irbid, Aqaba, Salt, Madaba, Karak, Tafilah, Ma'an, Mafraq, Jerash, Ajloun…) |

Shape:
```ts
export type LocalizedName = { en: string; ar: string };
export type Area = LocalizedName;
export type Governorate = LocalizedName & { areas: Area[] };
export type Country = LocalizedName & {
  code: string;       // "KW" | "AE" | "SA" | "QA" | "BH" | "OM" | "LB" | "JO"
  dialCode: string;   // "+965" etc — for future phone formatting
  governorates: Governorate[];
};
export const COUNTRIES: Country[] = [...];
```

Default country = Kuwait (top of list).

---

## 2. Database migration

Add two nullable text columns — non-breaking, defaults preserve existing rows:

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Kuwait',
  ADD COLUMN IF NOT EXISTS governorate text NOT NULL DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Kuwait',
  ADD COLUMN IF NOT EXISTS governorate text NOT NULL DEFAULT '';
```

Then update `useCreateOrder` (in `src/lib/db.ts`) and the profile read/write paths to include the two new fields. (Supabase types regenerate automatically.)

---

## 3. `/checkout` — inline cart editing

Replace the read-only summary list (lines 357–376) with editable rows:

- `−` / qty / `+` rounded pill (matches the cart-page styling, gradient hover)
- `🗑` remove button (red)
- Per-line subtotal updates instantly
- If user empties the cart they're redirected back to `/cart`
- All driven by the existing `useCart()` hook (`setQuantity`, `remove`) — no new state needed.

---

## 4. `/checkout` — new address section

Replace the `City + Area` row with **4 cascading selects** + 4 text inputs, in this order:

1. **Country** (select) — defaults to Kuwait, 8 options.
2. **Governorate** (select) — options derived from selected country. Resets when country changes.
3. **Area** (select) — options derived from selected governorate. Resets when governorate changes.
4. **Block** (text, required)
5. **Street** (text, required)
6. **Building / House** (text, required — was optional, now required as you implied)
7. **Additional details** (text, optional — floor / apartment / landmark)
8. **Order notes** (textarea, kept as-is)

The dropdowns render the AR or EN label automatically based on `useI18n().lang`. The stored value is always the **English canonical name** (so admin order list stays consistent).

The old `city` field is dropped from the form (governorate replaces it). For backwards-compatibility, on submit we also write `city = governorate` so existing admin views and the orders table's `city` column keep working.

---

## 5. New i18n keys (added to `src/lib/i18n.tsx`)

| Key | EN | AR |
|---|---|---|
| `checkout.country` | Country | الدولة |
| `checkout.countrySelect` | Select country | اختر الدولة |
| `checkout.governorate` | Governorate | المحافظة |
| `checkout.governorateSelect` | Select governorate | اختر المحافظة |
| `checkout.editCart` | Edit your cart | تعديل سلتك |
| `checkout.error.country` | Please select a country and governorate. | يرجى اختيار الدولة والمحافظة. |

Reuse existing `checkout.area`, `checkout.areaSelect`, `checkout.block`, `checkout.street`, `checkout.building`, `checkout.addressLine`, `checkout.addressLinePh`, `cart.decrease`, `cart.increase`, `cart.remove`.

---

## 6. Files touched

| File | Change |
|---|---|
| `src/lib/regionsData.ts` | **new** — full 8-country hierarchy |
| `supabase/migrations/<ts>_add_country_governorate.sql` | **new** — adds 2 columns to `orders` + `profiles` |
| `src/lib/db.ts` | extend `CreateOrderInput` + profile typing with `country`, `governorate` |
| `src/pages/Checkout.tsx` | replace address block with cascading selects; add inline cart editor in the summary; wire validation |
| `src/lib/i18n.tsx` | add 6 new keys |
| `src/pages/Account.tsx` | (light) accept the new profile fields if it currently writes the address |

The visual style (animated gradient hero, GlowCards, Icon3D badges, Reveal-on-scroll, gradient CTA) is **fully preserved** — selects keep the same emerald-ring style, cart rows reuse the gradient hover from `/cart`.

---

## Open questions

I'll proceed with these defaults unless you want them changed:

- **Default country** = Kuwait.
- **Building / House** becomes **required** (currently optional). Say "no" if you'd rather keep it optional.
- **Phone field** stays as a single free-text input (we don't auto-prefix the country dial code). Say "yes" if you want a dial-code dropdown driven by the selected country.