# Remove COD + new MyFatoorah payment-method selector

## Goal
- Remove Cash on Delivery everywhere — online (MyFatoorah hosted page) becomes the only checkout path.
- Replace the current payment UI with a card styled like the uploaded "Select Payment Method" reference: a vertical list of radio rows, each with a brand logo, label, and currency, plus a prominent Pay Now button.
- Methods:
  - **KNET** — always shown
  - **Visa / MasterCard** — always shown (maps to MyFatoorah `CARD`)
  - **Apple Pay** — shown only on Apple/Safari devices that support Apple Pay
  - **Google Pay** — shown only on Android/Chrome devices that support Google Pay

The verify/redirect + webhook flow already matches the MyFatoorah Hosted Payment Page docs (GET payment details with 3 retries / `pending_status_update`, webhook overrides, success-is-final). No backend payment-logic changes are needed — the edge function already accepts `KNET | CARD | APPLE_PAY | GOOGLE_PAY`.

## 1. Brand logos (generated assets)
Generate four brand-style badge images on clean white backgrounds, store as project assets:
- `knet.png`, `visa-mastercard.png`, `apple-pay.png`, `google-pay.png`

Render them in small rounded chips next to each method, matching the reference screenshot.

## 2. Device capability detection
Add a small helper `src/lib/deviceWallets.ts`:
- `canUseApplePay()` — true when `window.ApplePaySession?.canMakePayments?.()` is true (covers iPhone/iPad/Mac Safari).
- `canUseGooglePay()` — true on Android/Chrome (user-agent + `window.PaymentRequest` presence check); never on Apple Safari.

The checkout builds the visible method list from: always `[KNET, CARD]`, plus `APPLE_PAY` / `GOOGLE_PAY` when supported. Default selection = KNET.

## 3. Checkout UI rewrite (`src/pages/Checkout.tsx`)
- Delete the COD vs Online toggle and the `payMode` state. There is now a single "Select Payment Method" card.
- Replace `PaymentOption` / `OnlineMethodOption` with a new `MethodRow` component: radio control on the left, brand logo chip, method name + currency label, selected state styled like the reference (blue ring + tinted background).
- `onlineMethod` state holds the chosen `OnlinePaymentMethod`; default `KNET`.
- The submit handler always runs the online branch: create order with `paymentMethod: "pay_by_link"`, generate guest token, call `createMyFatoorahPayment`, redirect to `payment_url`. Remove the COD success branch and its WhatsApp `order.paid` send (admin `new_order` WhatsApp notification can still fire on order creation if desired — keep current best-effort behavior but tied to order creation, not COD).
- Submit button relabelled to "Pay Now" style while keeping existing gradient theme and loading/redirecting states.

## 4. Remove COD everywhere (code paths)
- `src/lib/i18n.tsx`: drop `checkout.cod` / `checkout.codDesc` usage; add new keys (`checkout.selectMethod`, `checkout.payNow`, method labels for KNET / `Visa / MasterCard` / Apple Pay / Google Pay, currency `KWD`). Keep English + Arabic.
- `src/pages/admin/AdminOrders.tsx`: remove "Cash on Delivery" from the payment-method filter/labels so admins no longer see it as a selectable filter for new orders. Existing historical orders that still have `cod` in the database keep displaying a neutral label (no data migration, no destructive change).
- `src/lib/db.ts`: `paymentMethod` continues to accept its existing union for backward compatibility with old rows, but checkout only ever writes `pay_by_link`. No schema migration required.

## 5. No database migration
No schema change is needed. The `orders.payment_method` column already stores free-form values, and `payment_attempts` / enum already support all three live methods. (Per project rule: if any migration were required I'd hand you a self-hosted SQL script — none is needed here.)

## Technical notes
- Apple Pay through MyFatoorah's hosted page still requires Apple Pay to be enabled on the MyFatoorah account/domain; the device check only governs whether we *offer* the button. Same for Google Pay.
- The `CARD` method on MyFatoorah's hosted page surfaces Visa/Mastercard (and any other card schemes enabled on the account).
- Verify flow (`verify-myfatoorah-payment`) and webhook (`myfatoorah-webhook`) are unchanged and already implement the doc's redirect+webhook reconciliation and resilience rules.

## Files touched
- `src/pages/Checkout.tsx` (rewrite payment section, remove COD)
- `src/lib/deviceWallets.ts` (new)
- `src/assets/payment/*.png` (new generated logos) + `.asset.json` pointers
- `src/lib/i18n.tsx` (strings)
- `src/pages/admin/AdminOrders.tsx` (remove COD filter/label)
