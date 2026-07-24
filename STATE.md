# STATE.md — the honest state of Care Conneqt

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
  `favicon.ico` is the Care Conneqt "v" mark (`sha256 d8e3315f…`, 5687 B). `main`'s
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

The launch domain **`careconneqt.es` is owned by a known partner**. Attaching it to Vercel +
DNS + email verification (SPF/DKIM/DMARC, Resend/Gmail domain verification) is a **final,
coordinated go-live step** done with the partner at cutover — not before. The repo uses it in
`public/robots.txt` (sitemap) and the `auth-email-hook` sender domain as the *intended* value;
until cutover **email sending from `@careconneqt.es` remains unverified** and **development
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
- **E2E harness** (Playwright/Cypress) + the two mandated E2E paths (checkout→activation, SOS→operator).
- **RLS isolation test suite** (golden rule #2, plan §13).
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
  `send-member-update-request` (→ `careconneqt.es`), `*.lovable.app` CORS origin patterns
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
