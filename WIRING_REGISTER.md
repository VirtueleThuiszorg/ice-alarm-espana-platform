# WIRING REGISTER

Every connection out of this application, where it actually goes, who finds out, and
whether anything would go red if it broke.

> Lee sent a message from the public Contact page and found nothing in Communications,
> Messages or notifications. It had gone to the `leads` table and nobody was told. This
> register exists so that is a known fact about every control on every page rather than
> something discovered one at a time.

**GENERATED FILE — do not edit.** `node scripts/wiring/build.mjs` rebuilds it from the
code plus `scripts/wiring/annotations.mjs`. CI regenerates and diffs, so the register in
main cannot drift from the code in main. To change a row, change the wire or the annotation.

## Score distribution

```
10 │   8  ███
 9 │   6  ██
 8 │   0  
 7 │  33  █████████████
 6 │  10  ████
 5 │  84  ██████████████████████████████████
 4 │  49  ████████████████████
 3 │   0  
 2 │   0  
 1 │   0  
 0 │   1  
```

191 distinct wires across 653 call sites and 110 routes.

| band | meaning | wires | share |
|---|---|---:|---:|
| 10 | fully wired — arrives, right person told on a live channel, failure shown, proof that goes red | 8 | 4% |
| 7–9 | arrives and proven; notification missing or on a channel not live today | 39 | 20% |
| 4–6 | arrives; nobody told; nothing proves it | 143 | 75% |
| 1–3 | fails, fails silently, or lands where nobody looks | 0 | 0% |
| 0 | dead control | 1 | 1% |

### How to read a low score

Most of this platform's wires **arrive**. What almost none of them have is a proof that
would go red if they stopped arriving, and that alone caps a row at 6 — deliberately, and
without rounding up. A screen full of buttons that all work today scores 5 because nothing
would tell anyone the day one of them stops. The rubric is applied by
`scripts/wiring/score.mjs`, not by judgement per row.

Two rules do the most work:

1. **No proof, no score above 6.** A test that names the table is not a proof; `proof`
   holds a test read and confirmed to exercise client → destination → visible.
2. **Only the bell counts as a channel live today.** `notification_log` is published to
   `supabase_realtime` and needs no secret, so it is provably live from the repo. Email,
   SMS and WhatsApp all return "not configured" without a production secret this repo
   cannot read — so they cap at 8 and appear in *Only Lee can verify* below.

## Method

Wires are **derived from the source**, not walked by hand — a hand-walked list misses the
control someone adds next week. Every exit from this app is one of these eight syntactic
things, and a control with no wire cannot do anything:

| kind | what it is | call sites |
|---|---|---:|
| `table` | `supabase.from(t).insert/update/upsert/delete` — a row written | 347 |
| `fn` | `supabase.functions.invoke(f)` — an edge function | 87 |
| `rpc` | `supabase.rpc(f)` — a SQL function | 5 |
| `channel` | `postgres_changes` — a realtime subscription | 51 |
| `auth` | `supabase.auth.*` — sign in, sign out, register, password reset | 20 |
| `storage` | `supabase.storage.from(b).upload/remove/…` — a file put somewhere | 14 |
| `link` | `mailto:` / `tel:` / `wa.me` — a hand-off off the platform | 65 |
| `open` | `window.open` / `window.location` — the SPA being left | 64 |

Routes come from an import graph over `src/App.tsx`, so a wire in a shared hook is
attributed to every page that can reach it, and a wire in a **layout** (the notification
bell lives in the headers, not in any page) is attributed to every route in its group.

Three facts are checked against the real schema rather than by grep — the migration set is
applied to a throwaway PostgreSQL and queried:

- **realtime publication membership** — 28 tables are in `supabase_realtime`; a
  `postgres_changes` subscription on a table outside it is a **dead control**, and five were
  found this way;
- **RLS** — every table in `public` has row-level security enabled (golden rule 2 holds);
- **triggers** — **no** database function anywhere writes `notification_log`, which is why
  "who is told" is only ever true where client code or an edge function says so explicitly.

`failure shown` is derived too: a `toast.error`, an inline error, or a throw inside a
react-query mutation. A bare `console.error` does **not** count — that is the definition of
failing silently, and it is exactly what the contact form did.

## Admin-audience events that write nowhere

The register above answers *who is told* for every wire that EXISTS. It cannot answer it
for something that never happens — and that is the more dangerous half, because a
notification nobody wrote looks exactly like a notification nobody needed. The bell is
fine as a reader; what is missing is on the other side of it.

Each row below is a claim about an ABSENCE, and each carries a check that this generator
verifies — so the build FAILS if one of these has since been wired, naming the file. A
fixed item cannot sit here looking broken, and a broken item cannot be quietly dropped.

| # | event | who should be told | what happens today | owner |
|---|---|---|---|---|
| **A1** | Every `ai_events` row — including `sale.paid` | admin / owner — Isabella's Boss & Owner Intelligence switches do what their labels say: a new sale, a cancellation, a failed payment, the daily briefing, the weekly revenue summary, a negative-feedback alert | `ai-dispatch-events` is the only consumer of `ai_events`, and NOTHING INVOKES IT — no client call, no cron schedule, no trigger. `post-payment.ts` writes a `sale.paid` row on every paid order and it is read by nobody; `ai-run` and `ai-execute-action` write more. So all seven owner-intelligence switches in `isabella_settings` can be turned ON and produce nothing at all, which is the same shape of defect as the Isabella status banner reading ACTIVE off a switch (item 1). Worth knowing before it is wired: `supabase/config.toml` sets `verify_jwt = false` on it, so the endpoint is PUBLIC — whoever gives it a caller has to give it auth in the same PR | the wiring session |
| **A5** | A price was edited without syncing it to Stripe | admin (super_admin) — the person who changed the price is told it is not live yet. Until the sync runs, every screen shows the new figure and Stripe would charge the old one | nothing watches for it. `send-payment-link` REFUSES at the point of use (`PRICE_STALE`, item 4) and the pricing editor shows drift when it is open, but no notification is raised — so the first person to find out is a customer or the staff member trying to send them a link | the wiring session |
| **A6** | An order sits in `awaiting_payment` — the checkout was abandoned | staff — somebody chases it. The state exists precisely so an unpaid order is distinguishable (F14, `20260908120400`), and a staff-sent payment link (item 4) creates one every time | nothing sweeps the state and nothing is raised when an order stays in it. The fulfilment dispatcher covers the edges FROM `paid` onwards; the edge into `awaiting_payment` has no audience at all | the wiring session |

The checks, verified on every build:

- **A1** — `ai-dispatch-events` appears nowhere in src, supabase/functions, supabase/migrations, .github/workflows. an invocation anywhere — invoke(), fetch, cron.schedule — would make this row false
- **A5** — `stripe_prices` and `notification_log|notify-admin|notifyAdmins` never appear within 4000 characters of each other in the same file (supabase/functions, supabase/migrations). a notifier that reads stripe_prices would make this row false
- **A6** — `awaiting_payment` and `notification_log|notify-admin|notifyAdmins` never appear within 4000 characters of each other in the same file (supabase/functions, supabase/migrations). a sweep or a trigger raising the bell for this state would make this row false

## The register

### Public & marketing

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 13 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 2 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 2 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **7** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 8 |
| **10** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Your enquiry has reached the team and someone will come back to you… if the matter is urgent please call the number above instead.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads, and unworked ones on the call-centre dashboard | bell | inline | `scripts/rls/wiring.sql` | 4 |

### Join & auth

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **5** | `auth:resetPasswordForEmail` | Forgot password → email link → set a new one — we will email you a link to get back in | resetPasswordForEmail sends via GoTrue's own mailer; the link returns to /reset-password, where updateUser sets the password | email | toast | none | 1 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signInWithPassword` | Sign in — /login (member), /staff/login, /partner/login — your password gets you into your account | supabase.auth.signInWithPassword → GoTrue; the session then decides every ProtectedRoute | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `auth:updateUser` | Forgot password → email link → set a new one — we will email you a link to get back in | resetPasswordForEmail sends via GoTrue's own mailer; the link returns to /reset-password, where updateUser sets the password | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 13 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **7** | `fn:join-order-status` | /join?success — the confirmation screen, polling for the webhook — your payment is confirmed, and here is the one thing still to do | join-order-status, keyed on the Stripe Checkout Session id (never the order number, which is sequential) → the member's second-stage link and the 24-hour number | screen | — | `src/test/joinOrderPolling.test.tsx` | 1 |
| **7** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **9** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4) | bell | — | `src/test/createCheckoutContract.test.ts` | 1 |
| **10** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4) | bell | toast | `src/test/createCheckoutContract.test.ts` | 1 |
| **10** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4) | bell | inline | `src/test/createCheckoutContract.test.ts` | 1 |
| **10** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4) | bell | inline | `src/test/createCheckoutContract.test.ts` | 1 |
| **10** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4) | bell | inline | `src/test/createCheckoutContract.test.ts` | 1 |

### Member dashboard

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 8 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 4 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 11 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 2 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 2 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 2 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 8 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 7 |

