# LEARN.md — How Care Conneqt's docs stay true (and keep improving)

> This is the operating manual for the documentation itself. `CLAUDE.md` §0 points
> Claude Code here every session. **It is not magic and nothing runs in the background** —
> it works because CC follows this protocol as a habit while it works.
>
> **The one rule that makes it work:** `CLAUDE.md` is the only doc CC auto-loads. As long
> as `CLAUDE.md` §0 says "follow LEARN.md", this whole system runs. If that line is ever
> removed, the system silently stops. Don't remove it.

---

## 1. The doc set (who owns which facts)

Each kind of fact has ONE canonical home. Update the home, not five copies.

| Doc | Owns |
|---|---|
| `CLAUDE.md` | Stack, real size figures, infra/secrets, Isabella state, working rules, brand, known leftovers, the §0 protocol hook |
| `LAUNCH_SCOPE.md` | **The pendant-first launch scope (LOCKED 2026-07-22): backend decision, what is public vs hidden, pricing model, languages, member self-service, partner-portal reversal, per-page audit rule, the staged plan.** Canonical — other docs link here, they do not copy from here. |
| `LAUNCH_CHECKLIST.md` | Every blocker/task to launch, ticked only when verified; rollout stages. **Created 2026-07-22** (hard blockers: domain/email, payments, safety, backend, content). |
| `FRONTEND_REDESIGN.md` | The public-site redesign brief (Stage 4b): direction, tokens usage, page map, imagery brief, execution prompt. Runs only after the AI-strip PR merges + Lee's visual sign-off. |
| `LEARN.md` (this file) | The doc protocol, the learnings log, the improvement backlog |
| `AUDIT_REPORT_2026-06.md` | Point-in-time audit snapshot — **frozen, never edited** (new audits get new dated files) |
| `BRAND_ASSETS.md` | Colours, fonts, logo |
| `README.md` | Setup / run / deploy |
| `REBRAND_CHECKLIST.md` | Historical rebrand record — frozen |
| `CRITICAL_VERIFICATION_2026-06.md` | Findings from the Isabella + Stripe verification (when written) |

If a fact would fit two docs, it lives in the one above and the other *links* to it.

## 2. Update protocol — triggers → action (definition of done)

Before a task is "done", run this checklist and update only what the change touched:

- Changed a count (edge functions, pages, tests, migrations)? → fix `CLAUDE.md` §3.
- Changed infra, a secret's location, or the Supabase link? → `CLAUDE.md` §4.
- Changed/clarified anything about Isabella's functions or enforcement? → `CLAUDE.md` §5.
- Completed, started, or re-scoped a launch item? → tick/edit `LAUNCH_CHECKLIST.md`.
- Verified a prior finding (true or false)? → update the checklist AND any `CLAUDE.md`
  claim it affects.
