# REVIEW: join → pay → member — independent trace

**Question asked:** can a stranger who has never spoken to us go to `https://icealarm.es/join`,
pay, and end up as a monitored member with a working login, an active subscription, a pendant on
order, their emergency contacts collected, and staff aware a sale happened?

**Answer: no.** The flow stops at the first server call, and would stop three more times if that
one were fixed. Nothing was changed by this review; the code on `main` at `679fe78` is the only
source used.

---

## The chain, and where it breaks

| # | Step | Result |
|---|---|---|
| 1 | Anonymous browser loads `/join`, picks a plan, fills 5 steps | ✅ works |
| 2 | Presses **Pay securely** → `submit-registration` | ⛔ **HTTP 400** — F1 |
| 3 | (if F1 fixed) client checks the payment gateway | ⛔ refuses — F2 |
| 4 | (if F2 fixed) `create-checkout` | ⛔ **HTTP 400** — F3 |
| 5 | (if F3 fixed) pays at Stripe, webhook fires, `post-payment` runs | partially |
| 6 | Member has a login | ⛔ never — F4 |
| 7 | Subscription is active | ⛔ stays `pending` — F5 |
| 8 | Emergency contacts collected | ⛔ never asked for — F6 |
| 9 | Pendant on order | ✅ order + order_items + device allocation work |
| 10 | Staff aware a sale happened | ⚠️ only if four production settings are right — F12, F20 |

A member reaching step 10 with F6 unresolved is **not monitoring-ready** by this system's own
definition (`member_monitoring_readiness` requires ≥1 emergency contact), so "monitored member"
cannot be reached even with every blocker below fixed.

**One thing that reframes the whole trace:** migration
`20260902160000_payment_gateway_mollie.sql` sets `settings_active_payment_gateway = 'mollie'`.
The Stripe path this review was asked to trace is **not the live one**. Findings are given for
both, and the Mollie path is *worse* on amount handling (F7) and idempotency (F10).

---

## Findings

**STATUS AT 9 SEP 2026.** Items 5, 6 and 8 closed most of this list. Read the per-finding
`**Status:**` lines below for the detail; this is the shape of it.

`PR #253` and branch `item6/second-stage` are **open and held for Lee's read** — they touch
`create-checkout` and `stripe-webhook`, which carry the standing human gate (CLAUDE.md). A
finding marked fixed there is fixed in code and reviewed by tests, and is **not yet on main**.
That distinction is the whole point of writing it down: GOALS G5 exists because a STATE.md
section once claimed two fixes that were sitting on an unmerged branch.

| | Finding | Status |
|---|---|---|
| F1 | schema rejects the wizard's own payload | fixed · main |
| F2 | anon cannot read the gateway setting | fixed · main |
| F3 | create-checkout rejects the amounts | fixed · #253 |
| F4 | no login is ever created | fixed · item6 |
| F5 | subscription stays `pending` | fixed · #253 |
| F6 | emergency contacts never collected | fixed · item6 |
| F7 | the browser chooses the amount | fixed (Stripe) · #253 — **open for Mollie** |
| F8 | the recurring amount too | fixed (Stripe) · #253 — **open for Mollie** |
| F9 | idempotency records before processing | fixed · #253 |
| F10 | Mollie guard keyed on the payment id | **open** |
| F11 | no recurring charge at all | fixed · #253 |
| F12 | payment secrets readable by all staff | fixed · main |
| F13 | success screen believes the URL | fixed · item6 |
| F14 | orders born `paid` | fixed · main |
| F15 | never advances `paid → allocated` | fixed · #253 |
| F16 | fee shown ≠ fee charged | fixed (Stripe) · #253 |
| F17 | order numbers collide | fixed · main |
| F18 | sale reported from the browser | **open** |
| F19 | CORS admits any `*.vercel.app` | **open** |
| F20 | staff-awareness depends on four settings | partial · #253 |
| F21 | Mollie webhook secret read by nothing | **open** |
| F22 | anon INSERT into `registration_drafts` | fixed · main |
| F23 | `ai_agents` readable anonymously | fixed · main |

**THE FIVE STILL OPEN ARE FOUR THINGS.** `create-mollie-checkout` carries the same
browser-names-the-price defect on the other gateway (F7, F8, F10, F21) and needs its own pass;
the Sync Hub report (F18) sends a figure computed in the browser; and CORS (F19) admits any
Vercel preview origin. None is on the Stripe money path.

**AND ONE THING THIS REVIEW DID NOT ORIGINALLY FIND**, added while fixing the rest: shipping was
in `orders.total_amount` but absent from the `lineItems` `submit-registration` returned, so
**Stripe collected less than the order said was due on every order with a pendant**. Fixed by
construction in #253 — the lines are built from `stripe_prices`, and the total is cross-checked
against the order row.

