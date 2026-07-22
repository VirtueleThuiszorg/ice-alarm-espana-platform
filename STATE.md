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

| # | Item | Status | Finding |
|---|---|---|---|
| 1 | Linked project ref = `crpsuhoixfdhjugprbuc` | ⛔ BLOCKED | Repo is **not linked** to any project — `supabase/.temp/project-ref` is absent and `supabase/config.toml` has no `project_id`. Cannot confirm/assert the ref without CLI auth + `supabase link`. |
| 2 | Local vs remote migration diff (`supabase migration list`) | ⛔ BLOCKED | Needs an authenticated CLI against prod. Local set = **127** migrations (measured). Remote state unverified. |
| 3 | Deployed edge functions vs repo dirs | ⛔ BLOCKED (repo side ✅) | Repo has **91** function dirs excl `_shared` (measured). Remote deployed list needs auth to diff. |
| 4 | Postgres logs / advisor — ~694-errors/day spike root cause | ⛔ BLOCKED | Logs/advisor require dashboard or authenticated CLI access. Not reachable from this environment. |
| 5 | `.env.example` completeness vs `Deno.env.get` / `import.meta.env` | ✅ VERIFIED + FIXED | **Frontend** (`import.meta.env.VITE_*`): all 13 referenced keys already present — complete. **Edge functions** (`Deno.env.get`): 25 distinct keys referenced; `.env.example` documented **none** of the server secrets (only VITE_*). **Fixed:** added an "Edge Function secrets" section (SITE_URL, WEBHOOK_SECRET, Resend/Gmail, 9× Twilio, 3× EV07B, Google OAuth, RENDER_WORKER_URL, LOVABLE_API_KEY). Excluded by design: `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (runtime auto-injected) and Stripe/Mollie keys (stored in `system_settings`, entered via Admin → Settings, not env). |

**⛔ BLOCKED — what Lee must provide to finish Stage 0 (items 1–4):**
a **Supabase personal access token** exported as `SUPABASE_ACCESS_TOKEN` (or an interactive
`supabase login`) for an account with access to the **LifeLink Sync** org, then
`supabase link --project-ref crpsuhoixfdhjugprbuc`. With that, items 1–4 (migration diff,
function diff, and the Postgres error-spike root cause) can be run read-only. The Supabase CLI
itself is available in-environment (`npx supabase` 2.109.1); only auth is missing.

### ⚠️ Launch domain & email — NOT verified (2026-07-22)

The launch domain **`careconneqt.es` is not currently under Lee's ownership/control**. The
repo uses it in `public/robots.txt` (sitemap) and the `auth-email-hook` sender domain — left
as-is as the *intended* value, but **the value may change** once a domain is secured.
**Email sending from `@careconneqt.es` cannot be verified** (no SPF/DKIM/DMARC, no
Resend/Gmail domain verification) until domain control exists. **Development continues on the
`*.vercel.app` URL.** Tracked as a HARD launch blocker in `LAUNCH_CHECKLIST.md`.

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
| **Auto-escalation runner** (levels 2–5: staff→supervisor→admin→contact voice calls) | ✅ | **VERIFIED WORKING** by `src/test/sosEscalation.e2e.test.ts` (a pendant SOS with no ack reaches every human tier 2→5) + `src/test/escalationLoop.test.ts` (cadence). Now scheduled: `20260716120000_sos_escalation_cron.sql` runs a **per-minute pg_cron wake** that drives an internal sweep loop (`_shared/escalation-loop.ts`, `ESCALATION_TICK_MS=10s`, `MAX_RUNTIME=55s`) → **effective ~10s cadence** meeting the 15/30/45/60/90s ladder (HAZARD 1 resolved without relying on pg_cron sub-minute support). Runner writes a heartbeat + logs structured JSON + fires a LOUD `system.runner_failure` admin alert on any sweep/fatal error (GOALS G2). |
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
- **AI on Lovable gateway, not Anthropic** — violates CLAUDE.md "Do not reintroduce Lovable / AI runs on the Anthropic API" (see RECONCILE.md).

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
- 🔴 **HIGH PRIORITY — migrate Isabella off the Lovable gateway to the Anthropic API.** Golden-rule
  violation: `ai-run` POSTs to `https://ai.gateway.lovable.dev/v1/chat/completions`
  (`ai-run/index.ts:801,984,1165,1437`, model `google/gemini-3-flash-preview`). Owed **regardless of
  the name**. Also address rule #5 (Isabella must "query as the user", not the service role).

### Scope — archive candidates (DEFERRED, per RECONCILE.md §2 / plan §11)
- Label-only for now (no code moved/deleted): **YouTube**, **Facebook**, **AI outreach**,
  **content/media generation**, **video-render**.
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
