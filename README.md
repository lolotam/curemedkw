# Curemed — Pharmaceuticals & Medical Supplies E‑Commerce (Kuwait)

Curemed is a bilingual (English/Arabic) e‑commerce storefront and admin platform
for a Kuwait‑based pharmaceuticals and medical‑supplies company. It sells trusted
health & wellness brands (Flexitol, Kapiva, Nada, Australian Bodycare, La Fe's,
Hartington, Phytophar, and more) and ships with a full admin back office, an
AI‑assisted product content pipeline, and WhatsApp order notifications.

> Built with Vite + React + TypeScript on the front end and Supabase
> (Lovable Cloud and/or self‑hosted) for database, auth, storage, and edge
> functions.

---

## 1. Project Overview

- **Main purpose:** Online store for pharmaceuticals, skincare, body care,
  wellness and home‑health products, with localized (EN/AR) content and a
  Kuwait‑specific checkout (governorates/areas, KD currency).
- **Target users:**
  - **Customers** — browse brands/categories, view products, manage a cart, and
    check out.
  - **Admins** — manage products, categories, orders, coupons, reviews, hero
    slides, branding, notifications, and WhatsApp integration.
- **Core problem solved:** A self‑manageable, bilingual storefront with a rich
  admin console and AI tooling to import, translate, rewrite, and upscale product
  content quickly.
- **Main modules/features:** Storefront, Cart & Checkout, Auth & Account, Admin
  back office, AI content pipeline (scrape/extract/translate/rewrite/upscale),
  WhatsApp notifications, Reviews, Coupons, Newsletter, Logging.
- **Current status:** Actively developed. Published on Lovable
  (`https://curemedkw.lovable.app`) with an additional self‑hosted production
  path at `https://supabase.curemedkw.com` (see `SELF_HOSTED.md`).

---

## 2. Tech Stack

### Frontend

- **Framework/library:** React 18 (`react`, `react-dom`).
- **Language:** TypeScript 5.
- **Build tool:** Vite 5 (`@vitejs/plugin-react-swc`).
- **UI library / CSS:** Tailwind CSS 3 + shadcn/ui (Radix UI primitives),
  `tailwindcss-animate`, `@tailwindcss/typography`, `lucide-react` icons.
- **Routing:** `react-router-dom` v6 (`BrowserRouter`, see `src/App.tsx`).
- **Data/State:** `@tanstack/react-query` for server state; React Context for
  cart (`src/lib/cart.tsx`), auth (`src/lib/auth.tsx`), theme
  (`src/lib/theme.tsx`), and i18n (`src/lib/i18n.tsx`).
- **Forms & validation:** `react-hook-form` + `zod` (`@hookform/resolvers`).
- **SEO:** `react-helmet-async` (`src/components/site/Seo.tsx`), plus static meta
  and JSON‑LD in `index.html`.
- **Other notable deps:** `embla-carousel-react`, `recharts`, `sonner`/Radix
  toasts, `date-fns`, `jszip`, `next-themes`, `vaul`, `cmdk`.

### Backend

- **Runtime/platform:** Supabase (PostgreSQL + Auth + Storage + Edge Functions).
  Lovable Cloud manages the dev/preview backend; production can run a self‑hosted
  Supabase stack.
- **API style:** Supabase auto‑generated REST/RPC (PostgREST) accessed via
  `@supabase/supabase-js`, plus **Deno edge functions** for server‑side logic.
- **Edge functions location:** `supabase/functions/*` (Deno + `Deno.serve`).
- **Validation:** `zod` inside edge functions (e.g. `send-whatsapp`).
- **Middleware / gating:** CORS headers on every function; some functions verify
  the caller's JWT and check `user_roles` for `admin`; others are intentionally
  public (`verify_jwt = false`) and gated server‑side via `site_settings`.
- **Error handling:** JSON error responses with appropriate HTTP status codes;
  server‑side `console.error` logging; client‑side operation logging via
  `src/lib/logs.ts` → `app_logs` table.

### Database