### F1 — `submit-registration` rejects the wizard's own payload · **BLOCKER**

**Status:** **FIXED · on main.** The schema no longer requires `medicalInfo` / `emergencyContacts`; both move to the post-payment second stage.

**Where:** `supabase/functions/_shared/validation.ts:68` and `:70`; `src/lib/registrationPayload.ts:23-27, 73`; refusal at `supabase/functions/submit-registration/index.ts:213-214`.

**What happens.** The schema requires two fields:

```ts
medicalInfo: medicalSchema,                                   // validation.ts:68
emergencyContacts: z.array(emergencyContactSchema).min(1).max(10),  // validation.ts:70
```

`buildRegistrationBody` deliberately sends **neither** — and `assertNoHealthDataInPayload`
*throws* if a caller tries to (`registrationPayload.ts:49-61`), because the wizard moved contacts
and medical data to a post-payment stage. So the client cannot satisfy a schema the server still
enforces.

Verified by running the real zod version against the real shapes:

```
success: false
medicalInfo: Required
emergencyContacts: Required
```

`validateRequest` turns that into `400 {"error":"Invalid request data"}`
(`validation.ts:266-279`), before the gateway check, before pricing, before any row is written.
The customer sees "Registration failed".

**What should happen.** The schema should match the flow it validates: `medicalInfo` optional and
`emergencyContacts` `.max(10)` without `.min(1)` — or, if at-registration contacts are still
wanted, the wizard must collect them again. The two halves currently contradict each other and
nothing fails until a real browser tries.

---

### F2 — the anonymous browser cannot read the payment-gateway setting, so the Pay button refuses · **BLOCKER**

**Status:** **FIXED · on main** (`20260908120000_settings_read_policies.sql`, applied). The gateway setting is on the public whitelist, and the client refuses rather than defaulting to Stripe when it is unreadable.

**Where:** `supabase/migrations/20260203185605_...sql:21-31`; `src/hooks/usePricingSettings.ts:45`; `src/components/join/steps/JoinPaymentStep.tsx:63-66`.

**What happens.** The only policy that grants a non-staff read of `system_settings` whitelists
**four** keys:

```sql
key IN ('settings_company_name','settings_emergency_phone','settings_support_email','settings_address')
```

`usePricingSettings` asks for four *different* keys — `registration_fee_enabled`,
`registration_fee_discount`, `registration_test_mode_enabled`,
`settings_active_payment_gateway`. An anonymous visitor gets **zero rows** for all of them
(RLS filters rows silently; there is no error). `parseGateway(undefined)` → `null`, and:

```ts
if (activeGateway !== "mollie" && activeGateway !== "stripe") {
  setError(t("joinWizard.payment.gatewayNotConfigured"));
  return;                       // JoinPaymentStep.tsx:63-66
}
```

So even with F1 fixed, the browser stops itself before calling any checkout function. Note the
earlier policy in `20260123130139` *did* whitelist the fee keys and the four plan prices; the
2026-02-03 migration dropped it and did not carry them over.

**What should happen.** `settings_active_payment_gateway` (and the two registration-fee keys, see
F16) belong in the public whitelist, or these values should be served by an edge function rather
than read from the browser. The gateway is not a secret — it decides which of two public
checkout URLs to use.

---

### F3 — `create-checkout` rejects the amounts `submit-registration` produces · **BLOCKER**

**Status:** **FIXED · PR #253 (held).** There is no amounts contract left to disagree about: `create-checkout` takes four ids and reads the plan, the quantity and the prices from the database.

**Where:** `supabase/functions/_shared/validation.ts:97`; `supabase/functions/submit-registration/index.ts:414-432`.

**What happens.** The schema demands integers:

```ts
amount: z.number().int().min(0),     // validation.ts:97
```

`submit-registration` returns euros with decimals — with the seeded prices,
`subscriptionFinal = 24.99 × 1.10 = 27.489`, `pendantFinal/pendantCount = 151.25`,
`registrationFee = 59.99`. Verified against the real zod:

```
27.489 → false     151.25 → false     59.99 → false
```

Every real line item fails, so `create-checkout` answers **400** for every genuine join.
`create-checkout:84` then multiplies by 100 (`Math.round(item.amount * 100)`), confirming euros
were intended — the `.int()` is simply wrong for the unit in use.

**What should happen.** Either validate euros (`z.number().nonnegative().max(...)` with a
2-decimal check) or move to integer cents on both sides. `.min(0)` should also become a positive
minimum — see F7.

---

### F4 — no login is ever created, and no reachable page can create one · **BLOCKER**

**Status:** **FIXED · branch `item6/second-stage`.** `handleSuccessfulPayment` creates the auth user with `generateLink` and sets `members.user_id`; the welcome email's CTA is the sign-in link.

