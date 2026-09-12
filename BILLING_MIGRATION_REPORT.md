# Moving the legacy members onto Stripe — the report Lee asked for

**As at 11 September 2026.** Everything below is either in `main` or in an open PR that names
itself. Nothing here has run against Stripe: this environment has no Stripe key, so no Checkout
Session has ever been created and no test clock has ever been advanced. What that means for the
"PROVE" half of the brief is set out honestly in §6.

---

## 1. The pull requests

| PR | What it is | State |
|---|---|---|
| #360 | **The Santander date.** `members.legacy_billing_day` (1–31) and `legacy_next_renewal`, derived by the CRM import from `Monthly Payment Date` / `Payment Type` / `Date Joined`; staff-editable with `activity_logs`; a "needs a date" queue for everybody the import could not work out | merged |
| #362 | Two live defects found on the way: `send-payment-link` read its settings off an identifier declared nowhere in the file, and asked Stripe for a 72-hour session when Stripe's ceiling is 24. **No staff-sent payment link had been able to succeed**, and both failed *after* the pending order rows were written | merged |
| #364 | **The switch link.** `send-payment-link` in `legacy_switch` mode — the same builder, registration fee and pendant removed | merged |
| #368 | **The runner.** Daily pg_cron; monthly members get one link three days out, annual members a ladder at 14 / 7 / 3 days. Arrives switched **off** | merged |
| #369 | **The progress view** and the Santander CSV | merged |
| #370 | **A failed debit:** one Stripe smart retry, then a staff bell and a friendly text | merged |
| #373 | **Six defects that made the whole thing do nothing.** The worst: `start_legacy_switch` and `expire_legacy_switches` were revoked from `PUBLIC` and granted to nobody, and PostgREST runs an edge function as `service_role` — so every "Move to Stripe billing" press hit permission denied. The feature was inert, and it failed *safe* | merged |
| #383 | **The switch link charged the import's default plan.** The plan was read from `subscriptions.plan_type` / `billing_frequency`, which hold `COALESCE(…, 'single')` / `COALESCE(…, 'annual')` for every row whose Karma label named no plan. A couple would have been charged the single price; a monthly member, a year at once | merged |
| #385 | **A bounced direct debit left the member in neither collection.** `checkout.session.async_payment_failed` was handled by nothing, so a failed first SEPA debit kept the member in `switch_pending` — out of the Santander export, billed by nobody — until the 14-day sweep found them | merged |
| #392 | **The Santander list did not say what each member is on.** The brief asks for "day, amount, plan"; the plan was missing. It is Karma's verbatim label, blank rather than guessed — and the members nobody can price now have a counter on the dashboard beside "needs a billing date", so the migration stopping for them is visible | merged |
| #393 | `20260911170000` was applied to production and the manifest commit was refused by the new ruleset. Recorded by hand, which is the workflow's own instruction | merged |
| #395 | **The billing day was the day the link was SENT, not the day they paid.** `renewal_date` is written at ORDER time by both paths; a switch link stands 24 hours and a SEPA debit settles days later, and `onInvoicePaid` skips the signup invoice — so nothing corrected it until the member's second invoice. Now recorded by the webhook, through the same month-end clamp the Santander dates use | merged |
| #396 | **WhatsApp on the switch link**, which the brief names and only SMS and email did. Off until a template is approved — §5 D | open |

## 2. The migrations, and what production has

Applied to production by CI (`supabase/migrations/APPLIED_TO_PROD.txt`):

| Migration | What it changes |
|---|---|
| `20260911110000_legacy_billing_date` | `legacy_billing_day`, `legacy_next_renewal`, two partial indexes, and a trigger that stops a member writing either of them for themselves |
| `20260911130000_legacy_switch_to_stripe` | `switch_pending` added to the `billing_source` CHECK; the five `switch_*` columns; `start_legacy_switch()`; `expire_legacy_switches()`; the two switch notification routes |
| `20260911150000_billing_migration_settings` | `notification_log.dedupe_key` + a **partial unique index** — the thing that makes "just run it again" safe; the five runner settings, seeded with `enabled = false` |
| `20260911150100_billing_migration_cron` | the pg_cron schedule, `0 6 * * *` |
| `20260911160000_billing_runner_grants` | the `GRANT EXECUTE … TO service_role` that #373 found missing, plus a re-issue rule so the annual ladder's 7-day reminder has something payable to point at |
| `20260911170000_abandon_legacy_switch` | one implementation of "return them to legacy and ring the bell", called by both the 14-day sweep and the bounced-debit webhook |

