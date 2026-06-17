# PRICING_AND_CONTENT_AUDIT.md

> READ-ONLY audit. Date: **2026-06-17.** No code changed. Prep for a planned standalone
> `/pricing` page + a view of what content is admin-controllable vs hardcoded.

---

## PART A — Pricing data sources

### A1. Where each price comes from

⚠️ **Headline: subscription/pendant/shipping prices are hardcoded in THREE separate places**
that can drift: `src/config/pricing.ts` (frontend calc), the `submit-registration` edge
function's own `PRICING` constant (the **server-authoritative amount actually charged**),
and **literal strings in the marketing pages** (which don't even read `pricing.ts`).

| Price | Source(s) | Admin-editable w/o deploy? |
|---|---|---|
| **Membership single** monthly net €24.99 | `pricing.ts:7` (display) **+** `submit-registration/index.ts:188` (charged) **+** literal `€27.49` in `LandingPage.tsx:296` & `PendantPage.tsx:219,379` | **NO** — code in 2 files + hardcoded marketing literals |
| **Membership couple** monthly net €34.99 | `pricing.ts:11` + `submit-registration:189` + literal `€38.49` in `LandingPage.tsx:337` & `PendantPage.tsx:401` | **NO** |
| **Annual discount** (pay 10 months / 2 free) | `pricing.ts` `annualMonths:10` + `submit-registration` `annualMonths` | **NO** |
| **Registration fee — base €59.99** | `pricing.ts:23` + `submit-registration:194` | **NO** (base amount) |
| **Registration fee — ON/OFF + discount %** | `system_settings` keys `registration_fee_enabled`, `registration_fee_discount` (read by `usePricingSettings.ts:25`; honored server-side in `submit-registration`) | ✅ **YES** |
| **Pendant — €125 net** | `pricing.ts:27` + `submit-registration:191` (the **join charge**) **and separately** `products` table row `slug='pendant'` `selling_price_net=125` (catalog display only) + literal `€151.25` in `DevicePage.tsx:180` | **partial** — see A3 (products row is editable but does NOT change the join charge) |
| **Shipping €14.99** | `pricing.ts:31` + `submit-registration:195` + literal in `DevicePage.tsx:181` | **NO** |
| **Subscription IVA 10% / product IVA 21%** | `pricing.ts` + `submit-registration` | **NO** |
| Payment gateway (stripe/mollie), test mode | `system_settings` (`settings_active_payment_gateway`, `registration_test_mode_enabled`) | ✅ **YES** |

**The amount a member is actually billed = the `submit-registration` edge-function `PRICING`
constant** (server recomputes, ignores client values — good for integrity, bad for
editability). `pricing.ts` only drives frontend display, and the landing/pendant cards don't
even use it — they hardcode `€27.49` / `€38.49` as text.

### A2. Can an admin change membership prices without a code deploy?

**NO.** Evidence:
- `usePricingSettings.ts:25` reads only 4 keys from `system_settings`:
  `registration_fee_enabled`, `registration_fee_discount`, `registration_test_mode_enabled`,
  `settings_active_payment_gateway`. None is a membership/pendant/shipping price.
- The charged prices are compile-time constants in `submit-registration/index.ts:187-195`
  (and mirrored in `pricing.ts`). Changing them requires editing code + deploying the edge
  function. The marketing display prices are literal JSX strings → also a deploy.

**What an admin CAN change today without deploy:** registration-fee on/off + discount %,
payment gateway, test mode. **What they CANNOT:** membership monthly prices, annual ratio,
pendant base price, shipping, registration base amount, tax rates.

### A3. Existing admin pricing UIs — editable vs hardcoded today

| Admin surface | Controls | Drives… |
|---|---|---|
| **Product Catalog** (`/admin/products`, `products` table — `selling_price_net`, `selling_tax_rate`, `cost_price`) | per-product prices | the **public `/products` + `/products/:slug` catalog DISPLAY only** — NOT the `/join` membership/pendant charge |
| **Partner Pricing** (`/admin/partner-pricing`, `partner_pricing_tiers`) | bespoke B2B partner tiers | hardcoded `DEFAULT_PRICING_TEMPLATES` in-bundle + DB overrides (per `APP_AUDIT`) |
| **Settings / pricing** (`system_settings`) | registration fee on/off + discount, gateway, test mode | the `/join` registration-fee line + which gateway |

**Net:** the **catalog** is admin-priced, but the **core membership + join checkout pricing
is hardcoded in code** (two copies) and **echoed as literal text** on the marketing pages.
A standalone `/pricing` page built today would either re-read `pricing.ts` (still
deploy-bound) or need pricing moved into the DB to be admin-editable.

> **Recommendation (not built):** to make a `/pricing` page admin-editable, introduce a
> single pricing source of truth in the DB (e.g. `system_settings` rows or a `pricing_plans`
> table) read by BOTH the frontend and `submit-registration`, and delete the three hardcoded
> copies. Until then, any `/pricing` page is just another place to keep in sync.

---

## PART B — "Real page" / content gap list

### (a) Sections that arguably deserve their own page
| Item | Today | Underlying data |
|---|---|---|
| **Pricing** | `#pricing` section on home (`LandingPage:279`); no `/pricing` route | hardcoded (see Part A) — a real page needs the pricing-source fix to be more than a copy |
| **FAQ** | none on home; only `/help` (documentation table) + inline on `/how-it-works` | `documentation` table is **admin-manageable**; a home FAQ section/page could reuse it |
| How It Works | already has `/how-it-works` page ✅ | i18n |

### (b) Thin / placeholder content
| Item | Today | Data manageable? |
|---|---|---|
| Home hero image | `homepage_hero` unseeded → "Coming Soon" placeholder | `website_images` (admin upload) — needs seeding/upload |
| Pendant hero/specs images | `pendant_hero`/`pendant_specs` unseeded → placeholders | `website_images` — needs upload |
| Pill Dispenser / Glucose Monitor images | Unsplash stock | `products.hero_image_url` — **admin-editable**, needs real assets |
| Blog | empty (`blog_posts` unseeded) | **admin-manageable** (`/admin/blog`) — needs posts authored |

### (c) Hardcoded text/numbers an admin should arguably control
| Item | Where | Manageable today? |
|---|---|---|
| Membership prices (€27.49/€38.49) | literal in `LandingPage`, `PendantPage` | ❌ hardcoded — **needs wiring** (to pricing source) |
| Pendant price (€151.25 / €14.99) | literal in `DevicePage:180-181` | ❌ hardcoded — products row exists but isn't read here |
| Pendant social proof "4.9/5", "2,000+ verified reviews" | `PendantPage:433-435` (i18n key w/ literal numbers) | ❌ hardcoded; unverifiable pre-launch claim |
| Company phone / email / address | `useCompanySettings` ← `system_settings` (with hardcoded fallbacks) | ✅ **admin-manageable** (fallbacks only if unset) |
| Testimonials | `testimonials` table | ✅ **admin-manageable** (`/admin/testimonials`) |
| Hero / marketing copy | i18n `en.json`/`es.json` | ⚠️ editable only via code/translation files, not an admin UI |

---

## Summary — admin-editable TODAY vs hardcoded (needs deploy)

**✅ Admin-editable now (no deploy):**
- Registration fee on/off + discount %, payment gateway, test mode (`system_settings`).
- Product-catalog prices + images (`products`, drives `/products` display only).
- Partner pricing tiers (overrides over hardcoded defaults).
- Company contact details, testimonials, blog posts, documentation/FAQ, managed images.

**❌ Hardcoded (code deploy required), and the priority gap:**
- **Membership single/couple prices, annual ratio, pendant base, shipping, registration base
  amount, tax rates** — duplicated across `pricing.ts`, `submit-registration` (the charged
  amount), and literal marketing text. **This is the main thing blocking an admin-editable
  `/pricing` page**, and the triple-duplication is itself a correctness/drift risk.
- DevicePage pendant price, Pendant page review-count claims — hardcoded literals.

**Recommended first step (if/when you build it):** one DB-backed pricing source read by both
the frontend and `submit-registration`, replacing the three hardcoded copies — then a
`/pricing` page (and the join flow, landing cards, device page) all render from it.