- **Type:** PostgreSQL (managed by Supabase).
- **Provider / self‑hosted:** Lovable Cloud (preview) and self‑hosted Supabase
  for production (`https://supabase.curemedkw.com`).
- **Client:** `@supabase/supabase-js`. App code imports the **runtime‑aware**
  client at `src/integrations/supabase/clientRuntime.ts` (never the
  auto‑generated `src/integrations/supabase/client.ts`).
- **Migrations:** SQL files in `supabase/migrations/` (timestamp‑prefixed).
- **Main tables (20):** `products`, `categories`, `product_categories`, `tags`,
  `orders`, `order_items`, `carts`, `cart_items`, `coupons`, `profiles`,
  `user_roles`, `messages`, `subscribers`, `notifications`,
  `user_notification_templates`, `product_reviews`, `testimonials`,
  `hero_slides`, `site_settings`, `app_logs`, `whatsapp_send_logs`.
- **Storage buckets (all public):** `hero-media`, `product-images`,
  `category-images`, `buket-images`, `brands-images`, `favicone`, `avatars`.
- **Security:** Row Level Security (RLS) policies on all tables;
  `has_role(user_id, role)` security‑definer function for admin checks; roles
  stored in a dedicated `user_roles` table (never on profiles).

### Authentication & Authorization

- **Provider:** Supabase Auth (email/password + Google OAuth).
- **Flow:** `src/pages/Auth.tsx` (login/signup), `src/pages/AuthCallback.tsx`
  (OAuth callback), `src/pages/ResetPassword.tsx` (recovery).
- **Session handling:** `AuthProvider` (`src/lib/auth.tsx`) subscribes to
  `onAuthStateChange`, persists sessions in `localStorage`, auto‑refreshes
  tokens, and logs login/logout to `app_logs`.
- **Roles/permissions:** `app_role` enum + `user_roles` table; `has_role()`
  RLS helper. Admin routes live under `/admin` and use `AdminLayout`
  (`src/components/admin/AdminLayout.tsx`) with an `/admin/login` entry.
- **Protected routes:** `/account`, `/admin/*`; sensitive paths disallowed in
  `public/robots.txt`.

### Infrastructure / Hosting

- **Preview/published:** Lovable hosting (`*.lovable.app`) with built‑in SPA
  fallback routing.
- **Self‑hosted production:** Docker image (`Dockerfile`) → nginx serving the
  Vite `dist/` build, deployed via Dokploy with a self‑hosted Supabase stack.
  Backend selected at runtime by `/config.js`.
- **Build:** `npm run build` (Vite). **Dev:** `npm run dev` (port 8080).
- See **Section 11** and `SELF_HOSTED.md` for the full production checklist.

---

## 3. Project Architecture

The app is a client‑side SPA that talks directly to Supabase for most data and
calls edge functions for privileged or AI operations.

- **Client ↔ backend:** The React app uses `@supabase/supabase-js` (via the
  runtime client) for CRUD against PostgREST. RLS enforces who can read/write.
- **Auth:** Supabase Auth issues JWTs stored in `localStorage`; the client
  attaches them automatically. Admin gating is enforced both in RLS and inside
  edge functions via `has_role`.
- **Data storage/retrieval:** Tables in PostgreSQL; React Query caches reads.
  Helpers live in `src/lib/db.ts`.
- **Files/uploads:** Images go to public Supabase Storage buckets; the
  `migrate-storage-copy` edge function uploads via the service role.
- **Background work / webhooks:** No cron/queues in‑repo. WhatsApp messages are
  sent on demand through the `send-whatsapp` edge function, which forwards to the
  external **Postora** WhatsApp API and records results in `whatsapp_send_logs`.

```text
                 User Browser (EN / AR)
                        |
        React + Vite SPA (TanStack Query, Router)
                        |
        ┌───────────────┴─────────────────┐
        |                                  |
 Supabase JS client                 Edge Functions (Deno)
 (PostgREST + RLS)                   send-whatsapp, scrape/extract,
        |                            translate/rewrite, upscale, models
        |                                  |
 PostgreSQL + Storage Buckets        External Services
 (products, orders, ...)             (Postora WhatsApp, OpenAI, Anthropic,
                                      Google AI, OpenRouter, Picsart, Firecrawl)
```