**Nothing is pending: production is level with the repo.** One caveat worth knowing about, because it
will recur: the ruleset now on `main` blocks `github-actions[bot]` from pushing to it, so
`Migrate Production` **applies** each migration and then cannot record it. The migration is live and
the manifest line is missing, which is the worse half to lose — the drift gate then reads production
as behind on something already applied. #393 is that line, appended by hand; #386 is the systemic
fix and is itself blocked until **Repository admin** is added to the ruleset's bypass list (§5 E).

**No SQL backfill of the Santander date.** Parsing Karma's free-text column in Postgres would be a
second implementation of the date rule, and the two would disagree on exactly the rows nobody
checks. The import derives it; everybody else lands in the "needs a date" queue, which is a
person's job.

## 3. The exact Stripe parameters

From `supabase/functions/send-payment-link/index.ts`, `legacy_switch` mode:

```ts
stripe.checkout.sessions.create({
  mode: "subscription",
  payment_method_types: ["card", "sepa_debit"],   // sepa_debit ONLY once §5 is ticked
  line_items: [ { price: <synced Stripe Price id>, quantity: 1 } ],
  customer_email: <the member's own email, or omitted>,
  success_url: `${PUBLIC_SITE_URL}/payment-success?order=<order number>`,
  cancel_url:  `${PUBLIC_SITE_URL}/payment-cancelled?order=<order number>`,
  billing_address_collection: "required",
  metadata:          { order_id, payment_id, member_id, subscription_id, source: "legacy-switch", … },
  subscription_data: { metadata: <the same> },
  expires_at: now + 24 * 60 * 60,
})
```

**And, deliberately, nothing else.** No `trial_period_days`, no `billing_cycle_anchor`, no
`proration_behavior` — asserted as absences in `src/test/legacySwitchToStripe.test.ts`, because the
defect would be a parameter *appearing*.

The temptation is an anchor set to the member's Santander date so the cycles line up. It is wrong
twice: it produces a €0 or prorated first invoice, and **a €0 invoice does not pay a Checkout
Session** — so the webhook would never activate them, while `switch_pending` had already taken them
out of the Santander run. Nobody would be collecting at all. That is the single worst outcome
available here, and it is produced by the very parameter that looks like it prevents one.

**24 hours** is not a choice: Stripe allows a session to expire between 30 minutes and 24 hours.
The switch *window* is 14 days, which is a different thing and lives on the member's record — so
the member portal can tell "here is your link" from "your link has expired, ring us". Showing a
dead Stripe page to an 82-year-old who then believes they have paid is worse than showing none.

**The line items.** One membership line, priced from `pricing_plans` / `pricing_settings` through
the synced `stripe_prices` ids. No registration fee (they joined years ago; charging it again is
charging somebody to stay) and no pendant line (they are wearing it, and a pendant line would post
a second one). The browser sends no amount, ever.

## 4. What the member is told

**SMS / WhatsApp**, ≤320 characters, with the link. English then Spanish:

> ICE Alarm España: hello Mary, **your alarm does not change.** We are moving payments to card or
> direct debit: €29.95 today and the same each month on this date. https://checkout.stripe.com/…

> ICE Alarm España: hola María, **tu alarma no cambia.** Estamos pasando los pagos a tarjeta o
> domiciliación: 29,95 € hoy y lo mismo cada mes en esta misma fecha. https://checkout.stripe.com/…

**Email** — subject, then the four things in the order the questions actually arrive in:

| | English | Español |
|---|---|---|
| Subject | Your service is not changing — only how you pay | Tu servicio no cambia — solo la forma de pago |
| 1. Nothing changes | Your alarm, your pendant and the number we call stay exactly as they are. This is only about how the payment is taken. | Tu alarma, tu colgante y el número al que llamamos siguen exactamente igual. Esto es solo sobre la forma de pagar. |
| 2. What is changing | We are moving payments off the bank collection and onto our own payment system. You can pay by card, or give your IBAN so it is taken automatically each time. | Estamos pasando los cobros del banco a nuestro sistema de pagos. Puedes pagar con tarjeta o dar tu IBAN para que se domicilie automáticamente cada vez. |
| 3. Exactly what and when | €29.95 will be taken today, and the same amount each month on this date. | Se cobrará 29,95 € hoy, y la misma cantidad cada mes en esta fecha. |
| 4. The old one stops | We will stop the bank collection as soon as this payment has gone through. | Dejaremos de pasar el recibo por el banco en cuanto se complete este pago. |
| Button | Pay and set up | Pagar y domiciliar |
| Help | If you would rather talk it over, reply to this email and we will ring you. | Si prefieres hablarlo por teléfono, responde a este correo y te llamamos. |