### Call centre

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 4 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 8 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 4 |
| **4** | `fn:send-email` | Email a member from their record (MemberQuickContact); billing reminder emails (useBillingReminders) — an operator can email the member from the record, and it is on their history afterwards | send-email edge function → Resend; a member_interactions row either way | email | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 4 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 4 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 10 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 2 |
| **4** | `table:member_interactions` | Communication log — the SMS / WhatsApp / Email / Log Call controls on the member record (MemberQuickContact), through logSms / logWhatsApp / logEmail / logInteraction — a member's contact history is on their record | member_interactions — read by ActivityTab and by the call-centre alert panel | screen | — | none | 1 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 3 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 11 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 1 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 2 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 4 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 13 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 4 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 2 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 2 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **7** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | screen | — | `scripts/rls/wiring.sql` | 1 |
| **7** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | screen | — | `scripts/rls/wiring.sql` | 1 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `fn:save-api-keys` | Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device — your credentials work | save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push | self | toast | `src/test/firebaseConfig.test.ts` | 5 |
| **7** | `fn:send-payment-link` | Staff send a member a Stripe payment link (CRM → member → Subscription) — a real Stripe Checkout link for a chosen plan, sent by SMS and email where those are switched on, and always shown on screen to copy | send-payment-link → create_payment_link_order (pending order + items + subscription + payment, one transaction) → Stripe Checkout Session (mode: subscription) → twilio-sms and/or send-email; activation is stripe-webhook's alone | the payer (SMS + email), and activity_logs twice — the order created, and what was sent | mutation onError | `src/test/sendPaymentLink.test.ts` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **7** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | mutation onError | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:staff_push_tokens` | "Enable notifications on this phone" — Admin → Settings → Notifications, and Staff preferences — an alert reaches you when this page is closed | staff_push_tokens, one row per device keyed on the FCM registration token; read by the notify-staff router's push transport (_shared/fcm.ts) and pruned by it when Google says a token is dead | push | toast | `src/test/pushClient.test.ts` | 1 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 8 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 7 |
| **10** | `rpc:apply_shift_swap` | Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it — the person being asked finds out, both people find out when it is approved, and the rota actually moves | staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction | bell | toast | `src/test/shiftSwaps.test.tsx` | 1 |
| **10** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Your enquiry has reached the team and someone will come back to you… if the matter is urgent please call the number above instead.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads, and unworked ones on the call-centre dashboard | bell | inline | `scripts/rls/wiring.sql` | 4 |
| **10** | `table:staff_shift_swaps` | Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it — the person being asked finds out, both people find out when it is approved, and the rota actually moves | staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction | bell | toast | `src/test/shiftSwaps.test.tsx` | 1 |

### Admin

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 4 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 1 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:send-email` | Email a member from their record (MemberQuickContact); billing reminder emails (useBillingReminders) — an operator can email the member from the record, and it is on their history afterwards | send-email edge function → Resend; a member_interactions row either way | email | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 5 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 4 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 4 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 10 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 2 |
| **4** | `table:member_interactions` | Communication log — the SMS / WhatsApp / Email / Log Call controls on the member record (MemberQuickContact), through logSms / logWhatsApp / logEmail / logInteraction — a member's contact history is on their record | member_interactions — read by ActivityTab and by the call-centre alert panel | screen | — | none | 1 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 3 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 11 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 2 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 4 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 13 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `storage:ai-agent-avatars` | Upload a website image, a staff document, a post image, a partner presentation, an agent avatar — the file is saved and will show where you put it | Supabase Storage buckets of those names | self | — | none | 1 |
| **5** | `storage:website-images` | Upload a website image, a staff document, a post image, a partner presentation, an agent avatar — the file is saved and will show where you put it | Supabase Storage buckets of those names | self | — | none | 2 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 2 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 3 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 4 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `storage:social-post-images` | Upload a website image, a staff document, a post image, a partner presentation, an agent avatar — the file is saved and will show where you put it | Supabase Storage buckets of those names | self | toast | none | 1 |
| **6** | `storage:staff-documents` | Upload a website image, a staff document, a post image, a partner presentation, an agent avatar — the file is saved and will show where you put it | Supabase Storage buckets of those names | self | mutation onError | none | 1 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 2 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 2 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **7** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | screen | toast | `scripts/rls/wiring.sql` | 1 |
| **7** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | screen | mutation onError | `scripts/rls/wiring.sql` | 1 |
| **7** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | screen | mutation onError | `scripts/rls/wiring.sql` | 1 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `fn:notify-staff` | Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification" — the person who needs to know is told, on a channel that works | notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value. | screen | toast | `src/test/notificationMatrix.test.ts` | 2 |
| **7** | `fn:save-api-keys` | Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device — your credentials work | save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push | self | toast | `src/test/firebaseConfig.test.ts` | 5 |
| **7** | `fn:send-payment-link` | Staff send a member a Stripe payment link (CRM → member → Subscription) — a real Stripe Checkout link for a chosen plan, sent by SMS and email where those are switched on, and always shown on screen to copy | send-payment-link → create_payment_link_order (pending order + items + subscription + payment, one transaction) → Stripe Checkout Session (mode: subscription) → twilio-sms and/or send-email; activation is stripe-webhook's alone | the payer (SMS + email), and activity_logs twice — the order created, and what was sent | mutation onError | `src/test/sendPaymentLink.test.ts` | 1 |
| **7** | `fn:send-test-email` | Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device — your credentials work | save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push | self | toast | `src/test/firebaseConfig.test.ts` | 1 |
| **7** | `fn:test-twilio` | Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device — your credentials work | save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push | self | mutation onError | `src/test/firebaseConfig.test.ts` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **7** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | mutation onError | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:notification_routes` | Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification" — the person who needs to know is told, on a channel that works | notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value. | screen | toast | `src/test/notificationMatrix.test.ts` | 1 |
| **7** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | mutation onError | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 2 |
| **7** | `table:staff_notification_prefs` | Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification" — the person who needs to know is told, on a channel that works | notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value. | screen | toast | `src/test/notificationMatrix.test.ts` | 1 |
| **7** | `table:staff_push_tokens` | "Enable notifications on this phone" — Admin → Settings → Notifications, and Staff preferences — an alert reaches you when this page is closed | staff_push_tokens, one row per device keyed on the FCM registration token; read by the notify-staff router's push transport (_shared/fcm.ts) and pruned by it when Google says a token is dead | push | toast | `src/test/pushClient.test.ts` | 1 |
| **7** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 4 |
| **7** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | toast | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **7** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS — the change is saved and takes effect | the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value | self | — | `src/test/checkoutPaymentMethods.test.ts` | 1 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 8 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 7 |
| **10** | `rpc:apply_shift_swap` | Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it — the person being asked finds out, both people find out when it is approved, and the rota actually moves | staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction | bell | toast | `src/test/shiftSwaps.test.tsx` | 1 |
| **10** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Your enquiry has reached the team and someone will come back to you… if the matter is urgent please call the number above instead.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads, and unworked ones on the call-centre dashboard | bell | inline | `scripts/rls/wiring.sql` | 4 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 5 |
| **10** | `table:staff_shift_swaps` | Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it — the person being asked finds out, both people find out when it is approved, and the rota actually moves | staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction | bell | toast | `src/test/shiftSwaps.test.tsx` | 1 |

### Partner

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **5** | `auth:setSession` | Accept a staff or partner invite from an emailed link — this link makes your account real | auth.setSession with the tokens in the invite URL, then the *-complete-invite function | self | — | none | 3 |
| **5** | `auth:signInWithPassword` | Sign in — /login (member), /staff/login, /partner/login — your password gets you into your account | supabase.auth.signInWithPassword → GoTrue; the session then decides every ProtectedRoute | self | — | none | 3 |
| **5** | `auth:signOut` | Sign out — every header, plus the forced sign-out on a wrong-surface login — you are signed out | supabase.auth.signOut() | self | — | none | 6 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 2 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 13 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 19 |
| **5** | `open:window` | Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard — this takes you where it says | a new tab or a full navigation, out of the SPA | external | — | none | 34 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 1 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 1 |
| **6** | `storage:partner-presentations` | Upload a website image, a staff document, a post image, a partner presentation, an agent avatar — the file is saved and will show where you put it | Supabase Storage buckets of those names | self | toast | none | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 5 |

## Notes, worst first

### `auth:signUp` — 0/10 (dead control)

- **control** Self-service account creation on src/pages/auth/Register.tsx
- **promised** create an account
- **goes to** supabase.auth.signUp
- **who is told** self — the wire cannot fire at all
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** —
- **call sites** src/pages/auth/Register.tsx

UNREACHABLE. `Register.tsx` is imported by nothing and `/register` is a Navigate to /join, so the page cannot be opened — it is the only wire in the register with zero routes attributed by the import graph. Harmless while dead, and worth removing rather than leaving: it creates an account OUTSIDE the join wizard, so reviving it would be a route to a member record with no payment behind it, which is golden rule 4's whole subject. Reported, not deleted — removing a page is a product call.

### `channel:alert_escalations` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre/sos-alert
- **call sites** src/hooks/useSOSConference.ts

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:alerts` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/devices, /admin/ev07b, /call-centre, /call-centre/alerts, /call-centre/documents +15
- **call sites** src/components/call-centre/DeviceOfflineAlertsCard.tsx, src/components/layout/CallCentreSidebar.tsx, src/hooks/useAlerts.ts, src/hooks/useAlertsRealtime.ts +3

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:conference_participants` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre/sos-alert
- **call sites** src/hooks/useSOSConference.ts

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `channel:conference_rooms` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre/sos-alert
- **call sites** src/hooks/useSOSConference.ts

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `channel:conversations` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/messages, /call-centre/alerts, /call-centre/messages, /dashboard/messages, /dashboard/support
- **call sites** src/components/call-centre/MessagesPanel.tsx, src/pages/admin/MessagesPage.tsx, src/pages/call-centre/CallCentreDashboard.tsx, src/pages/call-centre/MessagesPage.tsx +2

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

`save_home_location` (2026-09-10) is on this wire too and does NOT ring the bell, deliberately: a member marking their own front door is not news anybody has to act on tonight, and it is on the record where it matters — the member row, the SOS card, and an activity_logs row naming who set it and whether it replaced an earlier pin. What is PROVEN of it is the write and the refusals (src/test/memberHomeLocationWrite.test.ts, scripts/rls/isolation.sql); what is not is the click-through, until the Playwright spec runs against a seeded member. So this row still scores as unproven, which is the honest answer.