**Where:** no `auth.admin.createUser` call for members anywhere in `supabase/functions/` (only `partner-register:134`, `partner-admin-create:273`, `staff-register:131`, `partner-complete-invite:99`); `src/App.tsx:345`; `src/pages/auth/CompleteRegistration.tsx:73-75`; `supabase/functions/_shared/welcome-email.ts:50, 166`.

**What happens.**

* `submit_registration_atomic` inserts `members` rows with no `user_id`
  (`20260302120000_...sql:100-121`) and never creates an auth user.
* `post-payment.ts` sets `members.status = 'active'` (`:58-61`) and nothing else identity-related.
* `complete-member-registration` *links* an existing auth user to a member row — it explicitly
  never creates one (`index.ts:19-21`) — and `CompleteRegistration.tsx:73-75` redirects to
  `/login` when there is no session.
* The one page that calls `supabase.auth.signUp` for a member, `src/pages/auth/Register.tsx`, is
  **imported nowhere**, and `/register` is a redirect: `<Route path="/register" element={<Navigate to="/join" replace />} />` (`App.tsx:345`).
* The welcome email's only call to action is `Access My Dashboard` →
  `https://icealarm.es/dashboard` (`post-payment.ts:255`, `welcome-email.ts:50,166`).
* The confirmation screen's primary button goes to `/login` (`JoinConfirmationStep.tsx:151`).

So a paying stranger is sent to a login form for an account that does not exist, with no
password-set link and no sign-up route. "Forgot password" cannot help: there is no auth user with
that email.

**What should happen.** The payment path should create the auth user (or send a Supabase invite /
magic link) and the welcome email should carry that link, not a dashboard URL. Whichever is
chosen, `members.user_id` has to end up populated by something the member can trigger.

---

### F5 — after payment the subscription stays `pending` · **BLOCKER**

**Status:** **FIXED · PR #253 (held).** The root cause was `mode: "payment"`, which produces no `session.subscription`, so the activation block could never run. Now `mode: "subscription"`, and both rows of a couple are activated BY ID.

**Where:** `supabase/functions/_shared/post-payment.ts` (no `subscriptions` write anywhere in the file); `supabase/functions/stripe-webhook/index.ts:108-129`; `supabase/functions/create-checkout/index.ts:93`.

**What happens.** `submit_registration_atomic` creates the subscription with
`status = 'pending'` and `registration_fee_paid = false`
(`20260302120000_...sql:235-244`). After payment:

* `post-payment.ts` updates `orders`, `payments`, `members`, `devices`, `order_items`,
  `crm_events`, `ai_events` — and **never `subscriptions`**.
* the Stripe webhook's only subscription activation is inside
  `if (session.subscription && memberId)` (`stripe-webhook:108`), but `create-checkout` creates
  the session with `mode: "payment"` (`create-checkout:93`), which produces **no**
  `session.subscription`. The branch is dead for the join flow.

Result: `members.status = 'active'` while `subscriptions.status = 'pending'`. Every member-facing
surface that reads the subscription (`useMemberSubscription`, the membership condition mapping)
will tell the paying member they are *awaiting payment*.

The Mollie path has the same failure by a different route: it sets `status: 'active'` only inside
the `sequenceType === "first"` branch (`mollie-webhook:158-168`) wrapped in a `try/catch` that
swallows errors (`:182-185`), so a failed Mollie-subscription creation leaves a paid member on
`pending`.

**What should happen.** `handleSuccessfulPayment` is the one place both gateways agree on; the
subscription activation and `registration_fee_paid` belong there, not in a gateway-specific
branch that depends on an object the checkout mode never creates.

---

### F6 — emergency contacts are never collected · **BLOCKER (safety)**

**Status:** **FIXED · branch `item6/second-stage`.** The payment path mints one `member_update_tokens` row per member (`issued_via: 'post_payment'`), and the confirmation screen shows the link on screen — no email transport needed.

**Where:** `src/pages/join/JoinWizard.tsx:30-32`; `src/lib/registrationPayload.ts:11-13`; `supabase/functions/send-member-update-request/index.ts:27-60`; `src/components/admin/member-detail/MemberUpdateRequestModal.tsx:123`.

**What happens.** The wizard no longer asks for contacts; the stated replacement is the
`member_update_tokens` second stage. Nothing in the payment path creates such a token:

* `submit_registration_atomic` — no `member_update_tokens` insert.
* `post-payment.ts` — none.
* the only creator is `send-member-update-request`, which **requires a staff bearer token**
  (`:27-33`), verifies the caller is active staff (`:50-60`), and is invoked from exactly one
  place: an admin modal a human has to open.

So the automatic half of the split does not exist. A paid, "active" member has zero rows in
`emergency_contacts` and no prompt to add any, until a staff member notices the sale and clicks.
`member_monitoring_readiness` requires at least one contact, so **the member can never become
monitoring-ready** on this path.