Dutch is written too, for the members whose record says `nl`.

**The link is always on the operator's screen**, whatever the SMS and email did, and each channel
reports separately. Most of these members are eighty, and the delivery that actually works is an
operator reading it out.

## 5. What needs Lee

| | What | Where | Why it blocks |
|---|---|---|---|
| ~~**A**~~ | ~~**Enable SEPA Direct Debit**, subscribe the destination to `checkout.session.async_payment_succeeded` **and** `async_payment_failed`, tick *Async events confirmed*~~ **DONE (11 Sep)** | Stripe → Payments + Developers → Webhooks, Admin → Settings → Payments | Was the item that decided whether the migration ran or needed 431 phone calls. **The rehearsal workflow now checks it rather than taking it on trust** — step 0 lists the destinations and fails if no enabled one carries both events |
| ~~**B**~~ | ~~**Pin the destination to API version `2024-06-20`**~~ **DONE (11 Sep)** — the rehearsal reports the pinned version and notes any drift | same screen | `invoice.subscription` and `subscription.current_period_end` both moved in later versions. The webhook declares the fields it needs and refuses loudly if one is missing, so a wrong version is visible rather than silent — but it should simply be right |
| **C1** | **`STRIPE_TEST_KEY` is NOT reaching the workflow** — set it as a **repository** secret under that exact name | GitHub → Settings → Secrets and variables → Actions | **Measured, three times.** Runs [1](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34681525043), [2](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34682043460) and [3](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34682532216) all log `env: STRIPE_TEST_KEY:` **empty**. Three things make that happen and they need different fixes: the name is not exactly `STRIPE_TEST_KEY`; it is an **Organization** secret whose *Repository access* list omits this repo; or it is an **Environment** secret, in which case the job needs an `environment:` key — say which environment and it is a one-line change. **Until this is fixed no Stripe call has been made at all** |
| **C2** | **Live-mode keys**, once the rehearsal has been RUN and read | Stripe → Developers → API keys → Supabase secrets | Nothing goes to live keys on the strength of a workflow existing. The rehearsal has still never reached Stripe |
| **G** | **Complete ONE SEPA switch link in test mode, in a browser** | the link the rehearsal prints, or any test-mode switch link | The only step no script can do, and the only way `checkout.session.async_payment_succeeded` is ever generated: the event exists only for a Checkout Session a person completed. Until one is completed, the "did the events reach us" check reports **UNPROVEN** rather than a pass — correctly, because nothing was sent |
| **H** | *(optional)* **`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` as Actions secrets** | GitHub → Settings → Secrets | Lets the rehearsal read the webhook's own `webhook_events` ledger and confirm the events arrived at **our** destination rather than merely having been sent. Without them that step reports UNPROVEN and says so |
| **D** | **WhatsApp: switch the channel on and get a message template approved** | Admin → Settings → Notifications, Twilio → WhatsApp sender, then Meta | The brief names the delivery as "SMS/WhatsApp" and the code now offers both — but the channel is off and no template exists, so today every switch link goes by SMS and email and the WhatsApp row reads "not sent — the channel is switched off". **A business-initiated WhatsApp message outside a 24-hour window needs an approved template**, and that is the long pole rather than the switch. It has to carry the first name, the amount, the cycle and the link |
| **E** | **Add Repository admin to the `main` ruleset's bypass list** | GitHub → Settings → Rules | The ruleset as configured returns **no bypass actors**, which blocks everyone — a repository admin's PAT included. Until it is changed, `Migrate Production` applies every migration and cannot record it, and each one needs a manual manifest line (§2) |
| **F** | **Switch the runner on**, after reading its dry-run preview | Admin → Settings → Billing | It ships `enabled = false`. A migration that starts itself on deploy is a migration nobody chose, over 431 people who are all elderly and none of whom asked for it today |