Runtime backend selection:

```text
index.html → /config.js (window.__APP_CONFIG__)
        → src/integrations/supabase/clientRuntime.ts
        → falls back to VITE_SUPABASE_* env vars if config is empty
```

---

## 4. Folder Structure

```text
curemed/
├── index.html                  # SPA entry, SEO meta + JSON-LD, loads /config.js
├── public/
│   ├── config.js               # Runtime backend config (window.__APP_CONFIG__)
│   ├── robots.txt              # Crawl rules (admin/auth/account disallowed)
│   ├── sitemap.xml             # Sitemap
│   └── llms.txt, placeholder.svg
├── src/
│   ├── App.tsx                 # Routes (storefront + admin), providers
│   ├── main.tsx                # React root + stale-chunk auto-recovery
│   ├── index.css               # Tailwind layers + design tokens
│   ├── pages/                  # Storefront pages (Home, Brand, Product, Cart…)
│   │   └── admin/              # Admin console pages (Products, Orders, …)
│   ├── components/
│   │   ├── site/               # Storefront UI (Header, Footer, Hero, SEO…)
│   │   ├── admin/              # Admin UI (Layout, editors, dialogs)
│   │   └── ui/                 # shadcn/ui primitives
│   ├── lib/                    # Cart, auth, i18n, theme, db, logs, AI helpers
│   ├── hooks/                  # Reusable React hooks
│   ├── integrations/supabase/  # client.ts (auto-gen), clientRuntime.ts, types.ts
│   └── test/                   # Vitest setup + example test
├── supabase/
│   ├── config.toml             # Project ref + function flags
│   ├── functions/              # Deno edge functions (see Section 6)
│   └── migrations/             # Timestamped SQL migrations
├── scripts/                    # Self-host migration/function deploy helpers
├── docker/start-nginx.sh       # Writes config.js from RUNTIME_* env at startup
├── Dockerfile                  # Multi-stage build → nginx runtime
├── docker-compose.yml          # Dokploy "web" service definition
├── nginx.conf                  # SPA-friendly nginx config
├── SELF_HOSTED.md              # Production self-hosting checklist
└── .env / .env.example         # Env var names (no secret values committed)
```

---

## 5. Main Features

| Feature | What it does | Key files | DB tables |
|---|---|---|---|
| Storefront home | Hero slider, carousels, featured content | `src/pages/CuremedHome.tsx`, `src/components/site/HeroSlider.tsx` | `hero_slides`, `products`, `categories` |
| Brand & category browsing | Lists products by brand/category | `src/pages/BrandPage.tsx`, `src/pages/CategoryPage.tsx` | `products`, `categories`, `product_categories`, `tags` |
| Product detail | Product info, gallery, zoom, reviews | `src/pages/ProductDetail.tsx`, `src/components/site/ProductReviews.tsx` | `products`, `product_reviews` |
| Cart & Checkout | Cart, coupons, Kuwait address, order placement | `src/pages/Cart.tsx`, `src/pages/Checkout.tsx`, `src/lib/cart.tsx` | `carts`, `cart_items`, `coupons`, `orders`, `order_items` |
| Auth & Account | Login/signup, OAuth, account management | `src/pages/Auth.tsx`, `src/pages/Account.tsx`, `src/lib/auth.tsx` | `profiles`, `user_roles` |
| Reviews | Submit/read product reviews | `src/components/site/ReviewForm.tsx` | `product_reviews` |
| Newsletter | Email subscription capture | `src/components/site/Newsletter.tsx` | `subscribers` |
| Contact | Contact form/messages | `src/pages/ContactUs.tsx` | `messages` |
| Notifications | User notification bell/templates | `src/components/site/UserNotificationBell.tsx` | `notifications`, `user_notification_templates` |
| Admin: Products | CRUD + AI import/translate/rewrite/upscale | `src/pages/admin/AdminProducts.tsx`, `AdminProductEditor.tsx` | `products`, `product_categories` |
| Admin: Categories/Tags/Models/Flags | Taxonomy & config management | `src/pages/admin/AdminCategories.tsx`, etc. | `categories`, `tags` |
| Admin: Orders | View/manage orders | `src/pages/admin/AdminOrders.tsx` | `orders`, `order_items` |
| Admin: Coupons | Discount codes | `src/pages/admin/AdminCoupons.tsx` | `coupons` |
| Admin: Branding/Landing | Site branding, hero/landing editor | `src/pages/admin/AdminBranding.tsx`, `AdminLandingPageEditor.tsx` | `site_settings`, `hero_slides` |
| Admin: WhatsApp | Postora key + notification settings | `src/pages/admin/AdminWhatsApp.tsx` | `site_settings`, `whatsapp_send_logs` |
| Admin: Logs | Operation/audit logs | `src/pages/admin/AdminLogs.tsx`, `src/lib/logs.ts` | `app_logs` |

