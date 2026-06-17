# PRICING_REFACTOR_PLAN.md

> READ-ONLY plan. Date: **2026-06-17.** No code. Goal: one canonical, admin-editable
> pricing source read by the frontend AND the charge path, deleting the three hardcoded
> copies identified in `PRICING_AND_CONTENT_AUDIT.md`. Build nothing yet.

---

## 0. Why (recap)

Today the charged/displayed prices live in **three** places that can silently drift:
- `src/config/pricing.ts` (frontend calc),
- `supabase/functions/submit-registration/index.ts` `PRICING` constant (**the charged
  amount** — it computes `total` and the RPC `submit_registration_atomic` *trusts* it:
  `v_total := (payload->>'total')`),
- literal strings on marketing pages (`€27.49`/`€38.49` in LandingPage/PendantPage,
  `€151.25`/`€14.99` in DevicePage).

None of the base prices is admin-editable without a deploy. This plan unifies them.

---

## 1. DB structure — one canonical source

**Recommendation: two small purpose-built tables (NOT `system_settings`).**
Rationale: prices must be **publicly readable** (landing/`/pricing` render without auth),
and `system_settings` holds secrets locked to service-role — adding public-readable price
rows there muddies that boundary. Dedicated tables get clean public-read RLS.

### `pricing_plans` (membership plans as rows — future-proof for new plans)
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `plan_key` | text unique | `single` \| `couple` (\| future `family`…) |
| `monthly_net` | numeric | net €/month before IVA |
| `annual_months` | int | months charged annually (10 = 2 free) |
| `subscription_tax_rate` | numeric | e.g. 0.10 |
| `is_active` | bool | hide a plan without deleting |
| `display_order` | int | |
| `updated_at`, `updated_by` | tstz / uuid | audit |

