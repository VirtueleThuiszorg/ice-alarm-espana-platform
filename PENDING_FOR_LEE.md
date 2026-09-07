# PENDING_FOR_LEE.md — handover

> **This file is the handover from the 5–7 September 2026 autonomous run.** Claude Code cannot
> apply migrations, set secrets, approve senders, publish DNS, rotate keys or take a payment.
> Everything it merged that needs one of those is listed here, in order.
>
> **Read this before `supabase db push`.**

---

## 1. Migrations merged but NOT in production

`supabase/migrations/APPLIED_TO_PROD.txt` is the record of what production has. **Claude Code
has appended nothing to it** — it cannot apply migrations, so claiming they were applied would
make the manifest lie, and the drift gate (#164) depends on that manifest being true.

**Apply in this order, then append each filename to `APPLIED_TO_PROD.txt` and merge that.**

| # | Migration | What it does | Reversible |
|---|---|---|---|
| _(none outstanding)_ | | | |

> **Nothing is outstanding right now, and that is a real state rather than an empty table.**
>
> `20260905100000_staff_delete_fk_rules.sql` — the one that was held in §5 on 5 September — is
> **applied and recorded**: you merged #176, pushed it, and #179 appended it to
> `APPLIED_TO_PROD.txt`. Production is level with the repo, and `main` is green.
>
> **The WP2–WP7 schema bundle is also applied.** #180 and its corrections #187 are merged,
> pushed, and recorded in `APPLIED_TO_PROD.txt` by #185 and #189 — six migrations covering the
> fulfilment state machine and its D9 trigger, readiness's second condition, WP3's notification
> consent/templates/log, WP5's circle of care, WP6's messaging columns and WP7's attribution
> guard. That was the method change D-3 argued for: **one** PR carrying every schema change the
> rest of the brief needs, so the drift gate is paid once instead of once per increment. It
> worked — nothing has been blocked on it since.
>
> Two verification queries are still owed on it, S8 and S9, because the backfill runs at apply
> time and the RLS harness has no rows to assert against at that moment.

---

## 2. Secrets, settings and approvals only Lee can do

| # | Action | Where | Why it matters | Status |
|---|---|---|---|---|
| S1 | **Rotate the `sb_secret_` key** that was pasted into chat | Supabase → Project Settings → API Keys | A service-role key in a chat log is a live credential | ⬜ |
| S2 | **Approve the Twilio WhatsApp sender** | Twilio console | D8's opt-in link and D7's WhatsApp channel cannot send until approved. **Has its own clock — start early** | ⬜ |
| S3 | **Verify `icealarm.es` with Resend**, then edit the existing SPF record (one record only), publish DKIM + DMARC | Resend + DNS | Email channel stays OFF until this delivers. Nothing built this run depends on email | ⬜ |
| S4 | **Set `GMAIL_APP_PASSWORD`** or retire the Gmail transport in favour of Resend | Supabase → Edge Function secrets | `send-member-update-request` currently fails on the missing secret | ⬜ |
| S5 | **Disconnect the stale Vercel project** `care-conneqt-platform` (under `lee-wakemans-projects`) | Vercel | It fails on **every** PR because the repo was renamed. The live project `ice-alarm-espana-platform` (under `virtuele-thuiszorg`) deploys fine. Right now every PR shows a red X that means nothing — which is how a real red X gets ignored | ⬜ |
| ~~S6~~ | ~~**Set `system_settings.settings_emergency_phone` = `950 473 199`**~~ — **now a migration** (`20260907110200`), not a manual edit. The brief asked for one in WP1(b) and it was never written; it sat here as a table edit instead. `ON CONFLICT DO NOTHING`, so if you already set it by hand your value wins. Original note kept below for context: | Supabase → Table editor → `system_settings` (it is **data, not schema** — no migration needed, no drift-gate wait) | Until this row exists the 24-hour number is **absent everywhere** — public site, pendant page, member device/support/dashboard, join confirmation, invoices. That is deliberate and correct (the old hardcoded `+34 900 123 456` was not a number this company owns and was a live `tel:` link), but it means members currently see no number at all. **This is the highest-value five-second job on this list.** | ⬜ |
| S8 | **After pushing the WP2 corrections, verify the backfill** — run `select status, fulfilment_state, count(*) from orders group by 1,2 order by 1;` | Supabase → SQL editor | #180 defaulted EVERY existing order to `fulfilment_state='paid'`, including ones already shipped or delivered. The corrections migration maps them (processing→allocated, shipped→dispatched, delivered→delivered, cancelled→cancelled). **This is the one part of the bundle the RLS harness cannot prove**: the backfill runs at apply time, before the suite has any rows to seed, so there is nothing for it to assert against. Expect `status` and `fulfilment_state` to agree on every row except `pending`. | ⬜ |
| S9 | **Then check for pending orders with no subscription** — `select id, order_number from orders where status='pending' and not exists (select 1 from subscriptions s where s.member_id = orders.member_id);` | Supabase → SQL editor | The brief maps `pending → paid` only where a subscription exists. A pending order without one was never paid, and there is no state below `paid` to hold it — so those rows keep the default and are **wrong in the safe direction** until a human decides. If the query returns nothing, there is nothing to do | ⬜ |
| S10 | **Decide whether "Test call completed" also belongs on the SOS screen** | one line in `SOSActionPanel` | The brief says *"from the SOS screen **or** member record"*. It is built on the **member record** (`PendantFulfilmentCard`), because that is where somebody sits when they phone a member to walk them through a test — and because `SOSActionPanel` is the SOS path, where CLAUDE.md makes a human gate mandatory before merge. Say the word and it goes on the SOS screen in its own PR for you to review | ⬜ |
| S11 | **Then check for orders stuck at `paid` with a device already allocated** — `select o.order_number, o.fulfilment_state from orders o join order_items oi on oi.order_id = o.id where oi.device_id is not null and o.fulfilment_state = 'paid';` | Supabase → SQL editor | `_shared/post-payment.ts` allocates a pendant on payment — it writes `devices.status='allocated'` and `order_items.device_id` — and **does not move `orders.fulfilment_state`**. So every order allocated by the webhook since #180 sits at `paid` with its device already assigned. The fix is one line in the webhook path, which is why it is **PR #TBD, left open** (§5) rather than merged. These rows can be moved by hand, or left for the fix; either way they are wrong in the safe direction | ⬜ |
| S12 | **Check for subscriptions cancelled or paused in the DB that Stripe may still be charging** — the query is in D-10 | Supabase → SQL editor, then the Stripe dashboard | `SubscriptionTab`'s Cancel button wrote `subscriptions.status` from the browser and called **nothing** in Stripe. Any subscription showing `cancelled` or `paused` with a `stripe_subscription_id` may still be live in Stripe and still taking money from a member who believes they cancelled. The code path is fixed and removed (WP7); the rows it may already have produced are yours to check | ⬜ |
| ~~S7~~ | ✅ **DONE 2026-09-07.** ~~Run `select count(*) from partner_applications where status='pending';`~~ — **that query was wrong and unrunnable: there is no `partner_applications` table and no migration ever created one.** An application is a row in `partners` with `status='pending'` and `user_id` null, which `ConvertApplicationDialog`'s own header said. Correct query, which Lee ran: `select count(*) from partners where status='pending' and user_id is null;` → **2**, both his own test rows, since deleted → **0**. So `partner-apply`, the convert dialog, the Convert menu item and its tests are all removed. `decidePartnerInvite`'s `convert` branch and `partner-admin-invite` are kept. `PARTNER_JOURNEY.md` §4 | ✅ |

---

## 2b. Decisions Lee needs to make — found while building, deliberately NOT fixed

### D-1 — `members.user_id` is nullable **and** `ON DELETE CASCADE`

Deleting an `auth.users` row deletes the **entire member record** — and with it, by their own
cascades, that person's `medical_information`, `emergency_contacts`, `devices`, `alerts` and
`subscription`.

The column being **nullable** proves a member can exist without a login (staff-created members
do). So `SET NULL` — *"they no longer have a login; they are still a member"* — is available and
is probably the safer semantic on a life-safety product.

**Not changed**, because it is an **erasure-policy** decision rather than an audit fix:
cascading may be exactly what GDPR erasure is meant to do. Deciding it silently inside a PR
about staff deletion would be the wrong way to decide it. The RLS harness excludes it **by
name**, with a control assertion that fails if a *second* nullable cascade ever appears — so the
exclusion cannot quietly grow into a blanket.

**Question: should deleting a login delete the member, or orphan them?**

### D-2 — four `NOT NULL` staff FKs still block deletion

`SET NULL` is impossible on a `NOT NULL` column, so these were left alone rather than guessed at:

| Table | Column |
|---|---|
| `ticket_comments` | `staff_id` |
| `staff_shift_covers` | `original_staff_id` |
| `staff_shift_covers` | `cover_staff_id` |
| `internal_tickets` | `created_by` |

Each needs its own answer: CASCADE (delete the comment with its author?), RESTRICT (refuse until
the shift is reassigned — arguably right for `staff_shift_covers`), or make the column nullable
first. **A departing staff member with an open shift cover still cannot be deleted** until this
is settled.

### D-3 — the drift gate stops **everything**, not just the next migration

> **Outcome, 2026-09-07.** You cleared it: #176 merged, pushed and recorded by #179. The
> working method changed as a result — schema now goes in ONE bundled PR (#180) held until you
> can push, instead of one PR per increment each re-triggering the alarm. The question below is
> still open and still yours; the method change routes around it rather than answering it.

I got this wrong and then found out the hard way, so here it is plainly.

The gate I built in #164 does two things. The one I remembered: it fails a PR that **adds** a
migration while an earlier one is unapplied. The one I forgot, though I wrote the assertion for
it myself — `migrationDrift.test.ts`, *"the steady-state alarm: drift does not become acceptable
just because this PR is innocent"* — it fails **every** build while any migration is unapplied.
Every pull request, whatever it touches, and `main`'s own build too.

So when I merged `20260905100000_staff_delete_fk_rules.sql` (PR #170), **main went red and would
have stayed red until you ran `supabase db push`** — blocking every remaining piece of this run,
including a fix that removes a wrong emergency phone number from live member pages.

Two ways out, and I want to be explicit about which I took and why:

- **Weaken the gate** so a PR adding no migrations passes. I did **not** do this. There is a
  deliberate, commented test asserting the current behaviour; deleting it because it caught me is
  the "turn the gate off because it is inconvenient" failure the gate exists to prevent, and it
  would have been me quietly overruling a decision of yours while you were away.
- **Take the migration back out of main until you can push it.** This is what I did. The merge
  was reverted (a revert commit, not a history rewrite), the migration is an **open PR** in §5
  with its body and all six harness assertions intact, and main is green again.

**Nothing is lost and nothing was watered down** — the migration is one merge away the moment
production is level. But it does mean this run ships **no schema changes at all**; everything
merged is application code, tests and docs.

**If you would rather the gate warned instead of failed when a PR adds nothing**, that is a
one-line change in `scripts/migrationDrift.ts` plus its test — but it is your call, not mine, and
I would want the drift to stay loudly visible in the build output either way.

### D-4 — should a pendant test EXPIRE? (parked by you, 2026-09-07)

`FULFILMENT_MODEL.md` §9 Q4. You parked it, so it is recorded here rather than dropped.

A pendant tested eighteen months ago and never pressed since is evidence of very little. As
shipped, `tested` is **permanent** until the device is replaced or marked faulty (your Q2
ruling) — so readiness can be true on the strength of a test nobody has repeated since.

Nothing is built for a re-test cadence and nothing assumes one. The decision is only worth
making before the first test is a year old, which is 2027 at the earliest. **No action now.**

### D-5 — WP5's schema already exists (finding, 2026-09-07)

The brief asks for "circle-of-care schema". It is already there and complete:
`20260814140000_care_access_grants.sql` implements `CONSENT_MODEL.md` §4 in full — the three
categories, consent basis, revocation that cannot be undone, the predicate functions and every
policy. **No new schema is proposed for it.**

If the brief meant something beyond that, say what, and it goes into PR #180 before you merge
it — that is the point of holding it open.

### D-7 — the provisioning checklist has **14** steps, not the brief's six (finding, 2026-09-07)

The brief: *"programmed: the ProvisioningChecklist's **six** steps are all complete."* It has
fourteen (`useDeviceProvisioning.PROVISIONING_STEPS`), grouped as Hardware 5, Network 6,
Testing 3. They are real EV-07B steps, not padding — SIM, charge, pair the base, power on, APN,
server IP, the A1 SOS number, reporting mode, volume, a test SOS call, a GPS check, and a final
confirm.

**Built to the reality, not to the number.** `allocated → programmed` fires when **all** the
steps present are complete, so the count is not hard-coded anywhere and trimming or adding steps
changes nothing in the transition.

Two things worth your eye, neither of which I changed:

1. **Step 12 is already a test SOS call** — *"Press the SOS button to trigger a test call.
   Verify the configured SOS number receives the call and two-way audio works."* That is a
   bench test by staff, whereas `tested` means the **member** pressed **their** pendant in
   **their own home**. They are deliberately different states and I have kept them apart. If
   you want the bench test to count, say so — but it would mean readiness could be true for a
   member who has never touched their pendant.
2. **`PROVISIONING_CATEGORIES` disagrees with the step list.** It maps `contacts` to step index
   8 and `network` to indices 5–10, so index 8 (`set_sos`) is in both and the `contacts`
   category duplicates rather than partitions. Cosmetic today — the checklist renders by
   category — but it is the kind of hand-maintained index list that goes wrong the moment a step
   is inserted. Not fixed here because it is not this increment's concern; say the word.

### D-8 — a payer's consent has nowhere to live (decision, 2026-09-07)

WP3's dispatcher notifies the member **and the payer**, per D6, and the payer half is built:
recipient resolution, their own template rows (`fulfilment.*.payer`, because *"the payer is told
about the order, the member about their alarm"*), and the address comparison that stops a payer
who **is** the member being messaged twice.

**Every payer send is refused, and logged as `skipped_no_payer_consent`.**

`member_notification_optin` is keyed on `member_id`. A payer is not a member — `payers` is its
own table, with its own `user_id` — so there is no row that can say "this payer agreed to
WhatsApp". Rather than invent a legal basis inside a module, the dispatcher refuses and records
the refusal, which is the safe direction on a privacy question and leaves the gap visible in
`member_notification_log`.

**Two ways to close it, and the difference is a real decision, not a shape:**

1. **A `payer_notification_optin` table**, same shape as the member one (`payer_id`, `channel`,
   `opted_in`, `opted_in_at`, `basis`). Treats a payer's permission as consent they give, and
   means somebody has to ask them. Honest, and it means no payer hears anything until they say
   yes.
2. **Contract basis** — a payer paying for a subscription is party to it, so transactional
   messages about the order they are paying for need no opt-in. This is the ordinary legal
   footing for a receipt or a dispatch note, and `consent_basis` would gain a `contract` value.
   It sends sooner, and it needs you to be comfortable that "your father's pendant has been
   dispatched" is transactional rather than marketing.

**I have not chosen.** (2) is probably right for dispatch and delivery, and probably wrong for
anything that reads as an update about the member's wellbeing. That line is yours to draw, and
it is the sort of thing a regulator asks about.

**Nothing is blocked on it** — member notifications work whenever you turn a channel on.

### D-9 — `payers` has no `preferred_language` (finding, 2026-09-07)

The dispatcher renders in the recipient's locale. `members.preferred_language` exists; `payers`
has `email`, `phone`, `full_name`, `relationship` and nothing about language.

So a payer is currently rendered in **the member's** language. That is a guess, and it is a
named one: the payer is usually family, and family usually shares a language. It is wrong for
exactly the case this product has a lot of — a Dutch or English son in another country paying
for a Spanish-speaking parent, or the reverse.

One column, `payers.preferred_language`, with the member's as the default. Not added because
D-8 means no payer is messaged yet, so it would be schema for a code path that cannot run —
and the next schema bundle is a better place for it than a migration on its own.

### D-10 — `member_action` has no `resume`, and three of the six are recorded rather than performed (2026-09-07)

**The enum is your six**: renew, switch_to_single, switch_to_couple, add_pendant, pause, cancel.
Resuming a paused subscription is a seventh thing staff do and it is not in the list, so a resume
is logged as an ordinary attributed `activity_logs` row instead of a `member_action` one — it
carries the actor and a reason, but it does not appear in the `member_action` index or in a query
filtered by that column. One `ALTER TYPE public.member_action ADD VALUE 'resume';` fixes it; it
is not in a migration yet because the next schema bundle is a better home than a migration on its
own.

**And three of the six are RECORDED, not performed.** Pause and cancel go through Stripe (or
Mollie, for cancel) and the server mirrors the status. Renew, the plan switch and adding a pendant
do not: each needs new Stripe money-movement code against a real customer's card, nothing in this
repo can test it, and a mistake in it charges a real person. So they are offered with a badge that
says *"You do it in Stripe"* and a note that the billing was not touched.

That is a deliberate stop, not an omission. **The audit trail — the part that did not exist at
all — works for all six today**, so a renewal you take over the phone can be recorded with an
owner and a reason. Say the word and the three become automated in their own PR, which I would
expect you to want to review rather than merge on green.

**One thing to know regardless of what you decide.** The buttons that were there before were
worse than absent: `SubscriptionTab.updateStatus` wrote `subscriptions.status` from the browser
and called nothing in Stripe, so **Cancel left Stripe charging the member's card**. That is fixed
and gone; the query to find anybody it happened to is

```sql
select m.first_name, m.last_name, s.id, s.status, s.stripe_subscription_id
from subscriptions s join members m on m.id = s.member_id
where s.status in ('cancelled','paused') and s.stripe_subscription_id is not null;
```

Any row it returns needs checking in the Stripe dashboard: the subscription may still be active
there.

### D-11 — R3's one sentence loses the reassurance, and the fix is three strings (2026-09-07)

R3 puts the readiness notice in the header as **one sentence**. The bar it replaces led with
*"Your alarm works and an operator will always answer it. But we have no one to contact on your
behalf yet."* — and leading with what still WORKS is a rule in its own right
(`ICE_OPERATOR_CARD_SPEC.md` §5.2): an 80-year-old who reads "we still need your emergency
contacts" and concludes their alarm is not working is worse served than before.

**The two rules are in tension and I implemented R3**, because it is newer and more specific, and
moved the reassurance to the contacts page where the member lands. Nothing is frightening in the
meantime — the sentence on screen is a task, not an alarm.

**But one sentence can do both**, and this is the wording I would use:

| gap | proposed |
|---|---|
| contacts | *Your alarm works — we just need someone to contact.* |
| pendant | *Your alarm works — we just need to test it with you.* |
| both | *Your alarm works — we just need someone to contact.* (one task at a time) |

Three keys, three languages. **Not done in this PR** because two other PRs were open on
`src/i18n/locales/*.json` at the time and CLAUDE.md's serial-merge rule exists because two
outages came from exactly that. Say the word — or say you prefer the current wording — and it
goes in the next locale pass either way.

Note also: **the phone number is no longer in the notice.** One sentence has no room for it, so
the pendant variant links to Support, where the number lives. That removed the last test fixture
allowed to contain `+34 900 123 456`, which is a small good thing.

### D-12 — a signed-in member cannot buy anything, and `/join` is not the workaround (2026-09-07)

R8 says *"'No active subscription' shows the plans"*, and WP4 says the Membership page carries
*"actions 'Add a pendant' and 'Change to couple' through Stripe checkout only."* Both need a
checkout an EXISTING member can start. **There isn't one, and the obvious substitute is a trap.**

`/join` has no idea anybody is signed in. It ends at `submit-registration` →
`submit_registration_atomic`, which **INSERTs a `members` row unconditionally** — no lookup, no
`user_id` link. A signed-in member sent through it comes out with a *second* member record: a
second medical record, a second set of emergency contacts, a second Stripe customer. On this
product that is not a billing annoyance — it is two records for one person, and an operator with
an SOS on screen who can open the wrong one.

So the page **shows** the plans with live prices and the one-off costs, and every action opens a
prefilled support request instead. That is a real route: staff take the payment and the webhook
activates, which is golden rule 4 either way. It is also the same line WP7 stopped at (D-10) —
renew, plan switch and add-a-pendant all need new Stripe money-movement code against a real
customer's card, and nothing in this repo can test it.

**The decision.** Either

  (a) leave it — every change of plan is a conversation. Honest, slower, and for a customer base
      this age arguably the right shape anyway; or
  (b) build `create-member-checkout`: a server function that takes an EXISTING `member_id`, builds
      the line items, and returns a Stripe session, with the webhook activating as it does today.
      That is a payment-path PR, so it would stay open for you regardless.

Worth knowing before you choose: the query for members who would use it today is

```sql
select m.id, m.first_name, m.last_name, s.status
from members m left join subscriptions s on s.member_id = m.id
where s.id is null or s.status <> 'active';
```

### D-13 — may a member see WHO pays for them? (2026-09-07)

The Membership page now says *"Somebody else pays for your membership"* when `payer_id` is set. It
does **not** say who, and that is RLS rather than restraint: `payers` grants SELECT to staff and to
the payer themselves. A member can read `payer_id` — it is a column of their own subscription — but
not the row it points at.

Showing the name needs a new policy on `payers`, and that table's design note is *"being a payer
grants NO access to any care data"*, argued in both directions. Adding a policy to it in passing,
on a WP4 copy PR, is exactly the kind of thing PAYER_MODEL.md was written to stop. **RLS policies
are a mandatory human gate (CLAUDE.md), so this was never mine to decide.**

The argument for: an 80-year-old who cannot see who pays for their alarm cannot check it is still
the daughter they think it is. The argument against: the payer's name, email and phone are the
payer's data, and a member's account being taken over would expose a third party who never agreed
to that.

If you want it, the narrow version is a policy exposing `full_name` and `relationship` only — not
email, not phone — to `get_member_id(auth.uid())` on the subscription that points at the row. Say
the word and it goes in its own migration for you to review.

### D-6 — five alert/badge colours are below WCAG AA, and fixing them changes safety colour

Measured on the base `:root` palette (`publicPaletteContrast.test.ts`). All are white-or-near-
white text on a saturated fill, rendered by `<Badge>` — small text, so **AA 4.5:1 applies**, not
the 3:1 large-text bar:

| pair | ratio |
|---|---|
| `--alert-resolved-foreground` on `--alert-resolved` | 3.33 |
| `--destructive-foreground` on `--destructive` | 3.78 |
| `--alert-checkin-foreground` on `--alert-checkin` | 3.80 |
| `--alert-sos-foreground` on `--alert-sos` | 4.20 |
| `--muted-foreground` on `--muted` | 4.45 |

**One was worse and is fixed:** `--alert-fall` was **2.79** — below even the 3:1 floor, on the
badge that says a fall was detected. Fixed by darkening the TEXT to `25 95% 15%` (5.00:1); the
orange fill is untouched, so the operator's colour cue is unchanged. It copies the treatment
`--alert-battery` already uses on the neighbouring hue.

**The other five are your call**, because both fixes touch safety UI: darken the fill (changes a
colour operators recognise) or make badge text larger/bolder (changes layout). They are
*ratcheted* meanwhile — pinned at today's values, and the suite fails if a sixth sub-AA pair
appears or a pinned one slides. That records the debt without blessing it.

**PR is held for the human gate** — CLAUDE.md gates the SOS/alert path, and a fall-badge colour
is alert-path presentation.

---

## 3. Per-channel flags (D7) — turn on only when proven

Each channel is switched on independently in `system_settings`, **default OFF**. A channel that
is off is skipped and logged, never silently failed.

**The three rows are seeded `false` by PR #180**, so a channel is off because somebody wrote
off rather than because a lookup missed. They are data, not schema — but they arrive with that
migration, so they exist only once you have merged and pushed it. Turning one on stays a table
edit you make. Note the SECOND gate PR #180 adds: a send now needs the global flag on **and**
the member's own per-channel opt-in. A flag on its own no longer sends anything.

| Channel | Flag | Turn on when |
|---|---|---|
| SMS | `notify_channel_sms` | **Proven today — may be ON** |
| Email | `notify_channel_email` | After S3 verifies and a test message actually arrives |
| WhatsApp | `notify_channel_whatsapp` | After S2 approves the sender |

---

## 4. Tests only a human can run

1. **Sign up through `/join` with a real card.** Watch: webhook activates → readiness queue
   shows you → header notice shows → add a contact → allocate a pendant → walk the six states →
   test call → `tested`. **Refund.** That one pass proves WP2, WP3 and the payment path together.
2. **The D5 escalation ruling** — before the SOS drill.
3. **The SOS drill itself**, with Travis and Mary.

---

## 5. PRs left OPEN for Lee, deliberately

| PR | Why it is open |
|---|---|
| ~~**#176**~~ | ✅ **Done.** Merged, pushed, and recorded in `APPLIED_TO_PROD.txt` by #179. Production is level. |
| ~~**#180**~~, ~~**#187**~~ | ✅ **Done.** Merged and pushed; recorded in `APPLIED_TO_PROD.txt` by #185 and #189. Production is level. The monitoring-ready count is **zero** and that is the first honest number this system has produced — see S8/S9 for the two queries that confirm the backfill |

| **the `paid → allocated` line in `_shared/post-payment.ts`** — not yet raised | The webhook allocates a pendant and never moves the fulfilment state, so the first rung of the ladder has no writer on the payment path. It is one `.update({ fulfilment_state: "allocated" })` after the device is allocated — but `_shared/post-payment.ts` is imported by **both** `stripe-webhook` and `mollie-webhook`, so per the brief it stays open for you. **The staff allocation path is already fixed and merged** (`DeviceTab.assignDevice` → `linkDeviceToPendantOrder`), so allocation by hand works today; only webhook allocation is affected. S11 finds the rows |

> Per the brief: any PR touching `supabase/functions/stripe-webhook` or
> `supabase/functions/create-checkout` stays open. A broken webhook means no member ever
> activates, and it fails **silently**.
