
# Big Plan — E-commerce, Users, Admin Management & Pending Items

This is a **large multi-phase plan**. I'll execute it phase by phase. After each phase you can test before I move on.

---

## Phase 1 — Database schema (one migration)

New tables (all with RLS):

- **`profiles`** — `id` (= auth.users.id, FK cascade), `full_name`, `phone`, `avatar_url`, `address_line`, `city`, `area`, `block`, `street`, `building`, `notes`, `created_at`, `updated_at`. Auto-created via trigger on signup. RLS: user reads/updates own row; admins read/update all.
- **`carts`** — `id`, `user_id` (nullable for guests), `session_id` (for guest cart), `created_at`. One active cart per user.
- **`cart_items`** — `id`, `cart_id`, `product_id`, `quantity`, `price_snapshot`. RLS: owner of cart only.
- **`orders`** — `id`, `order_number` (human readable e.g. `CM-001234`), `user_id` (nullable), `customer_name`, `customer_email`, `customer_phone`, `address_line`, `city`, `area`, `block`, `street`, `building`, `notes`, `subtotal`, `discount_amount`, `coupon_code`, `total`, `payment_method` (`pay_by_link` | `cod`), `payment_status` (`pending`|`paid`|`failed`), `order_status` (`new`|`confirmed`|`processing`|`shipped`|`delivered`|`cancelled`), `created_at`, `updated_at`. RLS: user reads own; admin all.
- **`order_items`** — `id`, `order_id`, `product_id`, `product_name_snapshot`, `product_image_snapshot`, `quantity`, `unit_price`, `line_total`.
- **`coupons`** — `id`, `code` (unique), `discount_type` (`percent`|`fixed`), `discount_value`, `min_order_amount`, `max_uses`, `used_count`, `expires_at`, `is_active`, `created_at`. RLS: anyone reads active coupons by code (for validation); admins manage.
- **`product_reviews`** — `id`, `product_id`, `reviewer_name`, `reviewer_email` (optional), `rating` (1-5), `comment`, `is_approved` (default false), `created_at`. RLS: anyone inserts; anyone reads `is_approved=true`; admins manage.
- **`site_settings`** — single-row table; columns: `id`=1, `price_visibility` JSONB `{global: false, brands: {flexitol: false, kapiva: false, ...}}`. RLS: anyone reads; admins update.
- **`notifications`** — `id`, `user_id`, `title`, `body`, `type` (`order`|`system`|`message`), `link`, `is_read`, `created_at`. RLS: user reads own; admins insert for any user.
- **`user_notification_templates`** — `id`, `key` (e.g. `order_confirmed`, `order_shipped`), `subject`, `body`, `is_active`. Admin-managed templates for automated messages.

Plus **trigger** to auto-create `profiles` row on `auth.users` insert.

---

## Phase 2 — Pending items from previous batch
1. **Inline price edit** in admin product table (click price → input → save on Enter/blur). Add column for **Original Price** with same inline editing.
2. **Price visibility flags admin page** (`/admin/flags`): 1 global toggle + 7 brand toggles. When hidden, ProductCard & ProductDetail replace price/discount badge with a **"Contact us"** button linking to `/contact`.
3. **Product reviews**:
   - Public form on ProductDetail page: name + rating stars + comment (no login).
   - Approved reviews show on the product page below description.
   - Approved reviews appear mixed into the existing Testimonials slider on the homepage.
   - Admin moderation page `/admin/reviews` (approve / delete / view).

---

## Phase 3 — Cart & Checkout (public)
- **CartContext** in `src/lib/cart.tsx` — provides `addItem`, `removeItem`, `updateQty`, `clear`, `items`, `subtotal`. Persists for guests via `localStorage` keyed by `session_id`; for logged-in users syncs with `carts`/`cart_items` tables.
- **"Add to Cart" button** on:
  - Every `ProductCard` (overlay button on hover + always visible on mobile).
  - `ProductDetail` page (qty selector + Add to Cart, alongside existing "Inquire").
  - When price is hidden by flag → button becomes "Contact us" instead.
