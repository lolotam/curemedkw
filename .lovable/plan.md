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

## Phase 3 — RTL polish ✅
- All directional icons (ArrowLeft/ArrowRight/ChevronLeft/ChevronRight) verified using `rtl:rotate-180` or `rtl:hidden` variants — confirmed across HeroSlider, Testimonials, AutoCarousel, ProductDetail, Cart, Checkout, CategoryPage, CuremedHome.
- Cart qty +/- buttons: rounded corners are container-relative — flex auto-reverses in RTL so the visual outer edge stays rounded.
- Final hardcoded-text sweep: only "View" in Account.tsx remained — fixed to use `t("account.viewOrder")`. "Instagram" left in English (product/brand name per memory rule).

## Phase 4 — Verification ✅
- `tsc --noEmit` passes with zero errors.
- Render audit complete: no remaining hardcoded English JSX text on customer-facing surfaces.

## Remaining (DB-side, requires user action)
- Many products in the DB have empty `name_ar`, `short_description_ar`, `long_description_ar`, `usage_ar`, `benefits_ar`, `ingredients_ar`, `category_ar`. UI is now language-aware (falls back to English when AR is missing) but for full Arabic coverage these need to be populated.
- Option A: Bulk AI-translate via the `translate-product` edge function (already deployed).
- Option B: Manual entry per product in the admin editor.