---

## 6. API Endpoints (Edge Functions)

All functions are Deno (`Deno.serve`) deployed under
`https://<supabase-url>/functions/v1/<name>`. Most require an
`Authorization: Bearer <jwt>` header and, where noted, an admin role; some are
public and gated by `site_settings`.

| Method | Endpoint | Purpose | Auth Required | Request Body / Params | Response Summary | Source File |
|---|---|---|---|---|---|---|
| POST | `/send-whatsapp` | Send WhatsApp notification via Postora | No JWT (public, gated by `site_settings`) | `{ event, to[], data, order_id? }` | `{ success, ... }` | `supabase/functions/send-whatsapp/index.ts` |
| POST | `/scrape-product` | Scrape a product page (Firecrawl) for import | Yes (admin) | `{ url, endpoint? }` | `{ markdown, title, sourceUrl, images[] }` | `supabase/functions/scrape-product/index.ts` |
| POST | `/extract-product` | Extract structured product data via AI | Yes (admin) | TODO: confirm schema | Structured product JSON | `supabase/functions/extract-product/index.ts` |
| POST | `/translate-product` | Translate product content (EN↔AR) | Yes (admin) | TODO: confirm schema | Translated fields | `supabase/functions/translate-product/index.ts` |
| POST | `/rewrite-long-description` | AI rewrite of long description | Yes (admin) | TODO: confirm schema | Rewritten text | `supabase/functions/rewrite-long-description/index.ts` |
| POST | `/upscale-image` | Upscale image (Picsart) | Yes (admin) | TODO: confirm schema | Upscaled image URL/data | `supabase/functions/upscale-image/index.ts` |
| POST | `/upscale-image-ai` | AI image upscale/enhance | Yes (admin) | TODO: confirm schema | Upscaled image URL/data | `supabase/functions/upscale-image-ai/index.ts` |
| POST | `/migrate-storage-copy` | Copy a file into a bucket via service role | No JWT (`verify_jwt = false`) | `{ bucket, path, source_url }` | Upload result | `supabase/functions/migrate-storage-copy/index.ts` |
| POST | `/ai-test-connection` | Test an AI provider connection/key | Yes (admin) | TODO: confirm schema | Connection status | `supabase/functions/ai-test-connection/index.ts` |
| POST | `/openai-models` | List OpenAI models | Yes (admin) | TODO: confirm schema | Model list | `supabase/functions/openai-models/index.ts` |
| POST | `/google-models` | List Google AI models | Yes (admin) | TODO: confirm schema | Model list | `supabase/functions/google-models/index.ts` |
| POST | `/anthropic-models` | List Anthropic models | Yes (admin) | TODO: confirm schema | Model list | `supabase/functions/anthropic-models/index.ts` |
| POST | `/openrouter-models` | List OpenRouter models | Yes (admin) | TODO: confirm schema | Model list | `supabase/functions/openrouter-models/index.ts` |

> Standard data CRUD (products, orders, cart, etc.) goes through Supabase
> PostgREST auto‑generated REST endpoints, not custom routes — access control is
> enforced by RLS policies.

