
## Plan: Add About Us & Contact Us Pages

### 1. New Page — `src/pages/ContactUs.tsx`
- Wrapped in `SiteLayout brand="curemed"`.
- **Hero header**: "Get in touch" title + subtitle.
- **Contact info cards** (3 columns on desktop): 
  - **Address**: Kuwait – Hawally – Tunis St – Gulf Mart Complex – Second Floor, Office 2
  - **Phone**: +965 6000 3759
  - **Email**: info@curemed.com
  - **Working Hours**: Sunday–Thursday, 8:00 AM – 4:00 PM (Friday & Saturday closed)
- **Form section**: Reuse existing `<ContactSection brand="curemed" />` (the "Get in touch" form is already a self-contained component, so it'll continue to work on the home page too — but per request we will **remove it from the home page** so it lives only on Contact Us).
- **Map section**: Embed Google Maps iframe (the provided embed URL) inside a rounded container with proper aspect ratio, full-width on the page.

### 2. New Page — `src/pages/AboutUs.tsx`
- Wrapped in `SiteLayout brand="curemed"`.
- **Hero header**: "About Curemed" with intro paragraph from the uploaded markdown ("Who We Are").
- **Our Story** section — content from the markdown.
- **Mission** section — quote-style highlighted block (the bold mission statement).
- **Vision** section — quote-style highlighted block (the bold vision statement).
- **Three Pillars** (Quality / Partnership / Accessibility) — icon cards grid.
- **Why Choose Curemed** — 2-column feature list.
- **Our Values** — bullet list with icons.
- **Location section** at the bottom: 
  - Address text + working hours
  - Embedded Google Maps iframe (same as on Contact Us)

### 3. Routing — `src/App.tsx`
- Add routes:
  - `/contact` → `ContactUs`
  - `/about` → `AboutUs`

### 4. Header navigation — `src/components/site/SiteHeader.tsx`
- Add two new nav items after the brand list (desktop + mobile):
  - "About" → `/about`
  - "Contact" → `/contact`
- Use existing `t("nav.about")` and `t("nav.contact")` translations (already present in i18n).

### 5. Footer — `src/components/site/SiteFooter.tsx`
- Update the static contact info to the real address: "Kuwait – Hawally – Tunis St – Gulf Mart Complex, Floor 2, Office 2".
- Add quick links to `/about` and `/contact` in the right column.

### 6. Home Page — `src/pages/CuremedHome.tsx`
- **Remove** the inline `<ContactSection />` since contact form moves to its own page.
- Keep Newsletter, Testimonials, FAQ as-is.

### 7. i18n additions — `src/lib/i18n.tsx`
Add new translation keys (EN + AR) for:
- `about.hero.title`, `about.hero.subtitle`
- `about.story.title`, `about.story.body`
- `about.mission.title`, `about.mission.body`
- `about.vision.title`, `about.vision.body`
- `about.pillars.title`, `about.pillars.quality.*`, `about.pillars.partnership.*`, `about.pillars.accessibility.*`
- `about.values.title` + 5 value entries
- `about.why.title` + feature rows
- `contact.address.title`, `contact.address.body`
- `contact.hours.title`, `contact.hours.weekdays`, `contact.hours.weekend`
- `contact.location.title`
- `contact.phone.title`, `contact.email.title`

### Files to be created/modified
- **Create**: `src/pages/ContactUs.tsx`, `src/pages/AboutUs.tsx`
- **Edit**: `src/App.tsx`, `src/components/site/SiteHeader.tsx`, `src/components/site/SiteFooter.tsx`, `src/pages/CuremedHome.tsx`, `src/lib/i18n.tsx`
