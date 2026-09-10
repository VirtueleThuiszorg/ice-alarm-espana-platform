# STATE.md — the honest state of ICE Alarm España

> **This file tells the truth or it is a bug (GOALS.md G5).** Every "VERIFIED WORKING" line
> names the test or click-through that proves it. Nothing is marked working on the strength of
> a comment, a status doc, or "it looks implemented."
>
> - **Audit date:** 2026-06-18
> - **Branch:** `docs/truth-audit` · **Method:** static source/migration review + full suite run.
>   Runtime behaviour against the live DB was **not** exercised (Supabase MCP unauthenticated,
>   no E2E harness in repo), so most runtime claims are UNVERIFIED by design of this audit.
> - **Legend:** ✅ VERIFIED WORKING (passing test / click-through named) · 🔴 BROKEN (evidence) ·
>   🟡 UNVERIFIED (code exists, nothing proves it) · ⬜ MISSING (expected by the plan, not present).

---

## ⚠️ RULE CHANGE — 2026-09-09 · **nothing is held for Lee any more**

Read this before believing any "HELD — Lee" or "human gate" status below.

Lee's instruction, this date: *"nothing is held for me. No [HOLD FOR LEE] PRs, no gates waiting on
my read — every PR targets main and merges when green, schema included."* The four categories that
required his sign-off — the SOS/alert path, Stripe activation, RLS policies, Isabella's tool
permissions — no longer do. `CLAUDE.md` § *Merge authority* is the rule; this is the pointer to it.

**Consequence for the entries in this file.** Wherever a row below reads ⬜ HELD, *"behind the human
gate"*, *"pending Lee's review"* or *"needs a human gate"*, that is now a record of **why the work
stopped at the time**, not a live blocker. The work itself is unblocked; each item still needs
doing, and merges on green like anything else. Individual rows are deliberately **not** rewritten —
they are dated findings, and editing history to match today's rule is how a truth file stops being
one.

What did **not** change: golden rules 1–10 in `CLAUDE.md`, and **never merge red**. Merge authority
moved; the standard for what may merge did not. Green is now the only gate, which is why the CI
gates were split one-per-job the same day (below).

## Rota, shifts and holidays — 2026-09-10 · **all six items on main and in production**

Lee's brief: *"Staff see and manage their own shifts; supervisors control everyone's; holiday
balances correct and Spanish-law compliant."* Nine PRs, one concern each. Every claim below names
what presses it.

### What is now true