**Database RPC functions:** `has_role`, `handle_new_user`, `next_order_number`,
`slugify`, `products_set_slug`, `increment_coupon_usage`, `validate_coupon`,
`update_updated_at_column`.

---

## 7. Database Blueprint

- **Type:** PostgreSQL (Supabase).
- **Connection:** App uses the anon key + RLS through `@supabase/supabase-js`.
  Edge functions use `SUPABASE_SERVICE_ROLE_KEY` for privileged operations.
- **Migrations:** `supabase/migrations/*.sql` (timestamp‑prefixed, applied in
  order). Self‑host helper: `scripts/apply-self-hosted-migrations.sh`.

### Core tables

| Table | Purpose | Notable fields |
|---|---|---|
| `products` | Catalog items | name, slug, prices, images, brand, descriptions (EN/AR) |
| `categories` | Product categories | name, slug, image |
| `product_categories` | Product↔category join | product_id, category_id |
| `tags` | Product tags | name, slug |
| `orders` | Customer orders | order_number, totals, status, customer + address |
| `order_items` | Line items | order_id, product, qty, price |
| `carts` / `cart_items` | Shopping carts | user/session, product, qty |
| `coupons` | Discount codes | code, discount_type, value, limits, expiry |
| `profiles` | User profile data | full_name, phone (auto‑created on signup) |
| `user_roles` | Role assignments | user_id, role (`app_role` enum) |
| `product_reviews` | Reviews | product_id, rating, body, status |
| `testimonials` | Marketing testimonials | author, content |
| `hero_slides` | Homepage slides | media, text, styling, ordering |
| `site_settings` | Key/JSON settings (incl. WhatsApp integration) | key, value (jsonb) |
| `messages` | Contact submissions | name, email, message |
| `subscribers` | Newsletter emails | email |
| `notifications` / `user_notification_templates` | User notifications | type, payload, templates |
| `app_logs` | Operation/audit log | category, operation, status, user, metadata |
| `whatsapp_send_logs` | WhatsApp delivery log | event, to, status, response |

- **Relationships:** orders→order_items, products↔categories (join table),
  carts→cart_items, users→profiles/user_roles, products→product_reviews.
- **Sequences:** `order_number_seq` (via `next_order_number()` → `CM-000001`).
- **Indexes:** TODO: review per‑table indexes in migration files.
- **Seed data:** TODO: no dedicated seed file detected; data is migration/admin‑driven.
- **Storage buckets:** `hero-media`, `product-images`, `category-images`,
  `buket-images`, `brands-images`, `favicone`, `avatars` (all public).

---

## 8. Environment Variables

> Never commit real secret values. The committed `.env`/`config.js` contain only
> public anon keys and public URLs. Server secrets live only in the Supabase
> stack (see `SELF_HOSTED.md`). Examples below are **placeholders**.

### Frontend (build/runtime)

| Variable | Required | Used By | Purpose | Example |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Vite build / runtime fallback | Supabase API URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Vite build / runtime fallback | Public anon key (JWT) | `eyJhbGci...` |
| `VITE_SUPABASE_PROJECT_ID` | Yes | Vite build | Supabase project ref | `your-project-id` |
| `RUNTIME_SUPABASE_URL` | Prod (Docker) | `docker/start-nginx.sh` → `config.js` | Override backend URL at container start | `https://supabase.example.com` |
| `RUNTIME_SUPABASE_ANON_KEY` | Prod (Docker) | `docker/start-nginx.sh` → `config.js` | Override anon key at container start | `eyJhbGci...` |

> Note: `.env` also contains legacy `NEXT_PUBLIC_SUPABASE_*` entries; the app reads
> `VITE_SUPABASE_*` and the runtime `window.__APP_CONFIG__` only.

### Server‑side secrets (Supabase Edge Function Secrets — names only)