- Hit a gotcha, made a decision, or learned "X breaks if Y"? → append to §4 below.
- Spotted something that could be better but isn't this task? → add to §5 below
  (don't fix it now; log it).

**Affected docs only.** Do not rewrite every file on every change — that creates noise
and churn. A one-line test fix does not touch the brand doc.

## 3. Session-start routine (the proactive part)

At the start of each working session, before the first task, CC should:

1. Read `CLAUDE.md`, `LAUNCH_CHECKLIST.md`, this file, and any new dated reports.
2. Spot-check 2–3 figures in `CLAUDE.md` against the code (e.g. count edge-function
   dirs, run `npx vitest run`). If reality differs, fix the doc and note it in §4.
3. Report back in ≤5 bullets: what changed since last session, any doc-vs-code drift
   found, and 1–3 improvement suggestions pulled from §5.

This is the realistic version of "improve without me asking" — it's automatic *per
session*, driven by this routine, not a live background process.

## 4. Learnings log (append-only, newest at top)

> Format: `### YYYY-MM-DD — short title` then 1–3 lines. Never delete entries.

### 2026-08-11 — Project ref CONFIRMED against the dashboard; `qkfvojbcxaptufsepupo` is DEFERRED, not to be deleted
Lee verified in the Supabase dashboard: **`crpsuhoixfdhjugprbuc` (care-conneqt-prod) is
authoritative** — Pro tier, 24,299 requests at 100%, real migration history, backup 7h old.
The two **2026-06-17 entries below naming `cfwnrcogikjycjcobsay` as live are WRONG** and are
formally superseded by this entry (annotated in place, not deleted — §4 is append-only).
**Decision reversed:** `qkfvojbcxaptufsepupo` (care-conneqt-platform, VirtueleThuiszorg org,
Free — no migrations, no backups, empty) is a **future migration target**, recorded as
**DEFERRED**. It is **no longer to be deleted**; the 2026-07-22 "to be deleted" decision is
withdrawn, and the delete tasks in `LAUNCH_SCOPE.md` §0, `LAUNCH_CHECKLIST.md` and
`AUDIT_NIGHT.md` item 55 were corrected accordingly.
Full audit + per-file/per-line classification in **`PROJECT_REFS.md`** (new, canonical for
"which ref is where"). Learning: the split persisted because a *superseded* log entry read
like current truth. A dated log needs an explicit superseding marker on the entry itself —
newest-at-top ordering alone was not enough to stop it being cited five weeks later.
Also fixed in the same pass (bugs the split was masking, all long-standing): the
`YOUR_SUPABASE_PROJECT_REF` placeholder in `vercel.json`'s sitemap rewrite and in the six
`_shared/email-templates/*.tsx` logo URLs, plus `vite.config.ts`'s silent placeholder
fallback — which now **throws** when `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are
absent instead of building a client aimed at a dead host (G2: fail loud, never silent).
Deliberately **not** touched: `index.html`, `.github/workflows/deploy-functions.yml`, and the
two cron migrations (`20260716120000`, `20260723120000`) — the latter are the SOS-escalation
path and already correct.

### 2026-08-11 — Staff credential resets are now scripted, guarded and reversible
Manual credential surgery is what diverged `auth.users` from `public.staff` and broke staff
login. Replaced by `scripts/reset-staff-logins.ts` (separate PR): env-only config, account
list from a gitignored file, dry-run by default, `activity_logs` entry per change, passwords
never printed or persisted. Two learnings worth keeping:
**(1) A guard that cannot verify must refuse, not pass.** The script compares the `ref` claim
inside the service key against the `SUPABASE_URL` host and refuses on mismatch — the exact
failure we hit. Newer `sb_secret_*` keys are opaque, so the ref is unreadable; the script
treats "cannot check" as a refusal (explicit loud override exists) rather than silently
proceeding. Proven negatively by a test that feeds a mismatched pair and asserts refusal.
**(2) Cross-system writes need a pre-flight and a halt, not a try/catch.** Every account is
resolved against `public.staff` before the first write, so a bad account aborts while the DB
is untouched; if the staff update fails after the auth update succeeded, the run raises and
**halts** so no further account can diverge.
Second admin added as migration `20260811120000` rather than a hand-run INSERT — identity
supplied at apply time via a setting so nothing real is committed, guarded no-op when unset
(the STAGE_0B un-guarded `current_setting` lesson again), and reversible via prior state
captured in `activity_logs`. Verified against real PostgreSQL 16 across 8 paths including
both rollback directions. Re-confirmed the `is_active` trap: it is GENERATED, and writing it
directly still raises `column "is_active" can only be updated to DEFAULT`.

### 2026-07-22 — Stage 0 verified: prod functions stale since 2026-04-20; 721/day cron spike
Tokened read-only pass on `crpsuhoixfdhjugprbuc` (parallel session). Findings: **5 migrations
unapplied** (incl. `pricing_source` → gates Prompt 4), **2 functions never deployed**, and **all
89 deployed functions stale from a single 2026-04-20 deploy**. Reconciliation of the earlier
"2026-06-17 CUTOVER COMPLETE — all functions deployed" entry: that deploy targeted the
now-**CANCELLED** `cfwnrcogikjycjcobsay`, NOT current prod — so current prod has had no function
deploy since 2026-04-20 (hence a CI deploy pipeline is now a hard blocker). Error spike root cause
**confirmed empirically = ~721/day** from the two applied GUC crons (`ev07b-offline-monitor`
720/day + `shift-daily-reminders` 1/day) throwing on un-guarded `current_setting('app.settings.*')`.
Remediation: `STAGE_0B_PLAN.md` + PR #16 (Vault + hardcoded URL + guard, corrective migration,
deploy CI). STATE.md Stage 0 items 1–4 flipped BLOCKED → VERIFIED.

### 2026-07-22 — LAUNCH_SCOPE locked; docs truth pass (Stage 2)
Pendant-first launch scope committed as `LAUNCH_SCOPE.md` (canonical, added to §1 table).
Locked decisions now reflected in the docs that own them: **(backend)** the one true backend is
`crpsuhoixfdhjugprbuc` (care-conneqt-prod, LifeLink Sync org, Pro) — the `cfwnrcogikjycjcobsay`
cutover is **CANCELLED** (`qkfvojbcxaptufsepupo` to be deleted); updated CLAUDE.md Stack + master
plan §Architecture, and banner-cancelled CUTOVER_RUNBOOK.md/CUTOVER_CHECKLIST.md. **(partner)** the
2026-06-18 archive-candidate label on the partner/commission portal is **REVERSED** — live at
launch, **manual commission payouts**; fixed master plan §11 + STATE.md §6. **(pricing)** DB-backed
single source of truth — single €24.99 + couple €34.99 net + 10% IVA, monthly/annual toggle
(LAUNCH_SCOPE §1; note STATE.md §2 already shows `submit-registration` computes server-authoritative
totals from DB `pricing_plans`/`pricing_settings`, so this is largely built). **(languages)** EN/ES/NL
full coverage at launch. **(member self-service)** real Stripe/Mollie-backed billing (update payment
method, switch plan, invoices, cancel) is launch scope, not stubs.
Two drifts flagged, not resolved: `LAUNCH_CHECKLIST.md` does **not exist** (so LAUNCH_SCOPE could not
be linked from it — annotated the §1 table instead); and CLAUDE.md has no "§4 backend" section (the
golden-rule/§-numbering that LEARN §2 and old notes reference is stale) — backend fact recorded in
the Stack line, its true home today.

### 2026-06-17 — CLAUDE.md §4/§6 updated to post-cutover reality (live ref swapped)
> ⛔ **SUPERSEDED — THIS ENTRY IS WRONG. Do not act on it.** The cutover it describes was
> CANCELLED on 2026-07-22 and the live ref was confirmed as `crpsuhoixfdhjugprbuc` against the
> Supabase dashboard on 2026-08-11. `cfwnrcogikjycjcobsay` is **not** and never became live
> production. Retained unedited below because §4 is append-only. See the 2026-08-11 entry and
> `PROJECT_REFS.md`.

§4 now names `cfwnrcogikjycjcobsay` as CURRENT LIVE PRODUCTION (cutover complete: 126
migrations + 91 edge functions deployed; Lee = super_admin). `crpsuhoixfdhjugprbuc`
downgraded to OLD production — no longer served, kept as fallback, NOT to be deleted until
Lee confirms the new site is stable. `pduhccavshrhfkfbjgmj` unchanged (dead ICE, never touch).
§6 link-target rule rewritten: the only valid `db push`/`functions deploy` target is now
`cfwnrcogikjycjcobsay`, and it IS live production — full prod caution on every push.
NOTE: §3 size table is now stale (says 89 edge functions / 123 migrations; real = 91 / 126)
— left for the next §3 reconcile pass, not touched in this docs-only edit.

### 2026-06-17 — CUTOVER COMPLETE: cfwnrcogikjycjcobsay is live; first super_admin bootstrapped
> ⛔ **SUPERSEDED — THE TITLE'S CLAIM IS WRONG. Do not act on it.** This deploy did land, but
> on `cfwnrcogikjycjcobsay`, which was **never** live production and whose cutover was
> CANCELLED on 2026-07-22. Its practical consequence was the opposite of "complete": real prod
> (`crpsuhoixfdhjugprbuc`) went un-redeployed from 2026-04-20 until Stage 0b. The
> `bootstrap_first_admin` / `is_active` hotfix described at the end **is still valid** and
> applies to any project. Retained unedited because §4 is append-only. See the 2026-08-11
> entry and `PROJECT_REFS.md`.

Live deploy executed end-to-end against `cfwnrcogikjycjcobsay`: (1) link + secrets audited
(only 4 self-gen secrets set; provider secrets still Lee's to add); (2) 11 branches merged to
main (0 conflicts, 349 tests pass); (3) `db push` (pricing_source + bootstrap_first_admin);
(4) all edge functions deployed; (5) `git push origin main` → Vercel prod deploy. Step 6:
`bootstrap_first_admin` returned `staff.id 84ccfc96-aeb0-4c75-a1b0-450c9f78d989` — Lee
(lee@careconneqt.com) is now **super_admin**. The bootstrap is **self-disabled**: its guard
(`IF EXISTS (... role='super_admin') THEN RAISE`) now refuses every further call, so it can't
be used to escalate later.
Hotfix this session: `bootstrap_first_admin` originally wrote `staff.is_active`, which is a
GENERATED column (`GENERATED ALWAYS AS (status='active') STORED`) → "cannot insert a non-DEFAULT
value". Migration `20260617130000` drives the SOURCE column instead (`status='active'` in both
INSERT and ON CONFLICT UPDATE) so is_active computes true on both new-row and promote paths.
Decisions left OPEN by Lee: payments deferred (add Stripe from admin later), Twilio on TRIAL
(gate F8 open). Provider secrets (LOVABLE_API_KEY, Twilio set, RESEND/GMAIL, Google OAuth) still
missing — chat/AI, email, SOS won't work until added in the Supabase dashboard (runtime, no
redeploy needed). TODO follow-up: CLAUDE.md §4 still calls crpsuhoixfdhjugprbuc "CURRENT LIVE
PRODUCTION" — now stale; swap the live ref to cfwnrcogikjycjcobsay and decide the old project's
fate once smoke-test gates (Step F) pass.

### 2026-06-17 — Cutover ORDER is strict: Vercel auto-deploys main (CUTOVER Step E)
Vercel auto-deploys production from `main`, so merging the 9 feature branches is the trigger
that ships the new frontend. Mandatory order (now prominent in Step E): (1) set secrets —
env (Step A) + system_settings (Step B); (2) deploy edge functions (Step D); (3) switch
Vercel env vars (VITE_SUPABASE_URL/PROJECT_ID/PUBLISHABLE_KEY) to cfwnrcogikjycjcobsay;
(4) ONLY THEN merge branches to main → auto-deploy against the wired-up backend; (5) smoke-test.
⛔ Merging before steps 1-3 deploys the new frontend against the old/unwired backend — outage.
Also done this session: set self-generated secrets on cfwnrcogikjycjcobsay (WEBHOOK_SECRET,
EV07B_CHECKIN_KEY, EV07B_HMAC_SECRET, SITE_URL=https://care-conneqt-platform.vercel.app);
provider secrets remain Lee's to enter.

### 2026-06-17 — Pre-client BLOCKING gates added to CUTOVER Step F (F8, F9)
F8: **Twilio must be PAID before any real client** — a trial account only reaches
pre-verified numbers, so the SOS/emergency path can't contact real members' emergency
contacts; trial is for cutover testing only. F9: **rotate any credential exposed during
setup** (esp. the Twilio Auth Token; also Stripe/Mollie/Resend/Gmail/service-role/EV07B/
webhook secrets if shared in chat/screenshots) before go-live, and set secrets only in
dashboards. (F7 = replace staff test passwords via invite flow, already added.) Verify-gate F
now "all nine"; F5/F7/F8/F9 are hard blockers.

### 2026-06-17 — Staff test-accounts documented + no-test-password go-live gate
CUTOVER Step C2 now lists the 5 test accounts (lee/mary/carmen/albert/travis@careconneqt.com,
temp `Test@1234`, TESTING ONLY, created post-bootstrap on the deployed project) so Lee can
verify role boundaries (operators: medical+alerts, NOT finance/settings; supervisor: rota;
admin: all — verify-gate C2). Added Step F7 as a HARD BLOCKER: no account may use a test/
shared password at go-live; real staff are created via the invite flow (each sets their own
strong password). Verify-gate F bumped to "all seven" (F5 + F7 blocking).

### 2026-06-17 — Public nav/footer audit (no separate branch needed)
Public nav/footer audited 2026-06-16 — all targets correct; only defect was header #pricing
not scrolling cross-page, already fixed on `feat/frontend-polish`. No separate nav branch
needed (`feat/nav-links` dropped). Added a Step F nav-link visual check to CUTOVER_RUNBOOK.

### 2026-06-17 — Staffing & rota documented (CUTOVER Step C3); night-cover SPOF flagged
Added Step C3: shift patterns (Mary supervisor mornings; Carmen rotating; Albert afternoons;
Travis nights; Lee super_admin + on-call catch-all). **Verified** `sos-escalation-runner`
orders on-call staff by `escalation_priority` ASCENDING (lower=first), so Lee the backstop
needs the HIGHEST priority + `is_on_call=true`. **🔴 Risk flagged:** night shift (23:00–07:00)
has a single primary (Travis) with Lee as only backup — single point of failure on the most
safety-critical hours; recommend cross-training a 2nd night operator post-launch. Lee is sole
fallback for all uncovered shifts (OK for launch). Verify-gate C3: an uncovered/unanswered
night SOS must escalate to Lee (shift-monitor WhatsApp + escalation chain) AND Lee can take
the call — confirm Lee's mobile receives the alerts. Also fixed a merge-hygiene issue: editing
LEARN/CUTOVER on main reintroduced add/add conflicts vs logo-fraunces/admin-bootstrap, so those
branch copies were removed (docs now solely on main) — dry-run re-confirmed all 8 merge clean.

### 2026-06-17 — Staff setup documented (CUTOVER Step C2) + GDPR audit-log TODO
Added Step C2 to CUTOVER_RUNBOOK: Lee (super_admin via bootstrap) → invites Mary
(`call_centre_supervisor`, L3 escalation + rota/holidays) → Carmen/Albert/Travis
(`call_centre`, full member view+edit incl. medical/contacts, NO finance/settings), all via
staff-send-invite → staff-validate-invite → staff-complete-invite. Verify-gate C2 checks each
role's surface. `call_centre_supervisor` confirmed a real app_role (added via ALTER TYPE).
**⚠️ TODO before go-live (GDPR):** operators have full read+write to medical_information and
emergency_contacts — CONFIRM that both **viewing AND editing** medical/contact data is
**audit-logged per operator** (who/when/what, into activity_logs or equivalent). Full
operator access to special-category health data without per-operator access logging is a GDPR
exposure. Verify the member-detail Medical/Contacts tabs and any RPC writes emit audit rows;
if not, add audit logging before launch.

### 2026-06-17 — Branch stack mapped (MERGE_ORDER.md) + frontend-polish + Step F5 gate
8 feature branches open; isabella-gate already merged to main (eab298b). Conflict dry-run
(`git merge --no-commit --no-ff` per branch, then abort): **all merge into main with ZERO
conflicts, and no two pending branches touch the same file** — fully independent. Wrote
MERGE_ORDER.md (purpose + smoke-test need + safe order per branch). **Real hazard = scattered
planning docs:** LEARN.md + BRAND_ASSETS.md committed only on `feat/logo-fraunces`,
CUTOVER_RUNBOOK.md only on `feat/admin-bootstrap`, the rest untracked — merging those two
branches can abort with "untracked working tree file would be overwritten" if untracked copies
exist. Recommended: consolidate planning docs to main in one commit before those merges.
Also this round: `feat/frontend-polish` (pendant image 404→public/assets, legal i18n keys en+es,
#pricing scroll-to-hash, Products i18n, Notify-Me→leads capture; suite 265 green) and added
CUTOVER_RUNBOOK Step F5 BLOCKING medical-data gate (on admin-bootstrap, commit da86fbc) —
result to be recorded post-cutover. NB: LEARN.md itself currently lives only on logo-fraunces
(part of the fragmentation above).

### 2026-06-16 — Brand display font Poppins → Fraunces (logo wordmark + headings)
Wordmark "Care Conneqt" in `logo.tsx` now uses Fraunces (`font-display`, weight ~600);
**the two-interlocking-C icon SVG was NOT touched** (paths pixel-identical). Added Fraunces
to `index.html` Google Fonts, added Tailwind `font-display` token (`Fraunces, Georgia,
serif`), switched `h1–h6` in `index.css` from Poppins → Fraunces. Body stays Open Sans;
tagline stays sans; Poppins kept loaded for any legacy `font-['Poppins']` usages.
BRAND_ASSETS.md updated. Branch `feat/logo-fraunces` (not merged).

### 2026-06-16 — Spec gap analysis (SPEC_GAP_ANALYSIS.md)
Diffed `TECHNICAL_SPEC.md` (the ICE-original spec; the request's "SYSTEM_SPEC_REFERENCE.md"
doesn't exist — name mismatch) against current code. Code substantially matches spec.
**Routes:** spec-only none; code-only = 3 product-catalog routes (`/products`,
`/products/:slug`, `/admin/products`). **Edge fns:** spec 89 = main 89 (zero renames/removals);
working tree +`admin-subscription-action`. **Tables:** spec says 105 but migrations create
**112** (spec stale); +`webhook_events`,`shift_escalation_chain`,`staff_invites`; `feedback`
is spec-only (never migrated). **Migrations:** 120→123. **products** extended +9 catalog cols.
**Safety confirmed:** §7.3 SOS flow intact & Isabella-independent; emergency-services rule
(#2) and false-alarm gate (#12) ARE code-enforced (`sos-false-alarm-resolve` ≥2 responses +
no-staff + no emergency-contact-notify). **CONCERN:** 9/15 Isabella non-negotiables are
prompt-only (LLM-dependent), not code gates; `ev07b-sos-alert` uses x-api-key not HMAC (spec
overstates). AI gateway still Lovable (matches spec; Claude swap is post-cutover). TECHNICAL_SPEC
is the stale side — counts/refs need updating.

### 2026-06-16 — Full route audit (APP_AUDIT_2026-06.md)
Audited all 108 routes (6 parallel read-only agents, one per portal). App is substantially
built: ~95 WORKING, ~9 INCOMPLETE, 2 STUB-by-design (unauthorized, 404). **8 BROKEN** (must
fix): admin `/admin/orders/:id` route missing (OrdersPage navigates to it); call-centre
`tasks` re-export sends member links to `/admin/...`; dead buttons (call-centre alerts
"Call Emergency", admin Messages Call/SMS, admin Payments invoice + dead search, partner
"Generate Invoice", partner Support 3× `href="#"`); audit-log CSV exports only the current
page. **Highest money-risk:** admin subscription pause/cancel + commission "Mark Paid" only
flip DB status — no Stripe/Mollie call. **Data-integrity risk:** CRM import is
non-transactional and writes placeholder data into real member/medical records. **Orphans:**
call-centre `shift-history`/`preferences` (not in nav), public `/pendant` (superseded by
catalog). Most other gaps are NEEDS-BACKEND (untestable until cutover secrets+deploy). Full
table + prioritised defect list in APP_AUDIT_2026-06.md.

### 2026-06-16 — Clean-start + AI-fork decisions; cutover order; §4 Gemini drift fixed
**Clean start:** `cfwnrcogikjycjcobsay` launches with NO data migration from Lovable —
schema only; config/content tables seed from the pushed migrations, and only secret values
(system_settings) + a first admin account need manual entry.
**AI fork:** AI currently runs via the Lovable gateway on `LOVABLE_API_KEY` (no Gemini/
direct key is read by any function — corrected the stale §4 claim). Decision: **keep the
Lovable gateway working through cutover** (so Isabella isn't broken), then **swap `ai-run`
+ the 13 other `ai.gateway.lovable.dev` callers to Claude/Anthropic API** as a separate
post-cutover code task, via a shared `_shared/ai-gateway.ts` helper.
**Cutover order** (see `CUTOVER_RUNBOOK.md`): A env secrets → B system_settings rows →
C first admin/staff account (no bootstrap exists — manual SQL/invite) → D deploy edge
functions (Isabella gate goes live here) → E Vercel env repoint + redeploy → F end-to-end
smoke test (member signup, device register, test SOS, chat widget). Each step gated.

### 2026-06-16 — CLAUDE.md §6 link-target rule de-hardcoded
Changed §6's "confirm the link target is `crpsuhoixfdhjugprbuc`" to "confirm it matches the
CORRECT project for the current migration step (see §4)" — target is `cfwnrcogikjycjcobsay`
during the clean-start migration, the live prod project after cutover. Removes the §4/§6
contradiction flagged earlier. Also decided: **clean start on `cfwnrcogikjycjcobsay` — NO
data migration from Lovable** (schema only; tables seed from migrations + manual entry).

### 2026-06-16 — Schema migrated to new Lee-owned Supabase project (data copy is next)
Production is moving off the Lovable-managed Supabase onto Lee's own account. Three refs
now in play (see CLAUDE.md §4): `crpsuhoixfdhjugprbuc` = CURRENT LIVE PROD (Lovable, what
Vercel serves), `cfwnrcogikjycjcobsay` = NEW TARGET (Lee-owned `wakemanlee20@`, future
prod), `pduhccavshrhfkfbjgmj` = dead ICE ref. Linked to `cfwnrcogikjycjcobsay` and ran
`supabase db push` — **all 123 migrations applied to the empty target 2026-06-16**;
`supabase migration list` shows local==remote for every migration. **No data yet** — the
data copy from `crpsuhoixfdhjugprbuc` is the next step, then edge-function deploy and the
Vercel/env cutover (each a separate gated step). The local repo is currently linked to the
NEW target, so confirm `supabase/.temp/project-ref` before any future push/deploy. NB:
CLAUDE.md §6 still says "confirm the link target is crpsuhoixfdhjugprbuc" — left unchanged
per instruction, but it now lags §4 during the migration window.

### 2026-06-16 — VERIFIED SAFE: SOS/fall emergency path is fully independent of isabella_settings
Traced pendant → DB alert → human escalation end to end. `isabella_settings`,
`sos_button_triage`, and `fall_detection_triage` appear in **zero** edge functions and the
gps-gateway (`grep` clean). Path: gps-gateway GT06 parse (`gt06-parser.js:115/117` →
sos/fall) → `forwarder.js:49` POST → `ev07b-sos-alert` (also `ev07b-checkin` for HTTP
devices), which **deterministically** inserts the `alerts` row (`ev07b-sos-alert:152-165`)
then calls `emergency-contact-notify` (Twilio SMS + email "call 112", no toggle),
`partner-alert-notify`, and `notify-admin`. `sos-escalation-runner` (cron/10s) independently
escalates unaccepted `sos_button`/`fall_detected` alerts through levels. **None consults any
Isabella flag**, so the seed state (sos/fall triage = false, no row) does NOT disable
emergency handling. The `sos_button_triage`/`fall_detection_triage` toggles are config/UI
only and not wired into the live path. **One caveat:** `notify-admin` WhatsApp is gated on
the admin's own prefs (`whatsapp_ev07b_alerts`, `notify-admin:223`) — an admin pref, not
Isabella, and not the primary escalation (emergency contacts + runner are unconditional).
This confirms the ISABELLA_GATE_PLAN.md fail-open premise is already satisfied for the live
emergency path; the gate plan concerns the *Isabella agent* functions, not this pipeline.

### 2026-06-16 — Isabella gate plan written (ISABELLA_GATE_PLAN.md)
Prep for the safety-critical enforcement fix. Classified all **52** UI functions
(`FUNCTION_KEY_MAP`) into SAFETY-CRITICAL (4: `sos_button_triage`, `fall_detection_triage`,
`emergency_escalation_alert`, `bulk_offline_alert`), UNSURE (7, flagged for Lee), and
DISCRETIONARY (41). **Key exposure:** seed migration enables only `chat_widget`; the other
18 seeded rows are `false` and 33 functions have no row at all — and the existing
`isIsabellaFunctionEnabled()` helper is fail-closed (`?? false`), so a naive gate would
BLOCK all four safety-critical functions (2 seeded false, 2 with no row). Hence the plan's
core rule: safety-critical functions live on a hardcoded code-level allowlist and are
exempt from the gate (fail-open), never dependent on a DB read. Live prod enabled-set could
NOT be queried (Supabase not linked, MCP not authenticated) — seed-default only; Lee to
confirm. Also noted: CLAUDE.md §5 says "50 functions" but the UI map has 52 (drift).

### 2026-06-16 — VERIFIED: Isabella per-function toggles are NOT enforced server-side; Stripe webhook IS signed
Traced `ai-run`, `ai-execute-action`, `ai-dispatch-events`. **None read
`isabella_settings.enabled`** — that table is referenced only in frontend code
(`useIsabellaSettings.ts`, `isabella-function-config.ts`), zero edge functions, no shared
gate. So the Feb 2026 finding ("toggles are UI-only, never checked at execution") is
**still true** for the per-function toggles. A *different* coarse flag, `ai_agents.enabled`,
IS partly checked (ai-run line 839, ai-dispatch batch line 159) but is bypassed for
chat_widget/voice and isn't the same as the 50 Isabella toggles. Resolved the §5 UNVERIFIED
flag in CLAUDE.md accordingly. **Stripe webhook: YES** — `stripe-webhook/index.ts:64`
calls `stripe.webhooks.constructEvent(rawBody, sig, secret)` before any handling; signing
secret comes from `system_settings` (key `settings_stripe_webhook_secret`), not env. Full
trace in `CRITICAL_VERIFICATION_2026-06.md`.

### 2026-06-16 — Edge-function count drifted 87 → 89
Session-start spot-check found 90 directories under `supabase/functions/`; minus `_shared`
(shared lib, not deployable) and the `deno.json` file = **89 deployable functions**. CLAUDE.md
§2 and §3 still said 87. Corrected both to 89. Migrations (123) and tests (225 passing, 1
failing suite `crmEvents.test.ts`) still match the docs. **Lesson:** count function *dirs*
excluding `_shared`, not `ls | wc -l` (which also counts `deno.json`).

### 2026-06-16 — Secrets live in two places, not one
Stripe/Mollie/Gemini keys are stored in the `system_settings` DB table (written by the
public `save-api-keys` function), NOT in `.env`. The old CLAUDE.md claim "all keys in
`.env`" was wrong and caused confusion. Security rests on RLS on that table — keep it
locked to service-role.

### 2026-06-16 — Duplicate nested repo silently zeroed the test suite
A second full copy of the repo nested in the parent dir hijacked Vitest's root
resolution, so 0 of 226 tests ran with no obvious error (it just couldn't find
`setup.ts`). Both copies pointed at the same GitHub remote and commit, and Vercel builds
from GitHub — so production was never at risk; it was purely a local nesting problem.
Fix: de-nest, park the old copy as `~/care-conneqt-platform-OLD`. **Lesson:** if tests
"can't find setup", check for a parent-directory repo before debugging Vitest config.

### 2026-06-16 — Audits drift unless tracked
A Feb 2026 audit (62 findings) went un-actioned and its findings were presumed open at
the next audit. That's why `LAUNCH_CHECKLIST.md` and this log exist — to make findings
sticky. Re-audit quarterly.

## 5. Improvement backlog (append-only — log here, don't fix mid-task)

> Things CC notices that could be better. Promote to `LAUNCH_CHECKLIST.md` if they become
> launch-relevant; otherwise they wait here until there's room.

- Add a `typecheck` npm script (currently `tsc --noEmit` has to be run by hand).
- Consider a CI job that fails if `CLAUDE.md`'s edge-function/test counts drift from
  reality — automated guard against doc rot.
- Code-split the 982 kB main chunk (also in checklist N18).
- Drive down the 311 `no-explicit-any` lint errors in `supabase/functions/**`.

## 6. Guardrails (read before editing any doc)

1. **Verified facts only.** Never write an aspirational or assumed number — measure it.
2. **Affected docs only.** Don't touch files the change didn't affect.
3. **Append, don't erase.** Logs and dated reports grow; they are never rewritten.
4. **Frozen files stay frozen:** dated audit reports and `REBRAND_CHECKLIST.md` are
   history — supersede with a new file, don't edit.
5. **Flag, don't resolve** the `CLAUDE.md` §12 decisions (legal entity, domains, `ICE-`
   continuity, Dutch scope) — those are Lee's, not CC's.
6. **Keep the §0 hook in `CLAUDE.md` alive.** It is the only thing that runs this system.