### `pricing_settings` (global scalars — keyed)
`key text pk, value numeric, label text, updated_at, updated_by`. Seed keys:
`pendant_net`, `pendant_tax_rate`, `shipping_amount`, `registration_base`,
`registration_tax_rate`. (Tax rates kept here so they're editable too.)

> **Simpler alternative** (note for decision): a single-row `pricing` table with one column
> per value. Easier atomic read; less extensible (adding a plan = schema change). Recommend
> the rows approach unless you want absolute minimum surface.

**RLS:** `SELECT` to `anon`+`authenticated` (active rows); `UPDATE`/`INSERT` to admins only
(`is_admin(auth.uid())`). Same SECURITY-DEFINER pattern as existing tables.

**Keep as-is (already admin-editable, operational flags — NOT base prices):**
`system_settings`: `registration_fee_enabled`, `registration_fee_discount`,
`registration_test_mode_enabled`, `settings_active_payment_gateway`. These continue to layer
on top of the new base prices.

**Seed = EXACT current values** (so go-live changes nothing): single 24.99, couple 34.99,
annual_months 10, sub tax 0.10, pendant_net 125.00, pendant tax 0.21, shipping 14.99,
registration_base 59.99, registration tax 0.

### Admin editor
Add a **"Pricing" tab/section to `src/pages/admin/SettingsPage.tsx`** (where the
registration-fee toggle already lives) — edits `pricing_plans` + `pricing_settings`. (Keep
`PartnerPricingSettingsPage`/`partner_pricing_tiers` separate — that's B2B bespoke pricing.)

---

## 2. Every source to replace / delete

| # | Current source | Action |
|---|---|---|
| 1 | `src/config/pricing.ts` — the `PRICING` constant (numbers) | **Delete the numbers.** Keep the pure calc helpers (`calculateOrder`, `getSubscription*`, `formatPrice`) but have them take a `PricingConfig` argument fetched from the DB. pricing.ts becomes **calc-only, no literals**. |
| 2 | `submit-registration/index.ts` `PRICING` (lines 187-195) — **the charged amount** | **Delete.** Edge fn fetches `pricing_plans`+`pricing_settings` (service-role) and computes server-side (see §3). |
| 3 | `LandingPage.tsx:296,337` literal `€27.49`/`€38.49` | Replace with values from a `usePricing()` hook + shared calc. |
| 4 | `PendantPage.tsx:219,379,401` literal prices | Same. |
| 5 | `DevicePage.tsx:180-181` literal `€151.25`/`€14.99` | Same (read pendant + shipping from source). |
| 6 | `JoinPaymentStep.tsx` — passes `subscriptionAmount: order.subscriptionFinal` (client calc) to `create-mollie-checkout` | Client calc must come from the SAME DB source; ideally the checkout fn re-derives from DB too (don't trust client amount). |
| 7 | `create-checkout` / `create-mollie-checkout` line items / amounts | Re-derive amounts from the DB source server-side, not from client-passed values. |

New shared pieces: a frontend `usePricing()` (TanStack Query → the two tables) + the
calc-only `pricing.ts`; a server helper `_shared/pricing.ts` that fetches+computes for the
edge functions (single implementation mirrored, or an RPC `get_pricing_config()`).

---

## 3. 🔴 CRITICAL — the charge path, changed safely

**The charge total is authoritative server-side in `submit-registration` and is *trusted*
by `submit_registration_atomic` (it stores `payload->>'total'` verbatim).** So:

1. `submit-registration` must **fetch pricing from the DB and recompute `total` server-side**
   — it must NEVER trust a client-supplied total (it already recomputes; keep that property,
   just swap the constant for the DB fetch).
2. `create-checkout` / `create-mollie-checkout` must derive the gateway charge from the
   **same DB-computed amounts** (re-fetch or receive the server-computed `registrationResult`
   amounts), not from the client's `subscriptionAmount`.
3. Consider hardening the RPC to **recompute/validate** rather than trust `payload->>'total'`
   (defense in depth) — optional but recommended given it's the money path.

**Required test — displayed total == charged total.** A pure unit test over the shared calc,
fed the seeded config, asserting the grand total matches for the **matrix**:
`{single, couple} × {monthly, annual} × {registration fee on, off, discounted}` (± pendant
×1/×2, ± shipping). Same function feeds both the UI and the server, so equality is provable
in unit tests **for the math**.

**But the math being equal ≠ the gateway charging that amount.** A **live test charge in
Stripe/Mollie test mode is MANDATORY before trust**: complete a real `/join` for single and
couple, and confirm the **actual Stripe/Mollie amount** equals the displayed total and the
`payments.amount`/`orders.total_amount` rows. This is a **BLOCKING go-live gate** (tie into
CUTOVER Step F) — unit tests cannot prove the provider charged correctly.

---

## 4. /pricing page + admin editor

- **`/pricing` page** (`src/pages/PricingPage.tsx`, public route in `App.tsx`): renders plans
  + addons from `usePricing()`. The home `#pricing` section and `PendantPage` cards read the
  **same hook** (no duplication). Decide: keep `#pricing` on home AND add `/pricing`, or make
  the home section link to `/pricing`. (Header "Pricing" nav can then point at `/pricing`
  instead of `/#pricing` — resolves the cross-page anchor issue entirely.)
- **Admin editor**: Pricing tab in `SettingsPage.tsx` — edit plan rows + scalar settings,
  with a live "what members will see/pay" preview computed by the shared calc.

---

## 5. Branch, sequencing, test strategy

**Branch:** `feat/pricing-source`. **Sequence it AFTER the current 7 branches merge** (build
on consolidated main) — it touches LandingPage/PendantPage/DevicePage/pricing.ts/edge fns,
largely independent of the open branches but cleaner post-merge.

| Phase | Work | Test type |
|---|---|---|
| **1. DB** | migration: `pricing_plans` + `pricing_settings` + RLS, **seed = exact current values** | **Unit/CI:** a parity test asserting seeded values == the old constants (lock no-change-at-launch) |
| **2. Shared calc** | strip literals from `pricing.ts` → calc takes config; add `usePricing()` hook + server `_shared/pricing.ts`/RPC | **Unit:** calc(config) reproduces today's displayed prices exactly (single/couple/annual/fee matrix) |
| **3. Frontend reads** | Landing, Pendant, Device, Join all read `usePricing()`; delete literals | **Unit** (calc) + manual visual; **type-check/build** |
| **4. Charge path** | `submit-registration` + checkout fns compute from DB; (optional) RPC validates | **Unit:** server compute == displayed; **cannot** unit-test the gateway |
| **5. /pricing + admin editor** | public page + Settings pricing tab | **Unit:** editor writes/reads; render test |
| **6. 🔴 LIVE charge gate** | real Stripe/Mollie test-mode `/join` (single + couple) | **Live only** — charged amount == displayed == `payments`/`orders` rows. BLOCKING. |

**Deploy ordering (no drift window):** ship DB migration + edge-function changes + frontend
in **one coordinated release** so the UI and the charge path read the new source together;
the Phase-1 parity test guarantees the seed equals today's prices, so the release is a no-op
to customers until an admin actually edits a price. Do the Phase-6 live charge test in test
mode **before** announcing/enabling any price change.

**Unit-testable:** phases 1-5 (DB seed parity, calc parity, server compute, editor I/O).
**Needs live Stripe/Mollie test charge (not unit-testable):** phase 6 — the only true proof
the provider charges the displayed amount. Treat as a hard gate, same posture as the
existing Step F5 medical gate and the `feat/stripe-billing-actions` live-test requirement.

---

## Risks / flags
- **Money path** — any error overcharges/undercharges real members. The seed-parity test +
  live test charge are the safety net; do not skip the live charge.
- **Three→one is a net deletion** — ensure NO literal price string survives (grep
  `€` + the numbers across `src/` after refactor).
- **Public RLS** — prices are public by design; confirm no cost/margin field (`cost_price`
  lives on `products`, keep it OUT of the public pricing tables).
- **Coordinated deploy** — frontend reading the new source while the edge fn still uses the
  constant (or vice-versa) is a drift window; release together.