| Variable | Used By | Purpose |
|---|---|---|
| `SUPABASE_URL` | All functions | Supabase API base URL |
| `SUPABASE_ANON_KEY` | Functions | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged functions | Bypass RLS (server only) |
| `SUPABASE_DB_URL` | Functions/migrations | Direct DB connection |
| `POSTORA_WHATSAPP_API_KEY` | `send-whatsapp` | Postora WhatsApp API key (fallback to DB value) |
| `OPENAI_API_KEY` | AI functions | OpenAI access |
| `ANTHROPIC_API_KEY` | AI functions | Anthropic access |
| `GOOGLE_API_KEY` | AI functions | Google AI access |
| `OPENROUTER_API_KEY` | AI functions | OpenRouter access |
| `PICSART_API_KEY` | `upscale-image` | Picsart image upscaling |
| `FIRECRAWL_API_KEY` | `scrape-product` | Firecrawl scraping (cloud) |
| `LOVABLE_API_KEY` | AI gateway | Lovable AI Gateway access |

> Do not request or store `SUPABASE_SERVICE_ROLE_KEY` or DB passwords on Lovable
> Cloud — they are not retrievable there.

---

## 9. Local Development Setup

**Prerequisites:** Node.js 20+ (Docker build uses `node:20-alpine`), npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   Fill VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID

# 3. Start the dev server (Vite, port 8080)
npm run dev
```

- **Frontend URL:** `http://localhost:8080`
- **Backend:** chosen by `public/config.js` (`window.__APP_CONFIG__`) and falls
  back to the `VITE_SUPABASE_*` env vars.
- **Database/migrations:** managed by Supabase. For self‑host, apply migrations
  with `scripts/apply-self-hosted-migrations.sh` and deploy functions with
  `scripts/deploy-self-hosted-functions.sh`.

---

## 10. Production Build & Deployment

```bash
# Build static assets
npm run build      # outputs to dist/

# Preview the production build locally
npm run preview
```

### Docker / Dokploy

```bash
# Build & run with compose (maps host 3000 -> container 80)
docker compose up -d --build
docker compose down
```

- `Dockerfile` multi‑stage: Node builds `dist/`, then nginx serves it.
- `docker/start-nginx.sh` writes `/usr/share/nginx/html/config.js` from
  `RUNTIME_SUPABASE_URL` / `RUNTIME_SUPABASE_ANON_KEY` at container start, so the
  same image can target different backends without rebuilding.
- `nginx.conf` provides SPA fallback routing.
- **Build args:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID` (set in Dokploy → Build).
- **SSL/domain:** production domain `curemedkw.com`; Supabase at
  `supabase.curemedkw.com`. Reverse proxy/SSL handled by Dokploy/Traefik.
- **Migrations in prod:** apply via `scripts/apply-self-hosted-migrations.sh`.

See `SELF_HOSTED.md` for the complete production checklist (GoTrue/Kong/SMTP,
Google OAuth, redirect URLs, edge function secrets).

---

## 11. Current Self‑Hosting / Database Setup

From `SELF_HOSTED.md` and config files:

- **Database:** Self‑hosted Supabase Postgres container
  `cloud-supabase-hns8fw-supabase-db` for production; Lovable Cloud for preview.
- **Engine/provider:** PostgreSQL via the Supabase stack (GoTrue, Kong, Studio,
  PostgREST, Storage).
- **Frontend hosting:** Docker image served by nginx, deployed via **Dokploy**.
  App code path: `/etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code`.
- **Public URLs:** site `https://curemedkw.com` and
  `https://curemedkw.lovable.app`; API `https://supabase.curemedkw.com`.
- **Ports:** container `80` exposed; compose maps host `3000 → 80`.
- **Volumes:** TODO: confirm Supabase stack volumes (managed outside this repo).
- **CORS / redirects:** Kong allowed origins and GoTrue
  `ADDITIONAL_REDIRECT_URLS` documented in `SELF_HOSTED.md`.
- **Backups:** TODO: Add database backup schedule/retention and restore
  procedure for the self‑hosted Postgres.
- **Security:** RLS on all tables; service‑role key only on the server; runtime
  backend switch via `/config.js`.

> Per the project AGENTS rule, every database migration should also be exported as
> a standalone SQL script to run on the self‑hosted Supabase instance.

---

## 12. External Integrations