### `channel:devices` — 4/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/devices, /admin/devices/:id, /admin/ev07b, /admin/members/:id, /call-centre +2
- **call sites** src/components/call-centre/DeviceIssuesQueue.tsx, src/components/call-centre/PendantLiveStatusModal.tsx, src/hooks/useDeviceRealtime.ts, src/hooks/useOpsRealtime.ts +1

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `channel:internal_tickets` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/tickets, /call-centre/tickets
- **call sites** src/pages/admin/TicketsPage.tsx

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `channel:isabella_assessment_notes` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals, /call-centre/holidays, /call-centre/leads +12
- **call sites** src/components/call-centre/sos/SOSAlertBar.tsx, src/hooks/useSOSConference.ts

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:leads` — 4/10 (arrives, unproven)

- **control** Leads list and dashboard leads widget — live arrival of a new enquiry
- **promised** a new enquiry appears without a reload
- **goes to** postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/leads, /call-centre, /call-centre/leads
- **call sites** src/components/call-centre/NewEnquiriesCard.tsx, src/components/dashboard/LeadsWidget.tsx, src/pages/admin/LeadsPage.tsx, src/pages/call-centre/LeadsPage.tsx

This subscription WORKS — leads is published and the refetch fires. It is also the reason the original defect was so easy to miss: the wire looks alive, because on a screen someone has open the lead really does appear. Nothing brought anyone TO that screen, which is the whole difference between a live list and being told. The bell notification now does that (see `table:leads`); this row stays `screen`, because that is all a subscription can ever be, however healthy it is.

### `channel:messages` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /admin/messages, /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals +16
- **call sites** src/components/admin/member-detail/MessagesTab.tsx, src/components/call-centre/MessagesPanel.tsx, src/components/layout/CallCentreSidebar.tsx, src/pages/admin/MessagesPage.tsx +4

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

`save_home_location` (2026-09-10) is on this wire too and does NOT ring the bell, deliberately: a member marking their own front door is not news anybody has to act on tonight, and it is on the record where it matters — the member row, the SOS card, and an activity_logs row naming who set it and whether it replaced an earlier pin. What is PROVEN of it is the write and the refusals (src/test/memberHomeLocationWrite.test.ts, scripts/rls/isolation.sql); what is not is the click-through, until the Playwright spec runs against a seeded member. So this row still scores as unproven, which is the honest answer.

### `channel:outreach_raw_leads` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `channel:ticket_comments` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/tickets, /call-centre/tickets
- **call sites** src/pages/admin/TicketsPage.tsx

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `channel:video_exports` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoExports.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `channel:video_renders` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoRenders.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `fn:facebook-metrics` — 4/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/usePublishedPosts.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:member-self-service` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify, mark-read and home-location calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff, mark_read, save_medical_info and save_home_location
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /admin/messages, /call-centre/alerts, /call-centre/members/:id, /call-centre/messages, /dashboard +8
- **call sites** src/components/maps/SetHomeLocationDialog.tsx, src/hooks/useFeedback.ts, src/pages/client/MedicalInfoPage.tsx, src/utils/notifications.ts

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

`save_home_location` (2026-09-10) is on this wire too and does NOT ring the bell, deliberately: a member marking their own front door is not news anybody has to act on tonight, and it is on the record where it matters — the member row, the SOS card, and an activity_logs row naming who set it and whether it replaced an earlier pin. What is PROVEN of it is the write and the refusals (src/test/memberHomeLocationWrite.test.ts, scripts/rls/isolation.sql); what is not is the click-through, until the Playwright spec runs against a seeded member. So this row still scores as unproven, which is the honest answer.

### `fn:partner-admin-create` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/partners/new
- **call sites** src/pages/admin/AddPartnerPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-complete-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /partner/invite
- **call sites** src/pages/partner/PartnerInvitePage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-send-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /partner-dashboard, /partner-dashboard/invites
- **call sites** src/components/partner/CareDashboard.tsx, src/pages/partner/PartnerInvitesPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-validate-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /partner/invite
- **call sites** src/pages/partner/PartnerInvitePage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:process-commissions` — 4/10 (arrives, unproven)

- **control** Run the commission calculation
- **promised** partners are paid what they earned
- **goes to** process-commissions → partner_commissions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/commissions, /admin/partners-qa
- **call sites** src/pages/admin/CommissionsPage.tsx, src/pages/admin/PartnersQAPage.tsx

Money. Nobody is told it ran, or that it failed, and there is no test. A red in the report.

### `fn:send-email` — 4/10 (arrives, unproven)

- **control** Email a member from their record (MemberQuickContact); billing reminder emails (useBillingReminders)
- **promised** an operator can email the member from the record, and it is on their history afterwards
- **goes to** send-email edge function → Resend; a member_interactions row either way
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/MemberQuickContact.tsx, src/hooks/useBillingReminders.ts

NO LONGER DEAD ON THE FIRST HALF. The Messages tab's Email button was `toast.info("Email integration coming soon")` and now calls this function with `module: member` and the member as the related entity, logging the result. THE SECOND HALF IS STILL DEAD: `src/hooks/useBillingReminders.ts` is imported by nothing except a test — no page, no layout, no other hook — and there is no server-side twin (no cron, no migration, no edge function that sends billing reminders), so no billing reminder has ever been sent from this app. Reported, not fixed: whether members are chased automatically is a business decision, and it touches billing.

### `fn:sos-alert-resolve` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/alerts, /admin/ev07b, /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals +14
- **call sites** src/lib/alertResolution.ts

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `fn:sos-conference-join` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre/sos-alert
- **call sites** src/hooks/useSOSConference.ts

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:sos-conference-leave` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre/sos-alert
- **call sites** src/hooks/useSOSConference.ts

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:sos-drill` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/alerts
- **call sites** src/lib/sosDrill.ts

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `fn:staff-complete-invite` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /staff/invite
- **call sites** src/pages/staff/StaffInvitePage.tsx

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:staff-validate-invite` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /staff/invite
- **call sites** src/pages/staff/StaffInvitePage.tsx

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:track-invite-view` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /
- **call sites** src/pages/LandingPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:twilio-call-me` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/components/chat/CallMeModal.tsx

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:twilio-token` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals, /call-centre/holidays, /call-centre/leads +12
- **call sites** src/hooks/useTwilioDevice.ts

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:validate-member-update-token` — 4/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /member-update
- **call sites** src/pages/MemberUpdatePage.tsx

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:video-render-queue` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/communications, /admin/video-hub
- **call sites** src/components/admin/video-hub/RenderVariantButtons.tsx, src/components/admin/video-hub/VideoCreateTab.tsx, src/components/admin/video-hub/VideoProjectsTab.tsx, src/hooks/useFailedActions.ts +1

Renders and exports are both published, and the webhook notifies. Unproven.

### `link:wa.me` — 4/10 (arrives, unproven)

- **control** WhatsApp hand-off and outbound WhatsApp
- **promised** message them on WhatsApp
- **goes to** wa.me deep link; twilio-whatsapp for outbound
- **who is told** whatsapp
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin/members/:id, /call-centre/alerts, /call-centre/members/:id, /dashboard, /dashboard/device +8
- **call sites** src/components/admin/member-detail/MemberQuickContact.tsx, src/components/call-centre/MemberQuickSearch.tsx, src/components/client/NotificationPreferences.tsx, src/components/partner/ShareContentSection.tsx +9

Deep link always works; the outbound function returns “Twilio not configured” when the secret is absent, which is a production question.

### `table:ai_events` — 4/10 (arrives, unproven)

- **control** Isabella actions and observations
- **promised** what the assistant did is on the record
- **goes to** ai_events (published to supabase_realtime)
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/holidays, /admin/rota, /call-centre, /call-centre/alerts, /call-centre/documents +15
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx, src/hooks/useShiftCovers.ts, src/hooks/useStaffHolidays.ts, src/hooks/useStaffShifts.ts

Some ai_events call sites sit beside notifyUsers; the log row itself is for humans to audit later.

### `table:alerts` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/alerts, /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals, /call-centre/holidays +13
- **call sites** src/components/call-centre/sos/SOSActionPanel.tsx, src/hooks/useAlerts.ts, src/lib/alertOwnership.ts, src/pages/admin/AlertsPage.tsx

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `table:devices` — 4/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import, /admin/devices, /admin/devices/:id, /admin/ev07b, /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/devices/DeviceManagementModeToggle.tsx, src/components/admin/member-detail/DeviceTab.tsx, src/components/admin/products/BulkImeiImportModal.tsx, src/hooks/useDeviceProvisioning.ts +6

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `table:internal_tickets` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/tickets, /call-centre/tickets
- **call sites** src/hooks/useAgentHandoff.ts, src/pages/admin/TicketsPage.tsx

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:member_interactions` — 4/10 (arrives, unproven)

- **control** Communication log — the SMS / WhatsApp / Email / Log Call controls on the member record (MemberQuickContact), through logSms / logWhatsApp / logEmail / logInteraction
- **promised** a member's contact history is on their record
- **goes to** member_interactions — read by ActivityTab and by the call-centre alert panel
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/lib/communicationLogger.ts

NOT DEAD ANY MORE, and the fix was the same change that fixed the four controls. `src/lib/communicationLogger.ts` exported ten log functions and was imported by NOTHING, while `ActivityTab.tsx` and `AlertDetailPanel.tsx` both READ member_interactions — two screens that could only ever be empty, with no hint that the writer had never been wired up. `MemberQuickContact` is its first caller: every text, WhatsApp handoff, email and logged call from the record now writes a row those two screens can show. STILL UNWIRED: the alert, payment, profile and device helpers in the same module. Which events deserve a row is a product decision, and one of those readers is on the alert path.

### `table:order_items` — 4/10 (arrives, unproven)

- **control** Staff move an order through fulfilment; add or remove an order line
- **promised** the order says where the device actually is
- **goes to** orders / order_items
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/devices/:id, /admin/members/:id, /call-centre/members/:id
- **call sites** src/lib/allocatePendant.ts

Split from `fn:notify-fulfilment`, which was carrying these two rows on its proof. That suite proves the FAN-OUT decides correctly; it does not prove a staff edit to an order reaches the table and shows on the screen. Different wire, so no proof.

### `table:orders` — 4/10 (arrives, unproven)

- **control** Staff move an order through fulfilment; add or remove an order line
- **promised** the order says where the device actually is
- **goes to** orders / order_items
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/devices/:id, /admin/members/:id, /admin/orders, /call-centre/members/:id
- **call sites** src/hooks/useFulfilmentState.ts, src/hooks/useOrderActions.ts, src/lib/allocatePendant.ts

