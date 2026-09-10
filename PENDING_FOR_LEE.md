# PENDING_FOR_LEE.md — handover

> **This file is the handover from the 5–7 September 2026 autonomous run.** It lists what still
> needs a human: secrets, sender approvals, DNS, key rotation, taking a payment.
>
> **MIGRATIONS ARE NO LONGER ON THAT LIST.** Since 2026-09-09 CI applies schema —
> `.github/workflows/migrate.yml` runs `supabase db push` on every push to `main` that touches
> `supabase/migrations/**`, records exactly what applied in `APPLIED_TO_PROD.txt`, and commits
> that back to main as `github-actions[bot]`. You do not need to run `supabase db push`, and you
> should not: a hand-push that is not recorded is what left production's history out of order and
> made the first automated run fail.
>
> **Where to read what happened:** Actions → **Migrate Production** → the run's summary. Every run
> posts *files applied*, *files still pending*, and production's full migration list. The manifest
> commit message carries the run URL, so `git log supabase/migrations/APPLIED_TO_PROD.txt` is a
> history of every schema change with a link to the run that made it.
>
> **There is no `[HOLD FOR LEE]` convention any more.** Per Lee's ruling of 9 Sep, nothing is held
> for review: every PR targets main and merges when green, schema included. Rows below that say
> "held", "pending Lee's review" or "your gate" are a record of why work stopped **at the time**,
> not a live blocker.

---

## 1. Migrations merged but NOT in production

*This is the **A1** row of the go-live gap review.*