- ✅ **"My shifts" exists for every staff role** (#289, `/call-centre/my-shifts`). Four tabs then
  five: Upcoming (8 weeks, hours from `SHIFT_BOUNDS`, cover labels), Past (month picker back to
  the rota's first day, `is_confirmed` + `shift_notes` as evidence), Holidays (own rows +
  balance), Bank holidays and Requests (#306). Proven by `myShiftsPage.test.tsx`,
  `shiftSummary.test.ts` and `e2e/myShifts.spec.ts`.
  **The Past tab never says a shift was "worked"** — the platform holds no attendance record
  (`staff_presence` is one upserted row describing now; `staff_activity_log` is admin-only), so a
  shift with neither confirmation nor notes is shown as exactly that. Overstating it would put a
  number nobody can support in front of a payroll conversation.
- ✅ **A supervisor can reach the rota** (#288). `/call-centre/rota` mounts the SAME
  `pages/admin/RotaPage` component — a role gate and `return <AdminRotaPage />`, not a copy — with
  every editing control live. RLS had said for months that a `call_centre_supervisor` runs the
  rota; the only rota screen was admin-only, so Mary could not reach what the database already
  granted her. `rotaAccess.test.tsx` (24 cases) drives the gate from the constant and asserts
  "same page, not a copy".
- ✅ **The SOS escalation chain stayed admin-only** (#288). It is not the rota: it is the ladder
  `sos-escalation-runner` reads to decide who is telephoned when an alert goes unanswered.
  Widening who may edit it is a change to the SOS path and was not what "give Mary the rota"
  asked for, so the row and its dialog are hidden AND the query is not run for a supervisor.
- ✅ **A supervisor sees personnel** (#298, #300). Rota filter by person — which deliberately does
  NOT filter the coverage banner, because a false "uncovered" caused by somebody's own filter is
  the fastest way to teach people to ignore the one banner that means a shift has nobody on it.
  A "who is on now / next" strip on the supervisor dashboard, built on the escalation ladder's own
  `staff_on_shift_now` + `staff_presence` reads rather than a fork, showing SCHEDULED, ON DUTY and
  PRESENT as three separate statements — a single green tick would read as covered at the moment
  `staff-shift-monitor` is raising a no-show. Holiday approvals link each uncovered shift to the
  cover picker.
- ✅ **Swaps and cover exist** (#306, rota brief §3 — merged, and in production). The table, six
  statuses and RLS had been there since the rota landed; there was no UI and no apply step, so an
  operator wanting Thursday off asked Mary and Mary moved the shift by hand. Now: ask from the
  shift itself, answer in My shifts → Requests (with the count of what is waiting on you on the
  tab), approve in a queue on the rota. `apply_shift_swap` moves both shifts and writes the cover
  rows and the audit row in ONE transaction — a half-applied swap puts two people on one slot and
  nobody on another, and `staff_on_shift_now`, which the shift monitor reads, agrees with it. It
  refuses a non-supervisor, an unaccepted swap, a rota that changed underneath, and a swap
  offering a third person's shift; a second click moves nothing. The bell is written by a database
  trigger, because an operator cannot call `notify-staff` at all and a browser-raised notification
  dies with the tab.
  `wants_exchange` carries which question was asked, and exists because of who can see what: the
  requester cannot name the shift they would take, since RLS gives an operator its own shift rows
  only. Only the counterparty can, when they accept.
  Proven by 558 RLS assertions, 18 client tests asserted on the recorded write rather than a
  toast, and 10/10 UI mutants killed. **Two bugs found by execution, not by reading**: an assertion
  written as `apply_as(...) = X AND (SELECT staff_id …) = Y`, where SQL read the shift's owner
  BEFORE the apply ran (there is no left-to-right guarantee for `AND`), and a bell that called
  every swap request "cover" because both triggers read `offered_shift_id`, which is NULL until
  somebody answers.
- ✅ **Holiday entitlement is 30 días naturales** (ET art. 38.1), and the legal rules are
  SETTINGS, not code (#295): pro-rata only for a start date inside the year, festivos-inside-a-
  range default OFF with "confirm with convenio" on the screen, a warning on approving inside two
  months (art. 38.3 — 59 days warns, 60 does not), carry-over off with the sickness exception as
  a note. **No pay-out control anywhere**, and a test forbids the phrase outside comments: art.
  38.1 makes vacaciones non-substitutable by money.

### ✅ LIVE — the balances, and how they got there

The **2026 holiday backfill** (`20260910120000`, #292) was applied to production by
[Migrate Production run #8](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34488553431)
on 2026-09-10 at 14:22 UTC. One migration applied, none left pending, manifest recorded on main
by the bot as `ca51ab9`, and the verdict step read `db push: success · record: success`.

**What the database says, read back by the run itself** — not what the migration claimed:

```
Albert Soares:  16 used, 0 pending, 14 left of 30
Carmen Nicolas: 28 used, 0 pending,  2 left of 30
Mary Bonner:    18 used, 0 pending, 12 left of 30
Travis Nelison:  0 used, 0 pending, 30 left of 30
```

That is the sheet's 18 / 28 / 16 used and 12 / 2 / 14 remaining. Carmen's **2** is the number a
supervisor approving November would previously have seen as roughly 21.

The swap flow's two migrations followed on the merge of #306
([run #9](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34489927779),
schema first and functions after it). `check-migration-drift --main` now reports
**repo: 188 · manifest: 188 · production is level with the repo**, so the drift gate is green on
main for the first time since the 10th.

**HOW IT GOT UNBLOCKED, because the earlier version of this section was wrong twice.**
`supabase link` was refused, and I first wrote that off as an expired token. It was not: the same
token and project ref deployed every edge function 46 minutes later. Only the privilege `link`
needs was missing — and applying a migration never needed the Management API at all. `migrate.yml`
now tries `link` first and, when refused, writes the two files `link` would have written (the
project ref and the IPv4 **pooler** URL, since `db.<ref>.supabase.co` has no A record and runners
are IPv4) and carries on with every later step unchanged (#313). It shouts a `::warning::`
whenever that fallback runs, and it ran for both of these migrations.

**Still owed, and it is Lee's**: the Management API itself. `link` was still being refused a
minute after run #8 — PENDING_FOR_LEE §1, route A. Migrations flow; the API does not.

**"Manifest matches production" no longer sits red waiting for that (#337).** It had its own
`supabase link` step, so it could not pass while `link` was refused — on any commit, for any
reason — and a required gate that cannot pass teaches everybody to merge past a red X. Both
workflows now reach production through one shared script, `scripts/ci/reach-production.sh`, which
tries `link` first and falls back to the pooler with the same secrecy rules. **From #337 onwards,
red on that job means something real.**

Worth keeping from the wrong version, because it is a real trap: Migrate Production runs #4, #5
and #6 are all green and migrated **nothing** — their Apply-migrations job was *skipped*, because
those pushes touched no migration file. **A green Migrate Production run is not evidence that
migrating works.**

### Follow-ups, recorded rather than done

- **The RLS harness skips pg_net migrations**, so `20260909130000` (lead emit) and
  `20260910130100` (swap emit) are never applied by any gate. Applying them with only the
  `CREATE EXTENSION` line stripped works — bootstrap.sql already stubs `net.http_post` and
  `vault.decrypted_secrets` — and doing it by hand is how a real bug in the swap emit was found
  (it titled every swap request "cover"). Making the harness do that would have caught it in CI.
- `hire_date` is missing for the four operators, so pro-rata cannot be computed for anybody who
  started mid-year (PENDING_FOR_LEE D-16).
- The two convenio questions — do festivos inside a holiday range count against vacaciones, and
  is carry-over allowed — are settings with defaults and notes, awaiting Lee's answer.

---

## Member home location — 2026-09-10 · **the member's front door, and who is allowed to claim it**

Five PRs — #312, #315, #323, #327 and the import one. What is claimed here is what a test presses;
what is not done is named as not done at the bottom.

### ✅ The rule for which location the SOS card leads with (#312)
`src/lib/homeLocation.ts` — five outcomes from three inputs (a fix or not, fresh or not, a pin or
not), and it returns which block is PRIMARY rather than "the location". Two of the five are the
ones worth arguing about and both are recorded in the module: a stale fix stays on screen when
home takes over (it is where the pendant *was*), and a stale fix with NO pin stays primary
(replacing the only location we have with nothing is worse). Threshold 30 minutes.
Proof: `homeLocation.test.ts` (31), negative-first — home is not primary while the fix is fresh,
and the card does not claim to be showing home when there is no home.

### ✅ The schema, IN PRODUCTION (#315)
Six columns on `members` (`home_lat`, `home_lng`, `home_location_accuracy_m`,
`home_location_source`, `home_location_set_at`, `home_location_set_by`), the
`home_location_source` enum, three CHECK constraints and `guard_member_home_location()`.
Applied by
[Migrate Production run #10](https://github.com/VirtueleThuiszorg/ice-alarm-espana-platform/actions/runs/34502495922)
and recorded: repo 189, manifest 189, `20260910140000_member_home_location.sql` on the list.

**Written up here because the blockage was real for two hours and the reason it cleared matters.**
This PR was opened with the drift gate legitimately red: `Migrate Production` could not
`supabase link` at all, so `20260910120000_holidays_2026_backfill_before_cut.sql` was stranded and
the stacking gate held every schema PR in the repo. #313 (another session) reached production
through the IPv4 pooler instead, which cleared the backlog. The migration was then renumbered
from `20260910130000` to `20260910140000` because `20260910130000_shift_swap_apply_and_bell.sql`
landed on the same version in the meantime — two migrations sharing a version is the case
`migrationDrift.test.ts` fails on, and it fails on it because the CLI runs at most one of them and
records the other as applied without it having been.
`supabase link` is **still** refused and the fallback shouts every time it runs. The main-only
"Manifest matches production" job stayed red for that reason until #337 gave it the same fallback;
it is green now, so red there is no longer expected. Either way it is `PENDING_FOR_LEE.md` §1,
not this feature.

Proof: `scripts/rls/isolation.sql` +25 checks (551 total) — member A cannot READ
or OVERWRITE member B's pin; a member cannot record their guess as a staff correction; staff
cannot claim the member confirmed it; a backdated timestamp and a borrowed id are discarded; a
provenance-only rewrite raises; a >100 m `member_gps` fix raises and exactly 100 m is accepted;
`members.status` guard still holds beside the new trigger. Plus
`memberHomeLocationWrite.test.ts` (24) holding the three copies of the 100 m rule in step.

### ✅ The member marks their own front door (#323)
"Home location" row on `/dashboard/profile`; a dialog with the browser's own fix or a draggable
pin; the date it was set on screen, because that is what the operator sees too. A fix worse than
100 m is REFUSED and the pin does not move to it. Leaflet + OpenStreetMap for the picker and the
preview — `LocationMap` is a Google **iframe** and an iframe cannot carry a draggable pin;
the Google links are unchanged. Code-split, so Leaflet is not on the first paint.
Proof: `memberHomeLocation.test.tsx` (29) and `e2e/memberHomeLocation.spec.ts` (2, real Chromium,
real Geolocation API): a 20 m fix saves as `member_gps` through `member-self-service` and the
member sees it on their next visit; a 640 m fix is refused with **nothing sent**.

### ✅ The SOS card, display only
`SOSSituationPanel` and `AlertDetailPanel` gained a READ and a labelled block. The home pin is
never merged with the pendant's fix and never shown in its place: whenever a usable fix exists
the map is the fix, however old. When there is no recent one the card says
*"No recent pendant location — showing home"* in words, and the distance between the two is on
screen when both exist — the one line that answers "do I send help to the house?" on its own.
The label is derived from the provenance, in ONE component, so the two cards cannot disagree:
`geocoded` and `imported` read *"from our records — not confirmed by the member"*.
Proof: `sosHomeLocation.test.tsx` (20) and `e2e/sosHomeLocation.spec.ts` (3). The existing SOS
suites were re-run unchanged and are green (159 assertions across sosDrill, sosEscalation,
escalationLoop, escalationOutcome, alertOwnership, alertResolution, operatorQueue,
operatorCardNoContacts).

### ✅ The imported pin, and "recommended" meaning something
`parseGps` is exported and reused for the `Google Map Link` column — 90 rows have a link and no
coordinates. Anything written to `home_lat`/`home_lng` must pass a Spain bounding box, because
"the first decimal pair in a URL" occasionally finds a zoom level. Source is always `imported`
and the date is always NULL: the import knows when IT ran, not when anybody stood at that door.
`MEMBER_RECOMMENDED_FIELDS` is a SEPARATE list from `MEMBER_REQUIRED_FIELDS` — a member without a
pin is not an incomplete record, the missing count does not move, and it cannot travel on the
member's update link, which needs no login.
Proof: `memberHomeLocationRecommended.test.ts`.

### What is NOT done, named as undone
- **No member or staff member has actually set a pin on production.** The columns are there and
  every path is proven against a real PostgreSQL and a real browser, but the first live one will
  be the first live one. The honest first test is one member record, set from the staff card
  during a courtesy call, then read back on a test alert.
- **No screenshot of the LIVE app.** Every Playwright run here is against the production BUNDLE
  with Supabase's HTTP surface stubbed. That is what those specs claim and no more: they cannot
  prove a policy, a constraint or a trigger, which is why the RLS harness exists beside them.
- `home_location_source = 'geocoded'` is in the enum and **nothing writes it**. Deliberate: the
  forward geocoder centres the pin picker and its answer is never saved on its own, because a
  geocoded rooftop in rural Almería is routinely a hundred metres from the gate. The value exists
  so a future backfill has an honest label to use.
- The imported pin is **create-only**. A re-import fills it on a member being created and never
  on one the platform already holds — the guard trigger refuses a staff-authenticated write
  claiming `imported`, and filling an empty pin from a three-year-old spreadsheet on a live
  record is the wrong direction anyway. Backfilling those is a deliberate service-role job.

## CI — 2026-09-09 · **one gate per job; a missing secret fails**

Four gates shared one job — drift, wiring register, typecheck, build, in that order. A failing step
ends its job and marks every later step `skipped`, and `skipped` is not red. Main carried five
unapplied migrations for a day, so the drift gate failed first every time, and for that whole day
**main had no signal at all** for typecheck, build or register freshness. Two things went through
the hole: an unparseable test file (#268) and the review fix for a live auth stale-token hole
(#273). Neither was subtle; nothing was looking.

`migration-drift` and `wiring-register` are now their own jobs, with no `needs:` edges, so a red
gate sits beside four verdicts that still mean something. Neither runs `npm ci` — both scripts
import only `node:` builtins.

`deploy-functions.yml` no longer skips: its first step was *"Check deploy secrets (skip gracefully
until configured)"*, which reported **success having deployed nothing** when the credentials were
absent — so "green" meant either "deployed" or "never tried", on the one workflow whose entire
promise is that main and production run the same code. `scripts/ci/require-secrets.mjs` exits 1 and
names what is missing. Proven by `src/test/ciJobIsolation.test.ts` (23 assertions, 12 mutations
killed — including a duplicate gate re-added inside the shared job, which the first version of the
test missed).

## KarmaCRM import, Lee's four rulings — 2026-09-10 · **all four built; two migrations applied**

Five PRs (#334, #339, #342, #344, #346) answering `PENDING_FOR_LEE.md` D-19. The section below
describes the import as it was when the rulings were asked for; this is what changed.

### ✅ Who becomes a member, and the rule
Before: a member needed **nine** columns, including an email — and most of Lee's clients have
none, so they became CRM contacts. Now the rule is **name, phone, date of birth, and an address
(line 1, city, province, postal code)**. On the 10-row fixture that moved 3 members → **7**; the
three that remain contacts are blocked on a date of birth the parser refused, not on an email.
**Lee runs the real file** — the count on the 431 is his to see, and it is the preview screen's
job to show it before anything is written.

### ✅ Imported members are `pending_review` + `billing_source = 'legacy'` (#342, #344)
Not `inactive`, which was honest about the payment and wrong about the person. `active` +
`legacy` is monitored; only `stripe` means there is a subscription here to renew or dun. There
are now exactly **three** routes to `active` — the payment webhook, a staff reinstatement of a
member who already has a paid subscription, and `confirm_legacy_member()` (admin/supervisor,
`pending_review` only, `activity_logs` row with their name and reason, bell to admins and
supervisors). The guard trigger refuses everything else **including the import**.
Proof: 13 assertions in `scripts/rls/isolation.sql` — who may confirm, a plain UPDATE refused for
an admin AND a supervisor, confirming one member not unlocking another in the same transaction, a
second confirmation refused. Plus `legacyMemberState.test.ts` (18) and
`legacyConfirmAction.test.tsx` (11).

### ✅ Email is optional, and has an owner (#346)
`members.email` NULLABLE; `members_email_key` replaced by a **partial, case-insensitive** unique
index on `lower(email) WHERE email IS NOT NULL AND email_owner = 'member'`. A carer's address may
be shared — one daughter looking after both her parents is two members — and **is never a dedupe
key**, because keyed on email the second parent would have been patched onto the first's record.
Proof: 7 assertions executed against real PostgreSQL 16, including the same own address in
different case, which the old constraint let straight through.

### ✅ The three legacy membership facts have columns (#339)
`crm_profiles.legacy_membership_type / legacy_payment_type / legacy_date_joined`, with a backfill
that lifts them out of the notes already written and **keeps a value a human has corrected**.
Exercised against a real cluster, twice, with the second run writing 0 rows.

### ✅ The four unmapped columns (#334)
`Dob` is a fallback for `Birthday` **only when Birthday is blank** — never when it holds something
the parser refused, because a value we could not read is a value to look at. `Spouse` is a note.
`Contact Friend for Email` becomes an email consent row on an unambiguous yes only, stamped
`staff_recorded`, and never overwrites a refusal staff have since recorded. `Wellbeing Appt Date`
stays in raw.

### 🔴 Three defects found, two of them mine and already merged
1. **Every member note the import wrote was refused by Postgres.** `member_notes.note_type` is
   CHECK-constrained and the import wrote `'crm_import'`. Because `insertNote` throws, the whole
   row was then recorded as `failed` even though the member had been created. Invisible to every
   test in #316 — a fake database has no CHECK constraints. Found by running a backfill for real.
2. **`billing_source` was missing from `NEVER_PATCH`**, so a re-import could have flipped a
   Stripe-paying member to `legacy` and quietly stopped the platform chasing money it is owed.
3. **`supabase.rpc` returns a plain object, not an `Error`**, so the confirm dialog showed a
   generic "could not confirm" instead of the database's "admin or supervisor only" — the
   difference between fetching a supervisor and pressing the button again.

### 🔴 And two of my own migration tests were reading the comment, not the code
Two mutants survived on #346 — dropping the owner predicate and making the unique index
case-sensitive — because the migration's header comment quotes the intended index and the
assertions matched that. Fixed by stripping SQL comments before matching, and by asserting the
index as one statement (the three-match version also missed the case mutant, because there are
two indexes on `lower(email)` in that file).

### 🟡 Still not proved against production data
No legacy member has been confirmed on production, and the real 431-row export has never been run
through this code — it holds 431 living people's medical and address data and does not belong in
the repo. The first real run should be the one-row David Evans test, then the preview CSV read in
a spreadsheet, then the file.

---

## KarmaCRM import — 2026-09-10 · **works on the real 431-row export; nothing sensitive is stored**

Five PRs (#302, #307, #308, #316, #318). The brief: *"today it turns Lee's clients into incomplete
CRM contacts with garbled phones and no address, contacts or device."* What is claimed here is what
a test presses.

### 🔴 THE FINDING THAT REFRAMED THE GOAL: the good mapper existed and nothing imported it
`src/lib/iceCrmImport.ts` — 910 lines written against the real 147-column export, with 57 tests —
was imported by **its own test file and nothing else**. The page ran `src/lib/crmImport.ts`, a
parser written against KarmaCRM's *default* contact export. So the brief's item 1 ("write the
mapping") was already done and unreachable. Closing the gaps in the existing mapper and wiring the
page to it beat rebuilding it elsewhere; `crmImport.ts` is now deleted (#316).

### ✅ Nothing sensitive reaches any table (#302)
`Credit Card Details`, `20 Digit Bank No`, `Private Medical Details`, `Death Funeral Wishes` are
refused **at the accessor**: `IceRow.get()` returns `""` for them and `IceRow.raw()` omits the keys,
so `crm_import_rows.raw` has no copy either. Only the *count* of rows that held each is recorded, so
"94 rows had card data, discarded" is a statement somebody can check. The free-of-charge signal is
recovered as a **boolean** from the payment columns, never as a value.
Proof: `crmImportRedaction.test.ts` (21) sweeps the serialised output for the fixture's fake card
number at any depth; `crmImportPage.test.tsx` sweeps every recorded write.
**Two regressions this caused were caught by the existing tests, not by review:** `detectFreeOfCharge`
and `hasSensitivePaymentData` both read the card cell through `get()`, so redaction silently turned
`is_free_of_charge` false for members who pay nothing. And the first `REDACTED_SET` lowercased its
keys while `normaliseHeader` does not — the set never matched and **every redaction did nothing**
while the code read as guarded.

### ✅ A row that cannot be represented honestly does not become a member (#307, #316)
The old writer invented data to satisfy NOT NULL columns: `imported-…@placeholder.local`, `'N/A'`
for phone and address, `'TBD'` for a pendant's SIM, `status: 'active'` for all 431 rows, and `'N/A'`
as the phone of an emergency contact the CRM had named without a number — **a number an operator
would have been handed mid-SOS**. Now: nine required columns really present or it is a CRM contact
with the reason attached; no device row without a real SIM (the IMEI becomes a note); no contact
without a dialable number (the name becomes a note); `status: 'inactive'`, never `active` (golden
rule 4, D-19).
Proof: `crmImportWriter.test.ts` (33), `crmImportApply.test.ts` (26).

### ✅ Re-running the import changes nothing (#308, #316)
Matched on NIE (punctuation- and case-insensitive), then email (lower-cased), then phone — in that
order, because NIE is a government identifier and a phone is the most shared. Existing members are
patched **empty fields only**: a street a human corrected is never overwritten, and `status` is
never patched even when empty. The whole database, snapshotted after run one, is byte-identical
after run two. Lee's one-row test then the full file leaves **one** David Evans.
Proof: `crmImportDedupe.test.ts` (20), `crmImportApply.test.ts` (26).

### ✅ The screen shows the plan before anything is written (#316)
Per row: member / CRM contact / skipped and **why**, with the parsed date of birth, phones,
emergency contacts and IMEI beside it — shown for the *blocked* rows above all, because "no email"
must not look like "no data". Reasons totalled across the file. Discarded sensitive columns counted
per column. Preview exportable as CSV. **The batch row is created when Import is pressed, not on
file drop.**
Proof: `crmImportPage.test.tsx` (26), every assertion on the recorded write rather than a toast.

### ✅ Where all 147 columns go, derived rather than asserted (#318)
`ICE_IMPORT_COLUMN_MAP.md` — 92 mapped, 4 read only as a fallback, 47 kept in raw only, 4 discarded.
Generated by probing each column **by index** (three columns are called `Membership Type`) and
diffing the mapped output against a realistic baseline row; the committed document is asserted to
match, so it cannot go stale without CI saying so.
Proof: `iceImportColumnMap.test.ts` (7).

### 🟡 Not proved against production data
Every number in the brief (431 rows, 317 with an address, 338 multi-phone cells, 267 birthdays, 135
IMEIs) is Lee's measurement of the real file. The fixture is 6 rows carrying one of each shape; the
real export has never been run through this code, because it holds 431 living people's medical and
address data and does not belong in the repo. **The first real import should be the one-row David
Evans test, then the preview CSV read in a spreadsheet, then the file.**

### ⬜ Four decisions recorded rather than taken
`PENDING_FOR_LEE.md` D-19: three `crm_profiles` columns that do not exist, the absent `legacy`
member status, `members.email` being `UNIQUE NOT NULL`, and the 47 unmapped columns.

---

## Member CRM record — 2026-09-10 · **read-only by default, and it says what is missing**

Sixteen PRs on the member record (#290, #291, #293, #296, #297, #299, #301, #303, #304, #310,
#314, #317, #319, #326, #328, #329), plus the #305 and #322 corrections to this section and
the #333 repair below. What is claimed here is what a test presses; where something is left
undone it is named as undone.

### ✅ ONE definition of "required" (#290)
`src/lib/memberRequiredFields.ts` — **21 items**, each carrying WHY it is required (SOS
response / billing / legal), the sentence a member or a staff member reads, and which source
asserts it. It replaces **five** disagreeing answers: `readinessGap.ts`, `protectionChecklist.ts`,
the registration schema, `medicalFields.ts` (which marks nothing required) and an inline list
inside `MemberUpdateRequestModal` that was written nowhere else. The two real disagreements are
recorded in the file rather than resolved quietly — NIE/DNI is optional AT SIGN-UP and required
ON FILE; ONE emergency contact, not two, because the readiness view, the queue and the operator
card all say one. **Lee's to check:** the list itself, in that file's `MEMBER_REQUIRED_FIELDS`.
Proof: `memberRequiredFields.test.ts` (26).

### ✅ Locked until Edit — the WHOLE record (#301, #304, #310, #314, #317, #319)
`EditableCard` — one shell, and the lock is a single `<fieldset disabled>` rather than a
`disabled` prop on forty inputs, because the forty-first is the one somebody forgets and the
forgetting is invisible. A refused save keeps the card open with what was typed in it; unsaved
changes are warned about in-app and by the browser. MedicalTab now writes an audit row (it wrote
to `medical_information` and left none).

**Every card on the record, in one of three modes:**

| mode | cards | behaviour |
| --- | --- | --- |
| `form` | Profile, Medical, Courtesy calls | Edit → Save / Cancel, unsaved-change warning |
| `manage` | Contacts, Notes, Tasks, Device ×3 | Edit → Done; each row commits itself |
| `locked` | Subscription details, CRM profile, CRM import | padlock, no Edit, reason on screen |

**CORRECTION to what this section said on 2026-09-10.** It read *"Contacts / Notes / Tasks /
Device / Subscription needed no change — every field on them already sits inside a dialog"*.
That was true about FIELDS and missed the point: Add, Edit, Delete, Unassign and Mark Faulty
were all live the moment those tabs opened. Deleting a member's only emergency contact by a
stray click on a screen being read down the phone is a life-safety event, not a typo. They are
now `manage` cards, where Edit arms those controls and Done disarms them — there is no Save,
because each row already wrote itself and a Save that saves nothing is the same lie as an Edit
that unlocks nothing.

Three cards hold values NO screen may set (a subscription's plan and price are the payment
webhook's; an imported CRM profile is what the import saw). They are `locked` with a REQUIRED
reason — `MEMBER_UX_RULES` R7's rule for fields, applied at card level.

**What stays usable while locked is asserted as hard as what does not:** ringing or WhatsApping
a contact, searching the notes (moved into the card header so a locked card is still
searchable), the device links, View Batch. A lock that stops people reading is a lock they turn
off and leave off.

`EditableCard` moved to `src/components/EditableCard.tsx` (#310) because the member-portal work
needs the same behaviour; a guard fails the suite if a second implementation appears anywhere
under `src`. The header's Edit button opens the Profile card rather than landing on a locked one
(#319) — and that `editSignal` is what finally made the `!locked && wantsEdit` invariant
killable by a mutation, which it had not been.

Proof: `memberLockedUntilEdit.test.tsx` (14), `courtesyCallsLocked.test.tsx` (5),
`lockedCards.test.tsx` (6), `manageModeCards.test.tsx` (7).

### ✅ Leaving a half-typed edit is warned about, not silently discarded (#326)
The tab row and the browser go through one registry. `UnsavedChangesProvider` holds the set of
dirty card ids in a **ref and nothing else** — an earlier version kept a version counter in
state, and because each card's effect depended on the context object, one keystroke
unregistered-and-reregistered itself into an infinite render loop. That loop pegged the event
loop hard enough that vitest could not fire its own timeout: the runner hung rather than
failing, which is the worse of the two. The ref version has no state to loop on.
Proof: `unsavedRegistry.test.tsx`, `unsavedTabChange.test.tsx`.

### ✅ Read mode looks like reading (#328)
`<fieldset disabled>` stops the typing and changes nothing about the look: a disabled input is
still a bordered box with a placeholder and a chevron, so a locked record read as a form
somebody had switched off. One rule in `index.css` scoped to `.editable-card-fields:disabled`
strips the chrome and keeps **full-contrast** text — WCAG 1.4.3 exempts disabled controls, and
that exemption is for things you cannot use, not for the primary way of reading a medical record
down the phone. Placeholders are hidden with it, because "e.g. Penicillin, Shellfish" looks
exactly like a recorded allergy once the box around it is gone. jsdom applies no stylesheet, so
the test pins both halves separately — the class on the element, and the rule in `index.css`
itself; either half alone passes while the feature is broken. Proof: `readModePlainText.test.tsx`
(7).

### ✅ "After Save the value persists on reload" is a test now (#329)
It was the one line of the brief still resting on a click-through. Six tests over `ProfileTab`
against a fake that **holds and mutates a row** rather than swallowing the write: the value is on
the card after Save, still there on a fresh mount, untouched fields are not blanked, `onUpdate`
fires so the page re-reads, no discard prompt follows a save, and a cancelled edit puts the old
value back **on the screen** while writing nothing. Proof: `memberSavePersists.test.tsx` (6).

### 🔴 It broke main for eleven minutes, and the way it broke is worth keeping (#333)
#327 put `StaffHomeLocationCard` — a react-query consumer — on the Profile tab. #329 renders
`ProfileTab` bare. Both were green on their own branch, and neither CI run could have seen the
other's change: #327 ran before #329's test file existed. On the merged result the tab threw
`No QueryClient set` before the form under test ever mounted, and all six assertions went down.

**They touch no file in common.** The merging rule in CLAUDE.md keys on that — "when more than
one open PR touches the same large file, merge them serially" — and this pair would have passed
that check on the way in. The signal that was actually available was cheaper: #327 changed what
`ProfileTab` renders, and #329 renders `ProfileTab`. A PR that adds a component to a shared page
is a PR that can break any test which mounts that page, whatever files it lists.

Fixed by wrapping the render in a `QueryClientProvider` (`retry: false`, a fresh client per
open), **not** by stubbing the one card — stubbing buys a week, and the next react-query card on
this tab breaks it again the same way. `memberLockedUntilEdit` had the same gap and was fixed
inside #327. Two sessions diagnosed this independently and wrote the same patch; #333 is the one
that merged, #335 was closed as a duplicate.

### ✅ Overview and Missing-info pop-ups (#293, #299)
Overview shows only what we HAVE, in eight groups, empty fields omitted rather than rendered as
"—", with Copy-as-text and a Print document of its own. Missing-info carries the count as a badge
read on mount (a number nobody sees until they click is not a warning), every item with its
reason, requestable items pre-ticked, and what only WE can do shown but not tickable. The count is
on the members list too — five batched reads per page, and `…` rather than `0` while it is unknown.
Proof: `memberOverview.test.ts` (16), `memberOverviewDialog.test.tsx` (7),
`memberMissingInfo.test.tsx` (12).

### ✅ The member's link asks for everything, and can only write what it should (#296, #297)
`send-member-update-request` used to THROW when the email bounced — the token existed, the link
worked, and the staff member was told it had failed. It now returns the link with a named outcome
per channel (SMS when `notify_channel_sms` is on, to the number on the member's own row), and the
dialog shows the link with a Copy button whatever the transports did.
`MemberUpdatePage` understood **nine** tokens while the list names **eighteen** a member can
supply, so a ticked "date of birth" produced a token that asked for it and a page that did not
mention it. It is now driven from the list, with a ratchet that fails the suite if a requestable
field has no control. Old tokens (`contacts_count`, `contacts_email`) still work for their 7 days.
**Security:** `submit-member-update` spread the request body into a `service_role`
`.update({...member})` — the interface named three fields and the runtime accepted every column on
`members`, from an anonymous link holder, with RLS not behind it. Whitelisted now, refused keys
logged and audited. Proof: `memberUpdateRequest.test.ts` (18), `memberUpdateForm.test.ts` (18),
`memberUpdatePage.test.tsx` (6), `memberUpdateRequestModal.test.tsx` (6).

### ✅ Four controls that were toasts (#303)
The Messages tab's SMS, WhatsApp, Email and Log Call were each
`onClick={() => toast.info("… coming soon")}`. All four are wired: `twilio-sms`, `send-email`, a
`wa.me` handoff that deliberately does NOT claim delivery, and one `member_interactions` row
carrying the operator's note. That last one revives a dead reader: `communicationLogger.ts`
exported ten log functions imported by NOTHING while `ActivityTab` and the call-centre alert panel
both read `member_interactions`. Two register rows moved off DEAD; the still-dead halves
(billing reminders, the alert/payment/device helpers) still say so. A control walk covers 32
controls across the twelve tabs, the header and the ⋯ menu, with a sweep that fails on
"coming soon" or a no-op handler anywhere on the record. Proof: `memberQuickContact.test.tsx` (9),
`memberCrmControls.test.ts` (57).

### 🟡 Not done, and not claimed
- **The 12 tabs are brand-red cards** (#291) with a page-scoped token set and a ≥4.5:1 assertion,
  but active-vs-base is only 1.58, which is why the active tab also carries a ring and an
  underline. Nobody has looked at it on a real screen.
- **`dbMessage()`** was added because `error instanceof Error` is FALSE for a PostgrestError, so
  every `error instanceof Error ? error.message : String(error)` on the record rendered
  "[object Object]" — including the guard trigger's *"activation is the payment webhook's job"*.
  Two call sites are fixed. **The same pattern is elsewhere in the app and was not swept.**
- **`member_interactions` still has no test proving a row reaches `ActivityTab`** end to end; the
  writer and the reader are each proven alone.

## Sessions — 2026-09-09 · **the idle logout is gone, and the browser decides**

A session now lasts until the browser is closed or the user signs out. Nothing expires it on a
timer.

**What was wrong.** `useSessionTimeout` signed **everybody** out after 30 minutes without a
mousemove, with a 5-minute warning dialog. It was the *only* reason anybody ever re-logged-in or
re-entered a TOTP code: Supabase persists the session and refreshes the access token by itself,
so nothing else was expiring. And it was worst for the people it mattered most to — the SOS
ladder's tier 1 is an operator watching an open screen, and an operator who has been reading
rather than clicking for half an hour is doing their job, not idling.

| # | requirement | state | proof |
|---|---|---|---|
| 1 | no idle logout for staff/admin; none for members (Lee's preference) | ✅ | hook and dialog **deleted**; the three `TIMEOUTS.SESSION_*` constants removed so there is no number left to re-tune. `sessionPersistence.test.tsx` drives 31 minutes and 8 hours of fake time and asserts the token is still there |
| 2 | "Keep me signed in on this device", OFF for staff, ON for members | ✅ | `authStorage.ts` routes tokens to `localStorage` (on) or `sessionStorage` (off), reading the choice on **every** call because the client is built at import time. `KeepSignedInCheckbox` is one component with two defaults |
| 3 | 2FA challenged only on a NEW session | ✅ | asserted as an **absence**: no file on the navigation path (`AuthContext`, `ProtectedRoute`, `App`, both storage modules) contains `mfa.challenge`/`mfa.verify`, and `ProtectedRoute`'s admin gate checks *enrolment* (`hasVerifiedFactor === false`) rather than issuing a challenge |
| 4 | explicit Sign Out clears everything | ✅ | `clearAllAuthStorage()` clears **both** stores plus the preference, and only Supabase auth keys — the wizard draft, language and consent survive. The on-duty warning (#246) is unchanged |
| 5 | tests + STATE.md + WIRING_REGISTER.md | ✅ | 36 tests; **33 mutations, 33 killed** — 27 first pass, plus 6 after a review found a real hole (below). Register regenerated |

**The browser-close test is real, not mocked.** Closing a browser clears `sessionStorage` and
leaves `localStorage` alone — that *is* the difference between the stores. So the test clears
`sessionStorage` and asks the adapter what it can still see.

**Multi-tab was the one real cost**, and `sessionStorage` is per-tab. A tab opened from the
address bar or a bookmark starts with nothing while the tab beside it is signed in — for an
operator opening a member record mid-alert that is unacceptable. `authSessionSync.ts` has tabs
ask each other over `BroadcastChannel`; a signed-in tab replies with its tokens and the asker
installs them with `setSession`. Lee offered the alternative — localStorage plus clear-on-last-
tab-close — and it was rejected deliberately: it keeps the token on the disk of a machine shared
between shifts, and it depends on an unload handler that does **not** fire on a crash or a
force-quit, so the "cleared on close" promise fails exactly when somebody pulled the power out.

**One deliberate carry-over.** Everybody signed in today is signed in through `localStorage` with
no preference recorded. An absent preference read as "ephemeral" would clear every one of those
tokens on the next page load — including an operator's, mid-shift, which is the exact failure
this change exists to stop. So `adoptExistingSession()` reads an absent preference beside an
existing session as "persistent", once, and writes it down. Their next deliberate login sets it
properly. It runs **before** the client is constructed, and a test asserts that ordering.

**A HOLE THIS WORK'S OWN TESTS MISSED, found by reviewing the adapter afterwards.** `getItem`
fell back to the other store when the chosen one was empty. So an ephemeral staff session that
closed the browser found `sessionStorage` empty — as intended — then read `localStorage` and
picked up a token left by an earlier persistent login: **signed in after a browser close**, the
exact opposite of what the unticked box promises.

All 34 tests passed regardless, and the reason is the useful part: `setPersistentLogin(false)`
clears the other store *in the same call*, and every test set the preference immediately before
reading. On a real browser reopen the preference is **already** recorded, so nothing clears
anything and the stale token wins. The fallback had no legitimate case at all — every real path
puts the token in the store the flag names — so it is gone, and two tests now write the
preference **directly**, bypassing `setPersistentLogin`, to reproduce the state a reopened
browser is actually in. Three mutations confirm it (`the fallback comes back`, and pinning reads
to either store).

Second review finding, smaller: the 31-minute test claimed to be the behavioural proof and is
not — it mounts nothing, so no timer could fire in it either way. It proves the *stores* do not
self-expire. The behavioural guard is the "no source file arms a timer" assertion, and that one
is mutation-proven by planting a `setTimeout(() => handleSignOut(), 30 * 60 * 1000)` back into
`AuthContext`. Both are kept, with the comment now saying which does what.

🟡 **Not verified in a real browser.** Everything above is jsdom and source assertions. Two
things only a person at a keyboard can confirm: that a **real** browser close ends a staff
session (the jsdom test simulates it by clearing `sessionStorage`, which is what a close does,
but it is not the same as doing it), and that a second tab opened from the address bar picks up
an ephemeral session inside the 400 ms `BroadcastChannel` window on a slow machine.

---

## Dashboard notes — 2026-09-09 · **five merged, four held, two findings for Lee**

Lee walked the admin dashboard, the Holidays page, the product catalog, the call-centre
dashboard and the member CRM record, and sent nine items. This is what came of them, with the
evidence, and it is written to the same rule as everything else in this file: a ✅ names the
proof, and a 🟡 says what is missing.

| # | item | state | proof |
|---|---|---|---|
| 1 | Isabella card said ACTIVE while every run failed | ✅ **in main** (#244), then reshaped into a header pill by a later session (`IsabellaHealthPill`) | `src/test/isabellaHealthCard.test.tsx` — 38 assertions, 25/25 mutations killed |
| 2 | Sales card "Failed to load" (`22P02`) | 🟡 **merged in main (#243), NOT yet in production** | `scripts/rls/isolation.sql`, 9 assertions by execution; 7/7 mutations killed |
| 3 | admin-audience events writing nowhere | ✅ **in main** (#249) — inventory only, six rows (A1–A6), each check verified on every build | `src/test/absentAdminEvents.test.ts` — 21 assertions, 10/10 mutations killed |
| 4 | "Create Subscription" had no handler | 🟡 **held** (#248 code, #243 schema) | `src/test/sendPaymentLink.test.ts` + `memberCrmControls.test.ts` — 81 assertions, 34/34 mutations killed; 36 harness assertions |
| 5 | admins on the Holidays page | ✅ **in main** (#241) | `src/test/holidaysExcludeAdmins.test.tsx` |
| 6 | `sidebar.productCatalog` rendered its own key | ✅ **in main** (#240) | `src/test/i18nKeyCoverage.test.ts` (now collects `labelKey` declarations), `productCatalogAuthority.test.ts` |
| 7 | Start Shift / on duty | ✅ **in main** (#246) — Lee merged the held PR; it changes an input to the SOS escalation ladder | `src/test/onDutyDeclaration.test.tsx` (17) + `e2e/onDuty.spec.ts` (2, real browser); 12/12 mutations killed |
| 8 | MedConneqt framing + session | ✅ **in main** (#245) | `src/test/medconneqtKeepAlive.test.tsx` — frame identity across navigation; 11/11 mutations killed |
| 9 | sidebar order | ✅ **in main** (#238) | `src/test/callCentreSidebarOrder.test.ts` |

**Where the held work stands.** Lee merged #243 and #246 himself the same morning; #248 is
still open.

- 🔴 **`20260909100000` and `20260909110000` are in main and NOT in production.** #243 merged
  before `supabase db push` ran, so **main's CI is red on the drift gate** and stays red until
  the two filenames are appended to `APPLIED_TO_PROD.txt`. That is the gate working as
  specified, not a break: everything else on main — tests, lint, typecheck, build, RLS, page
  audit — is green. Nothing in this repo may append those lines; only `db push` makes them true.
- 🟡 **#248 (Send payment link)** is held on the payment human gate (CLAUDE.md) **and** on those
  two migrations: the SQL function it calls is one of them. Sending a link before then returns a
  409 naming the missing function.
- **#242** was the wiring session's and is now merged.

**A merge artefact reached main and was caught by CI (#251).** #242 rewrote `WIRING_REGISTER.md`
and #249 added a section to the older version; git merged them with no conflict and left BOTH
summary lines — the "kept both sides" pattern from the two locale outages, in a generated file
this time. Regenerating fixed it, which is the whole reason that file is generated. The lesson
is the one CLAUDE.md already carries and this run repeated anyway: **merge PRs that touch the
same generated or shared file one at a time.**

**Two things this run FOUND and deliberately did not fix** (`PENDING_FOR_LEE.md` S18/S19), both
from the item 4 walk of the member record:

- `PaymentsTab` records a manual bank transfer as `status: 'completed'` **from the browser**,
  with no actor and no reason. Golden rule 4 is intact — it activates nobody — but *"who says
  this money arrived?"* is unanswerable from the row.
- `DeviceTab` mirrors `has_pendant` onto **every** subscription a member has ever had
  (`.eq("member_id", …)`, no status filter). The same shape, larger, exists on the gated file:
  `stripe-webhook` sets `status: 'active'` on every subscription row for the member.

**Two defects found in the instruments themselves**, which is worth recording because it is the
second and third time this has happened:

- `pg_temp.check()` in the RLS harness recorded a **NULL** assertion as neither pass nor fail:
  the report printed FAIL and the suite **exited 0**. Every assertion of the form
  `<nullable column> = <value>` was un-failable — precisely the shape that matters, because "the
  column we expected to be written is NULL" *is* the defect. Found by a mutation that should have
  died and did not. Now COALESCEd to false and labelled; the clean suite still passes 433/433, so
  the hole was not hiding a live failure.
- `functionErrorAdoption`'s leak guard read raw source and flagged a new file for a **comment**
  explaining the string it guards against — the **ninth** prose-instead-of-code assertion this
  repo has caught. It strips comments now, and the guard was re-proven by planting a real leak.

**The absence inventory proved itself within the hour.** A4 ("Isabella failing tells nobody")
named `IsabellaHealthCard.tsx`; another session replaced the dashboard cards with header pills
and deleted that file, and the assertion went red on main. The CLAIM was still true — the pill
reads and notifies nobody — so the row stands; the test now resolves the surface by name pattern
and A4's check scans `src` as well, because a client-side notifier is exactly where that fix
would go. An absence claim that cannot go stale unnoticed is the only kind worth writing down.

**Item 8's one honest gap:** whether `alarm.medconneqt.nl` allows framing could not be checked
from this environment — outbound HTTPS to that host is refused at the proxy (`403 to CONNECT`).
The page answers it at runtime in the operator's browser instead, which is the only place the
answer counts, and `PENDING_FOR_LEE.md` **S17** carries the header Martijn would need to send.

## Wiring — 2026-09-08 · **register built, distribution measured**

Lee sent a message from the public Contact page and found nothing in Communications,
Messages or notifications. It had gone to `leads`, and nobody was told. `WIRING_REGISTER.md`
now answers that question for **every** control on every page instead of one at a time:
where each wire goes, who finds out, on which channel, what the user sees when it fails, and
what would go red if it broke.

**183 distinct wires · 628 call sites · 108 routes.** Wires are derived from the source, so
the register cannot fall behind the code — `node scripts/wiring/build.mjs --check` regenerates
and diffs, and CI runs it.

| band | meaning | at first measure | now |
|---|---|---:|---:|
| 10 | arrives · right person told on a live channel · failure shown · proof that goes red | 1 | **2** |
| 7–9 | arrives and proven; notification missing or on a channel not live today | 8 | **13** |
| 4–6 | arrives; nobody told; nothing proves it | 155 | **165** |
| 1–3 | fails, fails silently, or lands where nobody looks | 0 | **0** |
| 0 | dead control | 7 | **3** |

Both columns are real measurements of main, before and after #234. The five dead
realtime subscriptions are live and carry the only proof any of them has ever
had; the lead reaches the bell and is the second row to reach 10. The two
remaining 0s are billing reminders and the communication log — dead code whose
revival is a decision, not a fix (W6).

The `20260908130000` migration was applied to production and recorded in
`APPLIED_TO_PROD.txt` (#239), so the drift gate on main reads *"production is
level with the repo"*. A new enquiry now raises a bell notification for every
active staff member in production, and the five previously-dead realtime
subscriptions deliver.

**Only nine wires have a proof at all**, and each cites one of four suites that
were READ and confirmed to exercise the wire: `staffMemberActions`,
`notifyFulfilmentDispatcher`, `partnerJourney`, `inboundMessages`. Nine more
citations were withdrawn on reading them — `alertResolution` pins a call
contract and scans for bypasses but never executes the destination;
`isabellaGate` proves what Isabella may *not* do, which is a different property
from the wire; and three suites were being credited to neighbouring wires they
do not touch. Four further "proofs" named at first did not exist as files at
all. The generator now refuses to score on a test file that is absent.

**A REVIEW OF THIS WORK FOUND TWO DEFECTS IN THE REGISTER ITSELF**, both mine, both fixed:

- **The routes column was worthless.** App.tsx was treated as a page reaching every route so
  that app-wide mounts were not orphaned — but App.tsx dynamically imports every page, so
  169 of 171 wires came back claiming all 108 routes and `table:leads` claimed
  `/dashboard/medical`. The six per-surface tables were the same list six times. App.tsx's
  edges are now its STATIC imports only, minus the layouts (already placed by route group).
  Surfaces are now 21 / 24 / 28 / 72 / 143 / 28 rows instead of ~171 each.
- **Three wire classes were never scanned for**, while the file claimed a complete wire list
  bounds every control. `supabase.auth.*`, `supabase.storage.*` and `window.open` /
  `window.location` were absent — so **sign in, sign out, register and password reset had no
  row at all**, on a register whose brief named the login and reset flows. 12 wires added,
  including the password-reset email (the highest-stakes channel question in the product) and
  a third dead control: `Register.tsx` is unreachable (`/register` redirects to `/join`) and
  holds the only self-service `signUp` — a route to a member record with no payment behind it
  if it were ever revived.

Internal navigation (`navigate()`, `<Link to>`) is still deliberately not enumerated: hundreds
of sites, and a broken internal link fails visibly rather than silently.

**A note on how this section has behaved, because it is the thing GOALS G5 exists for.** W3 and
W4 were first written up as FIXED while the fix sat on a branch; that branch was closed
unmerged, so the file was claiming a fix that did not exist. They were corrected to red, and
have now genuinely landed in main via #234 — so they are green on evidence this time, not on
intent. W1 and W2 spent a day as code-in-main-but-not-in-production — a third state, recorded as one
rather than rounded to either end — and #239 has since applied the migration, so they are now
green on both counts.

**Read the 165 correctly.** Almost every wire on this platform *arrives*. What they lack is a
proof that would go red if they stopped arriving, and that alone caps a row at 6 — no rounding
up. A screen of buttons that all work today scores 5 because nothing would tell anyone the day
one of them stops.

**Only the bell is a channel proven live.** `notification_log` is in `supabase_realtime` and
needs no secret. Email, SMS and WhatsApp all return "not configured" without a production
secret this repo cannot read, so they cap at 8 and are listed for Lee to confirm.

**Seven dead controls found**, all mechanically, none previously known:

| wire | what was dead |
|---|---|
| `channel:tasks` | 🔴 a courtesy call assigned to an operator never appears — table not in `supabase_realtime` |
| `channel:shift_notes` | 🔴 the handover list is not live, on the one screen whose purpose is handover; its own comment promised it was |
| `channel:registration_drafts` · `channel:social_posts` · `channel:social_post_metrics` | 🔴 same cause, admin surfaces |
| `fn:send-email` (billing reminders) | 🔴 `useBillingReminders` is imported by nothing and has no server twin — no billing reminder has ever been sent |
| `table:member_interactions` | 🔴 `communicationLogger.ts` exports ten log functions and is called by none; `ActivityTab` and `AlertDetailPanel` read the table, so both screens can only ever be empty |

**Nothing in the database notifies anybody.** No PL/pgSQL function anywhere writes
`notification_log` — verified against the real schema. Every notification the platform sends
comes from client code or an edge function, which is why so many table writes reach a row and
tell no one.

Fixed / in flight:

| # | Item | Status | Evidence |
|---|---|---|---|
| W1 | New enquiry tells nobody | ✅ **FIXED, APPLIED TO PRODUCTION** | `20260908130000_wiring_held_bundle.sql` (#234), pushed to `crpsuhoixfdhjugprbuc` and recorded in `APPLIED_TO_PROD.txt` by #239 — `AFTER INSERT` trigger on `leads` raises a targeted bell notification per active staff member. Proven by `scripts/rls/wiring.sql` §2, mutation-tested three ways (no trigger → "a lead arrived and NOBODY was notified"; broadcast instead of targeted → caught; inactive staff notified → caught). |
| W2 | Five dead realtime subscriptions | ✅ **FIXED, APPLIED TO PRODUCTION** | Same migration, applied by #239. Proven by `scripts/rls/wiring.sql` §1, which derives the subscribed-table list from `src/` and checks it against `pg_publication_tables`; mutation-tested by removing the migration (all five named) and by adding a fresh bad subscription (`products` → caught). |
| W3 | Contact form promised 24 hours | ✅ FIXED IN MAIN | **#234**. `main`'s `en.json` now reads *"We can't promise a response time from this page, so if the matter is urgent please call the number above instead."* — verified by reading main, not by trusting a PR. `src/test/contactEnquiryReachesTeam.test.ts` asserts all three locales no longer name a deadline, and that none of them claims the team "has been notified" while W1 is unapplied. |
| W4 | Nothing surfaced unworked enquiries | ✅ FIXED IN MAIN | **#234** — a **New enquiries** card on the call-centre dashboard reading `leads` where `status='new'`, plus one notification-routing implementation replacing two that disagreed about where the same notification led. |
| W5 | The register itself | ✅ SHIPPED | `WIRING_REGISTER.md` + `scripts/wiring/*`, gated in CI (`Wiring register`). Gate proven both ways: a tampered score fails; a new wire with no row fails naming the file. **It then went wrong twice in its first day, both my fault and both fixed in #233:** it reddened main over a moved line number and two new test filenames (no wiring change at all), so the checked content is now file-level and the volatile "tests naming it" list is gone; and because it churned, a merge conflict in the generated file got resolved by keeping both sides — leaving main's register with **six duplicated wire keys** and a `table:leads` row still quoting the 24-hour promise the code had stopped making. That is the 2026-07-23/25 locale failure class, in a generated file. The resolution for a generated file is to regenerate it, never to merge it by hand; #233 does that and removes the churn that invited the conflict. |
| W7 | `Register.tsx` unreachable, holds the only self-service `signUp` | 🔴 **reported, not fixed** | Found by the review. `/register` is a `Navigate to /join` and nothing imports the page, so it cannot be opened — the only wire in the register with zero routes. Harmless while dead; reviving it would create an account outside the join wizard, with no payment behind it. Deleting a page is a product call. |
| W6 | Billing reminders, communication log | 🔴 **reported, not fixed** | Both are dead code whose revival is a business decision (chasing members for payment; which events deserve a log row), and `AlertDetailPanel` is on the alert path. Lee's call. |

## Backend identity — SETTLED 2026-08-11

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Authoritative project ref | ✅ VERIFIED | **`crpsuhoixfdhjugprbuc`** (care-conneqt-prod, LifeLink Sync, Pro). Lee confirmed in the Supabase dashboard: Pro tier, 24,299 requests at 100%, real migration history, backup 7h old. |
| B2 | `cfwnrcogikjycjcobsay` | ✅ VERIFIED — CANCELLED | Never became live production. Cutover cancelled 2026-07-22. Appears in **no** runtime or config file — docs only, all annotated HISTORICAL. |
| B3 | `qkfvojbcxaptufsepupo` | ✅ VERIFIED — **DEFERRED** | ice-alarm-espana-platform (VirtueleThuiszorg, Free): no migrations, no backups, empty. Possible **future** migration target. **The earlier "to be deleted" decision is WITHDRAWN** (2026-08-11). |
| B4 | Repo-wide ref audit | ✅ VERIFIED | `PROJECT_REFS.md` — every reference classified CURRENT / HISTORICAL / DEFERRED / BUG, per file and line, incl. all `docs/archive` hits. |
| B5 | `vercel.json` sitemap rewrite | ✅ FIXED | Was the literal `YOUR_SUPABASE_PROJECT_REF` → `/sitemap.xml` resolved to a non-existent host. Now the real ref. |
| B6 | `vite.config.ts` env fallback | ✅ FIXED | Silent placeholder fallback removed; the build now **throws** naming the missing var. Proven both ways: build fails without env, succeeds with the env CI supplies. |
| B7 | 6 email-template logo URLs | ✅ FIXED | All six `_shared/email-templates/*.tsx` carried the placeholder. Now the real ref. ⚠️ **Still owed:** upload the logo to the `email-assets/logo.png` storage object — until then the images 404 (templates are currently unreferenced by any function, so no live email is affected). |
| B8 | Untouched by design | — | `index.html`, `.github/workflows/deploy-functions.yml`, and the two cron migrations (`20260716120000`, `20260723120000`) already name the authoritative ref. The cron pair is the **SOS-escalation path** — not edited (G1 / human gate). |

## Staff control of the member record (2026-09-07) — WP7 · **a live defect removed**

> Scope: `CC_MASTER_BRIEF.md` WP7. Schema: `20260907100500`, applied.
>
> **The defect this replaces was live.** `SubscriptionTab.updateStatus` wrote
> `subscriptions.status` straight from the browser for pause, resume and cancel — and for
> Stripe it called nothing at all; its own comment said *"Stripe cancellation would be handled
> via Stripe Dashboard or API if needed."* So pressing **Cancel** left the database saying
> `cancelled` **while Stripe kept charging the member's card**, and pressing **Resume** wrote
> `status='active'` from the client, which golden rule 4 reserves for the payment webhook.
> Neither was attributed and neither had a reason. `admin-subscription-action` — which does it
> properly, Stripe first — existed and was not called.

| # | Item | Status | Evidence |
|---|---|---|---|
| W1 | The client cannot write `subscriptions.status` | ✅ VERIFIED | `updateStatus` deleted. `src/test/staffMemberActions.test.tsx` (19) sweeps **all of `src/`** for a `subscriptions` update carrying `status`, not just the one file — the same three buttons could reappear anywhere. |
| W2 | Every action goes through the gateway, and the SERVER mirrors the status | ✅ VERIFIED | `useMemberAction` → `admin-subscription-action` (Stripe) or `cancel-mollie-subscription` (Mollie). Both mirror the DB themselves, after the gateway accepts. The gateway call is asserted to happen **before** the audit row. |
| W3 | Mollie is handled honestly | ✅ VERIFIED | Cancellation uses the Mollie function. A Mollie **pause** is refused with a reason: the old code "paused" it by writing the DB and leaving Mollie charging. Refusing is not a lost capability, it is a removed trap. |
| W4 | Each action attributed, with a mandatory reason | ✅ VERIFIED | `activity_logs` row with `member_action`, `staff_id`, `entity_type='member'` and a trimmed reason — the exact shape `enforce_member_action_attribution()` accepts. The dialog refuses to submit without one, so nobody reaches the trigger's `RAISE EXCEPTION`. |
| W5 | A change that happened but was not recorded is said out loud | ✅ VERIFIED | The one state this feature exists to prevent. Distinct from a failed gateway call, which reports that **nothing** changed and writes no log. |
| W6 | Renew, single↔couple, add a pendant | 🟡 RECORDED, not performed | Each is new Stripe money-movement code against a real card that nothing here can test, and a mistake in it charges a real person. They are **offered** — an absent button is indistinguishable from a feature nobody built — with a badge saying *"You do it in Stripe"* and a note that the billing was not touched. **The audit trail works for all six today**, which is the part that was missing. |
| W7 | `member_action` has no `resume` — **and neither did the screen** | 🟡 WRITTEN, held (#219) | The gap turned out to be bigger than the enum. The old `SubscriptionTab.updateStatus` did pause, resume and cancel by writing `subscriptions.status` from the browser; WP7 deleted it and rebuilt **the two the brief names** — leaving a member record that could **pause a subscription and offered no way to un-pause it**. `admin-subscription-action` has supported `resume` all along. So the held bundle adds `ALTER TYPE … ADD VALUE IF NOT EXISTS 'resume'` **and** the spec that uses it, in the same change: a client writing an enum value the database does not have yet fails at the insert, so they cannot be merged apart, and a test says so. It is the one line in that migration that **cannot be rolled back** — Postgres has no `DROP VALUE` — and the migration says so rather than implying its rollback block covers it. **The RLS harness had to change with it**, and two of its assertions were wrong in a way worth keeping: *"all five staff actions exist in the enum"* counted to six rather than naming the values, so it passed just as happily if one were renamed; and three `notification_templates` / `canned_replies` assertions assumed those tables were otherwise **empty**, which the seed bundle ends. One of them was a scalar subquery that did not fail an assertion but **errored the whole run** (*more than one row returned by a subquery*). All four are scoped to their own fixtures now. |

## Member dashboard pass (2026-09-07) — WP4 · **shell, rules and pages done; two items held for Lee**

> Rules: `MEMBER_UX_RULES.md` R1–R11. This section grows one row per increment; nothing below is
> claimed on the strength of "it looks implemented".

| # | Item | Status | Evidence |
|---|---|---|---|
| M1 | R5 — one page shell, every page composed from it | ✅ VERIFIED (4a) | `src/components/client/PageHeader.tsx`; all **nine** client pages converted, including the dashboard. `src/test/memberPageShell.test.tsx` (11) asserts the ABSENCE: no page may hand-roll the old header block or render its own `<h1>` again, and a page added without the shell fails. Six mutations, each producing a verdict. |
| M2 | R5/R10 — 28px title, 16px subtitle | ✅ VERIFIED (4a) | The pages used `text-2xl md:text-3xl`, so on a **phone** — where most of these members read — the title was 24px, not the 28px R5 names. The responsive step-down is gone: the rule does not have one, and a smaller title on a small screen is the wrong way round for this reader. |
| M3 | R1 — one red button per page | ✅ VERIFIED (4f) | **Three pages showed two red buttons saying the same thing**: `EmergencyContactsPage`, `MessagesPage` and `SupportPage` each rendered a header action AND an empty-state action, both `bg-primary`, both opening the same dialog, both on screen for a member with nothing in the list — precisely the member the empty state is for. R8 keeps it in the empty state, beside the sentence explaining it; the header's slot appears once there is a list. Not hidden with `className="hidden"`, which leaves a focusable control nobody can see — asserted. `memberRedButtons.test.tsx` (8) pins **every** red button on the member surface with a written reason each, exact in both directions, and **renders** `EmergencyContactsPage` at zero contacts and at one to prove the actual rule. The pin is a drift guard and says so: it cannot know which buttons are on screen together. Buttons that override the background (`bg-[#25D366]`, WhatsApp) are not red and not counted. |
| M4 | R3 — the readiness notice moves INTO the header, the banner goes | ✅ VERIFIED (4b) | `MemberReadinessNotice` in the desktop header's LEFT slot — which R3 reserves for it and which stood empty — and as `md:hidden` layout chrome on mobile, where a 64px header has no room for a sentence. `MonitoringReadinessBar` is **deleted**, not merely unmounted: a component left in the tree is one somebody mounts again. The service announcement is gone from Home too (D10: announcements go in the bell). `memberReadinessNotice.test.tsx` (27), six mutations. |
| M10 | R3's one sentence vs the spec's "lead with what works" | 🟡 TENSION recorded | The old bar led with *"Your alarm works and an operator will always answer it"*, which `ICE_OPERATOR_CARD_SPEC` §5.2 records as a rule. R3 asks for one sentence, so that reassurance now lives on the page the member lands on. The better answer is one sentence that does both — *"Your alarm works — we just need someone to contact"* — which needs three new strings in three languages. `PENDING_FOR_LEE.md` D-11 carries the exact wording. Nothing is frightening in the meantime: the current sentence is a task, not an alarm. |
| M5 | R6/R8 — read-only by default; empty states offer the action | ✅ VERIFIED (4d) | The banned sentence is gone, and R8 turned out to be wrong for six of the seven states that reach that branch: `useMemberSubscription()` filtered on `status='active'`, so a paused, suspended, cancelled, expired, in-arrears or awaiting-payment member got the same `null` — and the same message — as somebody who never joined. `src/lib/membershipCondition.ts` maps every `subscription_status` (checked against the **migrations**) to its own copy; **only `never_joined` is shown the plans**, because sending a member in arrears to `/join` would give one person two member records (`submit_registration_atomic` INSERTs unconditionally) and an operator two records to choose between during an SOS. A failed read is `unknown`, never "you have never joined". `membershipCondition.test.tsx` (40), fifteen mutations, each producing a verdict. |
| M11 | The `?action=` support routes — one list, not five | ✅ FIXED (4d) | The subjects lived in a `Record<string,string>` inside `SupportPage` while four pages built the URL by hand, so `report-issue` for `report_issue` opened a generic "Support Request" and nothing failed. `src/lib/supportActions.ts` is the list; a test asserts **no file in `src/` hand-builds an `?action=` URL**. An unrecognised value still opens a request — a member following an old link deserves a conversation. |
| M12 | Who pays, on the page of the person being paid for | 🟡 PARTIAL (4d) | The Membership page says whether the member pays or somebody else does. It does **not** name them: `payers` grants SELECT to staff and to the payer only, so a member cannot read the row their own `payer_id` points at. Showing the name needs a new RLS policy on the table whose design note is that being a payer grants no access to anything — a mandatory human gate. `PENDING_FOR_LEE.md` **D-13**. |
| M13 | "Add a pendant" / "Change to couple" — offered, not performed | 🟡 PARTIAL (4d) | Both buttons exist, outline rather than red (R1), and each opens a prefilled conversation. WP4 says "through Stripe checkout only" and **there is no member-initiated checkout for an existing account** — `/join` creates a second member. `PENDING_FOR_LEE.md` **D-12** puts the build-or-leave-it to Lee. Two defects fixed on the way past: the amount rendered `€24.99//mo` (`subscription.mo` is `"/mo"` and the page prefixed a slash), and five dead locale keys promising things nothing does are deleted. |
| M6 | Medical information — **all** the fields | ✅ VERIFIED (4c) | All **sixteen** member-editable columns of `medical_information`, in the brief's six sections, plus "Getting into your home" from `member_access` — read-only by RLS, codes masked with Show, locked **with a reason** (R7's pattern, not R6's banned sentence). Driven from `src/lib/medicalFields.ts`, checked against the generated Row type at compile time. `src/test/medicalInfoFields.test.tsx` (20) reads the **migrations** for the column list, so completeness is measured against the schema and not against any of the four hand-maintained copies. Seven mutations, each producing a verdict. |
| M9 | The four hand-maintained copies of `medical_information`'s shape | ✅ FIXED (4c) | `types.ts` (#188, was missing ten columns), `useMemberProfile.MedicalInfo` (an interface listing eight — the query already said `select("*")`, so the **type** was what threw the data away), the page's markup, and `member-self-service`'s save whitelist. The last two now agree by assertion, in both directions: a field the page renders that the save drops is worse than a field that is absent. |
| M15 | R3 — MemberChatButton becomes the "Assistant" outline pill | ✅ VERIFIED (4g) | It was a bare round avatar with no visible label: an unlabelled circle in a header is a photograph, or an account menu, or a decoration, and a member had to press it to find out — the `aria-label` meant a screen reader was better served than the person looking at the screen. Outline, not red (R1). |
| M16 | The pulsing green dot that meant something else | 🔴 FIXED (4g) | The chat button carried a hard-coded `bg-green-500` + `animate-ping` dot, driven by **nothing**. The member surface already uses a small round green dot for exactly one thing — `is_online`, the pendant's connectivity, rendered from real data on the dashboard and the device page. The same mark on a header button teaches a member that a green dot means their alarm is connected and then shows them one that does not. Gone; `chat.available` still says the assistant is always there, in words, inside the widget. |
| M17 | R3 — initials avatar, and the initials NOT invented | ✅ VERIFIED (4g) | Initials come from `first_name`/`last_name` or not at all. `displayName` falls back to the email prefix, so initials taken from it would render a plausible "LW" for somebody who never told us their name. The generic icon says "we do not know yet", which is true. **The "role" half of R3 is deliberately not added to the header cluster**: every user of this surface is a member, so a "Member" label beside their own name is noise. It stays in the account dropdown next to the email, where it is information. |
| M7a | R7 — DOB and NIE locked **with a reason** | ✅ VERIFIED (4h) | The page had **four** locked fields and got all four wrong: DOB and NIE said *"Cannot be changed"* (what, not why), email said *"Contact support to change your email address"* — **R6's banned sentence, verbatim** — and country said nothing at all. All four now go through `LockedIdentityField`, whose `reason` prop is **required**, so the next locked field cannot default to no explanation. DOB/NIE carry R7's own sentence. `lockedIdentityFields.test.tsx` (11), ten mutations. |
| M18 | The padlock is a **label**, not a rule | 🔴 OPEN — Lee | `"Members can update own profile"` is `FOR UPDATE` with no column restriction, and the guard trigger from 20260904180000 names only `status` — its own comment lists NIE as an ordinary self-service write, which was true of the brief we had then. So a member can still PATCH `date_of_birth` and `nie_dni` through PostgREST and the operator card would show an identity number a stranger typed. **This application never sends those columns** (asserted), so it is a label rather than an open door. The one-branch fix, and why it waits for a bundle, is `PENDING_FOR_LEE.md` **D-14**. |
| M7b | R7 — the member photo upload | ⬜ BLOCKED — needs a bucket | There is no `member-photos` storage bucket; the eleven that exist are staff/marketing. A bucket's policies are RLS policies, which CLAUDE.md makes a mandatory human gate, and the migration would redden the drift gate until applied. Bundled with M18 in D-14 for Lee, with the upload UI, because an upload button against a bucket that does not exist is worse than none. |
| M19 | WP4 Home — the "Your protection" checklist | ✅ VERIFIED (4i) | Home had a Subscription card and an Emergency-contacts card, each a small dashboard of its own — a plan name, a renewal date, an amount, two contact names with ordinal badges. All true, and none of it the question a member opens this page to ask: **"if I press it, will somebody come?"** `src/lib/protectionChecklist.ts` answers it in three rungs with **five** states, and the two that are not failures are the point: `in_progress` (a pendant we have sent and not yet tested — "action needed" would blame the member for our queue) and `not_included` (a phone-only plan is a choice, not a fault). `unknown` for a failed read, never `ok` and never `action_needed`. It reuses `readinessGap()` and `membershipCondition()` rather than forming a third opinion. `protectionChecklist.test.tsx` (37). |
| M20 | WP4 Home — no stat tiles for a member with no device | ✅ VERIFIED (4i) | The brief says it in as many words. Two of the four tiles are about the pendant, and with none they read **"0%" battery and "Offline"** — not a zero, a fact about a device that does not exist, on the page whose subject is whether an alarm works. |
| M21 | The contacts count could never exceed three | 🔴 FIXED (4i) | Home's `emergency_contacts` query was `.limit(3)`, and both the tile and the badge showed `contacts.length` — so a member with five contacts was told they had three, an undercount on the one number that says how many people we can reach. It now reads `emergency_contact_count` from the readiness view, and renders an **em dash rather than 0** when that cannot be read: a zero here means nobody is coming. The `.limit(3)` query is gone, so Home makes one fewer round trip. |
| M22 | Home's third *"contact support"* dead end | 🔴 FIXED (4i) | The no-device card said *"Please contact support to get your device set up"* — R6's banned sentence, the third instance found (after `subscription.contactSupport` and `profile.emailChangeNote`) — and it told a member what was missing without saying whether it was on its way, whether they chose phone-only, or what happens next. The pendant rung answers all three, so the card is gone rather than reworded. |
| M23 | Recent activity, and Messages' "last thread" | ✅ DONE (4k) | Recent activity shipped in 4i with the reassuring empty state (*"No alerts"*); the Messages card still showed **a number**. *"2 unread messages"* tells a member how much is waiting and nothing about what it is, which is what decides whether they open it. It shows the last thread now — subject, a preview line and when — with the unread badge unchanged above it. Deferred here deliberately in 4i because WP6 was adding the unread count anyway and doing it twice was the alternative. |
| M31 | Every conversation list previewed the word **"undefined"** | 🔴 FIXED (4k) | Five lists built it as `lastMsg?.content?.substring(0, n) + (… ? "..." : "") \|\| ""`. With no message row that is `undefined + ""` — the **string** `"undefined"`, which is truthy, so the `\|\| ""` never fired. `MessagesPanel`'s variant produced `"undefined..."` and appended an ellipsis to every short message besides. Invisible while every conversation had messages, and **WP6 G7 made it visible**: Isabella creates a `conversations` row per chat session, so there is an empty-`messages` conversation for every member who has ever used the chat widget. One `previewText()`, five call sites, and a source scan forbidding the shape. The same queries used `.single()` for the last message — which reports *no rows* as an error, the ordinary case here — and in the two client lists that threw into a catch that returned a **zeroed unread count** with it. `conversationPreview.test.tsx` (17), ten mutations, all caught. |
| G7a | The conversation LIST previews from `messages` only | ✅ DONE (4k) | Closed with M31: Isabella's last turn is the fallback, read **only** when there is no ordinary message (every one of these lists is already one query per row and must not become two), and the newer of the two wins. || M24 | R3's header notice and the contacts rung both name the same gap | 🟡 TENSION recorded | A member with no contacts sees the header sentence AND the checklist's contacts rung on Home. The brief asks for both — R3 for the undismissible one-liner that follows them across every page, WP4 for Home's structured answer with the action — and they agree rather than contradict. Worth a look on a real screen: if it reads as nagging, the checklist rung is the one to soften, because R3's is the one that must never be missed. |
| M25 | WP4 My pendant — "What You're Missing" is gone | ✅ VERIFIED (4j) | Four rows in `text-destructive`, each with a red ✗: we cannot track your location · falls are not detected · you must call us manually · no boundary alerts. Every line true; the whole card wrong. It opened the page of somebody who **chose** the phone-only plan with four ways they are unprotected, in the colour this product reserves for an emergency (R2), on the screen they are most likely to open when they are worried. Replaced by what they **have** — a monitored line and a number that reaches an operator — plus one action. The pendant's feature list survives, in the offer, where a feature list belongs. |
| M26 | The page told a member who had **paid** for a pendant to buy one | 🔴 FIXED (4j) | `hasPendant` was `subscription?.has_pendant && device`, so every member in WP2's `paid` and `allocated` states — between the payment and the device being assigned — fell into the phone-only branch and was shown "What You're Missing" and a **"Purchase Pendant"** button. Its own branch now, carrying the real `fulfilment_state` via `FULFILMENT_MEANING`, and saying that the next step is a test call **we** make (Q1 is operator-confirmed only, so a member waiting for a button they can press is waiting forever). |
| M27 | The only route to adding a pendant was gated on a setting | 🔴 FIXED (4j) | It was a single `whatsappNumber && <Button …wa.me…>`. With `settings_emergency_phone` unset — the state WP1b's *"show nothing, never a fake number"* rule leaves us in until S-seed — a phone-only member had **no route at all** to the one thing that page offers. The in-app support route is unconditional and is the page's one red button; WhatsApp is a second, outline option when a number is configured. |
| M28 | `usePendantOrderForMember` could not see an order before the device existed | ✅ FIXED (4j) | Its `order` is reached through `devices → order_items`, which is the path readiness takes and whose gap the hook exists to expose — but it finds nothing in the window a member most wants to read about. `memberPendantOrder` is a **separate** field looking the order up by `item_type = 'pendant'` on the member's own orders. Separate rather than folded in, because a non-null `order` with `linkedToOrder: false` would quietly change what `PendantFulfilmentCard` reads, and that card's whole job is to say *"this pendant is on no order"*. |
| M29 | The red-button parser was reading prose | 🔴 FIXED (4j) | `memberRedButtons.test.tsx` counted a `<Button` that appeared inside a **comment explaining a button** — the prose-vs-code slip, this time inside the measuring instrument, where it is worse: the inventory could be moved by writing about buttons. It strips comments now. The first stripper also tried to match a whole JSX comment including its braces and **swallowed 3KB of real markup** in `MedicalInfoPage`, dropping its count from 2 to 0; stripping only comment bodies is both simpler and safe. |
| M30 | A mocked dependency is an untested one | ✅ FIXED (4j) | Two mutations **survived** the pendant-page batch because that file mocks `usePendantOrder` wholesale: dropping the `item_type = 'pendant'` filter (which would let a registration-fee line be picked as "the pendant order") and folding `memberPendantOrder` into `order` (which would stop `PendantFulfilmentCard` saying *"this pendant is on no order"* — the readiness dead-end it exists to surface). `pendantOrderHook.test.tsx` (6) asserts the hook's own query filters and both contracts; all four re-run mutations are caught. |
| M8 | R10 — the A/A text-size control, persisted | ✅ VERIFIED (4e) | `src/lib/textSize.ts` + `TextSizeControl`, in the desktop header (R3's slot, between the bell and EN/ES) **and the phone header** — not inside the menu sheet, because a member who cannot read the screen cannot reliably find a control hidden behind a hamburger. Two levels and **neither shrinks the text**: a way to go below R10's 16px floor would be pressed once by accident and then be unreadable, including the control that undoes it. Applied from `main.tsx` before `createRoot().render()`, so the page does not render small and jump. Every `localStorage` access wrapped — Safari private mode throws on `setItem`, and a failed write costs the preference, not the visit. `textSizeControl.test.tsx` (29), fifteen mutations. |
| M14 | Scalable fonts — the px sizes that silently opted out | ✅ FIXED (4e) | An arbitrary `text-[28px]` ignores the root font size, so the A/A control would have enlarged every other word on a member page and left the titles exactly where they were. R5's 28px is `text-[1.75rem]` — the same size at the default level. A guard test forbids a px font size in `src/pages/client` or `src/components/client`, and **it fired on its first merge**: #203's plans card landed two `text-[13px]` after this branch was cut. |

## Messaging as a real service (2026-09-07) — WP6 · **schema applied; started**

> The schema landed in the #180 bundle (`20260907100400_messaging_schema.sql`) and is applied:
> `staff_internal` as a sender_type behind a **RESTRICTIVE** policy, a `channel` vocabulary, and
> `canned_replies`. The RLS harness already proves the load-bearing one.

| # | Item | Status | Evidence |
|---|---|---|---|
| G1 | A member never reads a staff internal note | ✅ VERIFIED (schema, #180) | `scripts/rls/isolation.sql` seeds a `staff_internal` message in a member's OWN conversation and asserts the member reads **0** and staff read **1**. RESTRICTIVE, so it is AND-ed with every other policy present or later added — the existing member policy is scoped by conversation and says nothing about sender_type, so adding the enum value without this would have been the bug. |
| G2 | `read_at` — mark-as-read | ✅ VERIFIED (already correct) | Checked rather than assumed, and it was right: members have **no UPDATE policy on `messages`** by design, so the direct client update it replaced was silently RLS-denied (PostgREST reports zero rows, not an error) and badges never cleared. `markMemberConversationRead` routes through `member-self-service`'s `mark_read`, which verifies the conversation belongs to the caller and touches only `sender_type='staff'` rows. Both client pages call it. |
| G3 | Unread count on the nav | ✅ VERIFIED (6a) | The count existed **inline in `ClientDashboard`**, which is why nothing else could reach it. `useMemberUnread` is the one definition; the Messages nav item carries the badge. It counts `sender_type = 'staff'` and **not** "everything that is not mine" — `staff_internal` is a legal value now, and a badge raised by a note the member cannot read is a number they can never clear. Zero renders nothing; the collapsed rail keeps a dot, because a tooltip only exists for somebody who hovers; the count is announced as a sentence, because a bare "3" beside "Messages" says nothing about what there are three of. Ink, not red (R1/R2), and the dashboard card now matches. `navUnreadBadge.test.tsx` (11). |
| G4 | `staff_internal` notes in the staff UI | 🔴 **A LIVE LEAK, FIXED** (6b) | The internal-note feature **already existed** on both staff surfaces — and wrote `sender_type = 'system'`. The RESTRICTIVE policy from `20260907100400` protects `staff_internal` and only that; the member's thread selects everything in their own conversation and renders every row. **So every internal note appeared in the member's own message thread**, with `[Internal Note]` still on the front of it — written, on the admin surface, under a placeholder that says *"only visible to staff"*. Two writers, one wrong literal each; `staffSenderType()` is the one value now, and a repo-wide scan forbids the old one. The member side needs no client filter and a test says it must not grow one: a second place deciding who reads a note is the shape of the defect itself. `staffInternalNotes.test.ts` (13). |
| G9 | The rows already written as `system` | 🔴 OPEN — Lee | Code is fixed; **data is not**. Every internal note written before this is still readable by its member. `PENDING_FOR_LEE.md` **S13** carries the SELECT to read them first and the one-line UPDATE — first, because some of them may be things you would rather the member had not seen. |
| G5 | `canned_replies` per language | 🟡 PARTIAL (6c) | **The picker ships; the rows do not, and that is a scheduling decision rather than a gap in the work.** `canned_replies` has had a table, a `UNIQUE (shortcut, locale)` and RLS since #180, and nothing read it. `CannedReplyPicker` is one component for **all three** staff composers — `call-centre/MessagesPage`, `admin/MessagesPage` and the dashboard's `MessagesPanel` — because the last decision left to those three independently was which `sender_type` an internal note carries, two got it wrong, and members read the notes (G4). The rule the constraint's own comment states is the one thing here worth defending: *"the language is chosen from the member's preference rather than from the operator's"*. The natural implementation reads `i18n.language`, which in a call centre is whatever the last person left the browser on. It reads `members.preferred_language`, the header **names** the language it is offering, it says so explicitly when no language was recorded rather than passing the `en` default off as the member's choice, and a source scan of every `preferredLanguage={…}` call site in `src/` fails on `i18n`. It **inserts, never sends** — a one-click paragraph to a member of a life-safety service is a different feature. It is **disabled on an internal note** and says why: a script picked with the toggle still on reaches nobody, and the member's thread stays silent. It **never substitutes another language** when the member's has no rows; the empty state names the language, because a fallback is invisible at exactly the moment it matters. `cannedReplies.test.tsx` (21), twelve mutations, all caught. **The seed rows are a migration**, and per D-3 a merged-but-unapplied migration turns the drift gate red for every later PR — so they are in the one held bundle (#219) with WP3's N7 templates rather than blocking the rest of the run. Until Lee applies it the picker's honest state is the empty one it was built to render. |
| G6 | Inbound WhatsApp/SMS into the member's conversation | ⬜ MISSING | `messages.channel` exists for it. Needs an inbound webhook. |
| G5 | `canned_replies` per language | 🟡 PARTIAL (6c) | **The picker ships; the rows do not, and that is a scheduling decision rather than a gap in the work.** `canned_replies` has had a table, a `UNIQUE (shortcut, locale)` and RLS since #180, and nothing read it. `CannedReplyPicker` is one component for **all three** staff composers — `call-centre/MessagesPage`, `admin/MessagesPage` and the dashboard's `MessagesPanel` — because the last decision left to those three independently was which `sender_type` an internal note carries, two got it wrong, and members read the notes (G4). The rule the constraint's own comment states is the one thing here worth defending: *"the language is chosen from the member's preference rather than from the operator's"*. The natural implementation reads `i18n.language`, which in a call centre is whatever the last person left the browser on. It reads `members.preferred_language`, the header **names** the language it is offering, it says so explicitly when no language was recorded rather than passing the `en` default off as the member's choice, and a source scan of every `preferredLanguage={…}` call site in `src/` fails on `i18n`. It **inserts, never sends** — a one-click paragraph to a member of a life-safety service is a different feature. It is **disabled on an internal note** and says why: a script picked with the toggle still on reaches nobody, and the member's thread stays silent. It **never substitutes another language** when the member's has no rows; the empty state names the language, because a fallback is invisible at exactly the moment it matters. `cannedReplies.test.tsx` (21), twelve mutations, all caught. **The seed rows are a migration**, and per D-3 a merged-but-unapplied migration turns the drift gate red for every later PR — so they go in the one held bundle with WP3's N7 templates rather than blocking the rest of the run. Until Lee applies it the picker's honest state is the empty one it was built to render. |
| G6 | Inbound WhatsApp/SMS into the member's conversation | 🔴 **A MESSAGE WAS BEING DROPPED, FIXED** (6d) | The webhooks existed. Both `twilio-sms` and `twilio-whatsapp` matched the sender to a member and then did exactly one thing with the text: `if (activeAlert) { insert into alert_communications }` — **with no `else`**. With no alert open, which is the ordinary case because most people who text a care service are not mid-emergency, the message was **dropped**, and the auto-reply told them *"an operator will review your message"*. Now: one row in `messages` — `sender_type = 'member'`, `channel = 'sms' \| 'whatsapp'`, unread — in the member's own conversation, the thread both staff surfaces already render. The `alert_communications` write is **unchanged** and still happens during an alert; that record is evidence on the SOS path, not a duplicate of this one. Reuses the member's `open`/`pending` conversation and otherwise starts one — a resolved thread is not reopened silently, because an operator marked it finished and a new question arriving inside it looks answered. **Idempotent on `MessageSid`**, so Twilio's retry does not turn one text into three, and a failed write answers **5xx on purpose** so that retry happens. The reply is in the member's own language (`preferred_language`), and an **unmatched** number is told the truth — that nobody received it, and to call 112 — instead of being reassured. `inboundMessages.test.ts` (30), twenty-one mutations. |
| G6a | The signature on those webhooks | 🔴 **FIXED — it was a log line** (6d) | This handler now **writes into a member's conversation**, so an unsigned POST with `From=<a member's phone>` would put words in that member's mouth in their own thread, for an operator to act on. The one existing copy of Twilio signature validation (`sos-conference-status`) ends `console.warn("Invalid Twilio signature — proceeding anyway")`, which is not a check. `_shared/twilio-signature.ts` is one validator that **refuses**: 403, and **no configured auth token means invalid** — the tempting `if (!authToken) return true` turns a misconfiguration into an open endpoint, silently, on exactly the environment that is misconfigured. `sos-conference-status` is deliberately left alone (SOS path, human gate) and recorded for Lee as S14. |
| G6b | The staff unread badge counted the wrong thing | 🔴 FIXED (6d) | `.neq("sender_type", "staff")` on both full Messages pages — so an operator's **own internal note** counted as an unread message addressed to them, and `system` rows did too. `MessagesPanel` already had `.eq("sender_type", "member")`: three implementations, two wrong, the same shape as G4. An inbound SMS is a `member` row, so this is also what makes one visible. |
| G6c | WhatsApp was sending from a number this company does not own | 🔴 FIXED (6d) | `settings_twilio_whatsapp_number \|\| "+34900000000"` on the outbound path. With the setting unset every send was addressed FROM a stranger's number, rejected by Twilio, and returned to the caller as an ordinary API response — it looked configured and delivered nothing. It refuses now, with the setting named. Same rule as `noFakeEmergencyNumber`, and a scan of `supabase/functions` keeps it out. |
| G7 | Isabella's calls as a card in the thread | ✅ SHIPPED (6e) | **The join was never missing.** `20260907100400` checked it and found a NOT NULL FK from `20260204172318`, and said so instead of adding a second one. What was missing is that **no screen read it**: Isabella writes `conversation_calls` and `conversation_messages`, and every thread on every surface reads `messages` and only `messages`. And `useAIChat` **creates** a `conversations` row for a chat session with the member's id on it — so a member's conversation with Isabella was **already in the operator's list, named after the member, and empty**. An operator opens it, sees nothing, closes it. One card per **episode**, closed by default: a four-minute call is thirty short turns, and thirty bubbles would bury the two human messages either side of it. `mergeThread()` interleaves by time so all three threads map over one array — the interleave is not left to three pages to get right independently, which is how G4 happened. Turns are never dropped: a transcript whose call row never wrote (`voice-handler` writes it best-effort inside a try/catch) becomes its own card, and so does a voice turn with no call sid. **Nothing is summarised, scored or interpreted** — a generated précis of a care conversation is a clinical judgement wearing a UI, and the member reads this card too. Twilio's status word is rendered as Twilio wrote it (`no-answer` stays `no-answer`). `isabellaThread.test.tsx` (18), thirteen mutations: twelve caught, one equivalent (dropping the `endedAt` guard is behaviour-identical because a null end date already fails the positive-duration check). |
| G8 | Operator queue | ✅ SHIPPED (6f) | **Most of the brief's list already existed** — statuses, priority, an assignee select, mine/unassigned/unread filters. What did not is the question an operator actually works from: **which of these is waiting on US?** *Open* does not answer it — a thread stays open after we reply — so a list of open threads mixes the ones with somebody waiting at the other end into the ones already answered. On a care service the cost of that is not a slow reply; it is a member who wrote about something that frightened them and got silence. `waitingOn()` is **derived from the last message's `sender_type`, never stored**: a column would need a writer on all three send paths, which is precisely how G4 happened. A `staff_internal` note counts as **us speaking** — it is not a reply to anybody. A thread with **no messages** counts as waiting on us, which since G7 is exactly what an Isabella-only conversation is. Ordered waiting-first, then priority, then **oldest first** — deliberately the opposite of the list's default, because newest-first serves whoever wrote most recently and lets the longest wait sink. It is a **tab, not a new default sort**: scanning for what just came in is legitimate too, and silently reversing somebody's list is not an improvement they asked for. The count is separate from *unread*, because a message an operator has **read and not answered** is the one most likely to be forgotten. |
| G8a | The member context panel | ✅ SHIPPED (6f) | *"member context panel showing readiness state."* One fact, because it is the one that changes what an operator says: **is this member actually monitored?** Somebody answering *"my pendant is beeping"* from a member whose pendant has never been tested is having a different conversation from one answering the same words from a covered member — and the readiness queue lives on the admin surface, where the operator replying to the message cannot see it. It reads `member_monitoring_readiness` and nothing else (READINESS_MODEL.md §2); a panel re-deriving readiness from `orders` would be the third opinion in a product where a wrong all-clear is *the* failure. **`unknown` is shown, not hidden** — a failed read renders as *"Could not be read"* with the harness's own instruction, because rendering nothing is indistinguishable from ready. It offers no way to mark a test done: Q1 is operator-confirmed on the member record, and a second place to record it is a second place to record it wrongly. `readinessGapFromView()` now holds the *view beats the two detail columns* rule once — `MemberReadinessNotice` had the only copy, inline. `operatorQueue.test.tsx` (21), twelve mutations, all caught. |

## Circle of care (2026-09-07) — WP5 · **schema was already applied; the member's half is in**

> `CIRCLE_OF_CARE.md`. The distinction the whole work package turns on: **this is who the people
> are.** `care_access_grants` is what they may SEE, and nothing here touches it — a neighbour with
> a key may be phoned at 3am, and that does not entitle them to a medical record.

| # | Item | Status | Evidence |
|---|---|---|---|
| CC1 | The eight `contact_type` values reach the member | ✅ VERIFIED (5a) | `20260907100300` widened the CHECK from two values to eight; **the member's page collected six of the thirteen columns and none of WP5's four**, so from the side of the only person who knows the answers the schema change was invisible. `src/lib/contactTypes.ts` carries the eight with a description each — eight bare nouns ask somebody to guess whether their daughter is a "carer", and the guess reaches an operator. `circleOfCareContacts.test.tsx` (24) reads the values from the **migration's CHECK constraint**, taking the LAST definition in migration order so it cannot pass against the two-value version it replaced. |
| CC2 | `can_attend_in_person` is TRI-STATE, and NULL is an answer | ✅ VERIFIED (5a) | The migration says it: *"NULL means unknown, which is honest — it is not the same as false."* So three radio options and no default — a checkbox cannot express unknown, and an unchecked box would tell an operator at 3am that a daughter **cannot** get there when nobody ever asked her. Worse than a blank, because it looks like an answer. *"I am not sure"* is written as NULL; **no badge at all** renders on a contact nobody has answered for, which is every contact recorded before WP5. |
| CC3 | `EmergencyContact` was throwing three columns away | 🔴 FIXED (5a) | A hand-written interface listing ten of thirteen — missing `contact_type`, `can_attend_in_person` and `availability_notes`. The query already said `select("*")`, so the data was arriving and the **type** discarded it: the same defect as `MedicalInfo`, in the same file. Now `Tables<"emergency_contacts">`. |
| CC4 | The relationship label pointed at nothing | 🔴 FIXED (5a) | `<Label htmlFor="relationship">` with no `id` on the `SelectTrigger`, so a screen reader announced the control with no name and clicking the label did nothing. Found because a test could not reach the field. |
| CC5 | Operator card Band 3/5 | ⬜ HELD — Lee | The SOS/alert path, where CLAUDE.md makes a human gate mandatory before merge. The migration is explicit that the escalation ladder does **not** yet order by `can_attend_in_person`, and a test asserts it still does not. |
| CC6 | Away status and the structured Spanish address | ✅ VERIFIED (5b) | All seven `members` columns WP5 added now render and save. The migration's own arguments, kept: *"An ambulance crew with the street but not the portal is standing outside a gated development at night. This is where the minutes go"* · *"A device gone quiet and a device in a drawer in Birmingham are different problems."* Empty date fields write **NULL, not `""`** — `date` columns reject an empty string, so a member who typed a date and then cleared it could not save their profile at all, and the failure would have looked like "saving is broken". `awayAndAddress.test.tsx` (21). |
| CC7 | `MemberProfile` was the **third** hand-written subset in one file | 🔴 FIXED (5b) | After `MedicalInfo` and `EmergencyContact`. It listed nineteen of forty-odd columns, including none of WP5's seven. `useMemberProfile.ts` now holds no hand-written row type at all, and a test asserts that. |
| CC8 | **Dutch was translated, tested, storable — and unreachable** | 🔴 FIXED (5b), decision open | `nl.json` is complete and `localeParse` enforces it key-for-key; the enum is `en \| es \| nl`; **both** language selectors hard-coded their own two-value array. Worse than a missing option: `MemberProfile` declared `"en" \| "es"` and the form's schema matched, so **a member whose row says `nl` could not be loaded into their own profile form** — the compiler found it the moment the type was corrected. One list now, from the enum, shared by both. R3 says the header carries "EN/ES" and I have read that as shorthand rather than an instruction to hide a shipped language; `PENDING_FOR_LEE.md` **D-15** puts it to Lee, and reversing it is one line. |

## Notification fan-out (2026-09-07) — WP3 · **dispatcher shipped, every channel OFF**

> Design: `FULFILMENT_MODEL.md` §6-A. Schema: `20260907100200`, applied.
>
> **Nothing is sent to anybody today, and that is correct rather than broken.** All three
> `notify_channel_*` flags are seeded `false`, so every decision the dispatcher makes is
> `skipped_channel_off` — recorded, not silent. Turning a channel on is Lee's table edit
> (`PENDING_FOR_LEE.md` §3), and the second gate (the member's own opt-in) applies after it.

| # | Item | Status | Evidence |
|---|---|---|---|
| N1 | One dispatcher, called on every state edge | ✅ VERIFIED | `_shared/notify-fulfilment.ts` + the `notify-fulfilment` function. Called from `useFulfilmentState`, `linkDeviceToPendantOrder` and `markOrderProgrammed` via `src/lib/notifyTransition.ts` — asserted, including that no transition means no notification. |
| N2 | Two gates: global channel flag **and** member opt-in | ✅ VERIFIED | `src/test/notifyFulfilmentDispatcher.test.ts` (29). A flag is on only when its value is exactly `true` — `TRUE`, `1`, `yes`, `""` and absent are all off, asserted for all five. An absent opt-in row is not permission. |
| N3 | A skip is recorded, never silent (G2) | ✅ VERIFIED | One `member_notification_log` row per decision, with a status naming which gate stopped it. Mutation: logging only successes → 3 red. |
| N4 | No template means no message | ✅ VERIFIED | No inline fallback text exists in the dispatcher. Missing or inactive → `skipped_no_template`. Locale falls back to **Spanish**, not English. |
| N5 | The payer is resolved per D6 | ✅ VERIFIED | Second recipient when `payer_id` is set **and their address differs** — compared on addresses, not ids, so a payer who is the member is not messaged twice. Own event key (`fulfilment.*.payer`) so the text can differ. |
| N6 | A payer is actually notified | 🔴 BLOCKED — decision needed | There is nowhere to record a payer's consent: `member_notification_optin` is keyed on `member_id`. Every payer send is refused and logged `skipped_no_payer_consent`. `PENDING_FOR_LEE.md` D-8 sets out the two ways to close it. |
| N7 | Templates seeded per transition × recipient × language | 🟡 WRITTEN, held (#219) | **Four transitions, not six.** `allocated` and `programmed` are internal steps — nothing has happened the member can see or act on, and a message per internal state change is how a service teaches people to ignore it. No row means no message, so leaving them out **is** the decision rather than an omission. **Member templates only:** every payer send is refused today (N6/D-8), and the copy should be written after that decision — *"your father's pendant has been dispatched"* is not a translation of the member's message. **The `tested` message says the test call worked, not that the member is protected.** Readiness is two conditions (D4); a member with no emergency contacts receiving *"you are now monitored"* by SMS is a false all-clear with no page to correct it on. `seedBundle.test.ts` (15) asserts exactly that, plus placeholder safety, three-language parity and that no script carries a phone number. Ten mutations, all caught. |
| N8 | The "new member" staff notification (D5), from the webhook | ⬜ MISSING — held for a human | Touches `stripe-webhook`. Per the brief that PR stays open. |
| N9 | The member's own permission to be messaged (D8) | ✅ SHIPPED (3b) | **The dispatcher could never fire, and nothing said so.** `20260907100200`'s table comment is *"absent row means no permission"*, `notify-fulfilment` honours it — and **no screen anywhere wrote to `member_notification_optin`**, member-facing or staff. So every send was `skipped_no_optin` permanently, and would have stayed that way the day Lee turned a channel on. The gate was built, respected, and unreachable. `NotificationPreferences` on the member's own profile is that writer. It **records permission and never promises delivery** — the other gate is Lee's global flag, which a member cannot read, so *"you will now receive texts"* would be false today with silence as the only symptom. It says in as many words that **emergency calls reach us whatever is set here**, because somebody turning everything off must not be left wondering whether they have switched off their alarm. Withdrawing is the **same control, one press, no dialog, no reason asked for**, and `opted_in_at` survives it — that timestamp is the evidence for messages already sent. A channel with no phone or email is **off and disabled** naming the missing detail, and shows off even if a row says otherwise: a stored `true` we cannot honour is a row that reads as permission. `basis` is `member_self` and never the other value. `notificationConsent.test.tsx` (21). |
| N10 | Every `wa.me` link on the product went nowhere | 🔴 FIXED (3b) | `waNumber()` built the link from `settings_emergency_phone`, which holds `950 473 199` — a **national** format. `wa.me/<digits>` reads the digits as a full international number, so `wa.me/950473199` is a number in some other country or none. Three surfaces: the public *How it works* page, partner support, and (nearly) this new opt-in. It returns **null** without a leading `+` now, so those render nothing rather than somewhere wrong — the same rule as the fake emergency number, and prepending `34` because the company is Spanish would be inventing part of a phone number. `PENDING_FOR_LEE.md` **S16** turns all three back on with one setting edit. |

## Fulfilment state machine (2026-09-07) — WP2 · **schema APPLIED, screen partly shipped**

> Design: `FULFILMENT_MODEL.md`. Scope: `CC_MASTER_BRIEF.md` WP2. Lee's rulings on §9 are
> implemented and each carries a named assertion in `scripts/rls/isolation.sql`.
>
> **This is the section to read before believing any readiness number.** The readiness count for
> every member is **zero** today and that is correct: readiness now needs a `tested` order, no
> order has ever been in `tested`, and until increment 5b ships there is no way to put one there
> from the member record. It must not be "fixed" by backfilling `tested`.

| # | Item | Status | Evidence |
|---|---|---|---|
| F1 | `fulfilment_state` enum, six ranked states plus `cancelled` | ✅ APPLIED to prod | `20260907100000`, `20260907110000`. Recorded in `APPLIED_TO_PROD.txt`. |
| F2 | One step forward, D9 roles for a correction, a **new** reason required, `activity_logs` written | ✅ APPLIED to prod | `enforce_fulfilment_state()`, `20260907110100`. Asserted in `scripts/rls/isolation.sql`; each assertion mutation-tested. |
| F3 | `tested` refuses to be set without a resolvable staff id | ✅ APPLIED to prod | `20260907110100`. The state's entire content is that a named operator answered. |
| F4 | Existing rows backfilled (`processing`→`allocated`, `shipped`→`dispatched`, …) | ✅ APPLIED to prod | `20260907110100`, trigger explicitly disabled for the block — a backfill is not a transition. |
| F5 | Readiness = ≥1 contact **AND** a tested pendant still in good standing (D4, Q2) | ✅ APPLIED to prod | `20260907100100`. `security_invoker` preserved and asserted. |
| F6 | A member cannot write any fulfilment state (Q1) | ✅ VERIFIED | `scripts/rls/isolation.sql` — no UPDATE path exists, and the assertion re-reads the row to prove it is unchanged. |
| F7 | The staff **orders screen** moves a fulfilment state | ✅ VERIFIED (increment 5a) | `src/lib/fulfilmentState.ts` + `useFulfilmentState` + the column, filter, forward action and correction dialog on `/admin/orders`. `src/test/fulfilmentStateContract.test.ts` (45) proves the module mirrors the trigger — ranks, the correction predicate, the D9 role set and all five refusal messages are read out of the migrations. `src/test/ordersFulfilmentActions.test.tsx` (25) renders the screen. Both mutation-tested. |
| F8 | `programmed` set by finishing the `ProvisioningChecklist` | ✅ VERIFIED (increment 5b) | `markOrderProgrammed` fires from `useDeviceProvisioning` when **all** steps are complete — no button anywhere sets `programmed`, asserted. Attempted only from `allocated`: `paid → programmed` is a skip the trigger refuses, and walking two rungs would assert an allocation nothing checked. The checklist has **14** steps, not the brief's six, and the count is hard-coded nowhere — `PENDING_FOR_LEE.md` D-7. |
| F9 | `tested` reachable from the member record | ✅ VERIFIED (increment 5b) | `PendantFulfilmentCard` on the member's Device tab. Offered **only** from `delivered`, and it writes the state alone — `tested_by` is resolved by the trigger from `auth.uid()`. The SOS-screen copy of the action is **deliberately not built**: that is the SOS path and CLAUDE.md gates it on a human — `PENDING_FOR_LEE.md` S10. |
| F11 | Allocation writes `order_items.device_id` **and** moves `paid → allocated` | ✅ VERIFIED (increment 5b) | `linkDeviceToPendantOrder`, called by `DeviceTab.assignDevice` after the device row is written. **This closed a readiness dead-end**: readiness reaches a pendant through `orders → order_items → devices`, and `assignDevice` wrote only `devices.member_id` — so a pendant allocated by hand was invisible to readiness and that member could never be recorded as protected. `FULFILMENT_MODEL.md` §8-C. |
| F12 | The **webhook** allocation path moves `paid → allocated` | 🔴 BROKEN — fix held for a human | `_shared/post-payment.ts` allocates a device (`devices.status`, `order_items.device_id`) and does **not** move the fulfilment state, so every webhook-allocated order sits at `paid`. One line, in the payment path, so per the brief the PR stays open. `PENDING_FOR_LEE.md` §5 and S11. |
| F13 | The readiness **queue** has two row kinds and names the work | ✅ VERIFIED (increment 5c) | `readinessGap()` — one derivation read by every surface — plus a "What is missing" column, per-kind counts, and the queue's title/subtitle/empty-state corrected (they claimed the queue was only about contacts, which was true of one condition out of two). `src/test/readinessGap.test.ts` (15), `readinessQueue.test.tsx` (24). |
| F14 | The **member header notice** names which condition is missing | ✅ VERIFIED (increment 5c) | `MonitoringReadinessBar`, three variants. The pendant-only variant offers the member **nothing to press** — Q1 is operator-confirmed only, so a button would be a lie or a hole in that ruling; the phone number is the action. All five new strings in en/es/nl. `memberReadinessBar.test.tsx` (27). |
| F15 | The **operator card zero-state** names which condition is missing | ⬜ MISSING — held for a human | `SOSActionPanel` is the SOS path and CLAUDE.md gates it. Built as its own PR left OPEN, not merged. `PENDING_FOR_LEE.md` S10. |
| F10 | `awaiting_stock` as a condition rather than a state | ✅ VERIFIED (increment 6) | `fulfilmentCondition()` derives it from `fulfilment_state='paid'` + `orders.status`, with **no new column**. Chip beside the state (the order still reads Paid), a filter on both columns in the query, and the status nudge that allocated nothing is gone — replaced by "Allocate a device" on the member record, offered to an ordinary operator. Allocation clears the stale status so the condition clears itself. `FULFILMENT_MODEL.md` §6-B. |
| F16 | Every `admin.fulfilment` string exists in en/es/nl | ✅ VERIFIED (increment 6) | #192, #193 and #195 shipped 52 keys as inline fallbacks to keep locale JSON out of three concurrent PRs (CLAUDE.md's serial-merge rule). This PR adds all of them, plus the three `sos.action.pendantUntested*` keys #196 needs, so that held PR need not touch locale JSON at all. Every key the code names now resolves in all three locales — checked exhaustively, not sampled. |

## Emergency-contact readiness (2026-09-04) — the second axis · **SHIPPED to main**

> Design: `READINESS_MODEL.md` (#150). Increments: #151 (notify outcome), #152 (operator card),
> #153 (readiness view), #155 (paid-but-not-ready queue). Spec: `ICE_OPERATOR_CARD_SPEC.md` (#154).
> **ALL SIX ARE NOW MERGED** — `main` at `2b9444b`. The rows below record what `main` does today;
> the "BROKEN on main · fix open in #15x" wording they carried while the PRs were open is
> superseded, not deleted, so the before/after stays legible.

| # | Item | Status | Evidence |
|---|---|---|---|
| R1 | `emergency-contact-notify` reported a member with **zero** contacts as `{success: true, notified: 0}` at HTTP 200 | ✅ FIXED on main (#151) | Now a union on `outcome`: `notified` 200 / `all_failed` 502 / `no_contacts` **409** / `contacts_unreadable` **503**, `success` true only for `notified`. `src/test/emergencyContactOutcome.test.ts` sweeps every constructor so no branch can pair `success:true` with `notified:0` again. |
| R2 | The same branch swallowed `contactsError`, so a **failed read** returned the byte-identical payload as an empty table | ✅ FIXED on main (#151) | Split into `contacts_unreadable` (503, retryable) vs `no_contacts` (409). Asserted distinct in outcome **and** status. |
| R3 | Neither ingest caller read the notify response at all | ✅ FIXED on main (#151) | Both routed through `_shared/notify-emergency-contacts.ts` — one implementation. Asserted: no bare fetch to the function remains in either caller, and the helper reads `res.json()`. |
| R4 | Level 5 was **silent** for a member with no contacts, then recorded the tier as *reached* | ✅ FIXED on main (#151) | `fireNoTargetsAlert`, L5-only. `escalationOutcome.test.ts` asserts L2–L4 no-targets are unchanged, so the fix did not become an alert storm. |
| R5 | The operator card rendered "no emergency contacts" at 12px grey-on-dark (3.2:1), below the fold | ✅ FIXED on main (#152) | Loud non-dismissible `role="alert"` banner above JOIN CALL. 12 rendering tests; the two load-bearing **absences** (no banner while loading, none on a failed read) were mutation-proven. |
| R6 | No completeness/readiness concept existed anywhere | ✅ FIXED on main (#153) | `public.member_monitoring_readiness`, `security_invoker = on`, derived — no column, no trigger, no stored flag. |
| R7 | Admin queue of paid-but-not-ready members | ✅ SHIPPED on main (#155) | `/admin/members/readiness-queue`: `active` but not monitoring-ready, oldest paid first, days waiting, `tel:` per row, own sidebar entry. Reads the R6 view — never re-derives (asserted). **No automated chase** (email undeliverable; a silent chase failure is indistinguishable from a member ignoring you). |
| R8 | Readiness + queue isolation under RLS | ✅ VERIFIED on main | `scripts/rls/isolation.sql`: **125 checks, 0 FAIL, 153 migrations applied, 0 failed** on `2b9444b`. Re-run post-merge, not inherited from the PR runs. |
| R12 | The operator-card spec is in git, canonical and undated | ✅ DONE (#154) | `ICE_OPERATOR_CARD_SPEC.md`, "Living document. Do not date the filename." §5.1 is the emergency-contact state contract verbatim. The four `ICE_*_2026-09-02.md` files were Claude-project docs and had never been in git — reporting them absent was correct. |
| R13 | Call actions use `tel:` where spec §3 requires Twilio | 🔴 **BROKEN on main — tracked, not fixed** | **Issue #156.** 47 real call-action sites; **7 on the live-alert card**, two of them `tel:112`. Worst: `SOSActionPanel.tsx:494` sets `emergency_services_called` **on click, not on connection** — the incident record says 112 was called because somebody clicked. Also `window.open(..., "_self")` navigates the operator off the alert screen. Human gate (G1). |

### Post-merge verification — the merge commit is not what the PR runs tested

`#155` landed via a hand-resolved `Merge branch 'main' into …admin-queue` (`68662ad`). `CLAUDE.md`
names that exact commit shape as where both production outages were created, and
`scripts/rls/isolation.sql` was the interleaved file. So it was re-checked on `main` rather than
trusted:

| Check | Result |
|---|---|
| Every assertion from #153-as-authored present on `main` | **yes** — set difference empty |
| Every assertion from #155-as-authored present on `main` | **yes** — set difference empty |
| Duplicate check names (the "keep both sides" signature) | **none** |
| Conflict markers in `isolation.sql`, `src/`, `supabase/` | **none** |
| Duplicate readiness migration files | **none** — exactly 1 |
| Harness on `2b9444b` | **125 PASS, 0 FAIL**, 153 applied, 0 failed |

**All three queue mutations re-proven on `main`**, because a rebased assertion that has not been
made to fail has not been re-proven:

| Mutation | Went red |
|---|---|
| `security_invoker = off` | **all 6** queue negatives (member / other-member / partner / carer / role-less / own-row-only), plus 2 from the R6 block |
| readiness forced always-**true** | "a member with ZERO contacts always appears", "staff see the zero-contact paid member", "readiness is FALSE with zero contacts" |
| readiness forced always-**false** | "a member with ONE contact never appears", "empties on insert", "readiness is TRUE with one contact", + 3 more |

Restored after each: 125 PASS, 0 FAIL, clean tree.

### Not asserted

- **No browser click-through** of the operator card. R5 is proven by a rendering test, not by a
  human looking at a live SOS.
- **No end-to-end SOS drill** against a real device or a real Twilio call. The sub-second latency
  target is untouched and unverified by this work.
- **The queue's preventive value is unproven in use.** Nobody has worked it and no member has been
  phoned off the back of it. It is proven to list the right people, in the right order, and to
  refuse to report a failed read as an empty queue. That it actually gets worked is a human fact,
  not a test.
- **R13 means the operator card still cannot tell whether a call connected**, including to 112.
  Readiness is now honest about *who can be called*; the card is still not honest about *whether
  anyone was*.

### Retracted

**The 2026-09-04 "main is red" entries are retracted.** An earlier revision claimed `main` carried
78 type errors and that the RLS harness could not run. Both came from a **stale local `main` ref at
`17960fc`** rather than `origin/main`. The figures are real for `17960fc` and false for `main`.

The sequence matters, because the second mistake was worse than the first:

1. The first measurement — on the checked-out branch, which *was* current — reported **0 type
   errors** and a clean **141/0** harness run. Both were correct.
2. Later measurements ran after `git checkout -b <new> main`, resolving to the stale `17960fc`.
   They reported 78 errors and a failing rebrand migration. True of `17960fc`, false of `main`.
3. On the strength of step 2 I **retracted the correct step-1 finding**, wrote "main IS red" into
   the design doc, and added a false merge blocker to four PR descriptions.

Two tells were in my own output and both were missed: `git log --oneline main..HEAD` listed
`1dc74e7` (the typecheck-green merge) among commits *not in* `main`, which I read as "the branch
equals main"; and I borrowed a migration fix from `fix/rebrand-migration-jsonb` without asking why
a branch I needed to borrow from had already merged as #137.

**The lesson is procedural:** `git fetch --all` before measuring, and never treat a local `main`
as authoritative without checking it against `origin/main`. Recorded rather than edited away (G5).

## Partner journey (2026-08-11, consolidated 2026-09-05) — traced end to end

> Full reasoning and the current single path: **`PARTNER_JOURNEY.md`**.
>
> **2026-09-05 — the two-path split is closed.** Partners have ONE way in: full
> registration at `/partner/join`. `/partner` is a permanent redirect (router
> `<Navigate replace>` + a 308 in `vercel.json`); `PartnerOnboarding` and its
> locale namespace are deleted; `partner-apply` is still deployed but called by
> nothing. The admin conversion path (`ConvertApplicationDialog`,
> `partner-admin-invite`) is KEPT — production may hold pending applications
> (`PENDING_FOR_LEE.md` S7). Proven by `src/test/partnerSingleEntry.test.ts`.
>
> ⚠️ **Everything marked "fix open" below is in an OPEN PR and is NOT on `main`.** The
> live behaviour is still the broken behaviour until those merge. Nothing here is
> marked working on the strength of a PR existing.

### What the production trace established

| # | Item | Status | Evidence |
|---|---|---|---|
| P1 | Deployed bundle called a placeholder Supabase host, so **no client call reached the backend** | ✅ FIXED (live) | Lee fixed `VITE_SUPABASE_URL` in Vercel. `vite.config.ts` now throws instead of substituting a placeholder — merged in #100. |
| P2 | `partner-register` rejected the password; browser showed only `Edge Function returned a non-2xx status code` | 🔴 BROKEN on main · fix open in **#105** (C1) | `_shared/validation.ts` returns `{error, details:["password: Invalid"]}`; the helper dropped `details`. Tests in #105 fail against the pre-fix helper. |
| P3 | Client password rule was `min(8)`; server also requires upper + lower + digit | 🔴 BROKEN on main · fix open in **#106** (C2) | Parity test imports the REAL server schema and runs 35 adversarial inputs; reverting the client rule fails 5. |
| P4 | Terms acceptance was UI state only — never sent, validated or stored | 🔴 BROKEN on main · fix open in **#107** (C3) | No `accept_terms` in the server schema, no column on `partners`. Migration + server enforcement verified against real PostgreSQL 16, including rollback. |
| P5 | `/partner/login` unreachable from the public site | 🔴 BROKEN on main · fix open in **#108** (C5) | Nav and landing footer both pointed only at `/partner`. Reverting both pages fails 4 of 7 tests. |
| P6 | The nav reaches `/partner` → `partner-apply`, never `/partner/join` | ✅ **FIXED 2026-09-05** — the application path is retired; every public link points at `/partner/join` and `/partner` permanently redirects there | `src/test/partnerSingleEntry.test.ts` (15 assertions): route present and renders `<Navigate replace>`, `vercel.json` 308, no wildcard that would loop, header + both landing links, a walk of `src/` finds no remaining `/partner` complete-path link, the page is deleted, nothing invokes `partner-apply`, the locale namespace is gone, and the admin convert path still exists. **The zero-invocation count was NOT caused by this**: `partner-apply` read zero too, both from the placeholder `VITE_SUPABASE_URL`. |

### Verified by execution, not inspection

| Claim | How it was proven |
|---|---|
| `partners` has **no INSERT policy**; no anon/authenticated client can insert | Real PostgreSQL 16 with `authenticated`'s grants applied: `new row violates row-level security policy`. `SELECT` returns only own row; `UPDATE` of another partner's row affects 0 rows. |
| `partner-register`'s insert is valid against the migrated schema | Rebuilt `partners` from the migrations and ran the exact payload — succeeds. All 24 inserted columns exist among the 37 migrated. |
| `get_user_role_info` gates `is_partner` on `status='active'` | Ran the migration's own function body: `pending` → `is_partner:false, partner_id:null`; `active` → `true` + the row's id. |
| The terms migration is reversible | Applied, wrote a record, re-applied (no-op), rolled back: both columns gone, **all partner rows preserved**, index dropped with the column. |

### Open gaps — verified, unfixed, not in any PR

| # | Gap | Why it is left |
|---|---|---|
| P7 | `PartnerLogin` blocks only `pending`/`suspended` (denylist); `get_user_role_info` grants only `active` (allowlist) | Same asymmetry as #102. No status outside the enum exists today, so it is latent. Needs prod's distinct values checked first. |
| P8 | "No partner account found for this email" — the lookup is by `user_id`, not email | Every legacy `partner-apply` row has no `user_id`, so this is exactly what an application-path partner sees — and since P6, trying to log in is the only way one can arrive. Wording fix is trivial. |
| **P13** | **`/partner/join` is hardcoded English end to end** — 970 lines, two `t()` calls, no `useTranslation` | 🔴 **NEW SEVERITY as of P6's fix.** It was survivable while the nav reached the fully-translated `/partner`; it is now the **sole** public partner entry point, against LAUNCH_SCOPE §6 (EN + ES + NL, full coverage at launch). Translating a 970-line wizard is its own work package. Deliberately NOT papered over with two translated strings — see `PARTNER_JOURNEY.md` §3.1 and the comment in `partnerLoginReachable.test.ts`. |
| P9 | `preferred_language` is `en`/`es` only — CHECK constraint, server enum and form all agree | Consistent, so parity holds, but Dutch is consistently **rejected**, against LAUNCH_SCOPE §6. Needs a migration + scope decision; not bundled into a parity PR. |
| P10 | `/partner-dashboard` is hard-blocked on first arrival by `AgreementRequiredModal` (`open={true}`, non-dismissible) | Intended, but the first-run experience has never been click-tested. |
| P11 | Verification email runs on interim Gmail SMTP | Already a `LAUNCH_CHECKLIST.md` hard blocker. A silent delivery failure is indistinguishable from a partner who never bothered. |
| P12 | `partner-apply` writes no `user_id` and issues no verification token | An application is a lead and terminal without admin action. No longer reachable from the public site (P6), but the function stays deployed and the admin conversion path stays wired, because production may hold pending rows — `PENDING_FOR_LEE.md` S7 carries the count query that decides whether they can all go. |

### Retracted

**The schema-mismatch hypothesis in #104 was wrong.** `partners` has all 37 columns on
prod and the insert was never reached — `partner-register` had zero invocations. The
column-contract test from #104 is still worth keeping as a guard, but it was not the
explanation. Recorded here rather than left as a retracted theory with no correction
attached (G5).

### Not asserted

- No browser click-through of the partner journey was performed. Every claim above is
  either a test, a real-PostgreSQL run, or a source reading — never "looks right".
- The **live** partner journey is unverified after these PRs, because none is merged.
- `partner-apply`'s invocation count on prod is unknown, so whether the application
  path itself ever reached the backend has not been confirmed.
- The consolidation of 2026-09-05 **was** walked in a real browser, once: Chromium
  against the production build served by `vite preview` — `/partner` lands on
  `/partner/join` and renders "Become an ICE Alarm España Partner". That is the
  router redirect. **The 308 in `vercel.json` has NOT been observed on a deployed
  URL** — `vite preview` does not apply Vercel's redirect rules, so the HTTP status
  a search engine will see is asserted from config, not measured. One `curl -I`
  against the deployed `/partner` closes it.
- **The count of pending applications on prod is unknown** — that is exactly what
  `PENDING_FOR_LEE.md` S7 asks Lee to run.

## Staff credential reset tooling (2026-08-11)

> Landed on a **separate branch/PR** (`…-staff-login-reset`). Recorded here because
> `STATE.md` is the single home for status; the code is not in the docs PR.

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | `scripts/reset-staff-logins.ts` | ✅ VERIFIED | One-shot reset of staff email+password. Env-only config; account list from a gitignored file or `STAFF_LOGINS_CONFIG`. No address, password or key committed. Dry-run default, `--apply` to write. |
| C2 | Project-ref guard | ✅ VERIFIED — proven negatively | Refuses to run when the service key's `ref` claim ≠ the `SUPABASE_URL` host. Also refuses an opaque `sb_secret_*` key, since the check then cannot be performed. Test feeds a mismatched pair and asserts refusal; CLI exits 1. This is the failure that broke staff login. |
| C3 | auth ↔ staff lock-step | ✅ VERIFIED | All accounts pre-flighted against `public.staff` before the first write, so an unresolvable account aborts with the DB untouched. If the staff update fails after auth succeeded, raises `DivergenceError` and halts rather than diverging further accounts. |
| C4 | Audit trail | ✅ VERIFIED | Each change inserts an `activity_logs` row recording which fields changed. Password never printed, never stored; emails masked unless `--unmask`. |
| C5 | Dry-run diff | ✅ VERIFIED | End-to-end test runs `main()` against a stub client: asserts the full per-account diff prints and that the **only** DB calls are the two staff lookups — no write of any kind. |
| C6 | `20260811120000_second_admin_staff_row.sql` | ✅ VERIFIED | Creates/promotes one staff row to `role='admin'`, `status='active'`. Never writes the GENERATED `is_active` (the 20260617130000 bug). Identity supplied at apply time via a setting, so nothing real is committed. Guarded no-op when unset, so `db push` still succeeds on CI. |
| C7 | Migration reversibility | ✅ VERIFIED — executed | Exercised against real PostgreSQL 16 across 8 paths: no-op, missing auth user (raises, no change), create, idempotent re-run, promote, rollback of the created row, rollback of the promote restoring `call_centre`/`pending` exactly, and a direct `is_active` write confirming it raises. Prior role/status captured in `activity_logs` so the header's rollback is exact. |
| C8 | Tests | ✅ VERIFIED | 53 new tests pass; full suite 810 passed / 1 pre-existing skip. `scripts/` typechecks strict and lints clean. |

## Stage 0 — Prod backend verification (2026-07-22, LAUNCH_SCOPE.md §0)

> Read-only pass on `crpsuhoixfdhjugprbuc`. **Nothing on prod was changed.** Statuses:
> ✅ VERIFIED · ⚠️ DRIFT · ⛔ BLOCKED-needs-Lee.

> **Items 1–4 COMPLETED 2026-07-22** by a parallel tokened session (read-only on prod);
> findings folded in below. Remediation is **Stage 0b** — plan `STAGE_0B_PLAN.md` (PR #14),
> repo fix PR #16 — human-gated, not yet run on prod.

| # | Item | Status | Finding |
|---|---|---|---|
| 1 | Linked project ref = `crpsuhoixfdhjugprbuc` | ✅ VERIFIED | Confirmed: prod is `crpsuhoixfdhjugprbuc` (tokened session, read-only). |
| 2 | Local vs remote migration diff (`supabase migration list`) | ✅ VERIFIED — **DRIFT** | **5 migrations unapplied on prod** (matches `STAGE_0B_PLAN.md` §2): `bootstrap_first_admin`, `pricing_source`, `fix_bootstrap_first_admin_is_active`, `sos_escalation_cron`, `deactivate_non_pendant_products`. `pricing_source` unapplied ⇒ Prompt 4 review is gated on the Stage-0b push. |
| 3 | Deployed edge functions vs repo dirs | ✅ VERIFIED — **DRIFT** | **2 functions never deployed**; **all 89 deployed functions are stale from a single 2026-04-20 deploy.** (Reconciles the 2026-06-17 "cutover deploy" LEARN entry: that deploy targeted the now-**CANCELLED** `cfwnrcogikjycjcobsay`, not current prod — so current prod hasn't been redeployed since 2026-04-20.) Remediation: full redeploy + CI pipeline (PR #16 / plan §3). |
| 4 | Postgres error-spike root cause | ✅ VERIFIED | **~721 errors/day = the two APPLIED GUC crons** throwing "unrecognized configuration parameter": `ev07b-offline-monitor` (`*/2 * * * *` ⇒ 720/day) + `shift-daily-reminders` (daily ⇒ 1/day) = **721/day**. Root cause (the un-guarded `current_setting('app.settings.*')`) **confirmed empirically.** Fix in PR #16 (Vault key + hardcoded public URL + missing-secret guard). *(The unapplied `sos_escalation_cron`'s 2 crons are not yet on prod, so they don't contribute to the spike — but carry the same bug, fixed in place in PR #16.)* |
| 5 | `.env.example` completeness vs `Deno.env.get` / `import.meta.env` | ✅ VERIFIED + FIXED | **Frontend** (`import.meta.env.VITE_*`): all 13 referenced keys already present — complete. **Edge functions** (`Deno.env.get`): 25 distinct keys referenced; `.env.example` documented **none** of the server secrets (only VITE_*). **Fixed:** added an "Edge Function secrets" section (SITE_URL, WEBHOOK_SECRET, Resend/Gmail, 9× Twilio, 3× EV07B, Google OAuth, RENDER_WORKER_URL, LOVABLE_API_KEY). Excluded by design: `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (runtime auto-injected) and Stripe/Mollie keys (stored in `system_settings`, entered via Admin → Settings, not env). |

**✅ Stage 0 diagnosis COMPLETE — remediation pending (Stage 0b, human-gated).** The prod
execution (apply 5 migrations, redeploy all functions, fix the crons, verify) runs from the
**tokened terminal session**, or from this sandbox once `SUPABASE_ACCESS_TOKEN` is injected
here (it is **not** present in this sandbox as of 2026-07-22). Ordered steps + verification:
`STAGE_0B_PLAN.md`; repo fix (cron + deploy CI): PR #16.

### Stage 0b — COMPLETE ✅ (2026-07-22, two prod pushes, tokened session)

> **Evidence discipline (GOALS G5):** **Code-verified** = provable from this repo.
> **Runtime-verified** = confirmed against prod `cron.job_run_details` by Lee's tokened
> run (2026-07-22 ~17:47 UTC). All Stage-0b lines below are now one or the other — Stage 0b
> is **closed**; the only open item is the 24h clean-run clock (re-check 2026-07-23).

- **Migrations applied — reported COMPLETE.** All 5 Stage-0 drift migrations plus, in a
  **second push**, the 2 SOS cron migrations (`20260716120000_sos_escalation_cron.sql`)
  that the first push missed.
- **Functions deployed — reported COMPLETE:** 91 edge functions deployed (clears the
  "all stale from 2026-04-20" drift; the deploy also now runs in CI via
  `deploy-functions.yml`).
- **Cron auth pattern — CODE-VERIFIED (definitive).** All four scheduled jobs, in their
  final applied state, post via the **Vault pattern** (`vault.decrypted_secrets` →
  `service_role_key`, hardcoded public URL `crpsuhoixfdhjugprbuc`, `RAISE WARNING`+`RETURN`
  guard if the secret is missing). **No live cron code references `current_setting('app.settings.*')`**
  — that string survives only in explanatory comments (verified by grep across
  `supabase/migrations/`). Job-by-job:
  | Cron | Cadence | Scheduled by | Auth |
  |---|---|---|---|
  | `sos-escalation-runner` | `* * * * *` | `20260716120000_sos_escalation_cron.sql` | Vault ✓ |
  | `staff-shift-monitor` | `*/2 * * * *` | `20260716120000_sos_escalation_cron.sql` | Vault ✓ |
  | `ev07b-offline-monitor` | `*/2 * * * *` | re-scheduled by `20260723120000_fix_cron_url_and_auth.sql` | Vault ✓ |
  | `shift-daily-reminders` | daily | re-scheduled by `20260723120000_fix_cron_url_and_auth.sql` | Vault ✓ |
  This **answers the item-1 question directly**: `sos_escalation_cron` was written with the
  Vault pattern from the start (never the `app.settings` GUC), so the PR #16 Vault fix
  covers it. The old `app.settings` definitions of `ev07b-offline-monitor` /
  `shift-daily-reminders` are superseded (same jobname re-scheduled) by the corrective
  migration — so the ~721/day "unrecognized configuration parameter" spike is **eliminated
  by design**.
- **Crons active + firing — ✅ RUNTIME-VERIFIED (2026-07-22 ~17:47 UTC, Lee's tokened run).**
  `cron.job_run_details` over the last 10 minutes shows **all 4 jobs `status=succeeded`**
  with **no `app.settings` error** (the `return_message`/`msg` column shows the `DO ...`
  block succeeding). Observed firing at cadence: `sos-escalation-runner` every 1 min,
  `ev07b-offline-monitor` every 2 min, `staff-shift-monitor` firing, `shift-daily-reminders`
  scheduled daily. This is the runtime confirmation that matches the code-verified Vault
  config above.
- **~721/day Postgres error spike — ✅ RESOLVED.** The "unrecognized configuration parameter
  `app.settings.*`" errors (720/day from `ev07b-offline-monitor` @ */2 + 1/day from
  `shift-daily-reminders`) are gone: those jobs now run the Vault `DO` block and succeed.
  Root cause (Stage-0 item 4) → fix (PR #16 + corrective migration) → prod confirmation now
  all line up.
- **24h clean-run clock — RUNNING (started 2026-07-22 ~17:47 UTC).** Cron config + first-10-min
  runtime both green ⇒ **GO**. The only remaining action is the **T+24h confirmation
  (~2026-07-23)** that the clean run held for a full day; re-check `cron.job_run_details` +
  error count then and tick the launch-checklist line. (This sandbox can't watch prod
  directly — no prod SQL access, outbound blocked — so the T+24h check is Lee's, or a
  tokened session's.)

**➡️ Stage 0b is CLOSED.** Migrations applied, 91 functions deployed, all 4 crons succeeding
with zero `app.settings` errors. Outstanding: 24h-clock confirmation (2026-07-23) and the
separate favicon redeploy/cache-purge (deploy-side, tracked under Content & brand).

### Favicon "old ICE icon on prod" — root cause = STALE DEPLOY / CDN cache (2026-07-22)

Reported: production serves the old icon at `/favicon.ico` even loaded directly (not a
browser cache). **Investigated repo + build side (could not fetch the live site — the
sandbox network policy 403s outbound to `*.vercel.app`).** Findings:

- **Repo and build output are CORRECT.** `dist/` is byte-identical to `public/` for every
  icon (sha256 MATCH on favicon.ico/16/32/48, icon-192/512, apple-touch); the built
  `favicon.ico` is the ICE Alarm España "v" mark (`sha256 d8e3315f…`, 5687 B). `main`'s
  `index.html` has the correct `<link rel="icon">` set (#23) and **zero** references to the
  cancelled project. So nothing in git or the build is the old ICE image.
- **Therefore the wrong file is introduced at deploy/serve time**, consistent with the
  Stage-0 finding that prod hadn't been redeployed since **2026-04-20** (pre-rebrand;
  the rebrand landed in `b805825`). Same stale-deploy story as the broken sign-in.
- **Fix (Lee's side — the real remedy):** redeploy current `main` to Vercel, then purge the
  Vercel edge cache for `/favicon.ico` and the icon paths (favicon.ico is served from a fixed
  path and CDNs pin it hard). **Diff to confirm:** `curl -s https://<prod-url>/favicon.ico | sha256sum`
  must equal `d8e3315f327b38a58f59ecfd5ac6521455368adf7c35e5ccb8dc08695d60d4d1`. If it
  differs, the deploy is still stale; if it matches, it was edge cache.
- **Repo hardening (this branch):** `vercel.json` now sets a short, must-revalidate
  `Cache-Control` on the icon paths so a future icon swap can't be pinned stale by the CDN.

### ⚠️ Launch domain & email — NOT verified (2026-07-22)

The launch domain **`icealarm.es` is owned by a known partner**. Attaching it to Vercel +
DNS + email verification (SPF/DKIM/DMARC, Resend/Gmail domain verification) is a **final,
coordinated go-live step** done with the partner at cutover — not before. The repo uses it in
`public/robots.txt` (sitemap) and the `auth-email-hook` sender domain as the *intended* value;
until cutover **email sending from `@icealarm.es` remains unverified** and **development
continues on the `*.vercel.app` URL**. Tracked as a HARD launch blocker in `LAUNCH_CHECKLIST.md`.

---

## SOS/alerts safety reconciliation — STAGE_SOS_FIX.md (status 2026-07-23)

> The "two ownership paths" defect class (queue wrote `claimed_by` unguarded; SOS page wrote
> `accepted_by_staff_id` guarded — the two surfaces could disagree about who owns a live SOS)
> is being retired WP by WP. Every WP ships with a single-write-path source-scan invariant,
> race tests, and a truthful-UI check. **All SOS-path merges are human-gated (Lee, live drill).**

| WP | What | State | Proof |
|---|---|---|---|
| WP-A unified ownership | One guarded write path (`src/lib/alertOwnership.ts`, canonical `accepted_by_staff_id`, legacy mirror kept for SLA/history readers); queue claim now lands on the SOS page as active | ✅ **MERGED** #35 | `alertOwnership.test.ts` (9): write-path, shared-state derivation, 2-operator race, source-scan invariant |
| SOS drill | Admin-only `sos-drill` fn + dashboard controls: level-5 ladder-inert drill alert (contact-less internal member, no outbound HTTP), auto cleanup — lets Lee exercise the live path safely | ✅ **MERGED** #37 | `sosDrill.test.ts` (9): ladder-inert proof vs runner source, no-outbound scan, admin-only |
| WP-B single resolve path | Every resolve goes through `sos-alert-resolve` (now alert-type-aware; notes mandatory for SOS; false-alarm flag; Isabella log + contact SMS gated on real SOS) via `src/lib/alertResolution.ts` | ✅ **MERGED** #36 | `alertResolution.test.ts` (10) incl. source-scan: no direct resolved-status writes |
| WP-C real escalation | `sos-alert-escalate` fn: status + `alert_escalations` audit row (`escalated_by`) + real admin notify; **toast says "Admin has been notified" only after a confirmed send** (was a hardcoded lie) | 🟡 **PR #39 open — GATED** | `alertEscalation.test.ts` (11): notified never invented, table-aware source scan, runner harmless-slot proof |
| WP-D emergency button | Dead "Call Emergency Services" button → real `tel:112` link with the number visibly rendered (Lee's decision) | 🟡 **PR #40 open — GATED, stacked on #39** | `emergencyButton.test.ts` (3) |
| WP-E/F/G (queue checkboxes, small defects, dead SOSTakeoverScreen) | Not started | ⬜ | — |

**Found & flagged during this work (separate, gated):**
- 🔥 **Prod blocker:** `/complete-registration` fails RLS on a client-side `members` INSERT (correctly
  denied by design — no member INSERT policy exists). Fix = server-side linking fn, **zero policy
  changes** — **PR #38 open**. `completeRegistration.test.ts` (11) locks the security properties.
- 🔴 Partner `ResidentialDashboard` inserts members client-side — same bug class, pinned as
  known-broken by the same test; needs its own gated WP.
- Later-fix flags recorded in STAGE_SOS_FIX.md: member hard-DELETE → soft-delete/admin-only;
  SubscriptionTab client-side status writes → server-side.

**Call-centre upgrade buckets (non-gated, 2026-07-23):** #41 (draft — dashboard reorder
members→devices→personal + white-on-white badge fixes, awaiting visual sign-off), #42 (i18n:
72 keys × en/es/nl, removes hardcoded English from Messages/Leads/Members/holiday+cover toasts),
#43 (stacked on #42 — tickets full lifecycle on call-centre, shift-note edit/delete/realtime,
messages unassign `""`→`null` bug; `callCentreCrud.test.ts` 11 tests).

---

## 0. Full suite results (gates re-run 2026-07-16 on `chore/lint-zero-and-test-hygiene`)

| Gate | Result | Evidence |
|---|---|---|
| **Typecheck** (`tsc --noEmit`) | ✅ **0 errors** | exit 0 |
| **Lint** (`eslint .`) | ✅ **0 errors** (62 warnings) | Cleanup PR `chore/lint-zero-and-test-hygiene` fixed all 345 errors (318 `no-explicit-any` + 27 misc), type-only, verified by tsc 0 + suite green + build green. Remaining 62 are pre-existing `react-hooks/exhaustive-deps` + `react-refresh` **warnings** (deferred — fixing exhaustive-deps changes dependency arrays = a behavior change, notably on the SOS-path `useAlerts` effect). `render-worker` (separate package) excluded from root lint. |
| **Build** (`vite build`) | ✅ **succeeds** | `✓ built in ~1m20s`; only the >600 kB chunk-size warning. |
| **Tests** (`vitest run`) | ✅ **all green** | 20/20 files, 362 tests pass. `crmEvents.test.ts` load failure (`supabaseUrl is required`) FIXED via a dummy Supabase env in `vitest.config.ts` (test-only, non-secret) — referral logic now proven. |

**Test surface reality:** 23 Vitest files in `src/test/`. Still **zero** RLS/isolation tests and **zero** Playwright/E2E harness. The SOS escalation ladder now has a suite-level E2E encoding (`sosEscalation.e2e.test.ts`) plus edge-logic tests (`escalationLoop.test.ts`, `shiftTime.test.ts`) that exercise shared edge modules under vitest — but the mandated Playwright E2E paths (checkout→activation, SOS→operator UI) and the RLS-isolation/webhook-contract suites still have no corresponding files.

> **CORRECTION 2026-08-13 — "zero RLS/isolation tests" above is no longer true.**
> `scripts/rls/run.sh` builds a throwaway PostgreSQL, applies the Supabase-compatible
> scaffolding (`scripts/rls/bootstrap.sql`) and then the **real** migration set, and
> runs 28 cross-tenant checks (`scripts/rls/isolation.sql`). It runs on every PR via
> the `RLS Isolation` workflow — a stock `postgres:16` service, no Supabase project,
> no ephemeral cluster, because RLS is a pure PostgreSQL feature.
>
> Established by that run, on the real schema: **112 tables in `public`, all 112 with
> RLS enabled, 277 policies.** Covered: member↔member (SELECT/UPDATE/DELETE), PHI
> (`medical_information`, `emergency_contacts`), partner↔partner, partner→member,
> anonymous, a signed-in user with no rows, golden rule 3 (a call-centre operator
> cannot escalate their own role — the `staff_self_update_guard` trigger fires) and
> golden rule 4 (a member cannot move their own `subscriptions.status` or
> `plan_type`).
>
> **It is proven able to fail**, not merely green: adding a single `USING (true)`
> SELECT policy to `members` flips the relevant checks to FAIL and exits non-zero.
>
> Still true: the two mandated **E2E** paths (checkout→activation, SOS→operator) and
> the **webhook contract** tests remain owed. `webhook_events` is RLS-on with no
> policy — deny-all, which is correct for a service-role-only table, and is declared
> as an intentional exception rather than silently skipped.

> **UPDATE 2026-08-14 — G4 consent scoping now exists and is tested. NOT MERGED.**
> `PRELAUNCH_AUDIT.md` recorded G4 ("family sees only what the member has consented
> to share") as **not met, with nothing to test** — there was no family carer in the
> schema at all. Design: `CONSENT_MODEL.md` — **merged to `main` 2026-08-14** (#134).
> Implementation: `20260814140000_care_access_grants.sql` — **open PR (#135), behind
> the human gate on RLS policies**. So the model is agreed and on `main`; the
> enforcement is not, and nothing below is live in the database yet.
>
> What the branch establishes, by execution on real PostgreSQL: **137 migrations
> applied, 0 failed, 77 isolation checks green** (up from 29). The consent section
> is negative-first — a carer granted `alerts` over member A is proven **unable** to
> read that member's `medical_information`, `devices`, `emergency_contacts`,
> `subscriptions`, or `public.members` itself; unable to read member B's alerts;
> unable to write anything anywhere; and unable to grant themselves more. Revocation
> is asserted **in the same run**, microseconds after the revoking statement, and is
> per-category.
>
> **Proven able to fail, by mutation, not assumed:** deleting `AND g.revoked_at IS
> NULL` from `has_care_consent` turns the immediacy check red; deleting `AND
> g.category = _category` turns five checks red. Both were run, both went red, and
> the migration was restored byte-identical.
>
> **What is honestly NOT closed by this work:**
> - G4's *"every access is auditable"* is **partially** met. The grant lifecycle is
>   fully auditable — every grant and revocation is a durable row with a timestamp
>   and a named actor, and no client can delete one. **Per-read logging does not
>   exist** and is not built (`CONSENT_MODEL.md` §8).
> - There is **no family portal UI**, no carer invite flow, and no carer account
>   claim. The database can enforce consent; nothing yet renders it. That order is
>   deliberate.
> - A `location` grant currently exposes the whole `devices` row including `imei`
>   and `sim_phone_number`, because Postgres cannot column-scope while staff,
>   members and carers all share the `authenticated` role (`CONSENT_MODEL.md` §3.2).
> - **Consent on behalf of an adult with diminished capacity is unresolved and
>   deliberately unimplemented.** `consent_basis` has exactly two values and neither
>   is a legal representative; the isolation suite fails if a third is added. Open
>   with a Spanish data protection lawyer (`CONSENT_MODEL.md` §7). Until it returns,
>   **a member who cannot consent personally cannot have a carer granted access.**

> **CORRECTION 2026-08-11 — "zero Playwright/E2E harness" above is out of date.** Playwright
> landed 2026-07-22: `playwright.config.ts`, the `Page Audit` CI workflow, and
> `e2e/public.spec.ts` (14 public routes × 7 checks). This PR adds the first
> **authenticated** journey, `e2e/partnerJourney.spec.ts`, driving register → verify →
> log in → dashboard against the production bundle in real Chromium.
>
> What remains true, stated precisely so this does not rot again:
> - The journey harness stubs **Supabase's HTTP surface** (`e2e/helpers/supabaseStub.ts`).
>   It proves the client journey and the request contract. It does **not** prove a
>   migration, an RLS policy, a DB constraint, GoTrue's real behaviour, or email delivery.
>   A full-stack run needs `supabase start`, i.e. Docker.
> - The **two mandated E2E paths are still owed**: checkout→activation and SOS→operator.
>   The partner journey is neither of them.
> - **RLS isolation tests remain at zero** — still the single biggest gap (§3).
> - The `Page Audit` job is **RED on `main`** at `ed290ec`, on the `/` and `/pricing`
>   dead-button assertions ("Monthly"/"Annual"). Not caused by this work; see §3.

> **Two stacked PRs.** The escalation safety fix is a **tiny 11-file PR (PR-B)** on top of a
> mechanical cleanup PR (**PR-A** `chore: repo-wide lint + type + test-env cleanup` — `no-explicit-any`
> typing, `crmEvents`/`supabaseUrl` test-env, lint config; no escalation logic). **Merge order: PR-A
> first, then PR-B.** Rebased on PR-A, PR-B is green by itself: **typecheck 0 · lint 0 errors
> (62 pre-existing warnings) · build green · 384 tests pass / 1 skipped**. The escalation fix adds
> zero lint errors of its own.

---

## 1. Safety-critical path — SOS (EV-07B → operator)

**Verdict: real, non-mocked code end-to-end; proven only at the ingress-auth layer; two concrete defects. Fails golden rule #8 (SOS "always has an end-to-end test") — no such test exists.**

| Stage | Class | Evidence |
|---|---|---|
| Pendant → `gps-gateway` (Node GT06 TCP bridge) | 🟡 | Real: `gps-gateway/src/{server,gt06-parser,forwarder}.js` (parses `0x01→sos`, `0x03→fall`; HMAC-signs POST to `ev07b-sos-alert`). Packaged (Dockerfile) but nothing in-repo deploys/tests it. |
| `ev07b-sos-alert` edge fn → `alerts` insert | 🟡 | Real: authenticates ingress, dedups 5-min, **writes `alerts` row `status:"incoming"`** (`ev07b-sos-alert/index.ts:167-182`), fans out to notify fns. `verify_jwt=false` (`config.toml:15`). No test. |
| Ingress auth (HMAC / api-key transition) | ✅ | `src/test/ev07bAuth.test.ts` (9) + `src/test/hmac.test.ts` (8) — **17 pass**. Tests `_shared/ev07b-auth.ts` + `_shared/hmac.ts` (edge WebCrypto ↔ gateway Node parity). **This is the only proven SOS piece.** |
| HMAC **enforcement** | 🟡 | Permissive: `EV07B_ENFORCE_HMAC` defaults **false** (`ev07b-sos-alert/index.ts:53`) → accepts HMAC **OR** legacy `x-api-key`. Strict mode is off until the flag is set. |
| `emergency-contact-notify` (Twilio SMS) | 🟡 | Real Twilio send (`index.ts:137-166`), logs `alert_communications`. No test. |
| **Auto-escalation runner** (levels 2–5: staff→supervisor→admin→contact voice calls) | ✅ | **VERIFIED WORKING** by `src/test/sosEscalation.e2e.test.ts` (a pendant SOS with no ack reaches every human tier 2→5) + `src/test/escalationLoop.test.ts` (cadence). Now scheduled: `20260716120000_sos_escalation_cron.sql` runs a **per-minute pg_cron wake** that drives an internal sweep loop (`_shared/escalation-loop.ts`, `ESCALATION_TICK_MS=10s`, `MAX_RUNTIME=55s`) → **effective ~10s cadence** meeting the 15/30/45/60/90s ladder (HAZARD 1 resolved without relying on pg_cron sub-minute support). Runner writes a heartbeat + logs structured JSON + fires a LOUD `system.runner_failure` admin alert on any sweep/fatal error (GOALS G2). **Fail-loud calls (GOALS G2):** a rung is marked reached ONLY if a Twilio call actually connected; a failed call records `call_placed=false` on `alert_escalations` and fires a LOUD `escalation.call_failed` admin WhatsApp alert (no longer a silent advance). All-failed tiers bounded-retry then advance (Lee 2026-07-16). Proven by `src/test/escalationOutcome.test.ts` (failed call → alert fired AND not marked reached). |
| **Shift monitor** (night-cover SPOF net) | ✅ | **VERIFIED WORKING** (scheduled `*/2 * * * *` in the same migration; asserted by `sosEscalation.e2e.test.ts`). Also now the **dead-man's-switch** for the escalation runner: alerts LOUD if that runner's heartbeat goes stale (>3 min). |
| Realtime → operator screen | 🟡 | `alerts` in realtime publication (`20260121143325:391`); `src/hooks/useAlerts.ts:338-406` subscribes, plays sound/toast/notification on INSERT. `SOSAlertPage`/`CallCentreDashboard` + `sos-conference-*` all real. No click-through/test proof. |
| **Latency < 1 s (target)** | 🟡/⬜ | **Escalation *cadence* is now measured** (`escalationLoop.test.ts`: sweeps honour the ~10s tick). The **inbound** SOS latency (pendant press → operator-visible alert < 1s) is still **not measured** — there is no timing instrumentation in `ev07b-sos-alert` and no local/deployed harness to time it, so `sosEscalation.e2e.test.ts` keeps that assertion **skipped with a TODO** rather than assert a fabricated number (GOALS G5). Owed follow-up: an ingress-latency probe. |

---

## 2. Money-critical path — Payments (Stripe + Mollie → activation)

**Verdict: full loop wired in code, converging on one correct chokepoint; UNVERIFIED end-to-end (no contract/E2E test); the "webhook-ONLY activation" golden rule is BROKEN in three places.**

| Piece | Class | Evidence |
|---|---|---|
| Charge is **server-authoritative** | ✅ | `submit-registration` recomputes total from DB `pricing_plans`/`pricing_settings`, **fails closed** if unset ("refusing to compute a charge", `index.ts:247-249`). Proven by `pricing.test.ts`, `pricing-calculations.test.ts`, `pricingSource.test.ts` (calc + seed parity). |
| `stripe-webhook` signature verification | 🟡 | Correct in code: `stripe.webhooks.constructEvent(body, sig, secret)` (`index.ts:64`), 400 on failure, idempotency via `webhook_events`. No test exercises it. |
| `mollie-webhook` verification (API re-fetch) | 🟡 | Correct Mollie pattern: re-fetches payment from API rather than trusting POST (`index.ts:112`), idempotency guard. No test. |
| Activation chokepoint `_shared/post-payment.ts` | 🟡 | Both rails → `handleSuccessfulPayment`: order→confirmed, payment→completed, **`members.status='active'`** (`:57-60`), device auto-alloc, notifications. (Activation column is `members.status` enum — **not** a `subscription_tier`.) Complete code, nothing proves it runs. |
| Webhook **contract tests** | 🟢 | `webhookActivationContract.test.ts` (16) drives the REAL `handleSuccessfulPayment` — the function both webhooks call — against a recording Supabase double and asserts the writes: member set `active` filtered by id, order `confirmed`, payment `completed` under the right per-gateway column, device allocated with the `in_stock` guard, `awaiting_stock` written when none is free, and the member still activated when it is. Mutation-proven: removing the activation reddens 6, dropping its `id` filter reddens 3, removing the `in_stock` guard or the `awaiting_stock` write reddens 1 each. **Still owed:** `constructEvent` signature verification, and an end-to-end test-mode purchase (only a human can run that — `PENDING_FOR_LEE.md` §4.1). |
| **Webhook-ONLY invariant** (golden rule #4) | 🔴 | **Broken in 3 places:** (1) `src/components/admin/wizard/PaymentStep.tsx` — comment "Simulate payment", `setTimeout(2000)`, then inserts member `status:"active"` + subscription `active`/`registration_fee_paid:true` **client-side, no Stripe** (routed live at `/admin/members/new`). (2) `src/components/partner/ResidentialDashboard.tsx:92` — inserts active member directly. (3) `submit-registration` trusts client-supplied `testMode:true` (`index.ts:289`) → RPC activates member with no payment (`20260302120000_submit_registration_atomic.sql:474-488`), **without re-checking the server-side test-mode setting** — a public activation bypass. |

---

## 3. Auth / RLS

**Verdict: policy design is correctly restrictive where readable; the weakness is proof, not policy. Tenant isolation is UNVERIFIED — no isolation test exists (violates golden rule #2). AI hard-blocks ARE real in code.**

> Schema reality: **no `user_roles` table** and **no `subscription_tier` column** (CLAUDE.md's nouns don't match the DB). Roles live on `public.staff.role` (enum `app_role`). Findings mapped to real objects.

| Question | Class | Evidence |
|---|---|---|
| Role assignment client-writable? | 🟡 (secure by SQL, untested) | `staff` has only SELECT (`is_staff`) + `"Super admins can manage staff" FOR ALL USING(get_staff_role()= 'super_admin')` (`20260121143325:326-327`) — members/operators have **no write path**, cannot self-escalate. Bootstrap is service-role-only + self-disabling (proven by `bootstrapAdmin.test.ts`, 10 pass). **No test attempts an escalation and asserts denial.** |
| Member change own tier/plan? | 🟡 (secure by SQL, untested) | `subscription_tier` doesn't exist. `subscriptions`: member is **SELECT-only** (`:355`); only write is `"Staff can manage subscriptions" FOR ALL` (`:354`). No member write policy → client cannot change plan/status. No test asserts denial. |
| RLS enabled on every table? | ✅ (by migration grep) | ~112 `ENABLE ROW LEVEL SECURITY` vs ~112 `CREATE TABLE`; none missing. `20260228100000_fix_permissive_rls_policies.sql` closed 6 previously anon-open `USING(true)` policies. (Policy *correctness* still untested.) |
| Cross-tenant isolation tests? | ⬜ | **MISSING — the single biggest gap.** No test asserts member A can't read member B, family/partner scoping, etc. No pgTAP, no negative RLS assertion anywhere. Directly violates golden rule #2 & GOALS "RLS + isolation test on every new table." |
| Clara/Isabella dangerous tools unreachable in code? | ✅ | The named tools (`update_user_role`, `manage_alert`, `admit_resident`, `discharge_resident`, `toggle_user_status`) **appear nowhere** (0 grep hits). `ai-execute-action/index.ts:79-333` is a **closed switch allowlist** of 9 non-destructive actions; `default` throws. `"escalate"` only flips a *conversation*, never touches `alerts`. Proven by `isabellaGate.test.ts` (36) + `verificationGate.test.ts`. |
| Clara "queries as the user" (rule #5)? | 🔴 (deviation) | `ai-execute-action` uses `SUPABASE_SERVICE_ROLE_KEY` (`:16-18`) and relies on an `approved` gate, i.e. it does **not** query as the user. Non-conforming to golden rule #5. |

---

## 4. Feature inventory by domain (classification)

### ✅ VERIFIED WORKING (a passing test proves the named behaviour)
- **Pricing math + server-authoritative total** — `pricing*.test.ts`, `pricingSource.test.ts`.
- **Registration payload** (medical + emergency contacts reach `submit-registration`) — `registrationPayload.test.ts`.
- **Product-interest lead capture** — `productInterest.test.ts`.
- **Device ingress auth (HMAC/api-key)** — `ev07bAuth.test.ts`, `hmac.test.ts`.
- **Isabella gate** (never-gate safety/legal, fail-open, escalate carve-out, trigger→key) — `isabellaGate.test.ts` (36).
- **Verification gate** (outbound never verifies ID, force-escalate after 2 fails) — `verificationGate.test.ts`.
- **First-admin bootstrap guard** (self-disable, fail-closed) — `bootstrapAdmin.test.ts` (10).
- **Route protection** (requireStaff/Admin/Member redirects, admin bypass) — `auth.test.tsx`; in-portal links — `portalPath.test.ts`.
- **Subscription admin actions** (cancel/pause/resume; Stripe drives, Mollie 501) — `billingActions.test.ts`.
- **Cross-cutting utils** — `sanitize.test.ts`, `validation.test.ts`, `sentry.test.ts`, `error-boundary.test.tsx`, `rateLimiter.test.ts`.

### 🔴 BROKEN
- ~~**SOS auto-escalation & shift-monitor** — real code, no cron → never fire automatically~~ **→ RESOLVED (§1):** both scheduled via pg_cron at spec cadence; escalation proven by `sosEscalation.e2e.test.ts`. Also fixed the UTC-vs-Madrid timezone divergence between the two runners (both now use `_shared/shift-time.ts`, DST-correct, proven by `shiftTime.test.ts`). **Behind the human gate — pending Lee's review of the escalation path.**
- **Webhook-only activation** — 3 client-side activation paths (§2).
- **Lint gate** — 345 errors + 62 warnings (§0).
- **`crmEvents.test.ts`** — fails to load (`supabaseUrl required`); referral attribution therefore unproven.
- ~~**AI on Lovable gateway, not Anthropic**~~ **→ RESOLVED for Isabella core (2026-07-24, #52):** `ai-run` runs on the Anthropic API, runtime-verified. Only the archive-candidate growth functions (outreach-*, media-*, …) still reference the gateway (see §6).

### 🟡 UNVERIFIED (code exists; nothing proves it)
- **SOS end-to-end** (device→alert→realtime→operator) and **<1s latency** (§1).
- **Payment activation loop**, both rails (§2).
- **Tenant isolation** for member/family/partner (§3).
- **Member/client dashboard** pages (`/dashboard/*`), **member self-update** fns — no UI/route test.
- **Most Admin pages** (analytics, finance, reports, sla, feedback, audit-log, rota, orders, devices, tickets, messages, notifications) — no tests.
- **Staff/call-centre** shift-monitor, courtesy-calls, invite lifecycle — no tests.
- **Partner portal** (9 routes) + **commission calculation** (`process-commissions`) — no tests (referral test currently broken).
- **Comms/telephony** (all `twilio-*`, `send-email`, inbound webhook) — no dedicated test.
- **Marketing/blog/help** pages — no tests.
- **AI `ai-run` "queries as user"** — untested (and see §3 deviation).

### ⬜ MISSING (expected by plan/CLAUDE.md, not present)
- **Monorepo** (`apps/platform`, `apps/hub`, `packages/{ui,database,ai,config}`, `services/ingestion`) — none exist (see RECONCILE.md).
- **"Clara" assistant on Anthropic** (plan WP7) — the assistant is Isabella on the Lovable gateway.
- ~~**E2E harness** (Playwright/Cypress)~~ **→ EXISTS** since 2026-07-22 (`playwright.config.ts`, `Page Audit` workflow, `e2e/public.spec.ts`), extended 2026-08-11 with the first authenticated journey (`e2e/partnerJourney.spec.ts`, Supabase HTTP stubbed — see the correction in §2). **The two mandated E2E paths are still owed:** checkout→activation and SOS→operator.
- ~~**RLS isolation test suite** (golden rule #2, plan §13)~~ **→ EXISTS 2026-08-13.** `scripts/rls/` + the `RLS Isolation` CI job: real PostgreSQL, the real migration set (134 of 139 applied; the 5 skipped are pg_cron/pg_net scheduling with zero policies), 28 checks. Proven able to fail by mutation — adding one `USING (true)` policy to `members` turns it red.
- **Webhook contract tests** (plan §13).
- **Tool-permission tests** for the 6 hard-blocked tools (they're absent by construction, not asserted by a test).
- **One clean migration set** — reality is 126 accreted migrations (plan §5 wanted "not 83 accreted ones").

---

## 5. Golden-rule / GOALS scorecard (summary)

| Rule | State |
|---|---|
| #1 One Supabase project | ✅ holds |
| #2 RLS + isolation test on every table | 🔴 RLS on; **isolation test MISSING** |
| #3 No client-writable roles/tiers | 🟡 roles/tier not client-writable by policy (untested); tier column doesn't exist |
| #4 Payments activate via webhook only | 🔴 **3 client-side activation paths** |
| #5 Clara queries as the user | 🔴 AI executor uses service role |
| #6 Clara hard-blocked tools unreachable in code | ✅ holds (closed allowlist; tools absent) |
| #7 Clara red-lines (no medical advice, never resolve SOS) | 🟡 escalate can't touch alerts (good); red-lines not test-proven |
| #8 SOS never mocked + always E2E-tested | 🟡 not mocked ✅; **escalation E2E now exists** (`sosEscalation.e2e.test.ts`) ✅; inbound <1s latency still unmeasured 🔴 |
| #9 No secrets in git | ✅ holds (secrets in env/`system_settings`) |
| #10 No new tests skipped / zero-test code | 🔴 vast UNVERIFIED surface; 1 failing suite |
| Bar: typecheck 0 | ✅ | Bar: lint 0 | 🔴 | Bar: proven-not-claimed | 🔴 |

**Bottom line:** the app **builds and type-checks**, and a focused set of safety/gate/pricing/auth-logic units is genuinely proven. But the two paths that *must not break* — **SOS→operator** and **checkout→activation** — have **no end-to-end proof**, tenant **isolation is untested**, and there are **concrete BROKEN items** (unscheduled escalation cron, three webhook-only bypasses, AI on the forbidden Lovable gateway, a failing test suite, a failing lint gate). Treat SOS and Payments as **not production-safe** until their E2E/contract/isolation tests exist and the BROKEN items are fixed under the human gate.

*See `RECONCILE.md` for the Isabella/Clara decision, the scope-creep keep/archive list, and the full plan-vs-reality divergences.*

---

## 6. Next — tracked follow-ups (from the 2026-06-18 governance reconcile)

> Lee's three decisions are applied: **AI = Isabella** (not Clara) · **stay single-app** (monorepo
> target abandoned) · **archive the growth tooling** (YouTube/Facebook/outreach/content/video).
> **Partner/commission portal REVERSED to KEEP/LIVE 2026-07-22 (LAUNCH_SCOPE.md §4)** — it is in
> scope from day one, with **manual commission payouts** for launch. These follow-ups fall out of
> those decisions. **None were done in the docs-only reconcile loop.**

### AI / Isabella
- **Canonical spelling = `Isabella`.** Code is inconsistent — fix `Isabel` → `Isabella` in
  `supabase/functions/ai-run/index.ts:28` (chat system prompt) and
  `src/components/admin/settings/VoiceSettingsSection.tsx:37-38` (voice greeting). Voice handler
  (`isabella-voice-handler:93-94`) already says "Isabella". *(Code change — not this loop.)*
- ✅ **Isabella core → Anthropic API: DONE, RUNTIME-VERIFIED (2026-07-24).** Merged (#52,
  Lee's sign-off), `ANTHROPIC_API_KEY` set on prod, `ai-run` deployed — **Lee confirmed the
  public chat widget answers on the new transport.** The known streaming follow-up is
  now built: **PR #55 (open)** restores SSE streaming — `isabellaStream()` in
  `_shared/anthropic.ts` (SDK `messages.stream`), an opt-in `context.stream === true`
  branch in ai-run's chat path emitting `data: {delta}` / `{done, response}` / `{error:
  "stream_failed"}` frames (non-streaming JSON stays the default for voice/agent and
  non-opted callers), and incremental rendering in the widget via
  `src/lib/isabellaChatStream.ts` + `useAIChat` (falls back to the plain invoke path if
  the stream fails before the first delta; keeps the partial if it drops mid-stream —
  never double-answers). Tool allowlist + isabella-gate + verification-gate untouched;
  `isabellaStreaming.test.ts` (11) + the 13 migration contracts prove it. **Live once
  merged + `ai-run` redeployed** (deploy-lag lesson below applies). Also fixed: the chat
  prompt introduced her as "Isabel" — canonical spelling **Isabella** (2026-06-18 decision)
  now applied in `ai-run` + the voice greeting defaults.
  **Operational lesson (2026-07-24, agreed with Lee):** Prompt text lives inside edge
  functions — a merged prompt change is invisible until `ai-run` is redeployed. The
  2026-07-24 "Isabel" confusion was deploy lag, not a missed occurrence; fixed live after
  merge + redeploy, grep confirms zero bare "Isabel" in the repo. `ai-run`'s three gateway
  calls (chat widget / voice / agent) now go through `_shared/anthropic.ts` — official SDK,
  `claude-opus-4-8` default with `ISABELLA_MODEL` env override, no Lovable dependency
  (`isabellaAnthropic.test.ts`, 13 tests: zero-gateway invariant, single-transport path,
  safety surface byte-identical). **Live once merged + `ANTHROPIC_API_KEY` secret set +
  `ai-run` redeployed.** Root cause of the 2026-07-24 chat outage was the unset
  `LOVABLE_API_KEY` — the migration removes that failure mode. Still owed: rule #5
  (Isabella must "query as the user", not the service role).
- **Lovable-debris containment (2026-07-24, goal item 2).** Audit of all 13 remaining
  Lovable-referencing functions delivered (report in session). Executed so far:
  **PR #61** — dead `shelter-span.lovable.app` fallbacks fixed in `partner-register` +
  `send-member-update-request` (→ `icealarm.es`), `*.lovable.app` CORS origin patterns
  dropped from `_shared/cors.ts`, zero-invoker `outreach-followup-runner` deleted;
  **PR #62 (stacked, AUTH-CRITICAL — review carefully)** — `auth-email-hook` rewritten from
  `@lovable.dev/email-js`+`webhooks-js` onto the standard Supabase send-email hook
  (standardwebhooks + `SEND_EMAIL_HOOK_SECRET`) sending via the shared Gmail SMTP module;
  same templates, cutover steps in the PR. `lovableDebris.test.ts` pins the exact remaining
  Lovable surface: the **9 gateway growth fns** (facebook-publish, generate-ai-image,
  generate-slot-content, media-draft, outreach-enrich-lead, outreach-generate-drafts,
  outreach-topic-insights, rate-outreach-leads, repurpose-content) — recommendation
  ARCHIVE all (admin-only, none cron-scheduled); **awaiting Lee's archive/keep call**
  since the label-only deferral below was his recorded decision.

### Scope — archive candidates (EXECUTED for growth fns 2026-07-24; rest still label-only)
- ✅ **Growth-fn archive EXECUTED (PR, draft pending Lee's visual approval):** the 9
  Lovable-gateway growth fns (facebook-publish, generate-ai-image, generate-slot-content,
  media-draft, outreach-enrich-lead, outreach-generate-drafts, outreach-topic-insights,
  rate-outreach-leads, repurpose-content) + their orchestrator `outreach-pipeline-runner`
  moved to `archive/supabase-functions/` with their UI entry points removed
  (MediaManager AI-draft/AI-image/publish flows; AIOutreach rate/enrich/draft/pipeline
  controls). DB-CRUD features on both pages survive (drafts, approve, metrics, partner
  distribution, strategy CRUD, lead qualify/import, CRM/campaigns/inbox, send-email).
  Boundary pinned by `archivedFunctions.test.ts` (5); Lovable pin in
  `lovableDebris.test.ts` shrinks to `auth-email-hook` (its migration = PR #62/#64).
  Reinstating any fn = `git mv` back + migrate its gateway call to `_shared/anthropic.ts`.
  Follow-up: MediaHelpDialog/OutreachHelpDialog copy still describes the archived AI
  workflows (3-locale help-text revision once Lee confirms the archive is final);
  deployed prod instances are inert but should be deleted at next housekeeping.
- Still label-only (no code moved/deleted): **YouTube**, **video-render**.
- **Partner/commission portal — KEEP / LIVE AT LAUNCH** (~~archive candidate 2026-06-18~~ **reversed
  2026-07-22, LAUNCH_SCOPE.md §4**): live from day one, **manual commission payouts** for launch
  (admin "Mark Paid" + hand-done transfer); automated payouts are phase 2. Verify the commission
  flow end to end (referral → click → attribution → signup → payment → commission → release →
  approve → Mark Paid) before launch.
- **Migration-shrink bonus:** archiving the above removes **most of the 11 non-core functions** on the
  Lovable gateway, reducing the Anthropic migration to **Isabella core** (`ai-run`,
  `ai-execute-action`, `ai-dispatch-events`, `isabella-voice-handler`).

### Critical-path gaps (the real WP targets — see plan §12 reframe)
- **SOS:** ✅ **DONE (pending human gate):** `sos-escalation-runner` + `staff-shift-monitor` scheduled
  via pg_cron at spec cadence (`20260716120000_sos_escalation_cron.sql`); escalation proven by
  `sosEscalation.e2e.test.ts`; UTC/Madrid tz divergence fixed. ⬜ **Still owed:** an **inbound <1s
  latency** probe (the E2E keeps that assertion skipped with a TODO — see §1).
- **Payments:** add webhook contract + checkout→activation E2E; **close the 3 client-side activation
  bypasses** (`PaymentStep.tsx`, `ResidentialDashboard.tsx`, `submit-registration` `testMode`).
- **Auth/RLS:** add the **tenant-isolation test suite** (negative assertions) — golden rule #2.
- **Lint gate:** 345 errors + 62 warnings → 0 (GOALS bar).
- **Failing suite:** fix `src/test/crmEvents.test.ts` (`supabaseUrl required`) so referral logic is proven.