The confirmation screen is honest about the gap (`JoinConfirmationStep.tsx:64-110`, a red
`role="alert"` card telling them to call) — which is good, and is currently the *only* mitigation.

**What should happen.** The payment path should create the token and send the link (or the
wizard should collect contacts again). One of the two, not neither.

---

### F7 — the amount charged is chosen by the browser and never checked · **HIGH (money)**

**Status:** **FIXED for Stripe · PR #253 (held). STILL OPEN for Mollie.** `create-checkout` charges synced Stripe Price ids and the webhook refuses activation when `amount_total` disagrees with the server-written `payments.amount`. `create-mollie-checkout` is untouched: still `lineItems` with amounts, still no schema at all.

**Where:** `supabase/functions/create-checkout/index.ts:78-87`; `supabase/functions/create-mollie-checkout/index.ts:64, 67-71`; `supabase/config.toml:61-62, 97-98`; `supabase/functions/stripe-webhook/index.ts:140`; `supabase/functions/_shared/post-payment.ts:39-55`.

**What happens.** `create-checkout` builds Stripe's line items straight from the request body:

```ts
const stripeLineItems = body.lineItems.map((item) => ({
  price_data: { currency: "eur", product_data: { name: item.name },
               unit_amount: Math.round(item.amount * 100) },
  quantity: item.quantity,
}));
```

It never reads the `orders` or `payments` row whose ids it was handed. Both checkout functions run
with `verify_jwt = false`, so any caller can POST arbitrary amounts against a real `orderId` /
`paymentId`. `create-mollie-checkout` is worse: `const body: MollieCheckoutRequest = await req.json();`
(`:64`) — a bare TypeScript cast, **no schema at all** — and it sums the client's line items for
the charge (`:67-71`).

Nothing downstream compares what was paid to what was owed: `stripe-webhook:140` passes
`amountPaid` through, and `post-payment.ts` writes `payments.status = 'completed'` without
looking at `orders.total_amount` or `payments.amount`. A 1-cent payment activates a full
membership.

`validation.ts:97`'s `.min(0)` also permits a **zero**-value line item.

**What should happen.** The checkout functions should read the order server-side and price from
it, ignoring any client amounts; and the webhook should refuse to activate when
`amount_paid < orders.total_amount` (allowing only a rounding tolerance), logging the mismatch.

---

### F8 — the *recurring* amount is also chosen by the browser · **HIGH (money)**

**Status:** **FIXED for Stripe · PR #253 (held). STILL OPEN for Mollie.** The recurring line is a synced Price id from `stripe_prices`, cross-checked against `calculateOrder` and against `orders.total_amount`.

**Where:** `src/components/join/steps/JoinPaymentStep.tsx:69` (`subscriptionAmount: order.subscriptionFinal`); `supabase/functions/create-mollie-checkout/index.ts:138`; `supabase/functions/mollie-webhook/index.ts:131-146`.

**What happens.** The browser sends `subscriptionAmount`; `create-mollie-checkout` copies it into
the Mollie payment metadata unvalidated; the webhook reads it back and creates the Mollie
subscription with that value:

```ts
const subscriptionAmount = metadata.subscription_amount || "0";
...
amount: { currency: "EUR", value: parseFloat(subscriptionAmount).toFixed(2) },
```

So a stranger can set their own monthly price — permanently, on the mandate. The `|| "0"`
fallback would also attempt a €0.00 subscription, which Mollie rejects, landing in the
error-swallowing `catch` of F5.

**What should happen.** Derive the recurring amount server-side from `subscriptions.amount` /
`pricing_plans`, never from metadata that originated in a browser.

---

### F9 — webhook idempotency records the event *before* processing it · **HIGH**

**Status:** **FIXED · PR #253 (held).** The event is claimed with `processed_at: null` and stamped only after the handler returns, so a run that throws is retried instead of being answered "duplicate, skipping".

**Where:** `supabase/functions/stripe-webhook/index.ts:77-96`; `supabase/functions/mollie-webhook/index.ts:90-105`; `supabase/migrations/20260302130000_webhook_events_idempotency.sql:3-9`.

**What happens.** Order of operations:

1. look up `webhook_events` by `event_id`; if present, return `200 {duplicate:true}`;
2. **insert** the row;
3. *then* run the handler.

If step 3 throws — or the function times out, or `handleSuccessfulPayment` fails halfway — the
catch returns 500, the gateway retries, and the retry is answered at step 1 as a duplicate with
`200`. The work is never done and the gateway's dashboard shows a delivered webhook. Money taken,
member never activated, and no error anywhere after the first.

`webhook_events` has no status column (`:3-9`), so there is nothing to distinguish "started" from
"finished".

