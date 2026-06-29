# Checkout: Layout Restructure + Form Persistence

Two changes to `/checkout`, both confined to `src/pages/Checkout.tsx`.

## Part 1 — Layout restructure

Keep the two-column layout. Move **Select Payment Method** into the right rail (where Order Summary is now), and stack **Order Summary** directly beneath it. Contact Information and Delivery Address stay exactly where they are.

```text
        LEFT COLUMN                 RIGHT RAIL (sticky)
┌────────────────────────┐   ┌──────────────────────────┐
│ Contact Information      │   │ Select Payment Method     │  ← moved here
│  (unchanged)            │   │  • KNET / Card / wallets  │
├────────────────────────┤   ├──────────────────────────┤
│ Delivery Address        │   │ Order Summary             │  ← under payment
│  (unchanged)            │   │  • cart items + qty/remove│
│                         │   │  • promo code             │
│                         │   │  • subtotal/discount/total│
│                         │   │  [ Pay Now · KD total ]   │
└────────────────────────┘   └──────────────────────────┘
```

- Remove the Payment `SectionCard` from the left column and place it at the top of the right `<aside>`, above the existing Order Summary `GlowCard`. Both cards share one vertical column and keep the sticky behavior.
- Everything inside each card stays the same (payment methods, device-wallet gating, cart edit, coupon, totals, Pay Now button + states).

## Part 2 — Persist the checkout form

Save what the shopper types so it's restored on their next visit (works for guests too, not just logged-in users).

- Add a localStorage key `curemed.checkout.form.v1` holding all address/contact fields: `customerName, customerEmail, customerPhone, country, governorate, area, block, street, building, addressLine, notes`. Also persist the selected payment method.
- On every form change, write the current values to localStorage (debounced via a `useEffect` on the `form` state — same pattern the cart already uses in `src/lib/cart.tsx`).
- On mount, hydrate `form` from localStorage first. Then keep the existing profile prefill, but only fill fields the saved data left empty (saved values win, so a returning user sees their last entries).
- Restore order respects the country → governorate → area cascade so the dependent selects show the saved values correctly.
- Persisted data survives across sessions and page reloads; it is not cleared after an order, so the next visit shows the previous details. (Cart contents continue to clear on successful payment as today.)

## What stays the same
- All validation, order creation, WhatsApp admin notify, MyFatoorah payment + guest-token flow, redirect.
- Coupon apply/remove, cart quantity/remove, totals.
- Arabic RTL, responsiveness, empty-cart state, and the existing visual language (GlowCards, Icon3D chips, gradient headings, rounded-2xl inputs).

## Technical notes
- One file: `src/pages/Checkout.tsx`.
- Add small `loadForm()` / `saveForm()` helpers (mirroring the existing `loadCoupon`/`saveCoupon` pattern) wrapped in try/catch for SSR/quota safety.
- Hydrate via lazy `useState(() => loadForm())` merged with current defaults; a `useEffect([form])` persists changes.
- Profile prefill `useEffect` updated to only set fields that are still empty after hydration.
- No backend, schema, or edge-function changes. No database migration required.
