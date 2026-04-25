
# Curemed Website + Admin Dashboard — Full Plan

A multi-brand company site for **Curemed** with four sub-brands (Flexitol, Kapiva, NADA, ABC Australian Bodycare), plus a password-protected **admin dashboard** that manages products, contact messages, and newsletter subscribers — all stored in a local browser database (localStorage) with seeded sample data.

---

## 1. Public Website (foundations from previous plan)

### Loading screen `/`
- Beige background, animated Curemed logo loader
- Auto-redirects to `/curemed` after animation

### Curemed master landing `/curemed`
- Hero (mission + CTA)
- "Our Brands" grid — 4 cards, each links to its brand page
- Spotlight carousel (mixed featured products from all brands)
- About / What we do pillars
- Testimonials, FAQ, Contact form (writes to local DB)
- Newsletter signup (writes to local DB)
- Footer

### Brand landing pages
`/flexitol`, `/kapiva`, `/nada`, `/australian-bodycare`
- Brand-specific color palette + hero with tagline
- **Auto-scrolling product carousel** pulling that brand's products from the local DB
- Key benefits / features grid
- Testimonials + FAQ + Contact section

### Product detail page `/:brand/product/:id`
- Image gallery (main + thumbnails)
- Name, brand, category, price, SKU, stock status
- Short + long description
- Ingredients, Benefits, Usage instructions, Size/variant
- Tags, "Featured" badge
- Related products from same brand

### Global features
- **Language toggle** EN / AR (with full RTL layout for Arabic), persisted in localStorage
- **Theme toggle** Light / Dark, persisted in localStorage
- Each brand page applies its own color palette via CSS variables

---

## 2. Local Database (browser-based)

Since the app runs entirely in the browser, a real SQLite file isn't possible. Instead I'll use a tiny **localStorage-backed data layer** that mimics a database — works offline, persists per-browser, no setup needed.

Stores:
- `products` — full product records (see fields below)
- `messages` — contact form submissions
- `subscribers` — newsletter emails
- `uploaded_images` — uploaded photos saved as base64 data URLs

A small data-access module (`src/lib/db.ts`) exposes `list / get / create / update / delete` for each store, so the UI code looks like real DB calls.

> If you later want true cloud persistence and real image hosting, we can swap this layer for Lovable Cloud without rewriting any UI.

---

## 3. Admin Dashboard `/admin`

### Access
- Single hardcoded admin password gate at `/admin/login`
- Successful login sets a session flag in sessionStorage
- All `/admin/*` routes are protected; logout clears the session

### Admin layout
- Sidebar nav: **Overview · Products · Messages · Subscribers · Logout**
- Top bar with site link + theme toggle

### Overview page `/admin`
- Stat cards: Total products, Products by brand, Unread messages, Total subscribers
- Recent activity: latest 5 messages, latest 5 subscribers, recently edited products

### Products manager `/admin/products`
- Searchable, filterable table (by brand, category, featured, stock status)
- Columns: image · name · brand · category · price · stock · featured · actions (edit / delete)
- "Add product" button → full editor

### Product editor `/admin/products/new` and `/admin/products/:id`
Full form covering every field:
- **Core:** name, brand (dropdown of 4), category, price, short description, long description
- **Media:** main image upload + gallery (multiple images), drag-to-reorder, set cover, remove. Images stored as base64 in localStorage.
- **Details:** ingredients (list), benefits (list), usage instructions, size/variant
- **Meta:** SKU, stock status (in stock / low / out), featured toggle, tags (chips)
- Save / Cancel / Delete buttons; live preview panel showing how the product card will look

### Messages inbox `/admin/messages`
- Table of contact submissions: name · email · brand context · date · status (read/unread)
- Click row to open full message in a drawer; mark read/unread; delete
- Bulk delete

### Subscribers `/admin/subscribers`
- Table of newsletter emails with date subscribed
- Search + delete
- **Export to CSV** button

---

## 4. Seeded Sample Data

On first load, the app auto-seeds the local DB with:
- **20 sample products** (5 per brand), each with:
  - Realistic name, category, price, SKU
  - Generated short + long descriptions matching each brand's domain (foot care, ayurveda, intimate hygiene, body care)
  - Ingredient lists, benefits, usage instructions, size variants
  - Tags, featured flags, stock status
  - Placeholder mockup images (clean SVG/illustration placeholders branded per brand color) for both main image and gallery
- A few sample contact messages and newsletter subscribers so the inbox/list aren't empty

Admin can fully edit or delete any seeded item — they behave exactly like user-created records.

A "Reset sample data" button in admin Overview restores defaults if needed.

---

## 5. Image handling

- Uploaded images are read with `FileReader` → stored as base64 data URLs in localStorage
- Each image gets an ID; products reference image IDs
- Soft cap warning if total storage exceeds ~4MB (browser limit awareness)
- Placeholder mockups used everywhere a real photo isn't yet provided — clearly styled so it's obvious they're placeholders

---

## 6. What I still need from you (can be sent later)
- Curemed exact color palette
- Real logos for Curemed and each brand (placeholders used until then)
- The admin password you want to use (I'll use a default like `curemed-admin` and you can change it in one line)

---

## Build order
1. Global foundations: theme tokens, language/theme toggles, RTL, routing, local DB layer + seeder
2. Loading screen + Curemed landing + brand landings + product detail page (consuming the local DB)
3. Admin login + protected layout + Overview
4. Products manager + full product editor with image upload
5. Messages inbox + Subscribers list with CSV export
6. Polish: empty states, toasts, responsive, dark mode pass, Arabic RTL pass