**The rehearsal now runs from CI** (`.github/workflows/stripe-rehearsal.yml`, `workflow_dispatch`
only) so the key never leaves GitHub — but **it has not yet reached Stripe**, because the key is
not visible to the job (C1). Three dispatched runs got as far as the guard and stopped there.

That is the guard working rather than failing: `require-secrets.mjs` names the missing secret and
fails the job instead of skipping its work and reporting green. Two things were proven by those
runs all the same, both of which only ever appear when something is missing:

- **`set -o pipefail` holds in production, not only in a test.** Run #1's day-31 step piped
  through `tee` and still went red. Without it that step would have been GREEN while printing a
  refusal — which is the exact failure CLAUDE.md's merge rules name.
- **A shared output directory belongs to the job.** Run #2 found it the hard way: gating the
  rehearsal steps on the key took their `mkdir` with them, so the one step that needs no key
  failed for a reason that had nothing to do with it, and the artifact uploaded nothing. Fixed in
  #423 and confirmed green on run #3.

**A, B and D's first half are done** (11 Sep): SEPA is enabled on both configurations, the
destination carries both async events, it is pinned to `2024-06-20`, and *Async events confirmed*
is ticked — so switch links now offer direct debit rather than card only.

What is left is **G** above, and it is one click: the two `checkout.session.async_payment_*`
events only ever exist for a Checkout Session that a person completed in a browser, so until
somebody completes one in test mode there is genuinely nothing for the platform to have received.
The check reports that as UNPROVEN rather than as a fault, because "nothing was sent" and "it was
sent and we missed it" need completely different responses.

## 6. What is proven, and what is not

**Proven, by execution:**

- **680 assertions against real PostgreSQL** (`scripts/rls/run.sh`, a throwaway PG16 with the real
  migration set): who may call each function and who may not; that a member cannot take themselves
  out of the Santander run; that a lapsed link returns exactly one member and running the sweep
  again returns none; that every switch column is cleared; that the bells are targeted rows rather
  than one shared row somebody else can clear.
- **~4,550 unit and contract tests**, including the date rule at month ends and leap days, the
  runner's whole daily plan, the dedupe key, the Santander CSV's exclusion rule, and the refusals
  `send-payment-link` makes before it asks Stripe for anything.
- **"Monitored state unchanged", which is a clause of Lee's item 5 and of his rule 3, is now
  asserted on BOTH paths that end a switch without money** — the 14-day lapse and the bounced
  first debit. It was previously a sentence in the migration's header ("NOTHING HERE ACTIVATES OR
  DEACTIVATES ANYBODY") and an assertion on the path that *starts* a switch, with nothing on
  either ending. Measured, not assumed: adding `status = 'inactive'` to `abandon_legacy_switch`
  passed the entire harness before this, and now fails it twice. A failed direct debit is the
  most plausible reason anybody would ever reach for `members.status` there, and the member it
  would switch off is somebody in their eighties whose bank bounced one payment.
- Several of the assertions above were **mutation-checked** — broken on purpose to see them fail.
  One did not fail, and that is recorded rather than glossed: the "every switch column is cleared"
  assertion passed over columns that were already NULL in the harness seed. The seed now sets them.

- **The webhook's handlers, RUN rather than read** (`src/test/stripeWebhookExecuted.test.ts`).
  Until this existed, every assertion about them was a source scan — "the file contains
  `billing_source: 'stripe'`" — because `stripe-webhook/index.ts` calls `serve()` at import time
  and its handlers were file-private. They now live in `_shared/stripe-webhook-handlers.ts` and
  are driven against a fake PostgREST that records every write, so the platform's half of the
  list above is executed: the subscription activates with a renewal date taken from the PAYMENT;
  a SEPA session completing `unpaid` activates **nobody**; the later `async_payment_succeeded`
  does; a bounced debit calls `abandon_legacy_switch(..., 'debit_bounced')` and marks the payment
  failed; a first failed invoice bells the office and says **nothing** to the member, while an
  exhausted one texts them in their own language; and none of it writes to `members` at all —
  golden rule 4, executed rather than asserted about a string. All four of those were
  mutation-checked.