Split from `fn:notify-fulfilment`, which was carrying these two rows on its proof. That suite proves the FAN-OUT decides correctly; it does not prove a staff edit to an order reaches the table and shows on the screen. Different wire, so no proof.

### `table:outreach_campaigns` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachCampaigns.ts, src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_daily_usage` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachCaps.ts, src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_email_drafts` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/ai-outreach, /admin/communications
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx, src/hooks/useFailedActions.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:partner_commissions` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/commissions, /admin/members/:id, /admin/orders, /admin/partners/:id, /call-centre/members/:id
- **call sites** src/hooks/useOrderActions.ts, src/pages/admin/CommissionsPage.tsx, src/pages/admin/PartnerDetailPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_invites` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /admin/orders, /call-centre/members/:id, /partner-dashboard, /partner-dashboard/invites
- **call sites** src/components/partner/CareDashboard.tsx, src/hooks/useOrderActions.ts, src/pages/partner/PartnerInvitesPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:social_posts` — 4/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/communications, /admin/media-manager, /partner-dashboard, /partner-dashboard/marketing
- **call sites** src/hooks/useFailedActions.ts, src/hooks/usePartnerPostLinks.ts, src/hooks/useSocialPosts.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:staff` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/members/:id, /admin/settings, /admin/staff, /admin/staff/:staffId, /call-centre +18
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx, src/components/admin/member-detail/MessagesTab.tsx, src/components/admin/member-detail/NotesTab.tsx, src/components/call-centre/AlertDetailPanel.tsx +7

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_presence` — 4/10 (arrives, unproven)

- **control** Write a handover note; go on/off duty
- **promised** the next shift knows what happened
- **goes to** shift_notes / staff_presence
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre, /call-centre/alerts, /call-centre/documents, /call-centre/holiday-approvals, /call-centre/holidays, /call-centre/leads +12
- **call sites** src/hooks/useStaffHeartbeat.ts

See channel:shift_notes — the note lands, the live update does not.

### `auth:resetPasswordForEmail` — 5/10 (arrives, unproven)

- **control** Forgot password → email link → set a new one
- **promised** we will email you a link to get back in
- **goes to** resetPasswordForEmail sends via GoTrue's own mailer; the link returns to /reset-password, where updateUser sets the password
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /forgot-password
- **call sites** src/pages/auth/ForgotPassword.tsx

THE MOST CONSEQUENTIAL EMAIL IN THE PRODUCT, and the register was not asking about it. If GoTrue's SMTP is unconfigured or its redirect is wrong, the user sees a success message and no email ever arrives — the contact-form failure shape exactly, on the path someone locked out of a life-safety account has to use. `RecoveryRedirect` in App.tsx also has a 10-second fallback that navigates to /reset-password whether or not PASSWORD_RECOVERY fired, so a broken token lands on the form rather than on an error. Cannot be settled from the repo — it is a Supabase Auth setting, and it is in the list for Lee.

### `auth:setSession` — 5/10 (arrives, unproven)

- **control** Accept a staff or partner invite from an emailed link
- **promised** this link makes your account real
- **goes to** auth.setSession with the tokens in the invite URL, then the *-complete-invite function
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +104
- **call sites** src/lib/authSessionSync.ts, src/pages/partner/PartnerInvitePage.tsx, src/pages/staff/StaffInvitePage.tsx

Golden rule 3 lives near here: an invite establishes a session, and the ROLE must still come from the trigger/admin path rather than from anything in the link. Nothing here writes a role.

### `auth:signInWithPassword` — 5/10 (arrives, unproven)

- **control** Sign in — /login (member), /staff/login, /partner/login
- **promised** your password gets you into your account
- **goes to** supabase.auth.signInWithPassword → GoTrue; the session then decides every ProtectedRoute
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /login, /partner/login, /staff/login
- **call sites** src/pages/auth/Login.tsx, src/pages/auth/StaffLogin.tsx, src/pages/partner/PartnerLogin.tsx

The front door, on three surfaces. Nothing in the repo proves a member can actually get in: `partnerJourney.spec.ts` drives the partner login in a browser but stubs Supabase, so it proves the form and the routing, not the credential exchange. Whether sign-in works in production is a click, and it is in the list for Lee.

### `auth:signOut` — 5/10 (arrives, unproven)

- **control** Sign out — every header, plus the forced sign-out on a wrong-surface login
- **promised** you are signed out
- **goes to** supabase.auth.signOut()
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +104
- **call sites** src/components/layout/AdminHeader.tsx, src/components/layout/ClientLayout.tsx, src/contexts/AuthContext.tsx, src/pages/auth/ResetPassword.tsx +2

Present on every route because it lives in the layouts and in AuthContext. StaffLogin and PartnerLogin also call it deliberately: signing in on the wrong surface signs you back out rather than leaving a half-authorised session. That is the right behaviour and it is untested.

### `auth:updateUser` — 5/10 (arrives, unproven)

- **control** Forgot password → email link → set a new one
- **promised** we will email you a link to get back in
- **goes to** resetPasswordForEmail sends via GoTrue's own mailer; the link returns to /reset-password, where updateUser sets the password
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /reset-password
- **call sites** src/pages/auth/ResetPassword.tsx

THE MOST CONSEQUENTIAL EMAIL IN THE PRODUCT, and the register was not asking about it. If GoTrue's SMTP is unconfigured or its redirect is wrong, the user sees a success message and no email ever arrives — the contact-form failure shape exactly, on the path someone locked out of a life-safety account has to use. `RecoveryRedirect` in App.tsx also has a 10-second fallback that navigates to /reset-password whether or not PASSWORD_RECOVERY fired, so a broken token lands on the form rather than on an error. Cannot be settled from the repo — it is a Supabase Auth setting, and it is in the list for Lee.

### `channel:members` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members, /call-centre
- **call sites** src/hooks/useMembersRealtime.ts, src/pages/call-centre/StaffDashboard.tsx

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `channel:notification_log` — 5/10 (arrives, unproven)

- **control** The bell itself — badge, dropdown, mark read, mark all read
- **promised** you will be told when something needs you
- **goes to** notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations, /admin/alerts +78
- **call sites** src/components/admin/dashboard/NotificationLog.tsx, src/hooks/useNotifications.ts

The one notification channel this repo can prove is live: published, no secret required, and RLS verified so a member sees only rows addressed to them. Everything scored `bell` depends on this row being right.

### `channel:outreach_crm_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachCRMLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `fn:ai-run` — 5/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/hooks/useAIAgentHealth.ts, src/hooks/useAIAgents.ts, src/hooks/useAIChat.ts

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `fn:facebook-unpublish` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/usePublishedPosts.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:generate-content-plan` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/components/admin/media/strategy/ContentPlanner.tsx

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:notify-admin` — 5/10 (arrives, unproven)

- **control** Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures
- **promised** an operational failure is not silent
- **goes to** notify-admin edge function → notification_log (+ WhatsApp where configured)
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin
- **call sites** src/components/admin/dashboard/NotificationSettings.tsx, src/components/admin/dashboard/PaidSalesFeed.tsx

Reaches the bell, which is live. Untested end-to-end from the caller side.

### `fn:outreach-send-email` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachPipeline.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `fn:partner-admin-delete` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/partners
- **call sites** src/pages/admin/PartnersPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-admin-invite` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/partners
- **call sites** src/components/admin/InvitePartnerDialog.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:publish-scheduled` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useScheduledContent.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:send-member-update-request` — 5/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/MemberUpdateRequestModal.tsx

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:staff-register` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/staff, /admin/staff/:staffId
- **call sites** src/components/admin/staff/StaffForm.tsx, src/hooks/useStaffMembers.ts

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:staff-send-invite` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/staff/:staffId
- **call sites** src/hooks/useStaffInvites.ts

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:submit-member-update` — 5/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /member-update
- **call sites** src/pages/MemberUpdatePage.tsx

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:twilio-sms` — 5/10 (arrives, unproven)

- **control** Email hand-off; outbound SMS
- **promised** email or text this person
- **goes to** the user's mail client; twilio-sms for outbound
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/devices/:id, /admin/members/:id, /call-centre/alerts, /call-centre/members/:id
- **call sites** src/components/admin/devices/ProvisioningChecklist.tsx, src/components/admin/member-detail/MemberQuickContact.tsx, src/components/call-centre/AlertDetailPanel.tsx, src/hooks/useDeviceSmsCommands.ts

mailto: leaves the platform entirely — nothing is recorded and nothing can be. twilio-sms degrades to “Twilio not configured”.

### `fn:twilio-whatsapp` — 5/10 (arrives, unproven)

- **control** WhatsApp hand-off and outbound WhatsApp
- **promised** message them on WhatsApp
- **goes to** wa.me deep link; twilio-whatsapp for outbound
- **who is told** whatsapp
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /call-centre/alerts
- **call sites** src/components/call-centre/AlertDetailPanel.tsx

Deep link always works; the outbound function returns “Twilio not configured” when the secret is absent, which is a production question.

### `fn:youtube-disconnect` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/settings, /admin/video-hub
- **call sites** src/hooks/useYouTubeIntegration.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-integration-status` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/settings, /admin/video-hub
- **call sites** src/hooks/useYouTubeIntegration.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-oauth-start` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/settings, /admin/video-hub
- **call sites** src/hooks/useYouTubeIntegration.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-publish` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/settings, /admin/video-hub
- **call sites** src/hooks/useYouTubeIntegration.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `link:mailto` — 5/10 (arrives, unproven)

- **control** Email hand-off; outbound SMS
- **promised** email or text this person
- **goes to** the user's mail client; twilio-sms for outbound
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/leads, /call-centre, /call-centre/leads, /call-centre/messages +8
- **call sites** src/components/call-centre/sos/SOSActionPanel.tsx, src/components/dashboard/LeadsWidget.tsx, src/components/join/steps/JoinConfirmationStep.tsx, src/components/partner/ShareContentSection.tsx +9

