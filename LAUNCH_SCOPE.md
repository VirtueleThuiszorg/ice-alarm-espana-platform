# LAUNCH_SCOPE.md — Care Conneqt pendant-first launch

> **Status: DRAFT for Lee's sign-off — not yet committed.**
> Decided in planning session 2026-07-22. This document owns the launch scope:
> what is public, what is hidden, how it is hidden, and what "phase 2" un-hides.
> Canonical per LEARN.md §1 — other docs link here, they do not copy from here.
> **Nothing is deleted. Hidden ≠ removed.** All code, tables, and functions stay
> in the repo for phase 2.

---

## 0. Backend decision (LOCKED 2026-07-22)

- **The one true backend is `crpsuhoixfdhjugprbuc` (care-conneqt-prod, LifeLink
  Sync org, Supabase Pro).** Lee owns the org — verified 2026-07-22.
- The planned migration to `cfwnrcogikjycjcobsay` is **CANCELLED**. Update
  CLAUDE.md §4 and CUTOVER_RUNBOOK.md accordingly.
- The empty project `qkfvojbcxaptufsepupo` (VirtueleThuiszorg org, Free) is to be
  **DELETED** to prevent accidental use.
- Stage 0 residual work on prod: connect the GitHub repo integration, diagnose
  the Postgres error spike (~694 errors / 64.3% success rate seen 2026-07-22),
  verify all secrets set, and clear the runbook hard blockers (no test
  passwords, Twilio paid plan, rotate any exposed credentials).

## 1. The offer (LOCKED)

- **One product publicly for sale: the GPS SOS pendant (EV-07B)** with a
  monitoring membership behind it.
- **Membership pricing (net + 10% IVA):**
  - Single: **€24.99/mo + 10% IVA = €27.49** displayed (IVA incluido)
  - Couple: **€34.99/mo + 10% IVA = €38.49** displayed (IVA incluido)
- **Billing frequency: monthly AND annual, customer chooses via a toggle** on
  the pricing display and in the join flow. Annual ratio to be confirmed from
  the existing `pricing.ts` ratio (flag for Lee if it differs from 10× monthly).
