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

## Emergency-contact readiness (2026-09-04) — the second axis

> Design: `READINESS_MODEL.md` (PR #150). Increments: PR #151 (notify outcome), #152 (operator
> card), #153 (readiness view), #155 (paid-but-not-ready queue). Spec: PR #154.
> **NONE IS MERGED.** Everything below marked "fix open" is the broken behaviour on `main`
> today. Merge order: #154 before #152; #153 before #155.

| # | Item | Status | Evidence |
|---|---|---|---|
| R1 | `emergency-contact-notify` reports a member with **zero** emergency contacts as `{success: true, notified: 0}` at **HTTP 200** | 🔴 BROKEN on main · fix open in **#151** | `emergency-contact-notify/index.ts:73-78`. A caller checking `success` cannot tell "nobody to call" from "the whole chain was reached". Live. |
| R2 | The same branch swallows `contactsError`, so a **failed read** of `emergency_contacts` returns the byte-identical payload as an empty table | 🔴 BROKEN on main · fix open in **#151** | Same lines. Opposite facts, one response, on the highest-priority path. Not in the original brief. |
| R3 | Neither ingest caller reads the notify response at all | 🔴 BROKEN on main · fix open in **#151** | `ev07b-sos-alert/index.ts:197`, `ev07b-checkin/index.ts:221` — `await fetch(...)` then the `Response` is discarded. No `.json()`, no `.ok`. **Fixing R1 alone would change nothing observable.** |
| R4 | Level 5 of the escalation ladder is **silent** for a member with no contacts, then records the tier as *reached* | 🔴 BROKEN on main · fix open in **#151** | `_shared/escalation-outcome.ts:58,69` — zero contacts ⇒ `attempted=false` ⇒ `fireCallFailedAlert=false`. The comment's "the shift monitor covers it" is true for L2–L4 (staff) and false for L5 (next of kin — nothing watches those). |
| R5 | The operator card renders "no emergency contacts" as 12px grey-on-dark, buried below the fold | 🔴 BROKEN on main · fix open in **#152** | `SOSActionPanel.tsx:346`, `text-xs text-zinc-500` = **3.2:1** by the WCAG 2.1 formula, under the 4.5:1 floor. G3 unmet on the emergency path. |
| R6 | No completeness/readiness concept exists anywhere in the product | ⬜ MISSING on main · fix open in **#153** | `grep profile_complete\|monitoring_ready\|setup_complete\|onboarding_complete` returns nothing. A member is `active` or not. |
| R7 | Admin queue of paid-but-not-ready members | 🟡 BUILT, not on main · **PR #155** | `/admin/members/readiness-queue`: `active` but not monitoring-ready, oldest paid first, days waiting, `tel:` link per row, own sidebar entry. Reads the #153 view — never re-derives. **No automated chase** (email undeliverable; a silent chase failure looks like a member ignoring you). 12 harness assertions, 95 → 109 all PASS, mutation-proven. The earlier "NOT BUILT" entry is superseded. |
| R8 | Readiness view isolation | ✅ VERIFIED (in PR #153, not on main) | 18 assertions in `scripts/rls/isolation.sql`, 77 → 95, all PASS. Mutation-proven: `security_invoker = off` turns 7 red including cross-member reads. Rollback executed — view gone, 0 rows/policies/indexes lost. |
| R12 | The operator-card spec is in git, canonical and undated | 🟡 **PR #154** | `ICE_OPERATOR_CARD_SPEC.md` reconciles the Claude-project card design with this goal's emergency-contact state contract, retained **verbatim** as §5.1. Header: "Living document. Do not date the filename." The four `ICE_*_2026-09-02.md` files were Claude-project docs and have never been in git — reporting them absent was correct. Merge **before** PR #152, which no longer carries its own copy. |

### CI is a gate, and it is GREEN

| # | Item | Status | Evidence |
|---|---|---|---|
| R9 | The CI typecheck command checked **zero files** | ✅ FIXED on main | `cf2ae84`. `ci.yml` runs `npx tsc -p tsconfig.app.json --noEmit` **and** `-p tsconfig.node.json --noEmit`; guarded by `src/test/ciTypecheckGate.test.ts`. |
| R10 | ~~The 78 type errors are still there~~ | ✅ **FIXED on main — the earlier BROKEN entry is WITHDRAWN** | Cleared in `1dc74e7` (PR #142, `chore/typecheck-green`, "78 → 0"). On `dff29b7` **both** projects typecheck with **0 errors**, re-verified 2026-09-04. **Do not re-derive this as a blocker** — see "Retracted" below for why it was ever written. |
| R11 | ~~The RLS isolation harness cannot run on main~~ | ✅ **RUNS on main — the earlier BROKEN entry is WITHDRAWN** | `20260902120000_rebrand_ice_alarm_espana_content.sql` was fixed in `ee20053` (PR #137, `fix/rebrand-migration-jsonb`) and now looks column types up from `information_schema` instead of hard-coding `text`/`jsonb`. `scripts/rls/run.sh` on `dff29b7` with **no** local changes: **141 migrations applied, 0 failed, 77/77 checks PASS**. Golden rule 2's proof **is** executing. |

> **R10 and R11 must not be re-derived.** Both were entered as BROKEN on 2026-09-04 and both
> were false of `main`. They were measured against a **stale local `main` ref at `17960fc`**
> (PR #136, `feat/ice-rebrand`) — two days and eight merges behind `origin/main` at `dff29b7`.
> The figures (78 errors / 75 in `src/`; the `replace(jsonb, unknown, unknown)` migration
> failure) are entirely real **for `17960fc`**, which is why they reproduced repeatedly and
> matched the brief's numbers. A future session that measures `main` will find both green; if
> it finds 78 errors, it is on the wrong commit — run `git fetch --all` and check
> `git log --oneline origin/main -1` before concluding anything.

### Retracted

**The 2026-09-04 "main is red" entries are retracted.** An earlier revision of this section
claimed the opposite of what is now recorded in R10/R11: that `main` carried 78 type errors and
that the RLS harness could not run. Both claims came from a **stale local `main` ref at
`17960fc`** rather than `origin/main` at `dff29b7`.

The sequence is worth recording, because the second mistake was worse than the first:

1. The first measurement — taken on the checked-out branch, which *was* at `dff29b7` — reported
   **0 type errors** and a **clean 141/0 harness run**. Both were correct.
2. Subsequent measurements were taken after `git checkout -b <new> main`, which resolved to the
   stale `17960fc`. They reported 78 errors and a failing rebrand migration. Both are true of
   `17960fc` and false of `main`.
3. On the strength of step 2 I **retracted the correct step-1 finding**, wrote "main IS red"
   into `READINESS_MODEL.md` §1-F, and added a false merge blocker to four PR descriptions.

Two tells were in my own output and both were missed: `git log --oneline main..HEAD` listed
`1dc74e7` (the typecheck-green merge) among commits *not in `main`*, which I read as "the branch
equals main"; and I borrowed the jsonb migration fix from `fix/rebrand-migration-jsonb` without
asking why a branch I needed to borrow from had already merged as PR #137.

**The lesson for the next session is procedural, not factual:** `git fetch --all` before
measuring, and never treat a local `main` as authoritative without checking it against
`origin/main`. Recorded rather than edited away (G5).

### Not asserted

- No browser click-through of the operator card was performed. R5's fix is proven by a
  **rendering** test (12 assertions, both absences mutation-proven), not by a human looking at
  a live SOS.
- R1–R4's fixes are proven by unit and source-level tests. **No end-to-end SOS drill was run
  against a real device or a real Twilio call**, so the latency target and the live delivery
  path are unchanged and unverified by this work.
- Nothing above is on `main`. Five PRs are open; three of the four increments carry the
  mandatory human gate (SOS path ×2, RLS ×1). #154 (spec) and #155 (queue) do not.
- The queue's preventive value is **unproven in use**: no operator has worked it, and no
  member has been phoned off the back of it. It is proven to list the right people and to
  refuse to lie about a failed read; that it actually gets worked is a human fact, not a test.

## Partner journey (2026-08-11) — traced end to end

> Full reasoning, both signup paths and the open decision: **`PARTNER_JOURNEY.md`**.
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
| P6 | The nav reaches `/partner` → `partner-apply`, never `/partner/join` | 🔴 BROKEN — **DECIDED 2026-08-11: Option C** (admin conversion of applications), `/partner/join` kept reachable. Not yet implemented. | `PARTNER_JOURNEY.md` §3. **The zero-invocation count was NOT caused by this**: `partner-apply` read zero too, both from the placeholder `VITE_SUPABASE_URL`. The nav split is a real gap; it was not the cause of the zero. |

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
| P8 | "No partner account found for this email" — the lookup is by `user_id`, not email | Every `partner-apply` row has no `user_id`, so this is exactly what an application-path partner sees. Wording fix is trivial; the underlying cause is P6. |
| P9 | `preferred_language` is `en`/`es` only — CHECK constraint, server enum and form all agree | Consistent, so parity holds, but Dutch is consistently **rejected**, against LAUNCH_SCOPE §6. Needs a migration + scope decision; not bundled into a parity PR. |
| P10 | `/partner-dashboard` is hard-blocked on first arrival by `AgreementRequiredModal` (`open={true}`, non-dismissible) | Intended, but the first-run experience has never been click-tested. |
| P11 | Verification email runs on interim Gmail SMTP | Already a `LAUNCH_CHECKLIST.md` hard blocker. A silent delivery failure is indistinguishable from a partner who never bothered. |
| P12 | `partner-apply` writes no `user_id` and issues no verification token | This IS P6. An application is a lead and terminal without admin action. |

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
  path itself is currently reaching the backend has not been confirmed.

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
| Webhook **contract tests** | ⬜ | None. No test imports `handleSuccessfulPayment`/`constructEvent`/either webhook. `billingActions.test.ts` covers only cancel/pause/resume. **Zero tests assert a webhook activates a member.** |
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
