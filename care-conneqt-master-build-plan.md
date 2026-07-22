# Care Conneqt — Master Build Plan (v1)

**For:** VirtueleThuiszorg — new Spain launch
**Build tool:** Claude Code in VS Code
**Principle:** everything on the critical path is launch-blocking. No MVP cuts. Sequence is for *build efficiency*, not partial shipping.
**Status:** ready to build, with a small set of open decisions flagged in §3.

---

## 0. How to use this document with Claude Code

- This is the source of truth. `CLAUDE.md` (separate file) holds the non-negotiable rules CC must never break.
- Work is broken into **work packages (WP0–WP9)** in §12. Point CC at **one WP at a time**. Each has a goal, dependencies, and a definition of done.
- Do not let CC start a WP whose dependencies aren't green. WP0 first, always.
- Every WP ends with tests passing and the quality gates in §13 green — no exceptions, because everything ships at launch.

---

## 1. What we're building

A focused direct-to-consumer connected-care business in Spain, selling four products with a recurring monitoring subscription behind each. The customer journey is one clean funnel: **choose device → choose care level → add extras → pay → activated → live.**

**The four products** (real devices confirmed from existing seeds):

1. **SOS pendant / watch** — Vivago watch + Vivago Domi hub, one-touch alert, the market entry product.
2. **Glucose monitor** — connected CGM, readings flowing to the platform.
3. **Medication dispenser** — Dosell automated dispenser, missed-dose alerts.
4. **Family health pack** — connected scales, thermometer, BP cuff, etc. — the "complete home" bundle.

**Everything in-house already exists to run this** (staff, alarm centre, nursing). This build is the platform that turns that operation into a clean consumer product.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Renovate vs rebuild | **Evolved the existing app** (rebranded ICE/Lovable base) — *not* the greenfield rebuild originally planned. Reconciled to reality 2026-06-18. |
| Repo | **Single Vite SPA, npm** (not a monorepo); existing git history retained. |
| Backend | **One Supabase project** (`crpsuhoixfdhjugprbuc` — care-conneqt-prod, LifeLink Sync org, Pro; LOCKED 2026-07-22 per LAUNCH_SCOPE.md §0). One identity plane, one data plane. *The planned migration to `cfwnrcogikjycjcobsay` is **CANCELLED**.* |
| Surfaces | **One app, route-group separation:** client (`src/pages/{client,join}` + marketing) vs staff/admin (`src/pages/{admin,call-centre,staff,partner}`). |
| HR / workforce | **Consolidated into the one backend**, walled by role (not a separate DB). |
| Payments | **Stripe + Mollie** — Products/Prices, subscriptions, SEPA + cards, Customer Portal, webhook-driven. |
| AI | **One assistant (Isabella)**, role-aware. Target runtime = **Anthropic API**; *currently on the Lovable gateway — migration owed (see STATE.md)*. Five personas collapse into one. No agent-to-agent handoffs. |
| Lovable | **Fully removed** — tagger, `.lovable/`, generated READMEs, committed `.env`, Lovable AI gateway. |
| Launch scope | **Full function at go-live.** No phased/partial launch. |

---

## 3. Assumptions & still-open decisions (resolve early — they unblock WPs)

These have sensible defaults baked in so building can start. Confirm or correct:

1. **AI name = "Isabella"** (kept from existing code). *Confirmed by Lee 2026-06-18.* (Code spelling is inconsistent — "Isabel" in some files; canonical = **Isabella**, fix tracked in STATE.md.)
2. **Tier model** — three tiers, one household subscription, stackable devices:
   - **Conneqt** (base): device + app + family alerts, no professional monitoring.
   - **Conneqt Care**: + 24/7 alarm-centre response + nurse review of anomalies.
   - **Conneqt Complete**: + all devices on one dashboard + scheduled nurse check-ins.
   Pricing = device fee (one-off or spread over 12mo) + monthly tier fee. *Default assumed; existing seeds used `base`/`independent` + à-la-carte services — needs your final call.*
