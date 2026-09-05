# PENDING_FOR_LEE.md — handover

> **This file is the handover from the 5 September 2026 autonomous run.** Claude Code cannot
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
| _(none yet this run)_ | | | |

> **Deliberately empty — see D-3.** No migration is merged into `main` this run. The one that was
> ready is an open PR in §5. Merging it turns every build red until you push, so it waits for you
> rather than blocking the rest of the work.

---

## 2. Secrets, settings and approvals only Lee can do

| # | Action | Where | Why it matters | Status |
|---|---|---|---|---|
| S1 | **Rotate the `sb_secret_` key** that was pasted into chat | Supabase → Project Settings → API Keys | A service-role key in a chat log is a live credential | ⬜ |
| S2 | **Approve the Twilio WhatsApp sender** | Twilio console | D8's opt-in link and D7's WhatsApp channel cannot send until approved. **Has its own clock — start early** | ⬜ |
| S3 | **Verify `icealarm.es` with Resend**, then edit the existing SPF record (one record only), publish DKIM + DMARC | Resend + DNS | Email channel stays OFF until this delivers. Nothing built this run depends on email | ⬜ |
| S4 | **Set `GMAIL_APP_PASSWORD`** or retire the Gmail transport in favour of Resend | Supabase → Edge Function secrets | `send-member-update-request` currently fails on the missing secret | ⬜ |
| S5 | **Disconnect the stale Vercel project** `care-conneqt-platform` (under `lee-wakemans-projects`) | Vercel | It fails on **every** PR because the repo was renamed. The live project `ice-alarm-espana-platform` (under `virtuele-thuiszorg`) deploys fine. Right now every PR shows a red X that means nothing — which is how a real red X gets ignored | ⬜ |

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

### D-3 — the drift gate stops **everything**, not just the next migration, and that is why the repo has no migration in it right now

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

## 3. Per-channel flags (D7) — turn on only when proven

Each channel is switched on independently in `system_settings`, **default OFF**. A channel that
is off is skipped and logged, never silently failed.

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
| **#175** — `20260905100000_staff_delete_fk_rules.sql` | **Merge this one FIRST, and only when you are at a keyboard.** Merging it turns `main` red until `supabase db push` lands (D-3). Everything in it is proven — RLS harness 190/190, three mutations red — it is queued on *your* availability, not on its own quality. Suggested order: merge → `supabase db push` → append the filename to `APPLIED_TO_PROD.txt` → merge that → main green |

> Per the brief: any PR touching `supabase/functions/stripe-webhook` or
> `supabase/functions/create-checkout` stays open. A broken webhook means no member ever
> activates, and it fails **silently**.
