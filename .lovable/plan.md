# Translation & RTL Audit — Full Site Coverage

Goal: Every customer-facing page must render correctly in **English (LTR)** and **Arabic (RTL)** with no leftover hardcoded English.

## Phase 1 — Add missing translation keys
Add to `src/lib/i18n.tsx`:
- `reviews.title`, `reviews.empty`, `reviews.write`, `reviews.disclaimer`, `reviews.name`, `reviews.email`, `reviews.rating`, `reviews.comment`, `reviews.submit`, `reviews.commentPh`, `reviews.error.name`, `reviews.error.rating`, `reviews.error.comment`, `reviews.success`
- `cart.decrease`, `cart.increase`, `cart.remove`
- `category.productCount` (with plural) 
- `brand.why.title`, `brand.why.clinical`, `brand.why.trusted`, `brand.why.skinFriendly`, `brand.why.awardWinning`
- `notfound.title`, `notfound.subtitle`, `notfound.cta`
- `account.viewOrder`, `account.uploadOk`, `account.profileSaved`, `account.passwordOk`, `account.passwordMin`, `account.uploadFail`
- `notifications.title`, `notifications.empty`, `notifications.markAll`, `notifications.viewAll`, `notifications.unreadCount`
- `header.toggleLang`, `header.toggleTheme`, `header.menu`, `header.close`, `header.account`, `header.notifications`
- `whatsapp.label`

## Phase 2 — Customer pages: replace hardcoded text
Files to fix (user-facing only — admin stays English):
1. `src/pages/NotFound.tsx` — "Oops! Page not found" + Return to Home
2. `src/pages/CategoryPage.tsx` — "product/products" hardcoded plural
3. `src/pages/Account.tsx` — "View" button + toast strings
4. `src/pages/BrandPage.tsx` — "Why {meta.name}" heading already lang-aware items but heading hardcoded
5. `src/components/site/ProductReviews.tsx` — "Customer reviews" + empty state
6. `src/components/site/ReviewForm.tsx` — labels, placeholders, toast messages
7. `src/components/site/SiteHeader.tsx` — "Notifications", "View all messages", "No messages yet" (admin bell stays EN since admin-only)
8. `src/components/site/UserNotificationBell.tsx` — verify all labels
9. `src/components/site/WhatsAppFab.tsx` — aria-label

## Phase 3 — RTL polish
- Verify icon directional flips (ArrowLeft/ArrowRight) use `rtl:rotate-180`
- Verify margin/padding utilities use logical equivalents (ms-/me- or rtl: variants) where needed
- Check Cart minus/plus buttons round corners flip correctly in RTL
- Check Checkout summary panel in RTL
- Verify Product detail "•" separators look right RTL

## Phase 4 — Verification
- Type-check (tsc --noEmit) passes
- Render audit per-page in code, list any remaining hardcoded EN strings = 0