3. **Device vendor APIs** — Vivago and Dosell confirmed as hardware. **We need the integration specs** (webhook? REST pull? gateway?) for each before WP4 can be fully scoped. This is the biggest external unknown.
4. **Is the current system live with real users/data?** Sets whether the old repos need emergency patching during transition. *Assumed: demo-only → no emergency patch needed.*
5. **ICE integration in scope for Spain?** It's a Dutch ECD. *Assumed: shelved for launch; salvageable later.*
6. **Languages at launch** — EN / ES / NL all three (expat market on the costas). *Assumed yes.*

---

## 4. Architecture

> **Reconciled 2026-06-18 — this is the REAL architecture.** The monorepo (`apps/platform` +
> `apps/hub` + `packages/*` + `services/ingestion`) described in earlier drafts was **never built**;
> the app is a single SPA. That target has been **abandoned** (Decision 3, single-app).

```
care-conneqt-platform/   (single Vite SPA, npm — one repo, not a workspace)
├─ src/
│  ├─ pages/             route groups = the two "surfaces":
│  │   ├─ {client, join} + marketing pages   → client surface ("platform")
│  │   └─ {admin, call-centre, staff, partner} → staff/admin surface ("hub")
│  ├─ components/        shadcn/ui + app components (incl. components/ui) — one design system, in-repo
│  ├─ hooks/ lib/ config/ integrations/   shared modules (no packages/*)
│  └─ test/              Vitest unit tests
├─ supabase/
│  ├─ migrations/        one Supabase project (Postgres, Auth, RLS, generated types)
│  └─ functions/         edge functions incl. device ingestion (ev07b-*) + SOS + payments
├─ gps-gateway/          standalone Node GT06 bridge (EV-07B pendant ingress)
└─ render-worker/        standalone video-render worker (scope-creep — see §11)
```

**Stack:** single **Vite + React 18 + TypeScript** SPA (**npm**, not pnpm/Turborepo, not a monorepo) + Tailwind + shadcn/ui (`src/components/ui`) + Supabase (Postgres, Auth, Edge Functions, Realtime) + Stripe + Mollie. AI = Isabella, **currently on the Lovable gateway (Anthropic migration owed — STATE.md)**. Deploy on Vercel.

**Non-negotiable architectural rules** (enforced in `CLAUDE.md`):
- One Supabase project. No second database.
- All secrets in env / Supabase secrets. Nothing in git. `.env.example` only.
- Row-Level Security on every table. Isabella queries **as the user** — never with the service role for user-facing reads.

---

## 5. Data model

> **Reconciled 2026-06-18.** The "one clean migration set" was **not** achieved — reality is
> ~126 accreted migrations carried forward from the old schema. The domains below describe the
> intended model; where the shipped schema differs (esp. identity/roles), the reality is called out.

Carry forward the domain *thinking* from the old schema. Core domains (intended):

- **Identity & roles (REALITY):** roles live on **`staff.role`** (enum **`app_role`**: `super_admin` / `admin` / `call_centre_supervisor` / `call_centre`), read via **`get_staff_role()`** / **`is_admin()`** / **`is_staff()`** security-definer functions. **There is no `user_roles` table, no `profiles`, no `has_role()`** as the plan originally named them.
- **Care:** `members`, `member_devices`, `health_metrics`, `alerts`, `clinical_notes`, `appointments`, `nurse_assignments`.
- **Family:** `family_carers`, `member_carers`, `family_invitations` (consent-scoped).
- **Commerce:** `products`, `pricing_plans`, `subscriptions`, `subscription_items`, `orders`, Stripe mirror tables.
- **Finance:** `invoices`, `transactions`, `credits` (Stripe is source of truth; these mirror).
- **Ops / hub:** `clients`, `shifts`, `tasks`, `tickets`, `emergency_calls`, `intake_forms`, `alarms`.
- **HR / workforce:** `staff`, `leave_requests`, `payslips`, `hr_documents` — consolidated, role-walled.
- **AI:** `ai_functions` (the tool registry, see §9), `ai_conversations`, `ai_messages`, `ai_knowledge_base`.

