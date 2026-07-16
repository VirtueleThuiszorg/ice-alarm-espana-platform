# FRONTEND_GAPS.md — public-facing site completeness audit

> READ-ONLY audit of the marketing + member-facing public site (NOT admin/call-centre).
> Date: **2026-06-17.** Compared against `PublicHeader` nav + `TECHNICAL_SPEC.md` §2.1.
> Method: 4 parallel read-only auditors (landing, products/how-it-works, partners/contact/
> blog/help/legal, /join wizard).
>
> **Headline:** the public site is **substantially built** — every nav route resolves, every
> page is a real implementation (no empty shells), and the /join wizard works end to end.
> The real gaps are **placeholder/missing imagery** (hero + all 3 product images), a few
> **non-functional CTAs** ("Notify Me"/"Register Interest", the Pricing anchor), and some
> **content/i18n gaps**. One **data-loss bug** in /join (medical info) is flagged separately
> as it's correctness, not a "gap".

---

## Counts

| Tag | Count |
|---|---|
| MISSING (build) | 1 |
| INCOMPLETE (finish) | 8 |
| PLACEHOLDER-ASSET (real image/content needed) | 6 |
| (DEAD-CTA, cross-cutting) | 4 |
| (Correctness bug, out-of-scope but critical) | 1 |

---

## MISSING (build)

| # | Route | Description |
|---|---|---|
| M1 | `/` (landing) | **No FAQ section** on the landing page. It's in the expected section list and there's no FAQ anchor in header/footer. (FAQ-ish content exists on `/help` and `/how-it-works`, but not on the homepage.) Low priority — decide if one is wanted. |

No public route is a missing/empty shell — all pages render real layouts.

---

## INCOMPLETE (finish)

| # | Route | Description |
|---|---|---|
| I1 | `/products`, `/products/:slug` | **Page chrome is hardcoded English, not i18n** ("Our Products", "Learn more", "Notify Me", "Get Started", "incl. IVA", etc.) — ES/NL users see English. Inconsistent with the fully-translated Pendant/HowItWorks pages. |
| I2 | `/terms`, `/privacy` | **Page-header i18n keys missing from `en.json` AND `es.json`** (`legal.terms.title/company/lastUpdated`, `legal.privacy.*`) with no default fallback → the heading renders the **raw key string** (e.g. literal "legal.terms.title"). Body content is fully translated; only the 6 header keys are absent. |
| I3 | `/blog` | Empty on a clean DB — `blog_posts` has **no seed data**, so the list shows "No articles yet". Page works; needs authored posts. |
| I4 | `/help` | The `documentation` table IS seeded, but the `user_guide` filter pill has no rows and Spanish articles are sparse → those filters hit the "articles coming soon" empty state. |
| I5 | `/pendant` | Hardcoded social-proof filler: **"4.9/5", "2,000+ verified reviews"** + 3 fallback testimonials — unverifiable claims for a pre-launch service. |
| I6 | `/` (landing) | Testimonials / Our Products / Blog sections each **silently disappear** if their table is empty (no empty-state) — all seeded today, but the homepage can render sections-less if data is cleared. |
| I7 | `/contact` | Physical **address is never rendered** (cards show only phone + email) although `useCompanySettings.address` exists. Phone/email fall back to defaults if `system_settings` unseeded. |
| I8 | `/join` (payment step) | Test-mode bypass button copy is hardcoded English ("Complete FREE (Test Mode)"); a few step input placeholders are untranslated literals (`Dr. Name`, `+34 600 000 000`, `X0000000X`). Cosmetic. |

---

## PLACEHOLDER-ASSET (needs real image / content)