mailto: leaves the platform entirely — nothing is recorded and nothing can be. twilio-sms degrades to “Twilio not configured”.

### `link:tel` — 5/10 (arrives, unproven)

- **control** Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre
- **promised** pressing this rings the number shown
- **goes to** the device dialler, via a tel: href built from company settings or a member's stored number
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/leads, /admin/members/:id, /admin/messages, /admin/tasks +18
- **call sites** src/components/call-centre/AlertDetailPanel.tsx, src/components/call-centre/DeviceOfflineAlertsCard.tsx, src/components/call-centre/MemberQuickSearch.tsx, src/components/call-centre/PendantLiveStatusModal.tsx +15

Reaches the dialler, and `telHref()` returns null when the number is unset so a “Call us” card with no number in it is not rendered — the right failure. Nothing is recorded: a call placed this way leaves no interaction row (see table:member_interactions, whose logger is dead code), so the platform cannot say a member was ever phoned. On the SOS path the brief already calls for replacing tel: with the Twilio conference; that is Lee's gate, not this goal.

### `open:window` — 5/10 (arrives, unproven)

- **control** Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard
- **promised** this takes you where it says
- **goes to** a new tab or a full navigation, out of the SPA
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +104
- **call sites** src/components/admin/media/PublishedPostCard.tsx, src/components/admin/member-detail/MemberQuickContact.tsx, src/components/admin/member-detail/StaffHomeLocationCard.tsx, src/components/admin/video-hub/ExportArtifactButtons.tsx +30

The counterpart to `link:*`, and originally invisible to the scanner: a `tel:` in an href was counted while the same number handed to window.location.href was not. 59 call sites. This is also how the checkout redirect leaves the app, which is why the join→pay goal owns that part and this row does not re-prove it.

### `rpc:get_admin_dashboard_stats` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin
- **call sites** src/pages/admin/AdminDashboard.tsx

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_sales_command_stats` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin
- **call sites** src/hooks/useSalesCommandStats.ts

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_todays_birthdays` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /call-centre
- **call sites** src/pages/call-centre/StaffDashboard.tsx

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_user_role_info` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +104
- **call sites** src/contexts/AuthContext.tsx

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `storage:ai-agent-avatars` — 5/10 (arrives, unproven)

- **control** Upload a website image, a staff document, a post image, a partner presentation, an agent avatar
- **promised** the file is saved and will show where you put it
- **goes to** Supabase Storage buckets of those names
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/ai/agents/:agentKey
- **call sites** src/components/admin/ai/AIAvatarUpload.tsx

Also missed by the original scanner. Each bucket is used on exactly one admin or partner screen and the admin who pressed Upload is the audience. What none has is a proof that the object is READABLE afterwards — the failure mode is an upload that succeeds and a broken image — and `staff-documents` is where that matters, because an HR document nobody can open later is the same as one never filed.

### `storage:website-images` — 5/10 (arrives, unproven)

- **control** Upload a website image, a staff document, a post image, a partner presentation, an agent avatar
- **promised** the file is saved and will show where you put it
- **goes to** Supabase Storage buckets of those names
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/settings, /admin/video-hub
- **call sites** src/components/admin/settings/ImageUploadCard.tsx, src/components/admin/video-hub/LogoUploadSection.tsx

Also missed by the original scanner. Each bucket is used on exactly one admin or partner screen and the admin who pressed Upload is the audience. What none has is a proof that the object is READABLE afterwards — the failure mode is an upload that succeeds and a broken image — and `staff-documents` is where that matters, because an HR document nobody can open later is the same as one never filed.

### `table:conversation_messages` — 5/10 (arrives, unproven)

- **control** Isabella conversation turns
- **promised** the assistant's reply appears as it is produced
- **goes to** conversation_messages
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/hooks/useAgentHandoff.ts, src/hooks/useAIChat.ts

The person who typed is the person watching. No notification owed.

### `table:crm_contacts` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-contacts/:id, /admin/crm-import
- **call sites** src/lib/crmImportDb.ts, src/pages/admin/CRMContactDetailPage.tsx

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_events` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin/commissions, /admin/members/:id, /admin/orders, /admin/partners/:id, /call-centre/members/:id +10
- **call sites** src/lib/crmEvents.ts

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_import_batches` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import
- **call sites** src/pages/admin/CRMImportPage.tsx

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_import_rows` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import
- **call sites** src/pages/admin/CRMImportPage.tsx

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_profiles` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-contacts/:id, /admin/crm-import
- **call sites** src/lib/crmImportDb.ts, src/pages/admin/CRMContactDetailPage.tsx

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:documentation` — 5/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/settings, /call-centre/documents, /dashboard/support
- **call sites** src/hooks/useDocumentation.ts

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `table:emergency_contacts` — 5/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import, /admin/members/:id, /call-centre/members/:id, /dashboard/contacts
- **call sites** src/components/admin/member-detail/ContactsTab.tsx, src/lib/crmImportDb.ts, src/pages/client/EmergencyContactsPage.tsx

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:media_audiences` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_content_calendar` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useContentCalendar.ts, src/hooks/useScheduledContent.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_goals` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_image_styles` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_schedule_settings` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_topic_goals` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_topics` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useMediaStrategy.ts

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:medical_information` — 5/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import, /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/MedicalTab.tsx, src/lib/crmImportDb.ts

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:member_contact_methods` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-import
- **call sites** src/lib/crmImportDb.ts

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `table:member_notes` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/crm-contacts/:id, /admin/crm-import, /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/NotesTab.tsx, src/lib/crmImportDb.ts, src/pages/admin/CRMContactDetailPage.tsx

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `table:members` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +91
- **call sites** src/components/admin/member-detail/CourtesyCallsCard.tsx, src/components/admin/member-detail/ProfileTab.tsx, src/components/LanguageSelector.tsx, src/components/maps/SetHomeLocationDialog.tsx +6

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `table:notification_log` — 5/10 (arrives, unproven)

- **control** The bell itself — badge, dropdown, mark read, mark all read
- **promised** you will be told when something needs you
- **goes to** notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations, /admin/alerts +78
- **call sites** src/hooks/useNotifications.ts, src/lib/staffNotify.ts, src/utils/notifications.ts

The one notification channel this repo can prove is live: published, no secret required, and RLS verified so a member sees only rows addressed to them. Everything scored `bell` depends on this row being right.

### `table:outreach_crm_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx, src/hooks/useOutreachCRMLeads.ts, src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_queued_tasks` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_raw_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/hooks/useOutreachRawLeads.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_settings` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/components/admin/outreach/OutreachControlPanel.tsx, src/hooks/useOutreachCaps.ts

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_suppression` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/ai-outreach
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:partner_agreements` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /partner-dashboard, /partner-dashboard/agreement, /partner-dashboard/alerts, /partner-dashboard/commissions, /partner-dashboard/invites, /partner-dashboard/marketing +3
- **call sites** src/components/partner/AgreementRequiredModal.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_alert_notifications` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/partners/:id, /partner-dashboard, /partner-dashboard/alerts
- **call sites** src/hooks/usePartnerAlertNotifications.ts

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_alert_subscriptions` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/partners/:id, /partner-dashboard/members
- **call sites** src/hooks/usePartnerAlertSubscriptions.ts

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_members` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/partners/:id, /partner-dashboard, /partner-dashboard/members
- **call sites** src/hooks/usePartnerMembers.ts

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_post_links` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /partner-dashboard, /partner-dashboard/marketing
- **call sites** src/hooks/usePartnerPostLinks.ts

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_presentations` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /partner-dashboard/marketing
- **call sites** src/pages/partner/PartnerMarketingPage.tsx

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_pricing_tiers` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/partners/:id
- **call sites** src/hooks/usePartnerPricing.ts

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:payers` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/new
- **call sites** src/pages/admin/AddMemberWizard.tsx

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `table:shift_escalation_chain` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/rota, /call-centre/rota
- **call sites** src/hooks/useEscalationChain.ts

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:shift_notes` — 5/10 (arrives, unproven)

- **control** Write a handover note; go on/off duty
- **promised** the next shift knows what happened
- **goes to** shift_notes / staff_presence
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /call-centre/shift-notes
- **call sites** src/pages/call-centre/ShiftNotesPage.tsx

See channel:shift_notes — the note lands, the live update does not.

### `table:staff_activity_log` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/staff/:staffId
- **call sites** src/hooks/useStaffDocuments.ts

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_documents` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/staff/:staffId
- **call sites** src/hooks/useStaffDocuments.ts

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_holidays` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/holidays, /call-centre, /call-centre/holiday-approvals, /call-centre/holidays, /call-centre/my-shifts
- **call sites** src/hooks/useStaffHolidays.ts

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:staff_invites` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/staff/:staffId
- **call sites** src/hooks/useStaffInvites.ts

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_shift_covers` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/holidays, /call-centre, /call-centre/holiday-approvals, /call-centre/my-shifts
- **call sites** src/hooks/useShiftCovers.ts

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:staff_shifts` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin, /admin/holidays, /admin/rota, /call-centre, /call-centre/alerts, /call-centre/documents +15
- **call sites** src/hooks/useShiftCovers.ts, src/hooks/useStaffShifts.ts

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:subscriptions` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/DeviceTab.tsx

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `table:tasks` — 5/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/alerts, /admin/members/:id, /admin/tasks, /call-centre, /call-centre/members/:id, /call-centre/tasks
- **call sites** src/components/admin/FalseAlarmMonitor.tsx, src/components/admin/member-detail/TasksTab.tsx, src/pages/admin/TasksPage.tsx, src/pages/call-centre/StaffDashboard.tsx

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:ticket_comments` — 5/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/tickets, /call-centre/tickets
- **call sites** src/pages/admin/TicketsPage.tsx

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:video_brand_settings` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoBrandSettings.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_outreach_links` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoExports.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_projects` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoProjects.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_renders` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/video-hub
- **call sites** src/hooks/useVideoRenders.ts

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:website_events` — 5/10 (arrives, unproven)

- **control** Page tracking (mounted app-wide in App.tsx)
- **promised** — nothing is promised to the user
- **goes to** website_events
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +104
- **call sites** src/components/analytics/PageTracker.tsx