**Security requirements baked into the schema (these fix real audit findings — intent unchanged, mapped to the real objects):**
- **Role writes must not be client-controllable.** `staff` INSERT/UPDATE is restricted to `super_admin` (RLS `FOR ALL USING(get_staff_role()='super_admin')`); members/operators have no write path. Assigned by trigger/admin/bootstrap only. (Old bug: users could self-assign `admin`.) *Note: enforced by policy SQL but not yet proven by an isolation test — see STATE.md.*
- **Subscription plan/status must not be client-writable.** `subscriptions` is member-SELECT-only; writes are staff-only or via the payment webhook. There is **no `subscription_tier` column** (plan/status live in `subscriptions.status` / `plan_type` / `billing_frequency`); a member cannot change their own plan. (Old bug: free self-upgrade.)
- No plaintext credential storage. The password vault is **deleted** — use 1Password/Bitwarden.
- Every policy has a corresponding RLS test (see §13).

---

## 6. Products & pricing

Confirmed device/service catalogue exists in old seeds (Vivago watch/Domi, SOS pendant €19.99, glucose monitor, Dosell dispenser, family-dashboard, priority-emergency €14.99, medication-management-service). Re-model as:

- **4 device products**, each purchasable with a tier.
- **3 tiers** (§3.2), one household subscription, devices stackable onto it.
- **Add-ons** (priority response, extra family seats, medication management) as subscription items.
- All prices in EUR; VAT handled per Spanish rules. Model in **Stripe Products/Prices** as source of truth.

---

## 7. Payments (Stripe) — the loop must close

The old build created a checkout session but had **no webhook**, so payments never confirmed and nobody was ever activated. Rebuild the full loop:

- **Stripe Products/Prices** for 4 devices × 3 tiers + add-ons.
- **Checkout / Elements** in the funnel; **SEPA Direct Debit** + cards (SEPA is effectively mandatory for the Spanish senior market).
- **Webhook handler** (`stripe-webhook` edge function) is the *only* thing that activates a member: `checkout.session.completed` / `invoice.paid` → create subscription record → activate member → trigger device provisioning. One transaction.
- **Customer Portal** for self-service upgrades/cancellations.
- Success/cancel URLs point at the **platform app**, not Supabase. (Old bug: redirected to a JSON error page.)
- Finance/admin dashboards read Stripe-sourced data only.

---

## 8. Device ingestion — the product core

The old build had **zero** ingestion: `health_metrics` and `alerts` were read everywhere, written nowhere. This is the company; build it properly.

- `services/ingestion` exposes **one hardened endpoint per vendor** (Vivago, Dosell, CGM, family-pack BLE gateway).
- Each: authenticate the source → validate payload → normalize into `health_metrics` and/or `alerts`.
- **SOS path is safety-critical and realtime:** pendant press → validated `alerts` insert → Supabase Realtime channel → hub alarm screen in **< 1 second**. This path is never mocked and always tested end-to-end.
- Device provisioning/activation flow ties a physical device to a member (triggered by the Stripe activation in §7).
- Uptime checks + alerting on every ingestion endpoint (see §14). If a pendant webhook fails at 3am, we know before the family does.

---

## 9. Isabella — one AI, consolidated

One assistant. Behaviour changes by **who** (role, from auth) and **where** (page). Data access is by RLS — Isabella queries as the user, so she physically cannot read what the user can't. Runs on the Anthropic API.

### 9.1 Tool registry (consolidate the old 36-tool set; keep `ai_functions` table + admin toggle UI)

Each tool row carries: `name`, `parameters` (JSON schema), `is_enabled`, `requires_confirmation`, **`allowed_roles`** (NEW — replaces per-persona scoping), and `risk_tier`. Tiers:

| Tier | Tools | Rule |
|---|---|---|
| **Read (safe)** | all `get_*`, `lookup_user`, `get_analytics`, `get_revenue_stats`, `get_subscription_details` | Enabled; RLS limits rows to the user's scope. |
| **Client-soft** | capture_lead, create_checkout, request_demo, schedule_appointment, send_message | Reversible; confirmation on checkout. |
| **Ops-write** | create/update task, reminder, member, ticket_status, update_lead, assign_nurse_to_member, reassign_member | Staff roles only; `requires_confirmation = true`. |
| **Money** | issue_credit, process_refund | Finance/admin only; confirmation **always**; written to audit log. |
| **HUMAN-ONLY — Isabella may read, never execute** | update_user_role, manage_alert (escalate/resolve), admit_resident, discharge_resident, toggle_user_status | **Not in Isabella's callable set at all.** Enforced in code, not prompt. |

