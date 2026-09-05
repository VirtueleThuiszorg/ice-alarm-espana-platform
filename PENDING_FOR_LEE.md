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

> After pushing: `git pull`, append the filenames above to `APPLIED_TO_PROD.txt`, commit, merge.
> The drift gate will fail the next migration-bearing PR until you do.

---

## 2. Secrets, settings and approvals only Lee can do

| # | Action | Where | Why it matters | Status |
|---|---|---|---|---|
| S1 | **Rotate the `sb_secret_` key** that was pasted into chat | Supabase → Project Settings → API Keys | A service-role key in a chat log is a live credential | ⬜ |
| S2 | **Approve the Twilio WhatsApp sender** | Twilio console | D8's opt-in link and D7's WhatsApp channel cannot send until approved. **Has its own clock — start early** | ⬜ |
| S3 | **Verify `icealarm.es` with Resend**, then edit the existing SPF record (one record only), publish DKIM + DMARC | Resend + DNS | Email channel stays OFF until this delivers. Nothing built this run depends on email | ⬜ |
| S4 | **Set `GMAIL_APP_PASSWORD`** or retire the Gmail transport in favour of Resend | Supabase → Edge Function secrets | `send-member-update-request` currently fails on the missing secret | ⬜ |
| S5 | **Disconnect the stale Vercel project** `care-conneqt-platform` (under `lee-wakemans-projects`) | Vercel | It fails on **every** PR because the repo was renamed. The live project `ice-alarm-espana-platform` (under `virtuele-thuiszorg`) deploys fine. Right now every PR shows a red X that means nothing — which is how a real red X gets ignored | ⬜ |
| S6 | **Run `select count(*) from partner_applications where status = 'pending';`** | Supabase → SQL editor | The public application path is retired — `/partner` now redirects to `/partner/join` and nothing calls `partner-apply`. But production may still hold applications from real people, and `ConvertApplicationDialog` + the `partner_applications` table are the only way to turn one into an account, so they were **kept**. **If the count is 0**, the convert dialog, the `partner-apply` function and the table can all be deleted — say so and it will be done in one PR. If it is not 0, each row needs converting by admin invite before anything is removed. `PARTNER_JOURNEY.md` §4 | ⬜ |

---

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
| _(none yet this run)_ | |

> Per the brief: any PR touching `supabase/functions/stripe-webhook` or
> `supabase/functions/create-checkout` stays open. A broken webhook means no member ever
> activates, and it fails **silently**.