Analytics. Present on every route because PageTracker is mounted in App.tsx, not on any page.

### `fn:ai-execute-action` — 6/10 (arrives, unproven)

- **control** Isabella executes a tool action
- **promised** the assistant does what she is permitted to do and nothing more
- **goes to** ai-execute-action → ai_actions
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/hooks/useAIAgents.ts

Golden rule 6: the hard-blocked tools (update_user_role, manage_alert escalate/resolve, admit_resident, discharge_resident, toggle_user_status) are unreachable in code, and `src/test/isabellaGate.test.ts` proves that by executing the real gate — including that it FAILS OPEN on a settings error and is suppressed when no row exists. That is a real and important property, and it is NOT this wire: it proves what she may not do, not that an action she may do is executed and recorded. Cited here at first and withdrawn on reading it. The block is proven; the wire is not.

### `storage:partner-presentations` — 6/10 (arrives, unproven)

- **control** Upload a website image, a staff document, a post image, a partner presentation, an agent avatar
- **promised** the file is saved and will show where you put it
- **goes to** Supabase Storage buckets of those names
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /partner-dashboard/marketing
- **call sites** src/pages/partner/PartnerMarketingPage.tsx

Also missed by the original scanner. Each bucket is used on exactly one admin or partner screen and the admin who pressed Upload is the audience. What none has is a proof that the object is READABLE afterwards — the failure mode is an upload that succeeds and a broken image — and `staff-documents` is where that matters, because an HR document nobody can open later is the same as one never filed.

### `storage:social-post-images` — 6/10 (arrives, unproven)

- **control** Upload a website image, a staff document, a post image, a partner presentation, an agent avatar
- **promised** the file is saved and will show where you put it
- **goes to** Supabase Storage buckets of those names
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/media-manager
- **call sites** src/hooks/useSocialPostImages.ts

Also missed by the original scanner. Each bucket is used on exactly one admin or partner screen and the admin who pressed Upload is the audience. What none has is a proof that the object is READABLE afterwards — the failure mode is an upload that succeeds and a broken image — and `staff-documents` is where that matters, because an HR document nobody can open later is the same as one never filed.

### `storage:staff-documents` — 6/10 (arrives, unproven)

- **control** Upload a website image, a staff document, a post image, a partner presentation, an agent avatar
- **promised** the file is saved and will show where you put it
- **goes to** Supabase Storage buckets of those names
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /admin/staff/:staffId
- **call sites** src/hooks/useStaffDocuments.ts

Also missed by the original scanner. Each bucket is used on exactly one admin or partner screen and the admin who pressed Upload is the audience. What none has is a proof that the object is READABLE afterwards — the failure mode is an upload that succeeds and a broken image — and `staff-documents` is where that matters, because an HR document nobody can open later is the same as one never filed.

### `table:ai_actions` — 6/10 (arrives, unproven)

- **control** Isabella executes a tool action
- **promised** the assistant does what she is permitted to do and nothing more
- **goes to** ai-execute-action → ai_actions
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx, src/hooks/useAIAgents.ts

Golden rule 6: the hard-blocked tools (update_user_role, manage_alert escalate/resolve, admit_resident, discharge_resident, toggle_user_status) are unreachable in code, and `src/test/isabellaGate.test.ts` proves that by executing the real gate — including that it FAILS OPEN on a settings error and is suppressed when no row exists. That is a real and important property, and it is NOT this wire: it proves what she may not do, not that an action she may do is executed and recorded. Cited here at first and withdrawn on reading it. The block is proven; the wire is not.

### `table:ai_agent_configs` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/hooks/useAIAgents.ts

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:ai_agents` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/components/admin/ai/AIAvatarUpload.tsx, src/hooks/useAIAgents.ts

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:ai_memory` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/hooks/useAIAgents.ts

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:member_notification_optin` — 6/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /dashboard/profile
- **call sites** src/hooks/useMemberNotificationOptin.ts

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:payments` — 6/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment; staff set or correct the member's home-location pin
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/components/admin/member-detail/PaymentsTab.tsx

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

The home-location pin (2026-09-10) is a direct staff write to `members`, and what stops it lying is not this component: `guard_member_home_location()` forces a staff write to be source='staff_pin', stamps set_at/set_by, and refuses a provenance-only edit. The SOS card labels a staff_pin differently from a member confirmation, so the trigger is what makes that label true. Proven by execution in scripts/rls/isolation.sql.

### `channel:registration_drafts` — 7/10 (proven; nobody told)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** screen
- **failure shown to user** toast
- **proof** `scripts/rls/wiring.sql`
- **routes** /admin/leads
- **call sites** src/pages/admin/LeadsPage.tsx

Same cause as the two above — not in the publication. Lower consequence (admin surfaces, reloadable). Published in this bundle and covered by the §1 contract.

### `channel:shift_notes` — 7/10 (proven; nobody told)

- **control** Shift notes page — live handover list
- **promised** code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.”
- **goes to** supabase.channel('call-centre-shift-notes') → fetchNotes()
- **who is told** screen
- **failure shown to user** no
- **proof** `scripts/rls/wiring.sql`
- **routes** /call-centre/shift-notes
- **call sites** src/pages/call-centre/ShiftNotesPage.tsx

WAS DEAD, and the worst of the five. `shift_notes` was not published, so the code comment described behaviour that had never once happened: a handover note written by the outgoing shift was invisible to the incoming one until they reloaded — on the one screen whose entire purpose is handover. Published in this bundle and covered by the §1 contract.

### `channel:social_post_metrics` — 7/10 (proven; nobody told)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** screen
- **failure shown to user** mutation onError
- **proof** `scripts/rls/wiring.sql`
- **routes** /admin/media-manager
- **call sites** src/hooks/usePublishedPosts.ts

Same cause as the two above — not in the publication. Lower consequence (admin surfaces, reloadable). Published in this bundle and covered by the §1 contract.

### `channel:social_posts` — 7/10 (proven; nobody told)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** screen
- **failure shown to user** mutation onError
- **proof** `scripts/rls/wiring.sql`
- **routes** /admin/media-manager
- **call sites** src/hooks/useSocialPosts.ts

Same cause as the two above — not in the publication. Lower consequence (admin surfaces, reloadable). Published in this bundle and covered by the §1 contract.

### `channel:tasks` — 7/10 (proven; nobody told)

- **control** Call-centre dashboard — courtesy-call list auto-refresh
- **promised** the courtesy-call list stays current while the operator works
- **goes to** supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls()
- **who is told** screen
- **failure shown to user** no
- **proof** `scripts/rls/wiring.sql`
- **routes** /call-centre
- **call sites** src/pages/call-centre/StaffDashboard.tsx

WAS DEAD. `tasks` was NOT in the supabase_realtime publication (verified against the real schema, not grep: 28 tables are published and this is not one). The subscription is established and never fired, so a courtesy call assigned to an operator did not appear until they reloaded. Published in this bundle with REPLICA IDENTITY FULL, and `scripts/rls/wiring.sql` §1 now derives the subscribed-table list from src/ and checks it against pg_publication_tables, so the next one cannot be dead for long.

### `fn:admin-subscription-action` — 7/10 (proven; no notification owed)

- **control** Staff pause / resume / cancel a subscription
- **promised** billing changes, and the record says who changed it
- **goes to** admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /admin/members/:id, /admin/subscriptions, /call-centre/members/:id
- **call sites** src/hooks/useMemberAction.ts, src/pages/admin/SubscriptionsPage.tsx

Gateway FIRST, record second, and the half-applied case is said out loud rather than swallowed. Note the live drift: `member_action` gained 'resume' in a migration that is in main and NOT yet applied to production, so a resume in production performs the Stripe change and then fails to record it. Flagged to Lee separately; not this goal's to fix.

### `fn:cancel-mollie-subscription` — 7/10 (proven; no notification owed)

- **control** Staff pause / resume / cancel a subscription
- **promised** billing changes, and the record says who changed it
- **goes to** admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/hooks/useMemberAction.ts

Gateway FIRST, record second, and the half-applied case is said out loud rather than swallowed. Note the live drift: `member_action` gained 'resume' in a migration that is in main and NOT yet applied to production, so a resume in production performs the Stripe change and then fails to record it. Flagged to Lee separately; not this goal's to fix.

### `fn:join-order-status` — 7/10 (proven; nobody told)

- **control** /join?success — the confirmation screen, polling for the webhook
- **promised** your payment is confirmed, and here is the one thing still to do
- **goes to** join-order-status, keyed on the Stripe Checkout Session id (never the order number, which is sequential) → the member's second-stage link and the 24-hour number
- **who is told** screen
- **failure shown to user** no
- **proof** `src/test/joinOrderPolling.test.tsx`
- **routes** /join
- **call sites** src/hooks/useJoinOrderStatus.ts

Item 6. The screen used to announce 'registration complete' from a query parameter, before the webhook had run and for ever if it never ran. It now waits, then shows the `member_update_tokens` link that collects the emergency contacts the wizard stopped asking for — on screen, because no member email is deliverable yet. It gives up after 90s and falls back to the phone route.

### `fn:notify-staff` — 7/10 (proven; nobody told)

- **control** Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification"
- **promised** the person who needs to know is told, on a channel that works
- **goes to** notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value.
- **who is told** screen
- **failure shown to user** toast
- **proof** `src/test/notificationMatrix.test.ts`
- **routes** /admin/settings
- **call sites** src/components/admin/settings/FirebaseConfigCard.tsx, src/hooks/useNotificationMatrix.ts

The switches are the fix for the schema this replaces: a boolean COLUMN PER EVENT on notification_settings, which is how `whatsapp_ev07b_alerts` came to be read by notify-admin without any migration ever creating it. THE FOUR ALWAYS-LOUD EVENTS RENDER AS LOCKED, not as switches: the router ignores both tables for them, and a switch that cannot silence the alarm saying the SOS ladder is broken must not look like one. Every dark cell names which of the three gates stopped it, and `wouldReach` is driven against the router's own `planNotifications` across all 19 events × 4 channels × both switches so the screen cannot claim something the router will not do. Scored on the screen only: until the migration is applied the matrix says so rather than rendering an empty grid.