| Service | Purpose | Env vars | Files | Security notes |
|---|---|---|---|---|
| **Postora** | WhatsApp order/marketing notifications | `POSTORA_WHATSAPP_API_KEY` (or `site_settings` value) | `supabase/functions/send-whatsapp/index.ts`, `src/pages/admin/AdminWhatsApp.tsx` | Public function gated server‑side; key stored in DB or secret |
| **OpenAI** | AI extraction/translation/rewrite, models | `OPENAI_API_KEY` | `extract-product`, `translate-product`, `openai-models` | Admin‑gated functions |
| **Anthropic** | AI content/models | `ANTHROPIC_API_KEY` | `anthropic-models`, AI functions | Admin‑gated |
| **Google AI** | AI content/models | `GOOGLE_API_KEY` | `google-models` | Admin‑gated |
| **OpenRouter** | AI model gateway | `OPENROUTER_API_KEY` | `openrouter-models` | Admin‑gated |
| **Lovable AI Gateway** | Managed AI access | `LOVABLE_API_KEY` | AI helpers in `src/lib/ai*` | Managed secret |
| **Picsart** | Image upscaling | `PICSART_API_KEY` | `upscale-image` | Admin‑gated |
| **Firecrawl** | Product page scraping | `FIRECRAWL_API_KEY` | `scrape-product` | Admin‑gated; self‑host endpoint supported |
| **Google Search Console** | Site verification | — (meta tag) | `index.html` | Public meta tag |
| **Facebook** | Domain verification | — (meta tag) | `index.html` | Public meta tag |
| **Google Fonts** | Hero typography (EN/AR) | — | `index.html` | Public CDN |
| **Supabase Storage** | Image hosting | service role | `migrate-storage-copy` | Public buckets |

---

## 13. Security Notes

- **Auth protection:** Supabase Auth (JWT in `localStorage`); admin routes gated
  by `user_roles` + `has_role()`.
- **API authorization:** RLS policies on every table; privileged edge functions
  verify JWT and admin role; service‑role key used only server‑side.
- **Sensitive env vars:** all real secrets stored as Supabase function secrets,
  never in the repo. Committed `config.js`/`.env` contain only public anon keys.
- **CORS:** permissive (`Access-Control-Allow-Origin: *`) on edge functions;
  Kong CORS restricted to production origins in self‑host.
- **Rate limiting:** TODO: no app‑level rate limiting detected (relies on
  provider/Kong limits).
- **Input validation:** `zod` in edge functions and forms; phone/governorate
  validation in checkout.
- **File upload restrictions:** TODO: confirm size/type limits on storage
  uploads.
- **Database access rules:** RLS; roles isolated in `user_roles` to prevent
  privilege escalation.
- **Known gaps:** `site_settings` SELECT visibility for the WhatsApp key (see
  `.lovable/plan.md`); confirm it is admin‑only before storing secrets there.

---

## 14. Testing & Quality

| Concern | Tooling | Command |
|---|---|---|
| Unit tests | Vitest + Testing Library (`jsdom`) | `npm run test` |
| Watch tests | Vitest | `npm run test:watch` |
| Lint | ESLint 9 (`eslint.config.js`) | `npm run lint` |
| Typecheck | TypeScript (project refs) | `npx tsc -b` (or `tsgo`) |
| Build verify | Vite | `npm run build` |

- **Existing tests:** `src/test/setup.ts`, `src/test/example.test.ts`,
  `src/lib/upscaleTargets.test.ts`.
- **TODO:** Add coverage for cart/checkout logic, coupon validation, auth
  guards, and edge functions.

---

## 15. Development Roadmap

### Phase 1 – Documentation & Environment Cleanup
- Keep this README current; finish `.env.example` parity.
- Remove legacy `NEXT_PUBLIC_*` env entries if unused.

### Phase 2 – Stability & Bug Fixing
- Resolve stale‑chunk reload edge cases; verify EN/AR rendering parity.

### Phase 3 – Security & Auth Hardening
- Lock `site_settings` SELECT for secret rows; review CORS scope; add rate limits.

