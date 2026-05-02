Restyle `/auth`, `/privacy-policy`, and `/terms-of-service` to match the colorful, animated About page using the existing shared helpers in `src/components/site/ColorfulFx.tsx` (`ColorfulHeroBg`, `GlowCard`, `Icon3D`, `Reveal`).

## Shared visual language (from About page)
- Animated blob gradient hero background (sky → violet → pink) with dotted texture
- Eyebrow pill + gradient-clipped headline + fade-in animation cascade
- Gradient divider line below hero
- `GlowCard` (gradient ring on hover, glass card) + 3D colored `Icon3D` per section
- `Reveal` for staggered scroll-in
- Hover scale + glow on CTAs

## 1. `src/pages/PrivacyPolicy.tsx` — full rewrite
- Hero: blob bg, eyebrow "Your Rights First" / "حقوقك أولًا", gradient title (sky → violet → pink), subtitle, last-updated date
- Body: 6 sections rendered in a 2-column grid of `GlowCard`s, each with its own `Icon3D` + variant:
  - Introduction (sky, ShieldCheck)
  - Information we collect (violet, Database) — bullet list
  - How we use information (emerald, Cog) — bullet list
  - Sharing of information (amber, Share2)
  - Your rights (indigo, UserCheck) — clickable email
  - Contact us (rose, Mail) — clickable email + phone
- Bilingual via `useI18n()` `lang === "ar"` switching, RTL-aware list padding (`pr-6` vs `pl-6`)

## 2. `src/pages/TermsOfService.tsx` — full rewrite
- Same hero pattern with gradient (amber → rose → violet), eyebrow "Usage Agreement" / "اتفاقية الاستخدام"
- 8 `GlowCard` sections in 2-column grid: Acceptance (sky, FileCheck), Products & Pricing (violet, Tag), Orders & Payment (emerald, CreditCard), Delivery (amber, Truck), Returns (rose, RotateCcw), Liability (indigo, ShieldAlert), Governing Law (cyan, Scale), Contact (violet, Mail with email + phone links)
- Bilingual EN/AR

## 3. `src/pages/Auth.tsx` — full rewrite
- Wrap in `SiteLayout` hero with `ColorfulHeroBg` (consistent with site)
- Eyebrow pill + gradient-clipped title, gradient theme switches by mode:
  - signin → sky/violet/pink (LogIn icon)
  - signup → violet/fuchsia/pink (UserPlus icon)
  - reset → amber/rose/violet (KeyRound icon)
- Form inside a `GlowCard` (`Reveal` wrapped) with a large `Icon3D` overlapping the top edge
- Inputs get glassy `bg-background/80 backdrop-blur-sm` styling and label icons (Mail, KeyRound, User, Phone)
- Submit button uses gradient background matching the mode + hover scale
- Google button keeps brand colors but with glassy outline + hover scale
- Mode switcher links use `story-link` underline animation
- Eye toggle for password preserved; forgot-password link preserved
- All existing logic preserved verbatim: `signInWithPassword`, `signUp` with `emailRedirectTo` + metadata, `resetPasswordForEmail` with `/reset-password`, `signInWithOAuth("google")`, busy state, redirect on `user`

## Files touched
- `src/pages/Auth.tsx` (rewrite)
- `src/pages/PrivacyPolicy.tsx` (rewrite)
- `src/pages/TermsOfService.tsx` (rewrite)

No new dependencies, no DB changes, no route changes. Reuses existing `ColorfulFx` helpers so visual language stays consistent with About.