**What should happen.** Insert with a status (`received` → `processed`), or insert only after the
handler succeeds and rely on the `UNIQUE(event_id)` constraint to serialise concurrent retries.
A retry must be able to complete work the first attempt failed to do.

---

### F10 — the Mollie guard is keyed on the payment id, so only the first notification is ever processed · **HIGH (live gateway)**

**Status:** **OPEN.** Mollie is out of item 5's scope and untouched. It needs its own pass, alongside F7, F8 and F21.

**Where:** `supabase/functions/mollie-webhook/index.ts:96, 105`.

**What happens.** Mollie calls one webhook URL and identifies the payment, not the event:

```ts
.eq("event_id", molliePaymentId)          // :96
await supabase.from("webhook_events").insert({ event_id: molliePaymentId, ... });  // :105
```

Mollie notifies on *every* status change of the same payment, and again for refunds and
chargebacks. The first notification consumes the id; every later one — including the
`paid` transition after an `open` SEPA payment, and every refund — is discarded as a duplicate
before `payment.status` is even read.

**What should happen.** Key on `paymentId + status` (or Mollie's own event id where available), so
each transition is processed exactly once rather than the first transition only.

---

### F11 — Stripe monthly and annual create no recurring charge at all · **HIGH (money)**

**Status:** **FIXED · PR #253 (held).** `mode: "subscription"` with the one-off items on the first invoice (P1).

**Where:** `supabase/functions/create-checkout/index.ts:90-112`; `supabase/migrations/20260302120000_submit_registration_atomic.sql:229-244`.

**What happens.** The RPC records `billing_frequency` and a `renewal_date` of `+1 month` or
`+1 year`, and the member is told they have a monthly membership. Stripe is asked for
`mode: "payment"` — a **single** charge — with no `price` object, no recurring interval and no
customer/mandate. Nothing ever creates a Stripe subscription, so:

* the second month is never charged;
* `customer.subscription.updated/deleted` and `invoice.paid` (`stripe-webhook:176-246`) can never
  fire for a join, because no subscription object exists;
* `subscriptions.renewal_date` becomes a date nothing acts on.

The Mollie path does establish a mandate (`create-mollie-checkout:142` `sequenceType: "first"`)
and creates a subscription in the webhook, so this is Stripe-specific — but Stripe is the
gateway `create-checkout` and `stripe-webhook` exist to serve.

**What should happen.** Either `mode: "subscription"` with a recurring price for the membership
line (and one-off lines handled separately), or an explicit decision that Stripe is retired and
the Stripe functions are removed rather than left as a broken alternative.

---

### F12 — payment secrets live in a table every staff account can read · **HIGH (security)**

**Status:** **FIXED · on main** (`20260908120000_settings_read_policies.sql`, applied). Staff may read non-credential settings only.

**Where:** `supabase/migrations/20260203185605_...sql:35-39`; readers at `create-checkout/index.ts:50-54`, `stripe-webhook/index.ts:21-25, 46-50`, `create-mollie-checkout/index.ts:43-47`, `mollie-webhook/index.ts:53-57`, `notify-admin/index.ts:227-237`.

**What happens.** These live in `system_settings` as plain rows:
`settings_stripe_secret_key`, `settings_stripe_webhook_secret`, `settings_mollie_api_key`,
`settings_mollie_webhook_secret`, `settings_twilio_auth_token`, `settings_twilio_api_key_secret`,
`settings_facebook_page_access_token`.

The policy on that table is:

```sql
CREATE POLICY "Staff can view all settings" ON public.system_settings
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
```

**Every** staff row — call-centre operators included, not just super-admins — can
`select * from system_settings` and read the live Stripe secret key and both webhook secrets. The
write policy is correctly narrowed to `super_admin`; the read policy is not narrowed at all.

CLAUDE.md's rule is "No secrets in git. Env / Supabase secrets only." These are not in git — they
are in a table with a broader audience than the repo would have had.

**What should happen.** Move them to Supabase function secrets (`Deno.env`), as the SUPABASE keys
already are; or at minimum restrict SELECT of `settings_*_secret_key` / `_auth_token` /
`_api_key` rows to `super_admin` and have the functions read them with the service role only.

---

### F13 — the success screen believes the URL, not the payment · **HIGH (member trust)**

**Status:** **FIXED · branch `item6/second-stage`.** The screen polls `join-order-status` until the order is really confirmed, keyed on the Stripe session id — never the order number, which is sequential.

**Where:** `src/pages/join/JoinWizard.tsx:121-192`.

**What happens.** On return, the wizard reads `?success=true&order=<n>` and immediately sets
`paymentComplete: true`, jumps to the confirmation step and toasts "payment successful". It never
queries `payments`, `orders` or `subscriptions` to confirm anything. Consequences:

* anyone can visit `https://icealarm.es/join?success=true&order=whatever` and see the full
  "you're a member" screen;
* more importantly, if the webhook never arrives (mis-set endpoint, F9, F10), the member is
  **told they are covered while the database says pending** — the exact silent failure the
  gateway migration warns about, delivered to the customer as good news.

**What should happen.** Confirm against the server before showing success — a small read of the
order/payment status by order number — and show a "we're confirming your payment" state when it
is not yet `completed`, rather than asserting success from a query string.

---

### F14 — every order is born `fulfilment_state = 'paid'`, before any money moves · **MEDIUM**

**Status:** **FIXED · on main** (`20260908120300` / `20260908120400`, applied). The default is `awaiting_payment`, and moving INTO `paid` is privileged and needs a reason.

**Where:** `supabase/migrations/20260907100000_fulfilment_state_machine.sql:44`; `supabase/migrations/20260302120000_submit_registration_atomic.sql:264-279`.

**What happens.** The column is `NOT NULL DEFAULT 'paid'`, and the registration RPC does not name
it. So an order created at the moment the Pay button is pressed — before the gateway is even
opened, and for every abandoned attempt — sits in the fulfilment pipeline as **paid and awaiting
allocation**, while `orders.status` correctly says `pending`. Two columns, two contradictory
answers, and the fulfilment queues read the wrong one.

**What should happen.** The enum needs a pre-payment state (or the default should be the lowest
rung and payment should advance it). An unpaid order must not appear in a queue that tells staff
to ship a pendant.

---

### F15 — payment allocates a device but never advances `paid → allocated` · **MEDIUM**

**Status:** **FIXED · PR #253 (held).** `handleSuccessfulPayment` moves `awaiting_payment → paid` (naming the gateway payment) and then `→ allocated`, but only when every pendant on the order really got a device.

**Where:** `supabase/functions/_shared/post-payment.ts:120-140`; documented at `src/lib/allocatePendant.ts:14-19`.

**What happens.** On payment the code sets `devices.status = 'allocated'`, `devices.member_id`,
`reserved_order_id` and `order_items.device_id` — and leaves `orders.fulfilment_state` where it
was. The staff allocation path (`allocatePendant.ts`) does move it. So an order allocated by the
webhook shows as *not yet allocated*, with a device already assigned to it.

This one is known and deliberately deferred (the comment says the line "belongs in the webhook
path, which is why it is a SEPARATE PR that stays open for a human"). Recorded here for
completeness rather than as a discovery.

**What should happen.** One transition owner. Whichever way it is resolved, the state and the
device assignment must not be able to disagree.

---

### F16 — the registration fee shown can differ from the fee charged · **MEDIUM (money, cosmetic direction)**

**Status:** **FIXED for Stripe · PR #253 (held).** The charge is cross-checked against `orders.total_amount` and refuses with `ORDER_PRICING_CHANGED` rather than charging a figure no screen showed.

**Where:** `src/hooks/usePricingSettings.ts:45, 55-56, 64-65`; `supabase/functions/submit-registration/index.ts:219-235`.

**What happens.** Both sides read `registration_fee_enabled` / `registration_fee_discount`; the
browser reads them as `anon` and (per F2) gets nothing, then defaults:

```ts
registrationFeeEnabled: settingsMap.registration_fee_enabled !== "false",   // undefined → true
registrationFeeDiscount: parseFloat(settingsMap.registration_fee_discount || "0"),
```

The server reads the same rows with the service role and gets the real values. If Lee has
disabled the fee or set a discount, the customer is quoted €59.99 that the server does not
charge. The direction is in the customer's favour, so it is a wrong price rather than an
overcharge — but the total on the review screen is not the total taken.

**What should happen.** Whitelist those two keys for public read (they are already public
information on the pricing page), or serve the whole order preview from the server so one
calculation drives both the display and the charge.

---

### F17 — order numbers collide within the same second · **MEDIUM**

**Status:** **FIXED · on main** (`20260908120500_order_number_sequence.sql`, applied). A sequence cannot collide.

**Where:** `supabase/migrations/20260302120000_submit_registration_atomic.sql:261`; `supabase/migrations/20260121143325_...sql:132`.

**What happens.**

```sql
v_order_number := 'ICE-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT));
```

One-second resolution, and `orders.order_number` is `text UNIQUE NOT NULL`. Two registrations
completing in the same second → unique violation → the whole atomic RPC rolls back → the second
customer gets a 500 with no order, at the moment they were trying to pay.

**What should happen.** Add entropy (a sequence, or `gen_random_uuid()` fragment) or retry on
conflict. At current volumes it is unlikely; it is also entirely silent until it happens.

---

### F18 — the sale is reported to a second database from the browser, with a browser-computed amount · **MEDIUM**

**Status:** **OPEN.** `JoinWizard` still calls `reportEvent('new_sale', …)` with a browser-computed `totalPence`. Nothing on the money path depends on it, which is why it is not a blocker — but the figure in Sync Hub is not the figure charged.

**Where:** `src/pages/join/JoinWizard.tsx:133-155`; `src/lib/syncHub.ts:13-21, 36-38, 99`.

**What happens.** On return from the gateway the browser recomputes the order from
`localStorage` and posts `new_sale` with that amount — plus a `revenuePence` daily-metrics
upsert — to a *different* Supabase project (`VITE_SYNCHUB_*`). This is a revenue figure that:

* is computed client-side, not from the order that was actually charged;
* fires on the URL, so it fires for the fake-success case in F13 and again on every refresh
  before `localStorage` is cleared;
* does not fire at all when the member closes the tab at the gateway, even though the payment and
  webhook may have completed.

**What should happen.** Report revenue from `post-payment.ts` (server-side, from the order), or
accept the number as indicative and label it as such wherever it is displayed.

---

### F19 — CORS admits any `*.vercel.app` origin · **MEDIUM (security)**

**Status:** **OPEN.** The `^https://[\w-]+\.vercel\.app$` pattern is still in `supabase/functions/_shared/cors.ts`.

**Where:** `supabase/functions/_shared/cors.ts:9-12`.

```ts
const ALLOWED_ORIGIN_PATTERNS = [ /^https:\/\/[\w-]+\.vercel\.app$/, /^http:\/\/localhost:\d+$/ ];
```

Any page hosted on anybody's `*.vercel.app` deployment can call every one of these functions from
a victim's browser. Combined with `verify_jwt = false` on the whole checkout path, CORS is the
only browser-side gate and it is open to a public hosting namespace. (CORS never stops `curl`;
this is about what a third-party *page* can do.)

**What should happen.** Match the specific preview project (or a `VERCEL_URL`-derived origin),
not the whole namespace.

---

### F20 — "staff aware a sale happened" depends on four production settings, and fails silently · **MEDIUM**

**Status:** **PARTIALLY FIXED · PR #253 (held).** The FAILURE cases now raise targeted admin notifications in `notification_log` — amount mismatch, a subscription that did not activate, a failed renewal, a cancellation — which need no production secret. The `sale.paid` success path still goes through `notify-admin` and still depends on those four settings.

**Where:** `supabase/functions/_shared/post-payment.ts:217-248`; `supabase/functions/notify-admin/index.ts:227-253, 278-280, 341-352, 387`.

**What happens.** The only push is a WhatsApp message via `notify-admin`, which needs *all* of:

1. `settings_twilio_account_sid`, 2. an auth token or API-key secret,
3. `settings_twilio_whatsapp_number`, 4. a `notification_settings` row with
`whatsapp_paid_sales = true` **and** a `whatsapp_number` to send to.

Any one missing → `return 200 {"error":"Twilio not configured","sent":false}` (`:249-253`) or a
quiet skip (`:341`). `post-payment.ts` wraps the call in `try/catch` and only
`console.error`s. There is **no** in-app staff notification and **no** staff email on a sale; the
durable trace is a `crm_events` / `ai_events` row and the order itself.

**What should happen.** At minimum insert a staff-visible notification row (the same table the
admin bell reads) so the sale is on a screen regardless of Twilio; and let a failed notification
be visible somewhere other than function logs.

---

### F21 — `settings_mollie_webhook_secret` is read by no code, while a migration says payments cannot be verified without it · **LOW**

**Status:** **OPEN.** Part of the Mollie pass.

**Where:** `supabase/migrations/20260902160000_payment_gateway_mollie.sql:67-69` and its `RAISE NOTICE`; no reader anywhere in `supabase/functions/`.

**What happens.** The migration warns: *"settings_mollie_webhook_secret is empty. Payments would
complete at Mollie but the webhook could not be verified, so NO MEMBER WOULD ACTIVATE."* No
function reads that setting. The Mollie webhook authenticates instead by re-fetching the payment
from Mollie's API (`mollie-webhook:112`), which is Mollie's documented pattern and is sound. So
the warning points at a control that does not exist, and someone acting on it will set a row that
changes nothing.

**What should happen.** Delete the setting and the notice, or implement the check. A warning about
a non-existent control costs attention the next real warning needs.

---

### F22 — anonymous clients may INSERT into `registration_drafts` directly · **LOW**

**Status:** **FIXED · on main** (`20260228100000_fix_permissive_rls_policies.sql`).

**Where:** `supabase/migrations/20260121182221_...sql:29-33`; edge function at `supabase/functions/save-registration-draft/index.ts:53-56`.

**What happens.** `CREATE POLICY "Anyone can insert drafts" ... FOR INSERT WITH CHECK (true)` —
no `TO` clause, so `anon` included. The app writes drafts through an edge function (service role),
so the policy is not needed; while it exists, anyone can write unbounded PII rows into the table
with no rate limit at the database level. Reads are staff-only (`:41-45`), and UPDATE was
correctly scoped to the session header in `20260228100000:22-27` — INSERT was left as `true`.

**What should happen.** Drop the anon INSERT policy, since the function that needs it uses the
service role.

---

### F23 — `ai_agents` is readable by anonymous visitors · **LOW**

**Status:** **FIXED · on main** (`20260203185605`, which drops the "Public can view enabled agents" policy).

**Where:** `supabase/migrations/20260203185605_...sql:7-10`.

`CREATE POLICY "Public can view minimal agent info" ON public.ai_agents FOR SELECT USING (enabled = true)`
— no `TO` clause and no column restriction, so `anon` reads `agent_key`, `name`, `description`,
`mode` and `instance_count`. The sensitive material (`system_instruction`, `tool_policy`,
`read_permissions`) is in `ai_agent_configs`, a different table, so the leak is limited to
configuration trivia. The migration's own comment concedes the column restriction is only
"handled via application code".

---

## What only Lee can verify in production

Code cannot answer these. Exact queries and clicks:

**1. Which gateway is live, and can the browser see it**

```sql
select key, value from public.system_settings
 where key in ('settings_active_payment_gateway',
               'registration_fee_enabled',
               'registration_fee_discount',
               'registration_test_mode_enabled');
```

Then confirm F2 from the customer's side — in a **private window, logged out**, open the browser
console on `https://icealarm.es/join` and check whether the `system_settings` request returns rows
for `settings_active_payment_gateway`. If it returns `[]`, F2 is live.

**2. Is test mode on** — if this returns `true`, *every* registration is minted as fully paid with
no money collected (`submit-registration:277`, RPC `:474-500`), regardless of the hidden button:

```sql
select value from public.system_settings where key = 'registration_test_mode_enabled';
```

**3. Are the payment secrets present, and who can read them**

```sql
select key, (value is not null and value <> '') as is_set
  from public.system_settings
 where key like 'settings_stripe%' or key like 'settings_mollie%';

-- how many accounts can read them (F12):
select count(*) from public.staff where is_active = true;
```

**4. Email transport** — F1/F6 mean nothing has been sent yet, but before go-live:

```sql
select provider, from_email, reply_to_email from public.email_settings limit 1;
```

Supabase → Project → Edge Functions → Secrets: is `GMAIL_APP_PASSWORD` set (if provider is
`gmail`), or `RESEND_API_KEY` set **and** `icealarm.es` verified in Resend with DKIM/SPF aligned
(if provider is `resend`)?

**5. Staff notification of a sale (F20)**

```sql
select key, (value is not null and value <> '') as is_set
  from public.system_settings
 where key in ('settings_twilio_account_sid','settings_twilio_auth_token',
               'settings_twilio_api_key_secret','settings_twilio_whatsapp_number');

select whatsapp_paid_sales, whatsapp_number from public.notification_settings;
```

**6. Stripe dashboard** — Developers → Webhooks: is there an endpoint pointing at
`https<project>.supabase.co/functions/v1/stripe-webhook`, which events is it subscribed to
(`checkout.session.completed` is the only one that matters here), and does its signing secret
match `settings_stripe_webhook_secret`? Also Products: confirm there is **no** recurring price —
F11 says there is nothing to find, and its absence is the finding.

**7. Mollie dashboard** — Developers → Webhooks / the API key in use: confirm the webhook URL
points at `functions/v1/mollie-webhook`, and check Payments for any payment whose status reached
`paid` while its `orders.status` is still `pending`:

```sql
select o.order_number, o.status, o.fulfilment_state, p.status as payment_status,
       p.amount, o.total_amount, s.status as subscription_status, m.status as member_status,
       m.user_id is not null as has_login
  from public.orders o
  join public.payments p on p.order_id = o.id
  join public.members  m on m.id = o.member_id
  left join public.subscriptions s on s.member_id = m.id
 order by o.created_at desc
 limit 50;
```

Any row with `payment_status = 'completed'` and `subscription_status = 'pending'` is F5; any with
`has_login = false` is F4; any `fulfilment_state = 'paid'` with `status = 'pending'` is F14.

**8. Deployed function versions** — Supabase → Edge Functions: confirm the deployed
`submit-registration`, `create-checkout`, `stripe-webhook`, `create-mollie-checkout` and
`mollie-webhook` match this commit. Every finding above is read from `main`; a stale deploy could
be better or worse than the code.

**9. Whether anyone has already tried to join**

```sql
select count(*) as drafts_started,
       count(*) filter (where email is not null) as with_email
  from public.registration_drafts;

select count(*) from public.orders;   -- 0 would be consistent with F1 blocking everything
```

If `registration_drafts` has rows but `orders` has none, F1 has been turning real visitors away.