**Fixes baked in** (from the audit of the old function set):
- `update_user_role` is removed from Isabella entirely (privilege-escalation vector).
- `manage_alert` loses `escalate`/`resolve` for Isabella — she can read an alert and draft a note; a human decides. (Never dismiss an SOS.)
- `requires_confirmation` defaults **true** for all write/money tools (old seeds defaulted false — backwards).
- `handoff_to_agent` deleted (one agent, no handoffs).

### 9.2 Red-lines (hard-coded, identical in every context)

Built on the existing "never diagnose / escalate-on-symptom" seed, completed:
- Never give medical advice or a diagnosis.
- Never triage, dismiss, or resolve an SOS/alert.
- Never invent or alter a health reading.
- Always escalate uncertainty to a human.
- Keep the symptom-keyword escalation detector (`emergency|urgent|serious|pain|fever|breathing|…`).

### 9.3 Contexts (recap)
Clients: **Visitor** (sales guide) · **Member** (companion) · **Family** (reassure/explain).
Staff: **Nurse** (summarize/draft) · **Alarm operator** (retrieve profile + log call) · **Admin/HR** (ops copilot).

---

## 10. Security & auth

- RLS on every table; `has_role()` pattern kept.
- Role assignment: trigger-only for the default member role; all elevated roles via admin UI. **No client-writable roles or tiers.**
- Security headers (CSP, HSTS, X-Frame-Options) configured in Vercel from day one.
- Dependency policy: no known-critical CVEs at launch. Replace/patch `jspdf`, `xlsx` if retained; audit in CI.
- All secrets in Supabase secrets / env. Rotate anything ever exposed in the old repos (incl. the anon JWT hardcoded in an old cron migration).
- Every RLS policy has a test proving isolation.

---

## 11. Salvage / delete map

**Salvage (port deliberately from old repos):** domain model design · Twilio emergency-call handler (signature verification) · WhatsApp (Meta Graph) · Slack · Resend email (verify a domain) · Jitsi video · EN/ES/NL translation content · `has_role()` RLS pattern · the `ai_functions` registry concept + admin toggle UI · product/tier catalogue.

**Delete (do not rebuild):** password vault · per-employee import functions (`import-mary`, `-albert`, etc. → one generic rota importer) · 4 of 5 AI personas · Conneqtivity 6-sub-brand architecture · B2B insurance/care-company/facility modules (defer) · all Lovable artifacts · hardcoded-JWT cron migration (rewrite with a secret).

**Deferred — ARCHIVE CANDIDATES (labelled 2026-06-18 per RECONCILE.md §2; Lee decision. Inventory + label only — no code moved or deleted in the reconcile loop):**
- **YouTube** integration (`youtube-*` fns + VideoHubPage)
- **Facebook** integration (`facebook-*` fns + BlogManager/MediaManager surfaces)
- **AI outreach** (`outreach-*` + `rate-outreach-leads` fns + AIOutreachPage)
- **Content/media generation** (`generate-content-plan`, `generate-slot-content`, `media-draft`, `repurpose-content`, `publish-scheduled`, `generate-ai-image` + MediaManagerPage/BlogManagerPage)
- **Video render** (`video-render-*` fns + `render-worker/` service + VideoHubPage)
- **Partner / commission portal** — **KEEP / LIVE AT LAUNCH** (~~ARCHIVE CANDIDATE 2026-06-18~~ **REVERSED 2026-07-22 per LAUNCH_SCOPE.md §4**): the whole `/partner/*` portal (9 routes), `partner-*` fns, CommissionsPage/PartnersQAPage/PartnerPricingSettingsPage, and `process-commissions` are **in scope from day one** — we recruit partners at launch. **Commission payouts are MANUAL for launch** (admin "Mark Paid" + hand-done bank transfer); automated payouts are phase 2. Ring-fence + test the commission flow end to end before launch.

> **Bonus:** archiving the growth tooling above removes **most of the 11 non-core functions** currently
> calling the Lovable gateway — shrinking the owed Anthropic migration down to **Isabella core**
> (`ai-run`, `ai-execute-action`, `ai-dispatch-events`, `isabella-voice-handler`).

---

## 12. Build sequence (work packages)