- **Pricing moves to the database (single source of truth).** Net price, tax
  rate, and annual ratio stored in DB (pricing_plans / system_settings —
  implementer's choice, one place only), read by: the public site, the join
  wizard, `submit-registration` (the charged amount), and the member dashboard.
  The three hardcoded copies (pricing.ts, submit-registration literals,
  marketing JSX literals) are deleted. Admin gets a pricing editor — **no
  deploy ever needed to change a price again.**
- Other devices (glucose monitor, medication dispenser, family pack, etc.)
  remain in the `products` table, **deactivated/hidden**, ready for phase 2.

## 2. Public site at launch (VISIBLE)

- Landing page — pendant-focused hero, features, pricing (from DB, with the
  monthly/annual toggle), testimonials, CTA to /join.
- Pendant product page.
- How It Works, Contact, Help/FAQ, Blog, Terms, Privacy.
- /join wizard → Stripe or Mollie checkout (admin-selected gateway).
- Partner public pages (/partner, /partner/join, /partner/login, etc.) — LIVE,
  we are actively recruiting partners from day one.
- **Isabella chat widget — the ONLY visible AI on the platform.** Present on
  public pages as the trained customer-service & sales expert
  (customer_service_expert agent). Fully working, on-brand, all 3 languages.
- Referral links (/r/:code) live, feeding partner attribution.

### Public site — HIDDEN at launch
- /products multi-device catalog routes — hidden (nav removed, non-pendant
  products deactivated in DB; route may redirect to the pendant page).
- All AI/Isabella *mentions* in marketing copy, How It Works, FAQ, etc. —
  removed from rendered output. Grep-verified: zero "AI"/"Isabella" strings
  render on any public page except the chat widget itself.

## 3. Members area (/dashboard) — VISIBLE, audited page by page

- All 9 existing pages stay: dashboard, profile, medical, contacts, device,
  subscription, alerts, messages, support.
- **Isabella chat available in the members dashboard** (member-context agent).
- **REAL self-service billing (LOCKED — build it):** members can update their
  payment method, switch plan (single↔couple, monthly↔annual), see/download
  invoices, and cancel — wired to the live provider (Stripe Customer Portal;
  Mollie equivalent flows), not "contact support" stubs. Provider is the
  source of truth; webhooks update our DB.

## 4. Partner portal — VISIBLE from day one (REVERSAL of archive decision)

- The 2026-06-18 "archive candidate" label on the partner portal is REVERSED.
- Full portal live: onboarding, invites, marketing links, commissions view,
  agreement signing, settings, (residential features stay as-is).
- **Commission payouts: MANUAL for launch.** Admin "Mark Paid" + real bank
  transfer done by hand is the process. Automated payouts = phase 2.
- Known defects to fix before launch: dead support links (href="#"), no-op
  "Generate Invoice" button, wrong-toast settings bug, raw labelKey display.
- Commission flow verified end to end in test: referral link → click →
  attribution → signup → payment → €50 commission created → release →
  approve → Mark Paid.

## 5. Admin & call-centre — UNCHANGED

- Admin keeps EVERYTHING, including the AI Command Centre, outreach, content,
  video tooling — behind-the-scenes AI use continues and grows. No hiding.
- Payment provider setup must be admin-only configuration: Lee enters Stripe +
  Mollie API/secret keys and webhook secrets in Admin → Settings and the
  system works — verified round-trip on prod.
- Call-centre portal unchanged (fix its known broken items in the sweep stage).

## 6. Languages (LOCKED)

- **EN + ES + NL, all three, full coverage at launch:** UI translation files,
  language selector, Isabella replies, email templates, legal pages.
- Per-page audit asserts all three languages render with zero missing keys.

## 7. Branding

- Every rendered page conforms to BRAND_ASSETS.md (Care Conneqt only).
- Zero ICE leftovers in output: no icealarm.es (robots.txt/sitemap), no
  icehealthsync.com senders, no old brand colour, no fake claims
  ("4.9/5, 2,000+ reviews" hardcoded literals removed or replaced with real,
  verifiable content), no "Coming Soon" placeholder images on launch pages
  (IMAGE_SPEC.md launch-critical images seeded).

## 8. The per-page audit rule (applies to every stage)

No page is done, and no stage is signed off, until every route in scope passes:
1. Every link/button performs a real action (no href="#", no dead onClick,
   no navigation to nonexistent routes).
2. Data wiring works: real data loads; loading/empty/error states render.
3. Actions round-trip: saves persist and read back; toasts tell the truth.
4. Branding clean per §7.
5. Scope clean per §2 (nothing hidden is visible).
6. EN/ES/NL all render, no missing i18n keys; WCAG AA basics pass.

Proof = a Playwright click-through per page, kept in CI permanently. Items
that require live provider keys are marked "wired, needs live verification" —
never falsely green (GOALS.md G5).

## 9. Isabella runtime note

- Isabella currently runs via the Lovable AI gateway. CLAUDE.md forbids
  reintroducing Lovable; the Anthropic API migration is owed. **Decision
  needed on ordering:** migrate during this relaunch (recommended) or launch
  on Lovable and migrate immediately after. → Lee to confirm.

## 10. Stages (executed as /goal loops, each gated by §8 + plan §16 ten-point standard)

- **Stage 0 — Backend verification** (§0 above). BLOCKS EVERYTHING.
- **Stage 1 — This document signed off and committed.**
- **Stage 2 — Docs truth pass:** CLAUDE.md, LAUNCH_CHECKLIST.md, STATE.md,
  CUTOVER_RUNBOOK.md updated (backend decision, partner reversal, pricing
  model, NL scope, this file linked).
- **Stage 3 — Pricing to DB** + admin pricing editor + monthly/annual toggle.
- **Stage 4 — Public frontend:** pendant funnel, brand sweep, NL, hide catalog
  & AI mentions, Isabella widget polished.
- **Stage 5 — Members area:** page-by-page audit + REAL self-service billing.
- **Stage 6 — Partner portal:** fixes + end-to-end commission verification +
  branding + 3 languages.
- **Stage 7 — Payments hardening:** both providers admin-configurable,
  webhook-driven activation proven, subscription lifecycle actions actually
  call the provider (fixes the known highest-money-risk defect).
- **Stage 8 — Broken-items sweep:** remaining audit defects (order detail
  page, dead buttons, CSV export, CRM import hardening).
- **Stage 9 — Prove & launch:** full per-page Playwright suite across all
  portals × 3 languages green; LAUNCH_CHECKLIST.md walked; human gates
  (SOS path, Stripe activation, RLS, Isabella tool permissions) signed by Lee;
  live keys; go.

## 11. Open items (small, non-blocking to start Stage 0)

- Annual price ratio confirmation (§1).
- Isabella runtime migration ordering (§9).
- Postgres error-spike root cause (Stage 0 will answer).