### `fn:save-api-keys` — 7/10 (proven; no notification owed)

- **control** Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device
- **promised** your credentials work
- **goes to** save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/firebaseConfig.test.ts`
- **routes** /admin/holidays, /admin/settings, /call-centre/holiday-approvals
- **call sites** src/components/admin/HolidayPolicyCard.tsx, src/components/admin/settings/CheckoutPaymentMethodsCard.tsx, src/components/admin/settings/FirebaseConfigCard.tsx, src/components/admin/settings/SocialMediaSection.tsx +1

These are the only in-app way to find out whether the email, SMS and push channels are live, which is exactly what this register cannot determine from code. FIREBASE JOINED THEM: push used to need six VITE_FIREBASE_* build-time variables in Vercel plus a FIREBASE_SERVICE_ACCOUNT Edge secret — seven values, two consoles, and a redeploy before any of them did anything. The three paste fields replace that, and the test push's outcome is a notification_log row whichever way it goes. The service account is stored under a key ending `_key` so the staff read policy excludes it; the six web values are public by design and staff-readable because every operator's phone needs them.

### `fn:send-payment-link` — 7/10 (proven; nobody told)

- **control** Staff send a member a Stripe payment link (CRM → member → Subscription)
- **promised** a real Stripe Checkout link for a chosen plan, sent by SMS and email where those are switched on, and always shown on screen to copy
- **goes to** send-payment-link → create_payment_link_order (pending order + items + subscription + payment, one transaction) → Stripe Checkout Session (mode: subscription) → twilio-sms and/or send-email; activation is stripe-webhook's alone
- **who is told** the payer (SMS + email), and activity_logs twice — the order created, and what was sent
- **failure shown to user** mutation onError
- **proof** `src/test/sendPaymentLink.test.ts`
- **routes** /admin/members/:id, /call-centre/members/:id
- **call sites** src/hooks/useSendPaymentLink.ts

Replaces a `Create Subscription` button that had NO onClick. The browser sends a plan, a billing frequency, a pendant count and who pays — no amounts: every line item names a Stripe Price id created from pricing_plans/pricing_settings, and the request schema has no amount field. Refuses rather than guessing when a Price is unsynced or stale. REQUIRES 20260909110000 in production (the SQL function it calls); until that is applied the button returns a 409 naming the missing function.

### `fn:send-test-email` — 7/10 (proven; no notification owed)

- **control** Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device
- **promised** your credentials work
- **goes to** save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/firebaseConfig.test.ts`
- **routes** /admin/settings
- **call sites** src/hooks/useEmailSettings.ts

These are the only in-app way to find out whether the email, SMS and push channels are live, which is exactly what this register cannot determine from code. FIREBASE JOINED THEM: push used to need six VITE_FIREBASE_* build-time variables in Vercel plus a FIREBASE_SERVICE_ACCOUNT Edge secret — seven values, two consoles, and a redeploy before any of them did anything. The three paste fields replace that, and the test push's outcome is a notification_log row whichever way it goes. The service account is stored under a key ending `_key` so the staff read policy excludes it; the six web values are public by design and staff-readable because every operator's phone needs them.

### `fn:test-twilio` — 7/10 (proven; no notification owed)

- **control** Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase values), send a test email, test Twilio, send a test push to this device
- **promised** your credentials work
- **goes to** save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/firebaseConfig.test.ts`
- **routes** /admin/settings
- **call sites** src/pages/admin/SettingsPage.tsx

These are the only in-app way to find out whether the email, SMS and push channels are live, which is exactly what this register cannot determine from code. FIREBASE JOINED THEM: push used to need six VITE_FIREBASE_* build-time variables in Vercel plus a FIREBASE_SERVICE_ACCOUNT Edge secret — seven values, two consoles, and a redeploy before any of them did anything. The three paste fields replace that, and the test push's outcome is a notification_log row whichever way it goes. The service account is stored under a key ending `_key` so the staff read policy excludes it; the six web values are public by design and staff-readable because every operator's phone needs them.

### `table:activity_logs` — 7/10 (proven; no notification owed)

- **control** Every staff action that must be attributable
- **promised** who did what, and why
- **goes to** activity_logs, with enforce_member_action_attribution() refusing an unattributed member action
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /admin/commissions, /admin/media-manager, /admin/members/:id, /admin/members/new, /admin/orders, /admin/partners/:id +3
- **call sites** src/hooks/useGdprDeletion.ts, src/hooks/useMemberAction.ts, src/lib/auditLog.ts, src/pages/admin/AddMemberWizard.tsx

The database refuses a `member_action` row without a reason and an actor, which is why this scores on its trigger rather than on a notification.

### `table:admin_ideas` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations, /admin/alerts +60
- **call sites** src/hooks/useAdminIdeas.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:app_daily_metrics` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin, /admin/finance, /join
- **call sites** src/lib/syncHub.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:app_events` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin, /admin/finance, /join
- **call sites** src/lib/syncHub.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:app_finance` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin, /admin/finance, /join
- **call sites** src/lib/syncHub.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:blog_posts` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/blog
- **call sites** src/hooks/useBlogEditor.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:email_settings` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/settings
- **call sites** src/hooks/useEmailSettings.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:email_templates` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/settings
- **call sites** src/hooks/useEmailTemplates.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:isabella_settings` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/ai, /admin/ai/operations
- **call sites** src/hooks/useIsabellaSettings.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:notification_routes` — 7/10 (proven; nobody told)

- **control** Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification"
- **promised** the person who needs to know is told, on a channel that works
- **goes to** notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value.
- **who is told** screen
- **failure shown to user** toast
- **proof** `src/test/notificationMatrix.test.ts`
- **routes** /admin/settings
- **call sites** src/hooks/useNotificationMatrix.ts

The switches are the fix for the schema this replaces: a boolean COLUMN PER EVENT on notification_settings, which is how `whatsapp_ev07b_alerts` came to be read by notify-admin without any migration ever creating it. THE FOUR ALWAYS-LOUD EVENTS RENDER AS LOCKED, not as switches: the router ignores both tables for them, and a switch that cannot silence the alarm saying the SOS ladder is broken must not look like one. Every dark cell names which of the three gates stopped it, and `wouldReach` is driven against the router's own `planNotifications` across all 19 events × 4 channels × both switches so the screen cannot claim something the router will not do. Scored on the screen only: until the migration is applied the matrix says so rather than rendering an empty grid.

### `table:notification_settings` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin
- **call sites** src/components/admin/dashboard/NotificationSettings.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:operational_costs` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/ev07b, /admin/finance
- **call sites** src/hooks/useOperationalCosts.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:pricing_plans` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/settings
- **call sites** src/components/admin/PricingPlansEditor.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:pricing_settings` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/settings
- **call sites** src/components/admin/PricingPlansEditor.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:products` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/products
- **call sites** src/hooks/useProducts.ts, src/pages/admin/ProductCatalogPage.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:staff_notification_prefs` — 7/10 (proven; nobody told)

- **control** Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and "send a test notification"
- **promised** the person who needs to know is told, on a channel that works
- **goes to** notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value.
- **who is told** screen
- **failure shown to user** toast
- **proof** `src/test/notificationMatrix.test.ts`
- **routes** /admin/settings
- **call sites** src/hooks/useNotificationMatrix.ts

The switches are the fix for the schema this replaces: a boolean COLUMN PER EVENT on notification_settings, which is how `whatsapp_ev07b_alerts` came to be read by notify-admin without any migration ever creating it. THE FOUR ALWAYS-LOUD EVENTS RENDER AS LOCKED, not as switches: the router ignores both tables for them, and a switch that cannot silence the alarm saying the SOS ladder is broken must not look like one. Every dark cell names which of the three gates stopped it, and `wouldReach` is driven against the router's own `planNotifications` across all 19 events × 4 channels × both switches so the screen cannot claim something the router will not do. Scored on the screen only: until the migration is applied the matrix says so rather than rendering an empty grid.

### `table:staff_push_tokens` — 7/10 (proven; nobody told)

- **control** "Enable notifications on this phone" — Admin → Settings → Notifications, and Staff preferences
- **promised** an alert reaches you when this page is closed
- **goes to** staff_push_tokens, one row per device keyed on the FCM registration token; read by the notify-staff router's push transport (_shared/fcm.ts) and pruned by it when Google says a token is dead
- **who is told** push
- **failure shown to user** toast
- **proof** `src/test/pushClient.test.ts`
- **routes** /admin/settings, /call-centre/preferences
- **call sites** src/hooks/usePushNotifications.ts

REPLACES A WIRE THAT WENT NOWHERE. The previous hook upserted `notification_settings { user_id, push_token, push_enabled }` — three columns that table has never had — through a hand-written `supabase as unknown as` façade whose only effect was to stop TypeScript saying so, and no component called it. Not scored higher than push itself: until FIREBASE_SERVICE_ACCOUNT and the six VITE_FIREBASE_* variables exist, the card says so rather than offering a button that does nothing.

### `table:system_settings` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/partner-pricing, /admin/settings
- **call sites** src/components/admin/settings/DevicesSettingsTab.tsx, src/components/admin/settings/VoiceSettingsSection.tsx, src/hooks/useNotificationMatrix.ts, src/pages/admin/PartnerPricingSettingsPage.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:testimonials` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** toast
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /, /admin/testimonials, /pendant
- **call sites** src/hooks/useTestimonials.ts

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `table:website_images` — 7/10 (proven; no notification owed)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables. `system_settings.checkout_payment_methods` and `checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each change is an activity_logs row carrying the old and the new value
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/checkoutPaymentMethods.test.ts`
- **routes** /admin/settings
- **call sites** src/components/admin/settings/ImageUploadCard.tsx

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set `payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with `payment_status: "unpaid"` and activation depends on `checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is always offered and cannot be unticked; the three async methods are greyed with the reason until an admin confirms the destination listens, and that acknowledgement is re-applied when the setting is READ as well as when it is written.

### `fn:notify-fulfilment` — 9/10 (notified live, failure not shown)

- **control** Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested
- **promised** the next person in the chain knows the device is theirs to move
- **goes to** notify-fulfilment → member_notification_log, one row per channel decision
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/notifyFulfilmentDispatcher.test.ts`
- **routes** /admin/devices/:id, /admin/members/:id, /admin/orders, /call-centre/members/:id
- **call sites** src/lib/notifyTransition.ts