> **Reframed 2026-06-18 (single-app reality).** The original WPs assumed a greenfield monorepo built
> from zero. That build didn't happen that way — the app already exists (evolved from the ICE/Lovable
> base). So these are no longer "build from empty"; they are **work against THIS single-app repo,
> pointed at the real gaps `STATE.md` exposes** (verify what's UNVERIFIED, fix what's BROKEN, add the
> missing critical-path tests). "Done" still means proven by a test/click-through, not claimed.

| WP | Reframed goal (vs this repo) | Definition of done |
|---|---|---|
| **WP0 — Foundation** | **DONE-BY-EVOLUTION / N/A.** No monorepo to scaffold — single Vite SPA already deploys on Vercel against one Supabase project. *Residual:* lint gate is red (345 err/62 warn) and `.env.example` completeness — fold into WP8. | n/a (superseded) |
| **WP1 — Backend & auth (harden + PROVE)** | Schema exists (~126 migrations); roles trigger/admin-only by policy. **Gap: no RLS isolation tests.** Add the negative-assertion isolation suite. | Isolation tests prove member/family/partner cannot cross tenants; no client-writable role or plan (STATE.md §3 closed) |
| **WP2 — The funnel (CLOSE + PROVE)** | Both rails (Stripe/Mollie) wired to `_shared/post-payment.ts`. **Gaps: no webhook contract/E2E test; 3 client-side activation bypasses.** | E2E test: test-mode purchase activates a member via webhook ONLY; the 3 bypasses (PaymentStep, ResidentialDashboard, submit-registration `testMode`) closed (STATE.md §2) |
| **WP3 — Design system + rebrand** | Largely **DONE** — Care Conneqt tokens/logo/DM Sans live in `src/components` (one in-repo design system; no `packages/ui`). *Residual:* a11y (WCAG AA contrast + scalable fonts) pass. | a11y contrast + font-size pass on key flows |
| **WP4 — Device ingestion + SOS (PROVE + FIX)** | Real code end-to-end (`gps-gateway` → `ev07b-sos-alert` → `alerts` → realtime → operator). **Gaps: no SOS E2E test; <1s latency unmeasured; `sos-escalation-runner` + `staff-shift-monitor` have NO cron.** | E2E test: SOS reaches operator screen with **measured** <1s; escalation + shift-monitor scheduled (pg_cron) and proven to fire (STATE.md §1) |
| **WP5 — Client dashboards (VERIFY)** | Member/client dashboard pages exist; UNVERIFIED. | Live device data + alerts render; consent-scoped family access verified by test |
| **WP6 — Hub v2 (VERIFY)** | Call-centre/admin/shifts/tickets exist; mostly UNVERIFIED. Twilio/WhatsApp/Resend integrations present. | Operators run a shift end-to-end; HR role-walled; key flows tested |
| **WP7 — Isabella (MIGRATE + PROVE)** | Assistant is Isabella; gate + hard-block allowlist real and test-proven. **Gap: runs on the Lovable gateway, not Anthropic (golden-rule violation); "queries as user" not honoured (service role).** | Isabella migrated to the Anthropic API; queries-as-user; tool-permission tests prove human-only tools unreachable; red-lines verified (STATE.md Next) |
| **WP8 — Hardening** | **Lint gate green (0 warnings)**, critical-path coverage, a11y, GDPR/retention, runbooks, chunk-size. | Quality gates §13 all green |
| **WP9 — Launch** | Domain verification (Resend), Stripe/Mollie live keys, monitoring dashboards, go-live checklist §15. | Checklist green; on-call ready |

*Scope note: growth tooling (YouTube/Facebook/outreach/content/video — §11 archive candidates) is **out of the WP path** until Lee un-archives it. The **partner portal is NOT archived** — it is live at launch (LAUNCH_SCOPE.md §4).*

---

## 13. Testing & quality gates (every WP must pass its slice)

- **RLS tests** — prove data isolation for every role boundary. Non-negotiable.
- **Webhook contract tests** — Stripe events and each device-ingestion payload.
- **E2E tests** — the two paths that cannot break: **checkout→activation** and **SOS→operator**.
- **Tool-permission tests** — Isabella cannot call human-only tools; confirmation-gated tools require confirmation.
- Typecheck + lint + no known-critical CVEs, enforced in CI.
- Coverage focus is the critical path, not a vanity %.