- **Cart icon in `SiteHeader`** with badge showing item count, opens a Sheet/drawer cart preview.
- **`/cart` page** — full list with qty controls, remove, subtotal, coupon code field with validation, "Proceed to checkout" button.
- **`/checkout` page** — form: name, phone, email, full address (city, area, block, street, building, notes), payment method radio (`Pay by link` / `Cash on delivery`). For logged-in users, prefill from profile. Submit → creates `order` + `order_items`, clears cart, redirects to `/order-confirmation/:id`.
- **`/order-confirmation/:id`** — thank-you page with order number, summary, and message that admin will contact for payment link if applicable.
- All forms validated with **zod**.

---

## Phase 4 — User auth, profile & dashboard
- Enable **Email/password + Google sign-in** (using Lovable Cloud auth). Public **`/login`** and **`/signup`** pages (you mentioned signup will be activated by you — I'll add a kill-switch in `site_settings.signup_enabled` so you flip it on when ready).
- Add **`/forgot-password`** + **`/reset-password`** pages.
- **`/account`** layout with sub-routes:
  - `/account/profile` — view/edit profile (name, phone, address, avatar upload to a new `avatars` storage bucket).
  - `/account/orders` — list of user's orders + status timeline. Click → order detail.
  - `/account/notifications` — in-app notifications with unread counter (bell icon in header for logged-in users).
  - `/account/security` — change password.
- Header gets a **user avatar/menu** when logged in (Profile / Orders / Notifications / Logout).

---

## Phase 5 — Admin dashboard additions
- **`/admin/orders`** — table of all orders (search, filter by status, payment method, date). Click → detail with items, customer info, address, status timeline. Inline status change (`new → confirmed → processing → shipped → delivered / cancelled`). Each status change triggers an automated in-app + email notification to the user using a template. Admin can also send a **custom message** to the customer that becomes a notification (and email).
- **`/admin/users`** — list registered users (from `profiles` joined with `auth.users` via an RPC). Per-user actions: view profile, view orders, **send notification/message**, grant/revoke admin role, **block** (sets `is_blocked` on profile — login flow checks this).
- **`/admin/coupons`** — CRUD for coupons (code, type, value, min order, max uses, expiry, active toggle). Shows usage stats.
- **`/admin/reviews`** — moderation queue (from Phase 2).
- **`/admin/flags`** — price visibility (from Phase 2).
- **`/admin/notifications`** — manage notification templates + send broadcast to all users / a single user.
- Update admin sidebar to include all new sections.

---

## Phase 6 — Notifications (in-app + email + WhatsApp)
- **In-app**: bell icon in user header pulling from `notifications` table with realtime subscription.
- **Email**: set up email infrastructure (Lovable Cloud) + transactional templates for: `order_confirmed`, `order_status_changed`, `admin_message`, `password_changed`. Triggered from edge functions when admin updates order status or sends a message.
- **WhatsApp**: in admin order detail, "Message on WhatsApp" button opens `wa.me/<phone>?text=<prefilled>` — manual reach-out.

---

## Execution order (so you can review between phases)
1. **Phase 1** migration + **Phase 2** (inline price edit, flags, reviews) — this finishes the previous pending batch.
2. **Phase 3** cart + checkout + admin orders skeleton.
3. **Phase 4** user auth + profile + account dashboard.
4. **Phase 5** admin orders full features + users + coupons.
5. **Phase 6** email infrastructure + notification system + WhatsApp.

Each phase is self-contained and testable. Total: ~30+ files created, ~10 edited, 1 large migration, 1 email infra setup.

**Things I'll keep simple unless you ask otherwise:**
- Currency stays KD (already in code).
- Order numbers generated by a sequence, format `CM-000001`.
- Avatar bucket public read, owner write.
- Signup is built but gated behind a `site_settings.signup_enabled` flag (default `false`) — flip on when ready.
- "Pay by link" just records the choice; admin handles the link manually.

Approve and I'll start with **Phase 1 + Phase 2** in default mode.