### Phase 4 – Database & Backup Improvements
- Document indexes; add automated Postgres backups + restore runbook.

### Phase 5 – UI/UX Improvements
- Performance pass on carousels/images; accessibility audit.

### Phase 6 – Testing & QA
- Expand Vitest coverage; add edge‑function tests; add e2e (Playwright).

### Phase 7 – Production Deployment Improvements
- Harden Dokploy pipeline; health checks; migration automation in CI.

### Phase 8 – Future Features
- Payment gateway, order tracking, loyalty/coupons enhancements, analytics.

---

## 16. Known Issues / Technical Debt

- README previously minimal (now expanded).
- `.env` contains both `NEXT_PUBLIC_*` and `VITE_*` variables (legacy duplication).
- Backend selection split across `.env`, `config.js`, and Vite fallbacks — easy
  to misconfigure.
- `site_settings` public read could expose stored secrets (track in plan).
- Limited automated test coverage.
- Several edge‑function request/response schemas undocumented (TODOs in Section 6).
- Backup/restore and storage upload limits undocumented (TODOs).

---

## 17. Useful Commands

| Purpose | Command |
|---|---|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Build (prod) | `npm run build` |
| Build (dev mode) | `npm run build:dev` |
| Preview build | `npm run preview` |
| Test | `npm run test` |
| Test (watch) | `npm run test:watch` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc -b` |
| Apply self‑host migrations | `scripts/apply-self-hosted-migrations.sh` |
| Deploy self‑host functions | `scripts/deploy-self-hosted-functions.sh` |
| Docker up | `docker compose up -d --build` |
| Docker down | `docker compose down` |

---

## 18. Contribution / Developer Notes

- **Workflow:** read existing files first; make minimal, focused changes (see
  `AGENTS.md`). Prefer editing existing modules over duplicating logic.
- **Branching:** feature branches off `main`; small, reviewable PRs.
- **Code style:** TypeScript + ESLint; Tailwind with semantic tokens from
  `src/index.css` — avoid hardcoded colors.
- **Frontend components:** storefront UI → `src/components/site/`, admin UI →
  `src/components/admin/`, shared primitives → `src/components/ui/`.
- **Backend endpoints:** add a new edge function under `supabase/functions/<name>/`
  and register flags in `supabase/config.toml` if it must skip JWT verification.
- **Supabase client:** always import from
  `@/integrations/supabase/clientRuntime`; never edit `client.ts`/`types.ts`.
- **Environment variables:** never commit secrets; add server secrets as Supabase
  function secrets and document the variable name in Section 8.
- **Database schema:** change via a new SQL file in `supabase/migrations/`; include
  GRANTs + RLS for any new public table, and export a standalone script for the
  self‑hosted instance.

---

## 19. Maintenance Checklist

- [ ] Update npm dependencies and review `npm audit`.
- [ ] Verify environment variables in dev and production.
- [ ] Back up the database (and verify restore).
- [ ] Review `app_logs` and `whatsapp_send_logs` for errors.
- [ ] Renew/verify SSL certificates and domains.
- [ ] Run `npm run test` and `npm run lint`.
- [ ] Verify a clean production build (`npm run build`).
- [ ] Review RLS policies and admin role assignments.
- [ ] Update this README after major changes.

---

## 20. Final Summary

Curemed is a bilingual (EN/AR) e‑commerce platform for a Kuwait pharmaceuticals
and medical‑supplies business, built with React + Vite + TypeScript and Supabase
(PostgreSQL, Auth, Storage, Edge Functions). Customers browse brands and
categories, manage a cart, and check out with Kuwait‑specific addressing, while
admins run a full back office for products, orders, coupons, content, and
branding. An AI content pipeline (scrape, extract, translate, rewrite, upscale)
and WhatsApp notifications via Postora extend the platform. It runs on Lovable
Cloud for preview and on a self‑hosted Supabase + Dokploy/nginx stack in
production, selecting its backend at runtime through `/config.js`. Security rests
on Supabase RLS, a dedicated `user_roles` table, and server‑only secrets.
```