> ### ✅ RESOLVED 2026-09-10 14:35 — everything is in production; ONE thing is still yours
>
> **Nothing is stranded any more.** `check-migration-drift --main` reports **repo: 188 ·
> manifest: 188 · production is level with the repo**. The holiday backfill went in on
> [run #8](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34488553431)
> and the two swap migrations on
> [run #9](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34489927779).
> The balances the run read back out of `staff_holiday_balance`:
>
> ```
> Albert Soares:  16 used, 0 pending, 14 left of 30
> Carmen Nicolas: 28 used, 0 pending,  2 left of 30
> Mary Bonner:    18 used, 0 pending, 12 left of 30
> Travis Nelison:  0 used, 0 pending, 30 left of 30
> ```
>
> **WHAT IS STILL YOURS: route A below.** `supabase link` is still refused — it failed again on
> main a minute after run #8, and again on every run since — until a token with that privilege
> replaces the current one. Migrations flow through the pooler fallback (#313), which shouts a
> warning every time it is used, and it was used for all three of these. The Management API is not
> restored, and nothing else in this repo can restore it.
>
> ("Manifest matches production" stayed red on main for that same reason until #337, which is the
> paragraph below. It is green now.)
>
> #### Read the colours honestly — A1 in one paragraph
>
> **A1 is closed as "everything merged is in production", and it is NOT closed as "the supported
> path works".** Those are two different facts and the review's single tick hid the second one.
> Say it in full so nobody has to reconstruct it:
>
> * **Migrations flow via the FALLBACK.** Every schema change since 10 Sep reached production
>   through the pooler, not the Management API. It works, it is recorded in `APPLIED_TO_PROD.txt`
>   like any other run, and every single run posts a
>   `⚠ Reached production WITHOUT the Management API` warning. **A green Migrate Production run
>   does not mean the token is fixed.** If those warnings ever stop appearing, that is the good
>   news — it means `link` started working again.
> * **"Manifest matches production" was RED on main, and that red was NORMAL — until #337.**
>   The job linked its own way, so it could not pass while `link` was refused, on any commit, for
>   any reason. It is now the same shared script `migrate.yml` uses
>   (`scripts/ci/reach-production.sh`), so it reaches production by the same fallback and passes.
>   **From #337 onwards, red on that job means something real.** Do not wave it through. Its first
>   run on main
>   ([#762](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34506988777))
>   is what that looks like: `link` refused with the same privilege error, `aws-0-eu-west-1`
>   probed and connected, the warning posted, then **production: 189 applied · manifest: 189
>   recorded**.
> * **What is still yours is unchanged: route A.** A token that may call the Management API. The
>   fallback is a fallback — it needs `SUPABASE_DB_PASSWORD` to keep working and it cannot deploy
>   functions, so the day that password rotates without the token being fixed, schema stops
>   flowing altogether.
>
> The original diagnosis, kept because it was wrong and the correction is the useful part:

> ### 🔴 (superseded) 2026-09-10 — `migrate.yml` can no longer log in to Supabase, and ONE migration is stranded
>
> [Migrate Production run #3](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34474797455)
> failed on its second real outing, at the very first step that talks to Supabase:
>
> ```
> supabase link --project-ref "$SUPABASE_PROJECT_REF"
> Authorization failed for the access token and project ref pair:
> {"message":"Your account does not have the necessary privileges to access this endpoint."}
> ```
>
> **Nothing was applied** — `db push` was skipped, the manifest was not touched, and the job went
> red, which is what it is supposed to do.
>
> ### ⚠️ CORRECTED 2026-09-10, 13:55 — the token is NOT dead, and the earlier diagnosis was wrong
>
> This section first said `SUPABASE_ACCESS_TOKEN` had "expired, been revoked, or belongs to an
> account that no longer has access to `crpsuhoixfdhjugprbuc`". **The evidence contradicts that**,
> and it was there to be read at the time:
>
> | run | time | step | secret used | result |
> |---|---|---|---|---|
> | #3 | 12:06 | `supabase link --project-ref "$SUPABASE_PROJECT_REF"` | `SUPABASE_ACCESS_TOKEN` | **failed** — "Authorization failed for the access token and project ref pair" |
> | #6 | 12:52 | `supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"` | the **same** `SUPABASE_ACCESS_TOKEN`, the **same** `SUPABASE_PROJECT_REF` | **succeeded** — every edge function deployed to that project |
>
> Forty-six minutes apart, one token, one project ref: one endpoint refused it and the other
> accepted it and wrote to production. So the token is live and the account does reach the
> project. What is refused is specific to the endpoint `supabase link` calls — a scope or an
> organisation-level privilege that `functions deploy` does not need.
>
> (Runs #4, #5 and #6 all show "success" for the same reason and it means less than it looks:
> their **Apply migrations** job was *skipped* because those pushes touched no migration file.
> A green Migrate Production run is not evidence that migrating works.)
>
> ### THE FIX — two routes, and the choice is yours
>
> **A. A token with the missing privilege.** Create a new personal access token at
> <https://supabase.com/dashboard/account/tokens> from an account that owns the project's
> organisation, and replace the secret (Settings → Secrets and variables → Actions). Then re-run
> run #3 from the Actions tab — it is idempotent, so re-running is safe.
>
> **B. BUILT — the workflow no longer depends on that endpoint.** `migrate.yml` now tries
> `supabase link` first and, when it is refused, writes the two files `link` would have written
> (the project ref and the IPv4 **pooler** connection string) into the gitignored
> `supabase/.temp/`, probes the pooler READ-ONLY, and then runs the rest of the job exactly as
> before — still `--linked`, still reading the password from the environment, never on a command
> line. It emits a loud `::warning::` whenever the fallback is used, because a fallback that
> quietly rescues a broken credential is how a broken credential stays broken.
>
> Established rather than assumed, since the first version of this note was a guess:
> `db.crpsuhoixfdhjugprbuc.supabase.co` has **no A record** (direct connections are IPv6-only and
> GitHub runners are IPv4), which is exactly why `link` is what fetches the pooler URL; both
> `aws-0-` and `aws-1-eu-west-1.pooler.supabase.com` resolve, so the workflow probes each rather
> than betting on one; and `SUPABASE_DB_URL` is **not** read from the environment by the CLI, so
> the connection genuinely has to come from either the API or those files.
>
> **A is still wanted.** B gets migrations flowing again; it does not restore the Management API,
> which `supabase link` and anything else API-shaped still needs. Please do A when you can.
>
> Either way, check `SUPABASE_PROJECT_REF` is `crpsuhoixfdhjugprbuc` while you are in there.
>
> **What is stranded, and what it means until then:**
>
> | Migration | Effect of it not being applied |
> |---|---|
> | `20260910120000_holidays_2026_backfill_before_cut.sql` | The 2026 holidays taken **before** 2026-09-10 are missing from every balance. Mary reads 4 days used instead of 18, Carmen 9 instead of 28, Albert 4 instead of 16 — so a supervisor approving November sees roughly 21 days left for Carmen when she has **2**. It also has not set the four entitlements to 30 explicitly. Rehearsed on a local PostgreSQL 16 before merge: 16 ranges imported, 2 entitlements lifted, and the year then reads Albert 16/30, Carmen 28/30, Mary 18/30 — remaining **14 / 2 / 12** |
> | `20260910130000_shift_swap_apply_and_bell.sql` **(not merged — PR #306)** | The swap/cover flow's schema: `apply_shift_swap`, the bell trigger, the `wants_exchange` column and the three router events. Written and proven (558 RLS assertions on a local PostgreSQL 16), and **not merged**, because the drift gate refuses to stack a second unapplied migration on the one above — see the note under this table |
> | `20260910130100_shift_swap_router_emit.sql` **(not merged — PR #306)** | The pg_net trigger that queues the swap events to `notify-staff`, so the push leaves the building. Same PR, same reason |
>
> `main`'s **drift gate is legitimately RED** until the token is replaced and the run re-run. That
> is the gate doing its job: production trails `main` by one migration.
>
> **AND IT IS NOW HOLDING A SECOND PR SHUT — deliberately.** The gate has two halves: on `main`
> any pending migration fails it, while on a PR it fails only when the PR STACKS a migration on
> top of a pending one. **PR #306** (the swap and cover flow, rota brief §3) does exactly that, so
> its drift gate is red with:
>
> ```
> ✗ MIGRATION STACKING
> 1 migration(s) are already pending, and this PR adds 2 more on top
> Merge that first, then this. Stacking a second unapplied migration is how production fell 24 behind.
> ```
>
> Everything else on #306 is green — tests, lint, type check, build, wiring register, security
> audit — and the RLS harness passes 558 assertions locally. It has **not been merged**, because
> the one gate that is red is the gate whose entire purpose is to stop this, and both July outages
> came from pressing merge on a PR whose guard test was already red.
>
> **So replacing the token now unblocks two things, in this order:** the holiday balances go
> right, and #306 becomes mergeable. Nothing else is needed from you for either.
>
> **One honest limitation this exposed.** `scripts/ci/require-secrets.mjs` checks a secret is
> PRESENT, not that it still works — so the run got as far as the CLI before failing. A cheap
> improvement would be to make the link step's failure message say "the token is probably expired"
> rather than leaving somebody to read the Supabase error. Not done here; it is a change to the
> migrate workflow and this branch is about the holidays.

> ### ✅ CLEARED 2026-09-09 — all of these are in production, applied by CI
>
> `APPLIED_TO_PROD.txt` and production both name **185** migrations; the drift gate reports
> **none pending**. The last two — the rota and the `lead_new` emit — were applied by
> [Migrate Production run #2](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34379034687),
> which recorded them itself.
>
> **The table below is kept as the record of what went in, not as a list of things to do.**
> Nothing here needs a `supabase db push`; CI does that now, and `APPLIED_TO_PROD.txt` is written
> by the run rather than by hand.

`supabase/migrations/APPLIED_TO_PROD.txt` is the record of what production has, and it is now
written by CI on the strength of production's own migration list — a filename is appended only if
its version appeared in the remote list *after* a push and was absent *before* it.

| # | Migration | What it does | Reversible |
|---|---|---|---|
| 1 | `20260907120000_wp3_wp6_seed_bundle.sql` — **PR held open, not merged** | Rows only, plus one enum value. WP6 G5's canned replies (six shortcuts × three languages), WP3 N7's notification templates (four transitions × three channels × three languages, member-only), and WP7 W7's `resume` on `member_action`. Nothing sends because of it: all three `notify_channel_*` flags are still off, and the second gate (the member's own opt-in) applies after them | Rows yes, by the DELETEs in the file's header. **The enum value no** — Postgres has no `DROP VALUE`; reversing it means recreating the type. Called out in the migration rather than buried |

| 2 | `20260909100000_sales_command_stats_fix.sql` | Not mine — arrived on main with #259 | see the file |
| 3 | `20260909110000_payment_link_order.sql` | Not mine — arrived on main with #259 | see the file |
| 4 | `20260909120000_rota_2026_seed_and_generator.sql` — **the rota (#260, merged 9 Sep on Lee's instruction)** | `bank_holidays`, `staff_shift_swaps`, `generate_rota()`, `seed_rota_2026()`, and the 339-shift import of 2026-09-10..12-31. See **S18** — the seed is a documented no-op until the four operator staff rows exist | Yes, block written out in the file's header |
| 5 | `20260909121500_notify_staff.sql` — **renamed from `...120000_` by #278** | The notification router's schema: `notification_routes`, `staff_notification_prefs`, `staff_push_tokens`, the three columns that make `notification_log` a per-channel decision log, and 76 seeded route rows. See **S29** | see the file |
| 6 | `20260909130000_lead_new_router_emit.sql` | The `lead_new` emit the router above needs. Pairs with #5 — applying one without the other leaves the route defined and never fired, or fired with nowhere to go | see the file |

> **~~`main`'s drift gate is RED until these five are pushed~~ — all five are now applied.** The
> three paragraphs that followed described a repo with **no migrate workflow**, where
> *"nothing applies a migration but a human running `supabase db push`"*. That stopped being true
> on 2026-09-09: `migrate.yml` applies schema and records it. Kept below because the reasoning
> about *why* drift is dangerous has not changed — only who clears it.
> ## 🔴 ~~TWO MIGRATIONS ARE~~ FIVE MIGRATIONS ARE ON `main` AND NOT IN PRODUCTION — this is why CI on main is red
>
> **The count below is the 9 Sep 11:30 snapshot and is now out of date — it is FIVE, listed in
> the table above.** The two named here are still among them; three more landed the same day.
> Kept because the *why* under them has not changed.
>
> Discovered 9 Sep 11:30 while rebasing. `main` (`48e1a16`) **fails the migration drift gate**:
>
> | Migration | What it does |
> |---|---|
> | `20260909100000_sales_command_stats_fix.sql` | `get_sales_command_stats()` raised `22P02` on every call — it filtered `internal_tickets` on `category = 'sales'`, which is not a `ticket_category` value, aborting the whole function. That is the dashboard's "Failed to load" |
> | `20260909110000_payment_link_order.sql` | `create_payment_link_order()` — the pending rows behind a staff-sent payment link — plus a guard clause stopping staff typing a member into `active` without a paid subscription |
>
> **Both arrived on main inside PRs titled `[HOLD FOR LEE]`** (#243, #246), in a burst of five
> merges in about 25 minutes. Two consequences worth knowing:
>
> 1. `20260909110000` creates the function `send-payment-link` (#248) calls. If that function is
>    deployed before the migration is applied, it calls something production does not have.
> 2. Because the drift gate is the FIRST step of that job, **Type check, Build and the wiring
>    register never ran on main** — they show as `skipped`. So main is *unverified*, not
>    verified-good. Tests did pass.
>
> **The fix is yours:** `supabase db push`, then append both filenames to
> `APPLIED_TO_PROD.txt` and merge that. I have deliberately NOT written them into the manifest —
> doing so would silence the gate while production stayed behind, which is the "pin around it"
> CLAUDE.md forbids.
>
> **One is outstanding, and its PR is deliberately NOT merged.** Merging a migration before you
> can push it turns the drift gate red for *every* pull request behind it (D-3), so it waits in
> §5 until you can do both together: `supabase db push`, append the filename here, merge.
>
> **Order:** `supabase db push` (takes all three) → append all three filenames to
> `APPLIED_TO_PROD.txt` → merge that. Main goes green on the same commit.
>
> One consequence worth knowing when you read main's red X: the drift gate runs BEFORE typecheck
> and build in `ci.yml`, so while drift stands those two report `skipped` and main has no
> typecheck signal from CI. For #260 they were run locally instead — tsc app 0, tsc node 0,
> production build clean — because CI never got to them.
>
> **One is still waiting in §5 and deliberately unmerged**: #219, the seed bundle. It is not
> listed above because it is not in `main`.

---

## 2. Secrets, settings and approvals only Lee can do

| # | Action | Where | Why it matters | Status |
|---|---|---|---|---|
| S1 | **Rotate the `sb_secret_` key** that was pasted into chat | Supabase → Project Settings → API Keys | A service-role key in a chat log is a live credential | ⬜ |
| S2 | **Approve the Twilio WhatsApp sender** | Twilio console | D8's opt-in link and D7's WhatsApp channel cannot send until approved. **Has its own clock — start early** | ⬜ |
| S3 | **Verify `icealarm.es` with Resend**, then edit the existing SPF record (one record only), publish DKIM + DMARC | Resend + DNS | Email channel stays OFF until this delivers. Nothing built this run depends on email | ⬜ |
| S4 | **Set `GMAIL_APP_PASSWORD`** or retire the Gmail transport in favour of Resend | Supabase → Edge Function secrets | `send-member-update-request` currently fails on the missing secret | ⬜ |
| S5 | 🔴 **Disconnect the stale Vercel project** `care-conneqt-platform` (under `lee-wakemans-projects`) — **it is now costing you something, not just noise** | Vercel | It fails on **every** PR because the repo was renamed; the live project `ice-alarm-espana-platform` (under `virtuele-thuiszorg`) deploys fine on the same commits. Every PR therefore shows a red X that means nothing, which is how a real red X gets ignored. **New as of 2026-09-07 21:04:** it has stopped failing on configuration and started failing on quota — *"Resource is limited - try again in 24 hours (more than 100, code: `api-deployments-free-per-day`)"*. Every push to every branch triggers a build on it, and that account's free tier is now exhausted for the day. So this is no longer cosmetic: a dead project is burning the daily deployment allowance, and the next thing to hit that ceiling may be one you need | ⬜ |
| ~~S6~~ | ~~**Set `system_settings.settings_emergency_phone` = `950 473 199`**~~ — **now a migration** (`20260907110200`), not a manual edit. The brief asked for one in WP1(b) and it was never written; it sat here as a table edit instead. `ON CONFLICT DO NOTHING`, so if you already set it by hand your value wins. Original note kept below for context: | Supabase → Table editor → `system_settings` (it is **data, not schema** — no migration needed, no drift-gate wait) | Until this row exists the 24-hour number is **absent everywhere** — public site, pendant page, member device/support/dashboard, join confirmation, invoices. That is deliberate and correct (the old hardcoded `+34 900 123 456` was not a number this company owns and was a live `tel:` link), but it means members currently see no number at all. **This is the highest-value five-second job on this list.** | ⬜ |
| S8 | **After pushing the WP2 corrections, verify the backfill** — run `select status, fulfilment_state, count(*) from orders group by 1,2 order by 1;` | Supabase → SQL editor | #180 defaulted EVERY existing order to `fulfilment_state='paid'`, including ones already shipped or delivered. The corrections migration maps them (processing→allocated, shipped→dispatched, delivered→delivered, cancelled→cancelled). **This is the one part of the bundle the RLS harness cannot prove**: the backfill runs at apply time, before the suite has any rows to seed, so there is nothing for it to assert against. Expect `status` and `fulfilment_state` to agree on every row except `pending`. | ⬜ |
| S9 | **Then check for pending orders with no subscription** — `select id, order_number from orders where status='pending' and not exists (select 1 from subscriptions s where s.member_id = orders.member_id);` | Supabase → SQL editor | The brief maps `pending → paid` only where a subscription exists. A pending order without one was never paid, and there is no state below `paid` to hold it — so those rows keep the default and are **wrong in the safe direction** until a human decides. If the query returns nothing, there is nothing to do | ⬜ |
| S10 | **Decide whether "Test call completed" also belongs on the SOS screen** | one line in `SOSActionPanel` | The brief says *"from the SOS screen **or** member record"*. It is built on the **member record** (`PendantFulfilmentCard`), because that is where somebody sits when they phone a member to walk them through a test — and because `SOSActionPanel` is the SOS path, where CLAUDE.md makes a human gate mandatory before merge. Say the word and it goes on the SOS screen in its own PR for you to review | ⬜ |
| S11 | **Then check for orders stuck at `paid` with a device already allocated** — `select o.order_number, o.fulfilment_state from orders o join order_items oi on oi.order_id = o.id where oi.device_id is not null and o.fulfilment_state = 'paid';` | Supabase → SQL editor | `_shared/post-payment.ts` allocates a pendant on payment — it writes `devices.status='allocated'` and `order_items.device_id` — and **does not move `orders.fulfilment_state`**. So every order allocated by the webhook since #180 sits at `paid` with its device already assigned. The fix is one line in the webhook path, which is why it is **PR #TBD, left open** (§5) rather than merged. These rows can be moved by hand, or left for the fix; either way they are wrong in the safe direction | ⬜ |
| S12 | **Check for subscriptions cancelled or paused in the DB that Stripe may still be charging** — the query is in D-10 | Supabase → SQL editor, then the Stripe dashboard | `SubscriptionTab`'s Cancel button wrote `subscriptions.status` from the browser and called **nothing** in Stripe. Any subscription showing `cancelled` or `paused` with a `stripe_subscription_id` may still be live in Stripe and still taking money from a member who believes they cancelled. The code path is fixed and removed (WP7); the rows it may already have produced are yours to check | ⬜ |
| ~~S7~~ | ✅ **DONE 2026-09-07.** ~~Run `select count(*) from partner_applications where status='pending';`~~ — **that query was wrong and unrunnable: there is no `partner_applications` table and no migration ever created one.** An application is a row in `partners` with `status='pending'` and `user_id` null, which `ConvertApplicationDialog`'s own header said. Correct query, which Lee ran: `select count(*) from partners where status='pending' and user_id is null;` → **2**, both his own test rows, since deleted → **0**. So `partner-apply`, the convert dialog, the Convert menu item and its tests are all removed. `decidePartnerInvite`'s `convert` branch and `partner-admin-invite` are kept. `PARTNER_JOURNEY.md` §4 | ✅ |

| S13 | 🔴 **Internal staff notes already written are still visible to the member** — one UPDATE, and read the rows first | Supabase → SQL editor | The internal-note feature predates `20260907100400` and wrote `sender_type = 'system'`. The RESTRICTIVE policy protects `staff_internal` and **only** that, the member's thread selects everything in their own conversation, and it renders every row — so every internal note ever written appeared in the member's own message thread, with `[Internal Note]` still on the front of it. The code is fixed (both staff surfaces write `staff_internal` now); **the existing rows are not.** Read them before you change them, because some may be things you would rather the member had not seen:<br><br>`select m.id, m.created_at, c.member_id, m.content from messages m join conversations c on c.id = m.conversation_id where m.sender_type = 'system' and m.content like '[Internal Note]%' order by m.created_at;`<br><br>then<br><br>`update messages set sender_type = 'staff_internal' where sender_type = 'system' and content like '[Internal Note]%';` | ⬜ |
| S14 | **Send one test SMS and one test WhatsApp to the service number, and check the member's thread** | your phone, then Call centre → Messages | Inbound messages now write into the member's conversation (`STATE.md` G6) **and the Twilio signature is now enforced** — the webhooks answer **403** to anything they cannot verify, where before they logged and carried on. That is the right direction, but it means a mismatch between the URL Twilio is configured with and the URL the function sees would drop inbound messages silently, and only a real message proves it. Twilio's console shows the 403s if so. Also worth knowing: `sos-conference-status` still carries its own copy of the check ending `console.warn("Invalid Twilio signature — proceeding anyway")`. It is the SOS path, so per CLAUDE.md I have not touched it; adopting `_shared/twilio-signature.ts` there is a one-line change whenever you want it | ⬜ |
| S15 | **Set `settings_twilio_whatsapp_number`, or know that WhatsApp does not send** | Supabase → `system_settings` | The outbound WhatsApp path read `settings_twilio_whatsapp_number || "+34900000000"` — a number this company does not own. Every send was addressed FROM it, rejected by Twilio, and reported back as an ordinary API response: it looked configured and delivered nothing. It now refuses with the setting named, which is honest but still means no WhatsApp goes out until the row exists | ⬜ |
| S16 | **Store the 24-hour number in international form — `+34 950 473 199`** | Supabase → `system_settings.settings_emergency_phone` | Every `wa.me` link on this product is built from that setting, and `wa.me/<digits>` reads the digits as a **full international number**. With `950 473 199` stored, `wa.me/950473199` is not the Spanish number — it is a number somewhere else, or nowhere. Three surfaces were doing it: the public *How it works* page, partner support, and the member's new WhatsApp opt-in. `waNumber()` now returns null for a number with no `+`, so those links render **nothing** rather than going somewhere wrong — the same rule as the emergency number itself. Adding the `+34` turns all three back on and changes nothing else: `tel:` links are unaffected, a national number dials fine | ⬜ |
| S17 | **Ask Martijn for one HTTP header on `alarm.medconneqt.nl`** — until then the embed shows a refusal panel, not the platform | email to MedConneqt | Item 8 asked whether MedConneqt allows framing. **I could not check**: outbound HTTPS from this environment is refused at the proxy for that host (`403 to CONNECT`, `alarm.medconneqt.nl:443`), so anything I told you about their headers would be a guess. The page now answers it **at runtime in the operator's browser**, which is the only place the answer counts — a browser that refuses the frame parks it on `about:blank`, and the page detects that and says so plainly instead of showing a blank rectangle. What Martijn needs to send, on the pages we frame:<br><br>`Content-Security-Policy: frame-ancestors https://icealarm.es;`<br><br>and **stop sending `X-Frame-Options`** on those pages. There is no way to narrow `X-Frame-Options` to us — its `ALLOW-FROM` form is ignored by every current browser — so `frame-ancestors` is the only header that can grant the exception, and any `X-Frame-Options: DENY`/`SAMEORIGIN` alongside it still refuses us in some browsers. The blocked panel prints the exact line for whichever origin the operator is on, so an operator can copy it into an email without going through you | ⬜ |
| ~~S18~~ | ~~**`supabase db push`, then append five filenames to `APPLIED_TO_PROD.txt`**~~ — **DONE, and no longer yours.** CI applies schema (`migrate.yml`). All five are in production and recorded; the drift gate reports none pending. Two were applied by [run #2](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34379034687), three had already been pushed by hand and were reconciled against production's own migration list in #285 | — | ✅ |
| S18 | **Decide who may record a manual bank-transfer payment, and how it is attributed** — the CRM records one from the browser today | product decision | Found walking the member record (item 4). `PaymentsTab` inserts a `payments` row with `status: 'completed'`, `payment_method: 'bank_transfer'` and `paid_at: now()` straight from the browser, with **no actor and no reason**. Golden rule 4 is intact — it activates nobody, sets no subscription status and touches no member row — but *"who says this money arrived?"* cannot be answered from the row, and a bank transfer is the one payment method with no gateway to check against. The fix is small and I have deliberately not done it inside item 4: a `record-manual-payment` edge function that writes the row under the service role with `staff_id` and a mandatory reason, exactly like `useMemberAction` does for the five subscription actions. Say the word and it is one PR. Pinned in `src/test/memberCrmControls.test.ts` meanwhile, so it cannot quietly multiply |  |
| S19 | **`has_pendant` is mirrored onto EVERY subscription a member has ever had** | one-line fix, your call on where | Also from the item 4 walk. `DeviceTab` assigns or unassigns a device and then writes `subscriptions.has_pendant` with `.eq("member_id", memberId)` — no status filter, so a member with an old cancelled subscription has that row's flag rewritten by a device action today. Harmless in the ledger, wrong in the record, and it is the same `.eq("member_id")` shape the **payment webhook** uses when it activates (`stripe-webhook` sets `status: 'active'` on every subscription row for the member — which is a bigger version of the same bug, on the gated file, so I have flagged rather than touched it). Both want the subscription id, not the member id |  |
| S18 | **Check the rota grid against the spreadsheet — and check it is not EMPTY** | `/admin` rota screen, or one query | The migration is applied. What it *seeded* is not visible from CI: the Supabase CLI does not surface a migration's `RAISE NOTICE`, so the seed's own verdict was swallowed. It did **not** refuse, which rules out the "some operators but not all" branch — so it either seeded the full 339 shifts (four operator rows exist) or skipped entirely (none do). **One query settles it:** `select count(*) from staff_shifts where shift_date between '2026-09-10' and '2026-12-31';` — **339** means done. **0** means the operator staff rows (`asoares@`, `cnicolas@`, `mbonner@`, `travis@icealarm.es`) do not exist; create them and run `select public.seed_rota_2026();`, which is idempotent and fills in | ⬜ |
| S19 | **Decide who maintains `shift_escalation_chain`** — the SOS ladder does **not** read the rota | `sos-escalation-runner/index.ts:289` | **This is the finding from §5 of the rota brief, and it is not what the brief assumed.** `staff-shift-monitor` and `shift-daily-reminders` do read `staff_shifts`; `sos-escalation-runner` reads `shift_escalation_chain`, a **separate hand-populated table** on the same `(shift_date, shift_type)` key whose only writer is an admin filling in a dialog. So seeding the rota does **not** tell the SOS ladder who is on shift, and with no row for the current shift, levels 2 and 3 have nobody to call. Untouched on purpose — SOS path, your gate. `generate_rota` could seed it from the shifts it creates; that is ROTA_MODEL.md Q2 and needs your decision | ⬜ |

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

### D-14 — the padlock on date of birth and NIE is a LABEL, not a rule (2026-09-07)

R7 says those two stay locked. The profile page locks them — padlock, read-only, and now the
reason R7 asks for. **The database does not.**

`"Members can update own profile"` (20260121143325) is

```sql
CREATE POLICY "Members can update own profile" ON public.members
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
```

— no column restriction, because Postgres RLS is row-level and cannot have one. The guard trigger
we added on 4 September (`20260904180000_member_status_not_self_writable.sql`) closes exactly one
column, `status`, and its own comment says the rest are fine: *"An ordinary profile update (phone,
address, NIE) must stay exactly as cheap as it was."* That was true of the brief we had then. R7
changes it.

So a signed-in member — or anybody who gets into their account — can still run

```
PATCH /rest/v1/members?id=eq.<their own>
{"nie_dni": "X9999999Z", "date_of_birth": "1990-01-01"}
```

and the operator card then shows an identity document number a stranger typed. This application
never sends those columns (asserted in `lockedIdentityFields.test.tsx`), which is why it is a
label rather than an open door — but a rule you can go around with curl is not a rule, which is
the argument `20260907100000`'s header makes about fulfilment state.

**The fix is one more branch in the trigger that already exists**, not a new one:

```sql
CREATE OR REPLACE FUNCTION public.guard_member_status_self_write()
-- … existing status branch unchanged …
  IF (NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
      OR NEW.nie_dni IS DISTINCT FROM OLD.nie_dni)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION
      'date_of_birth and nie_dni are not self-writable: R7 requires identity to be verified by a human'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```

**Why it is not in this PR.** It is a migration, and merging one reddens the drift gate on every
subsequent build until you have pushed it (D-3). The method you and I settled on is to bundle
schema changes and pay that once — and the next bundle has a second thing in it that has to go
with it anyway: **the `member-photos` storage bucket** R7's other half needs. There is no bucket
for member photos today (the eleven that exist are all staff/marketing), so the upload cannot be
built until one exists, and a storage bucket's policies are RLS policies, which CLAUDE.md makes a
mandatory human gate before merge.

**What I would like from you:** say the word and I will open one held PR carrying both — the
trigger branch above and the bucket with its four `storage.objects` policies scoped to
`auth.uid()::text` as the first path segment — for you to review, apply, and merge. The photo
upload UI goes in it, because shipping an upload button against a bucket that does not exist
would be worse than not having one.

### D-15 — Dutch is translated, tested, storable — and was unreachable (2026-09-07)

`nl.json` is a **complete** translation. `localeParse.test.ts` enforces it key-for-key against
English, checks array lengths, and fails if a member-facing value is left in English. Every
increment this run has added Dutch alongside Spanish because that test requires it.
`members.preferred_language` is the enum `en | es | nl`.

**And no member or staff member could select it.** Two places offer a language and both hard-coded
their own two-value array — the header `LanguageSelector` and the profile form. So the Dutch
translation is maintained effort that reached nobody.

It was also a live defect rather than only a missing option. `MemberProfile` declared
`preferred_language: "en" | "es"` for a nullable three-value column and the profile form's schema
was `z.enum(["en", "es"])`, so **a member whose row says `nl` — set by staff, or by the CRM
import — could not be loaded into their own profile form at all.** The compiler said so the moment
the type was corrected to the generated row.

**What I have done, and the assumption in it.** One list, `src/lib/memberLanguages.ts`, derived
from the enum and shared by both selectors, so Dutch is now selectable and a stored `nl`
round-trips. MEMBER_UX_RULES **R3 says the header carries "EN/ES"**, and I have read that as
shorthand for "the language selector" rather than an instruction to hide a language the product
already ships, translates, tests and stores — the operating company is Dutch.

**If EN/ES was meant literally, say so and it is one line**: delete the `nl` entry from
`MEMBER_LANGUAGES` and both selectors follow. But then the second question is worth answering
deliberately rather than by omission: a 6,000-line translation and a CI gate defending it are a
real running cost, and either it is a market or it is not.

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

### D-16 — pro-rata holiday needs a start date, and the column is not the one you named (2026-09-10)

Your ruling was that pro-rata applies **only** to somebody whose start date falls inside the
year, read off `staff.start_date`, and to flag it if Travis's is missing. **There is no
`staff.start_date`.** The column that means this is **`staff.hire_date`** (nullable, added
2026-03-01), and there is also a `termination_date` beside it. It IS editable — the admin staff
form writes it (`StaffFormPanel`) and both the staff list and the overview tab display it — so
this is a data-entry gap rather than a missing feature.

I cannot see production from here, so I cannot tell you whether the four operators' `hire_date`
values are set or NULL. **Please check the four (Mary, Carmen, Albert, Travis) in Admin → Staff
and fill in any that are blank.**

Pro-rata is deliberately **not built yet**, for one reason: a rule that reads a column which may
be NULL computes a wrong balance confidently, and it would compute it for a payroll-adjacent
number. It is also not needed for 2026 — all four are on `contratos indefinidos` predating the
year, which is why the backfill asserts a flat 30 days for each of them.

**One thing to confirm** when you fill the dates in: that a pro-rata rule should read `hire_date`
and nothing else — no separate "contract start" field, no per-convenio accrual table.

**Also for the convenio, and both defaulted OFF pending your answer** (they are settings, not
code, so they flip without a deploy):

- **`festivos` inside a holiday range** — whether a bank holiday falling inside `vacaciones`
  counts against the 30 days. Default **off** (it does not count). This is a convenio question;
  the Estatuto does not settle it.
- **carry-over into the next year** — default **off**. The one exception that is statute rather
  than convenio is sickness or maternity/paternity overlapping booked leave (ET art. 38.3), where
  the days are not lost. That is recorded as a note, not automated: it needs a human to say which
  absence caused it.

### D-17 — the checkout payment-methods card saves to a key nothing reads (2026-09-10)

Found while building the holiday-policy card on the same pattern, and **not fixed here** because
it is the payment path and it is its own concern. It is a real defect, so it is written down
rather than left in a branch nobody reads.

`save-api-keys` prefixes every key it is given with `${service}_` **unless the key already starts
with that prefix**:

```ts
const finalKey = key.startsWith(`${service}_`) ? key : `${service}_${key}`;
```

`CheckoutPaymentMethodsCard` calls it with `service: "settings"` and the keys
`checkout_payment_methods` / `checkout_async_events_confirmed`, so the rows land as
**`settings_checkout_payment_methods`** and **`settings_checkout_async_events_confirmed`** — while
the card READS the unprefixed names. It saves, it says it saved, and the value never comes back.

**What that costs.** The card's whole purpose is to keep SEPA (and the other asynchronous methods)
switched off until somebody ticks the acknowledgement that
`checkout.session.async_payment_succeeded` is enabled on the webhook destination — because without
that event a SEPA customer pays and is never activated. If the acknowledgement cannot be read
back, the card returns to its defaults on every load: the tick is lost, and whatever selection was
saved is not the selection in force. `create-checkout` and `send-payment-link` both read those
same unprefixed keys through `loadCheckoutPaymentMethods`, so they see nothing either and fall
back to card-only — which is the safe direction to fail, and still not what an admin was told
they had chosen.

**The fix is one word** — `service: "checkout"`, which matches the keys' own prefix and makes
`finalKey === key` — plus a one-off tidy-up of any `settings_checkout_*` rows already written. It
needs a test that saves and reads back through the same path, which is exactly what no test does
today. Worth doing on its own branch, with the SEPA activation question (S20) beside it.

The holiday card avoids the trap by passing `service: "holiday"` against keys that all start
`holiday_`; the reason is written out in that file so the next person does not copy the broken
call.

### D-18 — the 21 fields the platform now treats as REQUIRED on a member's file (2026-09-10)

**This one is a list to read, not a defect.** Five parts of the codebase had five different
answers to "what is missing from this member's record", and the member-record work needed one. It
is now `src/lib/memberRequiredFields.ts`, and everything reads it: the header badge, the
Missing-info dialog, the members-list column, and the link the member fills in.

**The list, by group** — each entry in the file also carries WHY, in the sentence a member sees:

- **Identity** — first name, last name, date of birth, NIE/DNI
- **Address** — address line 1, town or city, province, postal code
- **Contact** — phone, email
- **Medical** — blood group, allergies, medication, doctor, doctor's phone, preferred hospital
- **Emergency contacts** — at least one contact, and a phone number for every contact
- **Device** — a pendant assigned (IMEI), pendant tested with an operator *(ours, not theirs)*
- **Membership** — an active subscription *(ours, not theirs — golden rule 4)*

**The two places the old sources disagreed, resolved in the open rather than quietly:**

1. **NIE/DNI** — the registration schema has it OPTIONAL (REVIEW_JOIN_PATH F1 is the record of
   what asking too much at the wizard cost), while the old inline list chased it. Both are right
   about their own moment, so the list means *"required on file"*, not *"required to sign up"*.
2. **ONE emergency contact, not two.** The old inline list chased a second. `readinessGap.ts`,
   `protectionChecklist.ts` and the readiness view all make ONE the condition, and making two
   required here would put the badge in disagreement with the readiness queue, the member header
   notice and the operator card. A second contact is better practice; it is not counted as
   missing.

**What to do with it:** read the fourteen medical/identity items and say whether any is wrong.
Adding one is a line in that file plus a control on the member's page (the ratchet in
`memberUpdateForm.ts` fails the build until the control exists, so it cannot be half-done).
Removing one is a line. The three marked *ours* cannot be asked of a member and are shown on the
staff dialog as "Ours to do" — a pendant nobody has tested is a phone call we owe them, not a form
field.

**Nothing is blocked on this.** It shipped; changing it is a one-line decision whenever you have
read the list.

---

### D-19 — ✅ RESOLVED 2026-09-10. Lee ruled on all four; all four are built.

Left below as the record of what was asked and why. What happened to each:

| | ruling | where |
|---|---|---|
| 1 | `crm_profiles` gets the three legacy columns | #339, migration `20260910150000`, **applied** |
| 2 | legacy members get `pending_review` + `billing_source` | #342 (schema) + #344 (the button), `20260910160000`, **applied** |
| 3 | email becomes optional, with an owner | #346, `20260910170000` |
| 4 | `Dob` fallback, `Spouse` note, consent flag, `Wellbeing Appt Date` stays raw | #334 |

**One place where the ruling was not followed literally, and it is flagged rather than
buried.** Item 2 said `active` should be reachable "only via stripe-webhook OR this confirm
action". Taken literally that deletes a rule written three migrations earlier: `20260909110000`
lets staff reinstate a member who ALREADY HAS an active or past_due subscription — un-suspending
somebody who pays every month. That route is the Stripe route one step removed (it needs a
subscription to point at, and the webhook wrote it), so it was kept and named in the migration.
**If Lee means it should go, it is one clause.**

**What a legacy member carries, before and after confirmation:**

```
imported by the CRM import      status = 'pending_review'   billing_source = 'legacy'
confirmed by a supervisor       status = 'active'           billing_source = 'legacy'
(a Stripe member, for contrast) status = 'active'           billing_source = 'stripe'
```

`pending_review` is NOT monitored. `active` + `legacy` IS monitored, with the badge "Legacy
billing" instead of a plan name, and renewal/payment-failed logic never fires for it.

---

### D-19 — the KarmaCRM import has three homeless facts and one invented status (2026-09-10)

Found while making the import work on the real 431-row export (#302, #307, #308, #316, #318).
Four decisions, none of them urgent, all of them yours.

**1. `crm_profiles` has no column for membership type, payment type or date joined.**

The brief said these three go to "CRM profile fields". There are no such fields: `crm_profiles`
holds `stage`, `status`, `referral_source`, `assigned_to_staff_id`, `department`, `industry`,
`tags` and `groups`, and that is all. A key with no column fails the **whole** insert, and
PostgREST reports that as the row failing rather than the key being wrong — so the first version
would have looked like bad data in your export.

They are written verbatim as one member note instead (`Karma CRM membership: membership type X;
payment type Y; joined Z`), with a stable prefix so a re-run recognises it rather than adding a
second copy, and `crm_import_rows` keeps them in `parsed_membership_type` and in `raw` besides.
**Nothing is lost; it is simply not a column.** Three columns and a migration is the fix, and it
is a five-line migration — say the word.

**2. Imported members are `inactive`, and there is no "legacy" state to be.**

The brief asked for "the fulfilment model's legacy-member state". There isn't one: `member_status`
is `('active','inactive','suspended')` and `fulfilment_state` describes a pendant order, not a
person.

`active` is not available — golden rule 4, a member is activated by the payment webhook and by
nothing else, and this platform has never seen any of these 431 people pay it. Writing `active`
would be the import asserting a payment it has no evidence for. `suspended` means a live member on
hold, which is wrong in the other direction. So: **`inactive`, with the verbatim Karma status on
the CRM profile**, so a human sees "Active Member in Karma" beside "inactive here" and nothing is
lost. They become active when a payment arrives.

The better answer is a fourth value, `legacy`, so these are visibly neither new nor cancelled.
That is a migration and an enum change, and it is your call whether it is worth one.

**3. `members.email` is `UNIQUE NOT NULL`, and that is why your clients land as CRM contacts.**

This is the single biggest reason a row cannot become a member: most of your clients have no
email. Households that share one get a plus-tag (`name+tag@…`) so the mail still reaches them, but
a client with none cannot be a member at all today. It is surfaced on the import preview rather
than worked around, because making `email` nullable is a decision about what a member *is* — a
person we can reach, or a person we hold a record for — and it changes the login flow.

**4. Forty-seven of the 147 columns are read by nothing.**

`ICE_IMPORT_COLUMN_MAP.md` lists every one. Nothing is lost — the whole row (minus the four
discarded columns) is kept in `crm_import_rows.raw`, so any of them can be mapped later **without
re-exporting from Karma**. The four I would ask about: **`Dob`** (a second date-of-birth column
beside `Birthday` — the difference between a member and a CRM contact for any row that has one and
not the other), **`Spouse`**, **`Wellbeing Appt Date`**, and **`Contact Friend for Email`**, which
reads like a consent flag and consent is not something to guess at.

**Nothing is blocked on any of these four.** The import works, and each is a decision you can take
whenever you have read the table.

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
| **#219 — the seed bundle** | **NO LONGER HELD, and the reason it was held is gone.** It was kept unmerged because merging a migration before somebody could push it turned the drift gate red for every PR behind it. CI now applies schema on merge, so merging it IS pushing it: the migrate run applies it, records it in `APPLIED_TO_PROD.txt` and commits that back to main. **Merge it when you want the rows.** Rows plus one enum value: WP6 G5's canned replies (six shortcuts × three languages), WP3 N7's notification templates (four transitions × three channels × three languages, member-only), and WP7 W7's `resume` on `member_action` — **with the button that uses it**, because a client writing an enum value the database does not have fails at the insert. ~~Order: `supabase db push`, append the filename to `APPLIED_TO_PROD.txt`, merge.~~ Just merge it. Nothing sends because of it: the three `notify_channel_*` flags are still off (§3). Merging it before pushing turns the drift gate red for every PR behind it (D-3) |
| ~~**#260**~~ | ✅ **Merged 9 Sep** on Lee's instruction ("nothing is held any more"). Now migration 4 in §1 — pushing it is **S18** |
| **#215 — inbound SMS and WhatsApp into the member's conversation** | Green on every check and **not** on the brief's excluded list, so this is my judgement rather than a rule I was handed. Two reasons. It changes what happens to a member's message **during an open alert** — the `alert_communications` write is unchanged but now sits downstream of a signature check that can refuse — and that is the SOS/alert path, where CLAUDE.md's human gate is mandatory. And it is the same failure shape the webhook exception exists to prevent: a broken inbound webhook means no member's message arrives, silently. The fix itself is not in question — today those messages are **dropped** unless an alert happens to be open, while the auto-reply says an operator will review them. What it needs is **S14**: one real text message after it deploys |
| **#196 — the operator card names the second readiness condition** | The SOS path. Green throughout; queued on you, not on its quality. Retargeted to `main` (its old base is fully merged) and refreshed against it, so the diff you see is only this change |
| ~~**the `paid → allocated` line in `_shared/post-payment.ts`**~~ | ✅ **Raised — it is in #253.** `handleSuccessfulPayment` now moves `awaiting_payment → paid` (with the reason the D9 trigger demands, naming the gateway payment so the claim about money is auditable) and then `→ allocated`, but **only when every pendant on the order really got a device** — claiming `allocated` with stock exhausted would hide the one case that needs a human. Mollie gets it too, from the shared module. S11 still finds the rows already stuck at `paid` |
| **#253 — item 5: create-checkout + stripe-webhook** | Both gated files. The browser no longer names the price (F7) and the webhook no longer takes Stripe's word for the amount (F9). **Merging it deploys them**: `deploy-functions.yml` pushes edge functions to prod on any merge to main touching `supabase/functions/**`. Needs S20 and S21 done first. Base is `feat/send-payment-link` so the diff is item 5 only — land #248 first and GitHub retargets it |
| **`item6/second-stage` — item 6: the auth user and the second-stage link** (PR pending, stacks on #253) | Touches `create-checkout` (the success URL gains `session_id={CHECKOUT_SESSION_ID}`), so it is gated for the same reason. It is what makes a paid member reachable: an account they can sign into, and the `member_update_tokens` link that collects the emergency contacts the wizard stopped asking for |
| ~~**#255 — item 8**~~ | Not gated, and **merges when green**: it touches neither `create-checkout` nor `stripe-webhook`. Blocked only by main being red (see §1) |

> Per the brief: any PR touching `supabase/functions/stripe-webhook` or
> `supabase/functions/create-checkout` stays open. A broken webhook means no member ever
> activates, and it fails **silently**.


---

## 6. Items 5, 6 and 8 — the runbook, in order

Each step depends on the one before it. **S20 and S21 must happen before #253 is merged**,
because merging #253 deploys the functions.

| # | Do this | Where | Why, and what goes wrong if it is skipped | ✅ |
|---|---|---|---|---|
| ~~S20~~ | ~~**Apply the two drifted migrations and record them**~~ — **DONE.** Both `20260909100000_sales_command_stats_fix.sql` and `20260909110000_payment_link_order.sql` are in production. They turned out to have been pushed by hand and never recorded, which is what made the first automated run fail; #285 reconciled the manifest against production's own migration list, and #286 added the check that catches that gap in future | — | ✅ |
| S21 | **Set the Stripe webhook destination's API version to `2024-06-20`, and enable the event `checkout.session.async_payment_succeeded`** | Stripe dashboard → Developers → Webhooks → your endpoint | The version decides the SHAPE of every event body. `invoice.subscription` and `subscription.current_period_end` both MOVED in later versions — on a newer version those reads become `undefined` and fail **silently**: renewals stop advancing and subscriptions stop matching. Item 5b declares the fields it needs and refuses loudly if one is missing, so a wrong version is visible rather than silent — but it should simply be right.<br><br>The async event matters just as much: `checkout.session.completed` does **not** mean paid for **SEPA**, so item 5b refuses to activate on it. That refusal is only safe because the async event is handled — **if it is not enabled, every SEPA customer pays and is never activated** | ⬜ |
| S22 | **Merge #253 (and #248 before it), which deploys the functions** | GitHub | `deploy-functions.yml` deploys on any merge to main touching `supabase/functions/**`. There is no separate deploy step to remember — the merge *is* the deploy. Watch the Actions run finish before S23 | ⬜ |
| S23 | **The live test: `/join` in a fresh incognito window, card `4242 4242 4242 4242`**, any future expiry, any CVC | a browser | This is the one pass that proves the whole path. Check, in order:<br>• Stripe shows a **subscription**, not a one-off payment, with the pendant/shipping/fee as one-off items on the first invoice<br>• `orders.status = 'confirmed'` and `fulfilment_state` = `paid` or `allocated`<br>• `members.status = 'active'` **and `members.user_id` is not null**<br>• `subscriptions`: `active`, `stripe_subscription_id` set, `registration_fee_paid = true`<br>• exactly **one** `payments` row `completed` — a second would mean `invoice.paid` double-counted the signup<br>• the confirmation screen shows a **second-stage link**; open it and the form asks for contacts and medical<br>• one `member_update_tokens` row, `issued_via = 'post_payment'`, `created_by` null<br>Then **refund it** | ⬜ |
| S24 | **The tamper test** — the point of item 5. In devtools, intercept the `create-checkout` request and change something | a browser | There is no amount left in the body to change. Change an id and it is refused: the order must be `pending`, the payment must belong to it, and a `couple` plan must name both members. Nothing should reach Stripe | ⬜ |
| S25 | **Then swap to live keys** — `settings_stripe_secret_key` and `settings_stripe_webhook_secret` | Supabase → `system_settings` | Do it last, and only after S23 passed on test keys. The webhook secret must be the one for the **live** endpoint — a live endpoint with a test secret fails signature verification on every event, which means no member ever activates and the failure is a 400 nobody is watching | ⬜ |
| S26 | **Check the invite/magic-link expiry** | Supabase → Authentication → Email templates / URL configuration | Item 6's welcome email CTA is a real sign-in link generated at payment time. If the OTP expiry is short (default is an hour), the CTA in an email somebody opens the next morning is dead. Nothing breaks — the member can still use `/login` — but the one-click promise does not hold | ⬜ |
| S27 | **Fix or disconnect the duplicate Vercel project** | Vercel → `lee-wakemans-projects/care-conneqt-platform` | `Vercel – care-conneqt-platform` fails on **every** open PR while `Vercel – ice-alarm-espana-platform` succeeds on all of them. It looks like a second project wired to the renamed repo, failing for its own reason. It makes every PR show a red check, which is exactly the condition CLAUDE.md says must stop a merge — so it either gets fixed or gets disconnected, or the rule stops meaning anything | ⬜ |
| S28 | **See the queue's new half, which has never had a real row** | Supabase → SQL editor, then Admin → Members → Readiness queue | Item 8 puts `past_due` subscriptions on the attention queue. There are none in production yet, so it has never rendered with real data. `update subscriptions set status = 'past_due' where id = '<one>';` → the member appears with a red **Payment failed** badge and a count → set it back. Item 5b is what will start producing these for real, from `invoice.payment_failed` | ⬜ |

> **What I could not verify and am not claiming.** Every item above needs a credential, a
> dashboard or a card this environment does not have. Nothing in items 5, 6 or 8 has been run
> against real Stripe — the proofs are contract tests and mutation testing against the real
> modules, which is a different and weaker thing than one live payment.

---

## 7. Admin notifications on the phone — the runbook

Everything in this section was built on 9 September and **none of it can reach a phone until
S29–S32 are done**. Each step says what goes wrong if it is skipped, and the last three are the
only proofs that matter.

The code is on main (the router, the emitters, the push client, the notifications screen, the
phone home). The **schema is held** — `20260909121500_notify_staff.sql` and
`20260909130000_lead_new_router_emit.sql`, in one PR, per the brief.

| # | Do this | Where | Why, and what goes wrong if it is skipped | ✅ |
|---|---|---|---|---|
| ~~S29~~ | ~~**Apply the two notify-staff migrations and record them**~~ — **DONE.** `20260909121500_notify_staff.sql` and `20260909130000_lead_new_router_emit.sql` are both in production and recorded. The router's tables, the three `notification_log` columns and the 76 seeded route rows exist. **The channel flags are still yours** — every route reads as OFF until you turn one on, and only the four always-loud safety alerts get through | — | ✅ |
| S30 | **Create a Firebase project, add a Web app, enable Cloud Messaging** | console.firebase.google.com | Push is the channel this is actually about: SMS costs money per message and WhatsApp needs the member to write first, but push is free and instant on a phone in a pocket | ⬜ |
| S31 | **Paste three things into Admin → Settings → Notifications → Firebase.** Nothing goes in Vercel and nothing goes in the Supabase console.<br><br>**1. The web-app config** — Firebase → ⚙ **Project settings → General** → *Your apps* → the Web app → **SDK setup and configuration** → *Config*. Copy the whole `const firebaseConfig = { … };` block and paste it. Unquoted keys, comments and the trailing semicolon are all fine; it is parsed, not eval'd.<br><br>**2. The VAPID key** — Firebase → ⚙ Project settings → **Cloud Messaging** tab → **Web Push certificates** → *Key pair*. Copy the long `B…` string. **This is on a different page from the config above, which is why it is the one people miss.**<br><br>**3. The service-account JSON** — Firebase → ⚙ **Project settings → Service accounts** → **Generate new private key** → it downloads a `.json` file → open it and paste the whole thing. | Admin → Settings → **Notifications** | The card refuses anything that will not work and says why: a config missing `messagingSenderId` is named as missing `messagingSenderId`, and a service-account JSON without a `private_key` is refused before it is stored rather than failing later inside Web Crypto with *"invalid keyData"*.<br><br>Its status line then reads **web config: set · VAPID: set · service account: set**. No redeploy: the client reads these at runtime and the router reads them per dispatch.<br><br>The six web values are public by design (they identify the project to a browser) and are stored where staff can read them, because every operator's phone needs them to register. **Only the service account is secret** — stored under a key ending `_key`, which the settings read policy excludes from every non-super-admin account. Proven in the RLS harness, both directions | ⬜ |
| S32 | *(optional, and only if you would rather not keep the service account in the database)* set the `FIREBASE_SERVICE_ACCOUNT` Edge secret instead — the server prefers it over the settings row | Supabase → Edge Functions → Secrets | An Edge secret never touches a table, so no RLS mistake can expose it. This is the stronger option and the reason the environment is read FIRST; the settings row exists so that nobody is forced into a second console | ⬜ |
| S33 | **Deploy the functions** — merging anything under `supabase/functions/**` does it; otherwise run the workflow by hand | GitHub → Actions → `deploy-functions.yml` | `notify-staff` is a new function. Until it is deployed, every emitter's POST to it is a 404 that the emitters swallow deliberately (a notification that cannot be sent must not break a sale or an Isabella answer) — so the symptom is silence, not an error | ⬜ |
| S34 | **Install the app on your phone, and on Martijn's** | the phone | **iPhone/iPad:** Safari → Share → **Add to Home Screen**, then open it from the Home Screen. Apple grants the notification permission **only** to an installed web app (iOS 16.4+); in a Safari tab the request is refused with nothing shown to the user, which is why the card says so before you tap. **Android:** Chrome → ⋮ → **Install app** (or *Add to Home screen*). The manifest is already complete — `display: standalone`, 192/512/maskable icons, `apple-touch-icon` and the `apple-mobile-web-app-*` meta tags — so no code change is needed for this.<br><br>**If Android does not offer "Install app":** Chrome also wants a service worker with a fetch handler. Ours (`firebase-messaging-sw.js`) has none, and one has **not** been added blind — a fetch handler that caches an SPA wrongly is its own class of bug, and this is a thing to check on a real device rather than guess at. If the prompt is missing, that is the fix, and it is three lines | ⬜ |
| S35 | **Turn the channels on, then send a test** | Admin → Settings → **Notifications** | Four switches at the top (`notify_channel_*`). Push and email credentials live in Edge secrets the browser cannot read, so those two badges read **"unproven"** until you press **"Send a test notification"** — which asks `notify-staff` what it could actually send on and replaces the guesses with its answer. The test goes to **one person**, never the company. Nothing on this screen needs a redeploy: a switch flips a row the router reads on the next send | ⬜ |
| S36 | **THE PROOF: a test sale should buzz both phones.** Stripe test mode, `/join`, card `4242 4242 4242 4242` | a browser and two phones | `sale.paid` fires from `post-payment` **after activation succeeds** — never before, because a notification about a sale that did not activate is worse than none. Expect: a push on both installed phones, an **email to every staff member** (Lee's rule: all staff get the email for every paid sale), a bell row each, and WhatsApp/SMS if you switched those on. Then check `notification_log`: **one row per recipient per channel, skips included, with the reason in `error`** — that table is the answer to "why did nobody get this", and it is the reason none of this is debugged from Deno logs. A webhook retry must produce **no** second buzz: the idempotency key is `sale.paid:order:<id>` and a unique index enforces it | ⬜ |

### What still cannot send, and why

| channel | state |
|---|---|
| **push** | Ready in code, needs S30–S31 (three pastes, no consoles). Server on FCM HTTP v1; per-device tokens in `staff_push_tokens`; a token FCM calls dead (404 `UNREGISTERED`, 400 `INVALID_ARGUMENT`) is pruned, while a 401/429/500 leaves the device alone — deleting somebody's phone because Google had a bad minute would silently stop their alerts |
| **email** | Routed through `_shared/email.ts`. **Off until `RESEND_API_KEY` exists** (or the Gmail app password, depending on `email_settings.provider`); the prefs screen says which is missing rather than offering a switch that does nothing |
| **SMS / WhatsApp** | Twilio, already configured for other paths. Both are gated by `notify_channel_*` first, so they stay off until you turn them on — see §3 |
| **the bell** | Live now, and the only channel that has never needed a secret. It is how a notification survives a phone being in a drawer |

### Two things found while building this, worth knowing

1. **The EV07B WhatsApp alert has never sent.** `notify-admin` reads
   `notification_settings.whatsapp_ev07b_alerts` — **a column no migration ever created** — so
   `undefined` makes `shouldSend` false. Reading a missing column through the Supabase client is
   not an error; it is `undefined`. That is the defect the routes table replaces, and it is
   asserted **still absent** from the type layer so the broken read cannot start compiling.

2. **`notify-admin` had no caller check at all.** It is not in `supabase/config.toml`, so
   `verify_jwt` defaults to true — which stops an anonymous caller and nobody else. Any
   signed-in user could post `escalation.call_failed` with any text and put it on every admin's
   WhatsApp, logged as a genuine SOS-ladder failure. Fixed (#261): service role or an admin JWT,
   nothing else. Worth knowing because it means the **loud safety alerts were forgeable** by
   anyone with a login, and an admin who learns that stops trusting the one message that must
   never be ignored.