A genuine end-to-end proof, and one of very few: it drives the REAL dispatcher module against a recording double and asserts one log row per decision — including the refusals, which are the assertions that matter while every outbound channel is off. A suite that only proved it CAN send would pass against a version that sends to people who never agreed.

### `fn:partner-register` — 9/10 (notified live, failure not shown)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** no
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /partner/join
- **call sites** src/pages/partner/PartnerJoin.tsx

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

### `fn:partner-verify` — 9/10 (notified live, failure not shown)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** no
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /partner/verify
- **call sites** src/pages/partner/PartnerVerify.tsx

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

### `fn:save-registration-draft` — 9/10 (notified live, failure not shown)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/createCheckoutContract.test.ts`
- **routes** /join
- **call sites** src/hooks/useRegistrationDraft.ts

OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', which was true while a separate goal held the path. `create-checkout` now takes ids only and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` refuses activation when `amount_total` disagrees with `payments.amount`. `create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts from the browser — and is the reason this row is not a 10. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `table:conversations` — 9/10 (notified live, failure not shown)

- **control** Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen
- **promised** “we'll get back to you” — a member message reaches the team
- **goes to** conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/inboundMessages.test.ts`
- **routes** /, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey, /admin/ai/operations +79
- **call sites** src/components/admin/member-detail/MessagesTab.tsx, src/components/call-centre/MessagesPanel.tsx, src/hooks/useAgentHandoff.ts, src/hooks/useAIChat.ts +4

This is the wire the platform gets RIGHT, and it is the model for fixing the lead: the member surface cannot write the staff notification itself, so it calls a server function that verifies ownership and then broadcasts. Both tables are published and both screens subscribe. Failure is shown.

`inboundMessages` earns this: 31 cases driving the real inbound handler, written negative-first around the defect it replaced — a member texting when no alert was open had their message matched to their record and then DROPPED, while the auto-reply told them an operator would review it. It asserts what must be written into the member's conversation, what must not, and that an unsigned POST cannot put words in a member's mouth.

### `table:messages` — 9/10 (notified live, failure not shown)

- **control** Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen
- **promised** “we'll get back to you” — a member message reaches the team
- **goes to** conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/inboundMessages.test.ts`
- **routes** /admin/members/:id, /admin/messages, /call-centre/alerts, /call-centre/members/:id, /call-centre/messages, /dashboard/messages +1
- **call sites** src/components/admin/member-detail/MessagesTab.tsx, src/components/call-centre/MessagesPanel.tsx, src/lib/communicationLogger.ts, src/pages/admin/MessagesPage.tsx +3

This is the wire the platform gets RIGHT, and it is the model for fixing the lead: the member surface cannot write the staff notification itself, so it calls a server function that verifies ownership and then broadcasts. Both tables are published and both screens subscribe. Failure is shown.

`inboundMessages` earns this: 31 cases driving the real inbound handler, written negative-first around the defect it replaced — a member texting when no alert was open had their message matched to their record and then DROPPED, while the auto-reply told them an operator would review it. It asserts what must be written into the member's conversation, what must not, and that an unsigned POST cannot put words in a member's mouth.

### `fn:complete-member-registration` — 10/10 (fully wired)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** toast
- **proof** `src/test/createCheckoutContract.test.ts`
- **routes** /complete-registration
- **call sites** src/pages/auth/CompleteRegistration.tsx

OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', which was true while a separate goal held the path. `create-checkout` now takes ids only and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` refuses activation when `amount_total` disagrees with `payments.amount`. `create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts from the browser — and is the reason this row is not a 10. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:create-checkout` — 10/10 (fully wired)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** `src/test/createCheckoutContract.test.ts`
- **routes** /join
- **call sites** src/components/join/steps/JoinPaymentStep.tsx

OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', which was true while a separate goal held the path. `create-checkout` now takes ids only and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` refuses activation when `amount_total` disagrees with `payments.amount`. `create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts from the browser — and is the reason this row is not a 10. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:create-mollie-checkout` — 10/10 (fully wired)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** `src/test/createCheckoutContract.test.ts`
- **routes** /join
- **call sites** src/components/join/steps/JoinPaymentStep.tsx

OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', which was true while a separate goal held the path. `create-checkout` now takes ids only and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` refuses activation when `amount_total` disagrees with `payments.amount`. `create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts from the browser — and is the reason this row is not a 10. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:submit-registration` — 10/10 (fully wired)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** `src/test/createCheckoutContract.test.ts`
- **routes** /join
- **call sites** src/components/join/steps/JoinPaymentStep.tsx

OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', which was true while a separate goal held the path. `create-checkout` now takes ids only and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` refuses activation when `amount_total` disagrees with `payments.amount`. `create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts from the browser — and is the reason this row is not a 10. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `rpc:apply_shift_swap` — 10/10 (fully wired)

- **control** Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it
- **promised** the person being asked finds out, both people find out when it is approved, and the rota actually moves
- **goes to** staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction
- **who is told** bell
- **failure shown to user** toast
- **proof** `src/test/shiftSwaps.test.tsx`
- **routes** /admin/rota, /call-centre/my-shifts, /call-centre/rota
- **call sites** src/hooks/useShiftSwaps.ts

THE BELL IS WRITTEN BY THE DATABASE HERE, not by the client, and that is the difference from the cover flow above. An operator cannot call notify-staff at all (NOTIFY_CALLER_ROLES admits admins and the service role), and a notification raised by the browser is lost when the tab closes mid-request — so a trigger does it, which also covers a supervisor fixing a swap by hand in the SQL editor. The move is a single transaction because a half-applied swap puts two people on one slot and nobody on another, and staff_on_shift_now — which the shift monitor reads — would agree with it. 32 assertions in scripts/rls/isolation.sql exercise the refusals (an operator cannot apply; a swap not yet accepted cannot be applied; a rota that changed underneath is refused whole), the bell rows per transition, and the idempotent second click.

### `table:leads` — 10/10 (fully wired)

- **control** Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens
- **promised** “Your enquiry has reached the team and someone will come back to you… if the matter is urgent please call the number above instead.”
- **goes to** leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads, and unworked ones on the call-centre dashboard
- **who is told** bell
- **failure shown to user** inline
- **proof** `scripts/rls/wiring.sql`
- **routes** /admin/leads, /call-centre/leads, /contact
- **call sites** src/components/products/NotifyInterestDialog.tsx, src/pages/admin/LeadsPage.tsx, src/pages/call-centre/LeadsPage.tsx, src/pages/ContactPage.tsx

THE DEFECT THIS REGISTER CAME FROM, now fixed end to end. The row always arrived and both Leads screens always showed it, but the only trigger on `leads` was `update_leads_updated_at` — no notification, no task, no queue. `leads` is in supabase_realtime and /call-centre/leads does subscribe, so a lead appeared live on a screen nobody was required to have open. That is not being told.

Three parts: an AFTER INSERT trigger raising a targeted bell notification per active staff member (a trigger, because the form submits as `anon` and notification_log INSERT is staff/service_role only — and because it covers every route into the table, not the one caller someone remembered); a New enquiries card on the dashboard operators already have open; and copy that no longer promises 24 hours.

PROVEN by `scripts/rls/wiring.sql` §2 against a real PostgreSQL — one targeted, routable, human-readable notification per active staff member, no broadcast row, nobody terminated. Mutation-tested three ways. This is the only row in the register that reaches 10, and it does so because it is the one wire that has been driven all the way to a person.

### `table:partners` — 10/10 (fully wired)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** toast
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /admin/partners, /admin/partners/:id, /partner-dashboard, /partner-dashboard/agreement, /partner-dashboard/alerts, /partner-dashboard/commissions +5
- **call sites** src/components/admin/partner/PartnerOrganizationTab.tsx, src/components/partner/AgreementRequiredModal.tsx, src/pages/admin/PartnerDetailPage.tsx, src/pages/admin/PartnersPage.tsx +1

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

### `table:staff_shift_swaps` — 10/10 (fully wired)

- **control** Ask a colleague to swap or cover a shift; accept or decline; a supervisor approves it
- **promised** the person being asked finds out, both people find out when it is approved, and the rota actually moves
- **goes to** staff_shift_swaps → bell_on_shift_swap writes targeted notification_log rows; emit_shift_swap_to_router queues shift.swap_requested/_accepted/_approved to notify-staff (push on, SMS/WhatsApp/email off); approval calls apply_shift_swap, which moves staff_shifts and writes staff_shift_covers + activity_logs in one transaction
- **who is told** bell
- **failure shown to user** toast
- **proof** `src/test/shiftSwaps.test.tsx`
- **routes** /admin/rota, /call-centre/my-shifts, /call-centre/rota
- **call sites** src/hooks/useShiftSwaps.ts

THE BELL IS WRITTEN BY THE DATABASE HERE, not by the client, and that is the difference from the cover flow above. An operator cannot call notify-staff at all (NOTIFY_CALLER_ROLES admits admins and the service role), and a notification raised by the browser is lost when the tab closes mid-request — so a trigger does it, which also covers a supervisor fixing a swap by hand in the SQL editor. The move is a single transaction because a half-applied swap puts two people on one slot and nobody on another, and staff_on_shift_now — which the shift monitor reads — would agree with it. 32 assertions in scripts/rls/isolation.sql exercise the refusals (an operator cannot apply; a swap not yet accepted cannot be applied; a rota that changed underneath is refused whole), the bell rows per transition, and the idempotent second click.

---

Generated by `scripts/wiring/build.mjs`. Rubric in `scripts/wiring/score.mjs`.