- **The runner, RUN** (`src/test/billingMigrationRunExecuted.test.ts`), including the one item on
  Lee's list that could not be checked at all before: **"Runner re-run sends nothing twice."** The
  claim is an insert against a unique index, and the fake enforces exactly that index — so the
  second run claims nothing, sends nobody, and reports one skipped. Also executed: the sweeps
  still run while the migration is switched OFF (a member left mid-switch is out of the Santander
  export, so pausing must not strand them); a dry run decides everything and writes nothing; a
  member nobody can price is belled once rather than daily; and a failed run rings the bell rather
  than stopping silently. Six mutations were tried and six bit — two of them only after a test was
  strengthened, because the first version of the dry-run case used a member whose renewal had not
  passed, so there was no write for the guard to prevent.

**Not proven until the workflow has been RUN and READ.** The rehearsal exists, its judgement is
executed against a fake Stripe, and `STRIPE_TEST_KEY` is now in Actions — but a workflow that
exists is not a workflow that has answered. Nothing goes to live keys on the strength of this
section; it goes on the strength of a run.

**And one thing cannot be proven by any script, now or later.** The two events the whole SEPA path
turns on — `checkout.session.async_payment_succeeded` and `async_payment_failed` — exist ONLY for
a Checkout Session that a person completed in a browser. No API call creates one. So the rehearsal
proves the three things around it instead, and says which is which rather than blurring them:

1. **the destination is subscribed to both events** — account configuration, readable with the key;
2. **the money really does move later** — the invoice-level equivalent on the same subscription,
   open at creation and paid once the clock advances, which is the behaviour the ordering depends on;
3. **the platform handles both events correctly** — executed in `src/test/stripeWebhookExecuted.test.ts`
   against a fake PostgREST.

Those three together are the whole of it. **None of them alone is**, and the gap that remains is
one click: complete a single SEPA switch link in test mode. Until somebody does, the "did the
events reach our destination" check reports **UNPROVEN** — not a pass, and deliberately not a
fault either, because Stripe having sent nothing is not the same as us having missed something.

The rehearsal worth doing in **test mode**, before live keys:

1. A monthly member completes a switch link on the 15th → the **full** fee is taken at once (not
   €0, not prorated), `billing_source` flips to `stripe` on the first payment, and the Santander
   export no longer lists them.
2. Advance the test clock a month → the next charge lands on the 15th.
3. The same again paying by **SEPA**, to see `async_payment_succeeded` arrive and activate them.
4. Fail a SEPA debit, to see `async_payment_failed` put them back on legacy billing with the bell.
5. Run the runner twice on the same day → the second run sends nothing.

**Steps 1 to 5 are now one button**, not a checklist somebody performs and interprets, and it is
pressed where the key already lives:

> **GitHub → Actions → "Stripe rehearsal" → Run workflow**, with `amount` in cents and `day` set
> to a member's Santander day. It is `workflow_dispatch` only — every run creates real objects in
> the test account, and it is not a merge gate.

The key is an Actions secret (`STRIPE_TEST_KEY`), mapped into `env` for the steps that need it and
never echoed, never put on a command line, never interpolated into a URL, and never written to the
artifact. `src/test/stripeRehearsalWorkflow.test.ts` asserts each of those, and asserts the one
that would be silent: every step pipes through `tee` to get its output into both the log and the
artifact, and **without `set -o pipefail` a pipeline exits with `tee`'s status — so a rehearsal
that failed every assertion would report the step green.**

It still runs from a terminal, unchanged, for anyone who has a key:

```
STRIPE_TEST_KEY=sk_test_... node scripts/stripe/test-clock-rehearsal.mjs --amount <cents>
node scripts/stripe/test-clock-rehearsal.mjs --day 31 --amount <cents>   # the month-end clamp
STRIPE_TEST_KEY=sk_test_... node scripts/stripe/platform-check.mjs       # did the events reach us
```

It creates a test clock, a customer and a subscription carrying the switch link's **exact**
parameters, then asserts, per step:

| | |
|---|---|
| **card, first charge** | the FULL amount — **not €0, not prorated**, the trap a `billing_cycle_anchor` sets |
| **card, next charge** | the same day of the month, accepting a month-end clamp as the right answer rather than a fault |
| **SEPA, settles** | the debit is presented for the full amount — `open` is correct, because SEPA settles days later, which is why the webhook must handle `async_payment_succeeded` |
| **SEPA, bounces** | exactly **one retry scheduled**. Lee's rule 4 is "one Stripe smart retry, then staff bell + friendly SMS", and that is only true if Stripe actually retries — with none, the member is told on the *first* failure, which is several hundred texts about a problem that usually fixes itself |
| **the destination** | an **enabled** webhook destination carries BOTH `checkout.session.async_payment_succeeded` and `async_payment_failed`. Checked FIRST, because it is the only question here whose answer can be wrong while every other step passes — and its consequence is silent: the member completes the link, pays days later, we never hear it, and since `switch_pending` already removed them from the Santander run, **nobody collects from them at all** |

Each step prints the Stripe object ids it relied on, so a run nobody watched can be opened in the
dashboard afterwards, and each failure names **which of Lee's rules it breaks** rather than only
what Stripe returned.

**The SEPA halves advance the clock, and that is the whole of why they mean anything.** Read at the
instant the subscription is created, the good IBAN and the bad one are *identical* — both `open`
with the payment processing, because a SEPA debit takes days either way. The earlier version of
this rehearsal stopped there and therefore passed both. Advancing the clock is what separates
them, and it is also what makes the assertion Lee's brief actually asks for possible: the invoice
was **not** paid at creation and **was** paid afterwards, which is the Stripe-side fact behind
"the member flips to `stripe` on the event, not on completion".

Measured rather than assumed: replacing that advance with a bare `ready = true` passed all 54
tests, because the fake answers with a settled invoice whether or not the clock moved. The
ordering is now asserted directly — subscription created, *then* clock advanced, *then* invoice
re-read — and that mutation now fails twice.

Pass or fail per step, non-zero exit. It **refuses** without a key rather than skipping, refuses a
live key outright, and reports `--no-sepa` as a **failure** rather than as silence — skipping the
path most of these members take must not produce a green run.

Its **judgement** is executed here — 31 tests in `src/test/stripeRehearsal.test.ts`, nine
mutations, each one made to fail. Its **HTTP** has not been: no key, so the REST shapes come from
Stripe's documented surface. Every read checks for the field it needs and reports the missing one
by name, so the first real run is a fixable message rather than a stack trace.

Completing one real Checkout Session still needs a browser. That stays manual, and it is step 0.

Items 1 and 2 are the ones that would embarrass us, and neither can be checked from here — they
are Stripe charging what its own parameters say. Everything on that list that is OURS is now
executed (above); what is left is Stripe's own behaviour and the SEPA round trip through a real
bank.

## 7. One line of the brief that reads two ways — and the setting that settles it

> The runner times the link to the member's Santander date **so paying on completion lands on
> their usual day.**

> monthly members — send the switch link **3 days before** their Santander day.

Both are in the brief, and they do not agree. A member who pays the moment the link arrives has a
Stripe billing day of *(Santander day − 3)*, which is three days earlier than their usual one —
not the same day. The two only coincide if the link goes out **on** the day.

**Built to the specific number**, because 3 is what the runner section states outright, and because
a few days' notice is what lets somebody ring their son before the money moves. It is not a guess
baked into code: `billing_migration_monthly_lead_days` is a setting in **Admin → Settings →
Billing**, and setting it to **0** makes the link go out on the Santander day, so paying on
completion lands on the usual day exactly. Zero is handled deliberately — an empty or unreadable
row falls back to 3 rather than silently becoming 0, which was a defect found and fixed on the way.

Lee's call, and it costs one field on one screen either way.

## 8. The rules this was built to, in one place

1. **Nobody pays twice.** A member is out of the Santander export from the moment a Stripe session
   exists, and back in it the moment the switch ends without money — whether that is the 14-day
   lapse or a bounced first debit.
2. **Nobody loses monitoring.** Nothing in the migration touches `members.status`. Every one of
   these members is `active` before, during and after; a failed debit says so in as many words to
   the staff member reading the bell.
3. **`billing_source = 'stripe'` is written by the payment webhook and nowhere else** — golden
   rule 4, applied to who bills rather than only to who is active.
4. **The setup day becomes the billing day.** No €0 setups, no future anchors, no proration.
5. **Never twice is a unique index, not a check.** Every send claims itself by INSERTing a
   `notification_log` row carrying `billing-switch:<member>:<renewal>:<kind>`.
6. **What cannot be established is refused, not guessed.** A member whose Karma label names no plan
   gets no link and the office gets a bell; Santander goes on collecting from them meanwhile.
