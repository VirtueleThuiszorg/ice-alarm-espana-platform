# PRICING_JOIN_AUDIT.md — pricing → join → charge audit (2026-07-25)

Read of the live code on `claude/pricing-join-flow-review-eekwps`. Three questions:
double selection (fixed here), does **annual** survive end-to-end (audit only), do the
**one-time costs** match between advert, wizard and charge (audit only).

Everything under **§2** and **§3** touches the charge path, Stripe activation, or the
webhook — **human gate before any fix** (CLAUDE.md "Looping discipline"). Nothing in those
sections was changed by this branch.

---

## §1 Double selection — FIXED on this branch

`/pricing`, the home `#pricing` section and `/pendant#pricing` asked for the membership
plan; wizard step 1 asked again. Now:

- `src/lib/joinLink.ts` — `buildJoinPath()` / `parseJoinSelection()` / `resolveJoinEntry()`.
- All three pricing surfaces share `components/pricing/BillingPeriodToggle.tsx` and link
  `/join?plan=…&billing=…`. Plan-agnostic CTAs (hero, header, blog, how-it-works) still
  link plain `/join` and correctly start at step 1.
- `JoinWizard` pre-selects from the URL and **starts on step 2** when a valid `plan` came
  in; step 1 is marked complete, stays clickable in the rail, and a "Your selection:
  Couple Membership · Annual — Change" bar sits above steps 2–6. Billing stays changeable
  on the review step as before.
- Unknown values (`?plan=enterprise`) are ignored, and the deep link is not applied when
  returning from the gateway (`?success=` / `?cancelled=`) so a paid draft is never
  overwritten. Pinned in `src/test/joinDeepLink.test.ts`.
- **Not a charge input.** `submit-registration` still recomputes the price server-side
  from DB pricing; the URL only changes what is pre-selected.

**Other duplicated wizard steps: none.** No public page repeats the personal / address /
contacts / medical / pendant / review steps. `src/components/admin/wizard/*` is a separate
staff-side flow (its own `BillingFrequencyStep`), not a duplicate of a public page.

---

## §2 Annual end-to-end — GAPS (audit only, gated)

**Where the toggle lives:** it *is* in the wizard — `JoinSummaryStep` (step 7, "Review"),
not step 1. Before this branch `/pricing` had **no** toggle at all (it printed both prices
as text), so an annual intent could not be expressed until step 7. §1 adds the toggle to
all three pricing surfaces and carries it in.

**What works:** wizard → `buildRegistrationBody` → `submit-registration` carries
`billingFrequency` correctly. The server recomputes annual from DB pricing
(`monthly_net × annual_months`, +10% IVA → single €274.89 / couple €384.89),
`submit_registration_atomic` writes `subscriptions.billing_frequency='annual'` and
`renewal_date = start + 1 year`, and the checkout line item is named "… Membership -
Annual" at the annual amount. **Annual does not silently become monthly.**

| # | Gap | Where | Effect |
|---|---|---|---|
| A1 | Stripe checkout is `mode: "payment"` with ad-hoc `price_data` — no `recurring` price, no subscription | `create-checkout/index.ts:90-112` | **No Stripe subscription is ever created**, for annual *or* monthly. The first charge is correct; nothing is ever charged again. Not "annual → monthly" — it is "recurring → one-off". |
| A2 | `if (session.subscription && memberId)` is never true in payment mode | `stripe-webhook/index.ts:108` | `subscriptions.status` stays `'pending'` forever on Stripe; `stripe_subscription_id` / `stripe_customer_id` never stored. The member row *is* activated (`post-payment.ts`), the subscription row is not. |
| A3 | `useMemberSubscription` filters `.eq("status","active")` | `hooks/useMemberProfile.ts:190` | Consequence of A2: every Stripe-paid member's dashboard shows **"No active subscription — contact support"**. Mollie-paid members see the record (the Mollie webhook does set `active`). |
| A4 | `subscriptions.amount` is stored **net** (annual: 249.90, monthly: 24.99) and rendered raw | RPC `…_atomic.sql:241`, `client/SubscriptionPage.tsx:129` | Dashboard shows "€249.90/yr" / "€24.99/mo" while the member was charged €274.89 / €27.49 (IVA incl.). Also mixes units between frequencies (annual total vs monthly rate) in one column. |
| A5 | Recurring amount is **client-supplied**: `subscriptionAmount: order.subscriptionFinal` from the browser, forwarded to Mollie metadata and used verbatim to create the subscription | `JoinPaymentStep.tsx:58` → `create-mollie-checkout/index.ts:138` → `mollie-webhook/index.ts:132-146` | The one-off charge is server-derived, but the **recurring** amount is not — a tampered client can set its own renewal price. Should be recomputed server-side like the initial total. |
| A6 | Mollie subscription is created with no `startDate` | `mollie-webhook/index.ts:139-151` | Mollie's documented default for `startDate` is the current date, so the first recurring charge lands the same day as the initial payment — which already contained the subscription amount → **duplicate subscription charge on day 1**. Confirm against Mollie's current reference, then set `startDate` to `renewal_date`. |
| A7 | `renewal_date` is never advanced on a recurring payment | `mollie-webhook/index.ts:213-225`, `stripe-webhook/index.ts:207-232` | The dashboard's "Next renewal" goes stale/past immediately after the first renewal. |
| A8 | Admin pause/cancel assumes `stripe_subscription_id` | `admin-subscription-action/index.ts:70-93` | Consequence of A1/A2: no Stripe subscription to act on. `cancel-mollie-subscription` has no Stripe counterpart. |
| A9 | `payment_method_types: ["card"]` on Stripe | `create-checkout/index.ts:91` | SEPA is Mollie-only, though LAUNCH_SCOPE lists SEPA + cards for both. |
| A10 | No E2E covers checkout → activation | `e2e/` (only `public.spec.ts`) | CLAUDE.md lists "E2E on checkout→activation" as a merge gate; it does not exist, so A1–A3 went unnoticed. |

