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
> **The next three migrations are in PR #180 and are NOT merged** (§5). That is the method
> change D-3 argued for: one PR carrying every schema change the rest of the brief needs, so
> the drift gate is paid once instead of once per increment.

---

## 2. Secrets, settings and approvals only Lee can do

| # | Action | Where | Why it matters | Status |
|---|---|---|---|---|
| S1 | **Rotate the `sb_secret_` key** that was pasted into chat | Supabase → Project Settings → API Keys | A service-role key in a chat log is a live credential | ⬜ |
| S2 | **Approve the Twilio WhatsApp sender** | Twilio console | D8's opt-in link and D7's WhatsApp channel cannot send until approved. **Has its own clock — start early** | ⬜ |
| S3 | **Verify `icealarm.es` with Resend**, then edit the existing SPF record (one record only), publish DKIM + DMARC | Resend + DNS | Email channel stays OFF until this delivers. Nothing built this run depends on email | ⬜ |
| S4 | **Set `GMAIL_APP_PASSWORD`** or retire the Gmail transport in favour of Resend | Supabase → Edge Function secrets | `send-member-update-request` currently fails on the missing secret | ⬜ |
| S5 | **Disconnect the stale Vercel project** `care-conneqt-platform` (under `lee-wakemans-projects`) | Vercel | It fails on **every** PR because the repo was renamed. The live project `ice-alarm-espana-platform` (under `virtuele-thuiszorg`) deploys fine. Right now every PR shows a red X that means nothing — which is how a real red X gets ignored | ⬜ |
| S6 | **Set `system_settings.settings_emergency_phone` = `950 473 199`** | Supabase → Table editor → `system_settings` (it is **data, not schema** — no migration needed, no drift-gate wait) | Until this row exists the 24-hour number is **absent everywhere** — public site, pendant page, member device/support/dashboard, join confirmation, invoices. That is deliberate and correct (the old hardcoded `+34 900 123 456` was not a number this company owns and was a live `tel:` link), but it means members currently see no number at all. **This is the highest-value five-second job on this list.** | ⬜ |
| S7 | **Run `select count(*) from partner_applications where status = 'pending';`** | Supabase → SQL editor | The public application path is retired — `/partner` now redirects to `/partner/join` and nothing calls `partner-apply`. But production may still hold applications from real people, and `ConvertApplicationDialog` + the `partner_applications` table are the only way to turn one into an account, so they were **kept**. **If the count is 0**, the convert dialog, the `partner-apply` function and the table can all be deleted — say so and it will be done in one PR. If it is not 0, each row needs converting by admin invite before anything is removed. `PARTNER_JOURNEY.md` §4 | ⬜ |

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
| **#180** — `[HOLD FOR LEE] schema bundle for WP2–WP5` | **Merge only when you are at a keyboard and can `supabase db push` in the same sitting.** Three migrations: the fulfilment state machine + D9 trigger, readiness's second condition (D4), and WP3 notification consent/templates/log. Everything in it is proven — RLS harness **190 → 252**, and every new assertion made to fail against nine deliberate mutations. It is queued on *your availability*, not on its own quality. Suggested order: merge → `supabase db push` → append the three filenames to `APPLIED_TO_PROD.txt` → merge that → main green. **Expect the monitoring-ready count to drop to zero** the day it lands — no order has ever been tested, and that is the first honest number the system has produced |

> Per the brief: any PR touching `supabase/functions/stripe-webhook` or
> `supabase/functions/create-checkout` stays open. A broken webhook means no member ever
> activates, and it fails **silently**.