*The old build had zero tests across ~100k lines in a life-safety domain. That does not repeat.*

---

## 14. Observability & ops

- Sentry (both apps + edge functions).
- Structured logs; no `console.log` of auth/PII in production.
- Uptime + latency alerting on every ingestion endpoint and the SOS path.
- Audit log for all money and admin actions (incl. any Isabella write).

---

## 15. Definition of done — launch checklist

- [ ] All WP0–WP9 definitions of done green.
- [ ] Checkout→activation works with live Stripe (SEPA + card).
- [ ] SOS→operator verified <1s in production, with alerting.
- [ ] All four device ingestions live and monitored.
- [ ] Isabella live, role-aware, EN/ES/NL, human-only tools unreachable, red-lines verified.
- [ ] RLS isolation tests green; no client-writable roles/tiers.
- [ ] No known-critical CVEs; security headers live; secrets rotated.
- [ ] HR/payroll role-walled; clients cannot see any staff/HR data.
- [ ] a11y pass (senior users); GDPR/data-retention documented.
- [ ] On-call + runbooks ready.

---

## 16. Professional standard (the bar every loop is held to)

"Loop at the highest professional standard" is enforced here as a concrete definition, not an adjective. Every `/goal` loop must satisfy **all** of the following before it is allowed to stop — this is appended to each WP's stop condition. Vague quality words ("clean", "good", "polished") are not acceptable stop criteria; these are.

**Definition of "professional-grade done":**
1. **Proven, not claimed.** No feature is "done" without a test or a real browser click-through that proves it. If it can't be proven, it isn't done.
2. **Typed & clean.** `typecheck` passes with zero errors; lint passes with zero warnings; no `any` on public boundaries; no dead or commented-out code left behind.
3. **Tested at the right level.** Critical paths (checkout→activation, SOS→operator, RLS isolation, Isabella tool-permissions) have E2E/contract tests. Coverage serves the critical path, not a vanity number.
4. **Secure by construction.** RLS on every new table with an isolation test; no secret in code; no client-writable roles or tiers; no known-critical CVE introduced.
5. **Small & reviewable.** One concern per branch, one PR per concern, with a clear description of what changed and why. No 2,000-line God commits.
6. **Documented honestly.** Each WP updates `STATE.md` with what is VERIFIED WORKING (and the test that proves it), what is next. No optimistic "100% complete" docs.
7. **Accessible.** Senior-facing UI meets WCAG AA contrast and scalable font-size; every interactive element is keyboard-reachable and labelled.
8. **Observable.** New endpoints/flows emit structured logs and are covered by monitoring; no `console.log` of auth/PII in production.
9. **Consistent.** Follows the existing patterns in `src/components` and the shared modules (`hooks`/`lib`/`config`/`integrations`) — no parallel/duplicate implementations of something that already exists.
10. **Reverts cleanly.** Every migration is reversible or has a documented rollback; nothing ships that can't be backed out.

If any item fails, the loop keeps working — it does not stop. Turn caps still apply to control cost; hitting a cap surfaces the blocker for a human rather than lowering the bar.

---

## 17. Looping strategy (how CC actually runs this)

We don't prompt CC step-by-step. We define **loops** — a goal with a deterministic stop condition — and let CC grind until the condition is met, with us as the human gate on anything safety-critical. Four loop types, used deliberately.

### 17.1 The one rule
**Success criteria must be deterministic.** "Make it good" lets the agent declare victory early and burn tokens on nothing. Every loop below stops on something provable: tests pass, build green, a Playwright click-through succeeds, an SOS reaches the operator screen. If a criterion is vague, tighten it before running. Cap turns on every goal.

### 17.2 Loop types
- **`/goal`** — goal loop. CC works until an evaluator confirms the stop condition. This is the workhorse for each WP.
- **`/loop <interval>`** — time loop. Recurring checks (PRs, CI) while you do other things. Runs on your machine.
- **`/schedule`** — cloud routine. Moves recurring work (nightly security audit, deploy-health check) off your machine.
- **Combine** — a `/goal` plus a `/loop` so CC cycles on an interval and self-terminates when the goal is hit.

### 17.3 Loop per work package
Each WP in §12 is run as a goal loop whose stop condition **is** its definition of done. Pattern:

```
/goal Execute WP<n> from care-conneqt-master-build-plan.md. Read CLAUDE.md first.
Stop only when its Definition of Done is met AND every item in §16 (professional
standard) holds: proven not claimed, zero type/lint errors, critical-path tests
green, RLS + isolation test on new tables, one concern per branch/PR, STATE.md
updated, a11y AA, observable, no secret in code. Work one concern per branch,
open a PR for each. Do not touch other WPs. Cap: <N> turns.
```

WP-specific hard gates (the deterministic bit that stops early victory):
- **WP1:** RLS isolation tests prove a family carer cannot read another family's data — that specific test must pass.
- **WP2:** a Playwright run completes a test-mode purchase and the member is activated **by the webhook** (not client code).
- **WP4:** a Playwright/harness run fires an SOS and the hub operator screen updates in **< 1 second** — measured, not asserted by CC.
- **WP7:** tool-permission tests prove Isabella **cannot** invoke any human-only tool.

### 17.4 The babysitter loop (run continuously alongside WP work)
```
/loop 10m check open PRs, address review comments, fix failing CI,
merge anything green and approved. Never merge changes to the SOS path,
Stripe activation, or RLS policies without flagging me first.
```

### 17.5 Business/maintenance loops (move to /schedule once code loops hum)
- Nightly dependency + security audit — **zero tolerance**, this is a health product. Fail the build on any new critical CVE.
- Morning deploy-health routine — check Vercel deploy status + runtime errors, file issues automatically.
- Weekly a11y + i18n coverage sweep — missing translation keys or contrast regressions filed as issues.
- Weekly SOS-path canary — synthetic SOS end-to-end, alert if latency > 1s or delivery fails.

### 17.6 The human gate (non-negotiable)
Loops implement, verify, and prepare. **You personally review, before merge:** the SOS/alert path, the Stripe activation flow, and any change to RLS policies or Isabella's tool permissions. Loops make you fast; they don't make you absent. If someone's grandmother depends on that callback firing, a human signs off on it.

---

## 18. Old-repo cleanup & extraction (one-time, before WP0)

Unlike a rescue job, our **new repo starts clean** — there is nothing to clean up in it. The cleanup is a one-time pass on the **two old repos** so they're safe, honest read-only reference and can't poison CC's context with stale "done" claims or leaked keys.

### 18.1 Why this matters
CC reads markdown and config as context. If the old repos contain optimistic status docs, committed `.env` files, or Lovable hooks, CC may believe things work that don't, or reconnect a dead toolchain. We neutralise that once.

### 18.2 Cleanup goal (run against each old repo, on a throwaway branch — never build on these)
```
/goal Prepare care-conneqt (and care-conneqt-hub) as READ-ONLY reference only.
Produce SALVAGE_INDEX.md listing exactly the assets we keep (per the plan §11)
with file paths: Twilio handler, WhatsApp/Slack/Resend/Jitsi integrations,
EN/ES/NL translations, has_role() pattern, ai_functions registry + admin UI,
product/tier seeds, domain-model migrations. Move all Lovable artifacts
(.lovable/, lovable-tagger, generated README) and any stale status/planning
docs into /docs/archive. Confirm no .env or secrets remain tracked; list any
found so they can be ROTATED. Do not delete history — this repo is frozen.
Stop when SALVAGE_INDEX.md is complete and no tracked secrets remain.
```

### 18.3 Security actions this surfaces (do immediately)
- Rotate the Supabase keys and the anon JWT that were committed to the old repos' history — public exposure means they must be treated as burned.
- Confirm no service-role key was ever committed (scan history, not just HEAD).
- These old keys never touch the new project; the new backend gets fresh secrets.

### 18.4 What the new repo gets instead of a graveyard
One honest `STATE.md` generated at the end of each WP (what's VERIFIED WORKING with the test that proves it, what's next) — replacing the LifeLink-style stack of contradictory "100% COMPLETE" docs. Nothing is "working" without a test or a browser click-through proving it.

---

*Living document. Confirm §3 to lock the last decisions; §3.3 (Vivago/Dosell integration specs) is the top external dependency for WP4. §16 defines the professional bar every loop is held to; §17 governs how CC runs each WP; §18 is the one-time pass on the old repos before WP0.*