The plain answer to "does annual flow through as an annual subscription": **Mollie yes**
(interval `12 months`, €274.89 — modulo A5/A6), **Stripe no** — the correct annual amount
is charged once and no subscription exists at all.

---

## §3 One-time costs — one real mismatch (audit only, gated)

**Source of truth: confirmed.** All three figures come from `pricing_settings` and are
admin-editable in `PricingPlansEditor` ("One-time" block → `pendant_net`,
`pendant_tax_rate`, `shipping_amount`, `registration_base`):

| Line | Advertised on `/pricing` | From | Wizard breakdown | In the charge |
|---|---|---|---|---|
| GPS pendant | €151.25 (125.00 net + 21% IVA) | `pendant_net`, `pendant_tax_rate` | same (`calculateOrder`) | ✅ charged |
| Registration & setup | €59.99 | `registration_base` | same, ± `system_settings` discount | ✅ charged |
| Shipping | €14.99 | `shipping_amount` | same, shown in "Total due today" | ❌ **not charged** |

- **B1 — shipping is advertised, shown, stored, and never charged.**
  `submit-registration` builds `lineItems` from subscription + pendant + registration fee
  only (`index.ts:357-375`); shipping is omitted. Stripe charges exactly those line items
  and Mollie sums the same array, so the gateway takes **€14.99 less than the "Total due
  today"** the member agreed to. Single monthly + pendant: shown €253.72, charged €238.73.
  `orders.total_amount`, `orders.shipping_amount` and `payments.amount` all record the
  higher figure, so the books disagree with the gateway on every pendant order.
- **B2 — `/pricing` ignores the registration-fee flags.** The advert always prints €59.99,
  while the wizard and the charge apply `registration_fee_enabled` /
  `registration_fee_discount` from `system_settings`. With a discount live, the page
  over-states the price (safe direction, still a mismatch, and invisible to the admin who
  set the discount).
- **B3 — `registration_tax_rate` is a dead setting.** Written by `formToDbRows` and read
  into `PricingConfig`, but `calculateOrder` never applies it (`pricing-calc.ts:120-123`)
  and the editor has no input for it. Set it and nothing happens.
- **B4 — `usePricingSettings` reads the hardcoded base.** `registrationFeeBase` comes from
  `PRICING.registration.amount` (the DEFAULT mirror), not `registration_base`. Unused for
  the charge today, but it will lie once an admin edits the base.

---

## Suggested order for the gated work
1. **B1** — under-charging on live orders; smallest fix (add the shipping line item, or
   Stripe `shipping_options`, plus a test that `Σ lineItems == order.grandTotal`).
2. **A1 + A2 + A3** — recurring billing does not exist on Stripe and Stripe members see no
   subscription. Needs a Stripe subscription-mode checkout (or a Price with
   `recurring.interval` = `month`/`year`) and a webhook that activates the row.
3. **A5 + A6** — Mollie recurring amount and start date.
4. **A4, A7, B2** — member-facing correctness.
5. **A10** — the E2E that would have caught all of the above.