| # | Route | Description |
|---|---|---|
| P1 | `/` (landing) | **Hero shows "Hero Image / Coming Soon" placeholder.** Hero pulls `homepage_hero` from `website_images`, which has **no seeded row** and the batch hook does NOT fall back to a bundled default → literal placeholder until an admin uploads one. |
| P2 | `/products`, `/products/pendant` | **GPS Pendant image is broken in production.** Seed sets `hero_image_url = '/assets/pendant-product.png'` but there is **no `public/assets/` dir** — the real asset is `src/assets/pendant-product.png` (Vite-bundled). The literal `/assets/...` URL **404s**, and because the field is truthy it renders a broken-image icon instead of the MapPin fallback. **This is the likely "location-pin placeholder" for the pendant.** |
| P3 | `/products`, `/products/pill-dispenser` | Pill Dispenser uses a **generic Unsplash stock photo** (hotlinked external URL), not a real/branded product image. |
| P4 | `/products`, `/products/glucose-monitor` | Glucose Monitor uses a **generic Unsplash stock photo** (hotlinked external URL). |
| P5 | `/pendant` | Hero + Specs images source from `website_images` (`pendant_hero`, `pendant_specs`) which are **unseeded** → render "Product Image / Coming Soon" and "Specifications Image / Coming Soon" placeholders. Bundled `defaultAsset` is ignored by the batch hook. |
| P6 | `/partner` | Form input placeholders use the classic fake values `+34 600 000 000` / `john@example.com` (acceptable as input hints, flagged per brief). |

**Net on the 3 products:** none has a working real hosted photo — Pendant (broken `/assets/` path), Pill Dispenser & Glucose Monitor (Unsplash stock). This matches the reported "location-pin placeholders".

---

## DEAD-CTA (cross-cutting — buttons/anchors that go nowhere)

| # | Route | Description |
|---|---|---|
| D1 | `/products`, `/products/:slug` | **"Notify Me" / "Register Interest"** buttons on coming-soon products have **no onClick/href** — no interest-capture flow exists. (On the listing, the dead button sits inside the card link so it just navigates to detail.) |
| D2 | nav + footer | **Pricing anchor is functionally dead.** `section id="pricing"` exists, but the only scroll handler (`ScrollToTop`) forces scroll-to-top on navigation and **ignores `location.hash`** — no scroll-to-hash is implemented. Header `/#pricing` and footer `#pricing`/`#how-it-works` land on `/` at the top, never scrolling to the section. |
| D3 | `/` (landing) | "Notify Me" on coming-soon product cards — label implies a signup action but the behavior is just navigate-to-detail (misleading CTA). |
| D4 | `/partner` | Success screen promises *"Isabella will send you an email shortly… with a link to complete your registration"*, but the submit only inserts the row + calls `notify-admin` (notifies **admin**, not the applicant). **No applicant-facing email is sent** — content claim not backed by behavior. |

---

## Correctness bug (out of audit scope, but critical — flagging)

- **`/join` drops all Medical info from the final member record.** The Medical step collects blood type / allergies / medications / conditions / doctor and saves it to `registration_drafts`, but `JoinPaymentStep`'s `submit-registration` call **omits `medicalInfo` / `partnerMedicalInfo`** — even though the edge function expects and persists them. For a life-safety service, medical data entered at signup never reaches the member record (survives only in the abandoned-draft table). Recommend a dedicated fix.

---

## What's healthy (no action)
- All public nav/footer CTA **routes resolve** (`/join`, `/how-it-works`, `/products`, `/partner`, `/contact`, `/blog`, `/help`, `/terms`, `/privacy`, `/login`).
- **/join wizard is production-built end to end** — 9 real steps (spec's "7" is stale), progressive draft save, correct `submit-registration` → Stripe/Mollie checkout chain with not-configured/error/cancel handling, server-side pricing recompute, no placeholder assets, no dead CTAs.
- Pricing cards, features, legal content (Terms 20 / Privacy 16 sections, real AEPD details), Contact form (→ `leads`), and How-It-Works are fully built with real i18n copy — no lorem/TODO anywhere.

## Top pre-launch priorities
1. **Product + hero imagery** (P1–P5): fix the pendant `/assets/` path, replace Unsplash stock with real product photos, seed/upload `homepage_hero` + `pendant_hero/specs` (or make the image hook fall back to bundled defaults).
2. **Legal header i18n keys** (I2) — currently renders raw key strings on Terms/Privacy.
3. **Dead CTAs** (D1/D4) — wire "Notify Me"/"Register Interest" to a real interest-capture, and either send the promised partner applicant email or fix the success copy.
4. **Pricing anchor** (D2) — implement scroll-to-hash.
5. **(Critical, separate) /join medical data loss.**
