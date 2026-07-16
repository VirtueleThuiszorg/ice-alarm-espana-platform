# Care Conneqt — Claude Code Run-Book

Copy-paste prompts to drive the whole build. Paste **one at a time**, let each loop finish, review the human-gate items, then move to the next.

**Locked for build** (correct if wrong): AI name = **Clara**. Pricing = **three tiers, Conneqt / Care / Complete**, one household subscription, stackable devices.

**Companion files (must be in the repo):**
- `CLAUDE.md` → repo **root** (CC reads it automatically).
- `GOALS.md` → repo **root** (standing acceptance criteria every loop is measured against).
- `care-conneqt-master-build-plan.md` → repo root or `/docs`.
- This run-book → `/docs` (reference for you).

---

## Before your first paste (human, ~10 min)
1. Create the new empty repo `care-conneqt` on GitHub. Connect it in CC browser.
2. Add `CLAUDE.md` and `care-conneqt-master-build-plan.md` to it (root).
3. Keep the two old repos (`care-conneqt`, `care-conneqt-hub`) accessible as **read-only reference**. Never build in them.
4. Set a turn cap you're comfortable with (start ~30–50 per goal; raise if it's genuinely progressing).

---

## Kick-off order
`STEP A (cleanup, old repos)` → `WP0` → `WP1` → then `WP2` and `WP4` in parallel → `WP3` anytime after WP0 → `WP5` → `WP6` → `WP7` → `WP8` → `WP9`.
Run the **babysitter loop** continuously alongside. Move **scheduled routines** to the cloud once WP0–WP2 are green.

---

## STEP A — Old-repo cleanup & extraction (shakedown run)
Run once against the OLD repos, on a throwaway branch. Safe first loop.

```
/goal Prepare the old repos care-conneqt and care-conneqt-hub as READ-ONLY reference only.
Produce SALVAGE_INDEX.md listing exactly the assets we keep with their file paths:
Twilio emergency-call handler, WhatsApp/Slack/Resend/Jitsi integrations, EN/ES/NL
translation files, the has_role() RLS pattern, the ai_functions registry + admin toggle UI,
product/tier seed data, and the domain-model migrations. Move all Lovable artifacts
(.lovable/, lovable-tagger, generated README) and every stale status/planning doc into
/docs/archive. Scan FULL git history (not just HEAD) for any committed secrets; list every
key found so it can be rotated. Do not delete history — these repos are frozen.
Stop when SALVAGE_INDEX.md is complete, all Lovable artifacts are archived, and every
tracked/historical secret is listed for rotation.
```
**Human action after:** rotate every key it lists (Supabase keys + the anon JWT). New project gets fresh secrets.

---

## WP0 — Foundation
```
/goal Read CLAUDE.md and care-conneqt-master-build-plan.md. Execute WP0 (Foundation):
pnpm-workspace monorepo with apps/platform, apps/hub, packages/ui, packages/database,
packages/ai, packages/config, services/ingestion. Add CI (typecheck, lint, build),
Sentry, security headers (CSP/HSTS/X-Frame-Options) on Vercel, .env.example, and a
packages/ui skeleton. No secrets in git.
Stop only when both apps deploy empty, CI is green, and every criterion in GOALS.md
holds. One concern per branch/PR. Cap: <N> turns.
```

## WP1 — Backend & auth
```
/goal Execute WP1 (Backend & auth) per the plan. One clean Supabase schema for all domains
in §5, RLS on every table, has_role() security-definer, trigger-only role assignment,
generated TypeScript types. CRITICAL: user_roles is NOT client-writable; members.subscription_tier
and billing columns are NOT user-updatable. Write the RLS isolation test suite.
Stop only when RLS tests prove a family carer cannot read another family's data, no
client-writable role or tier exists, and every criterion in GOALS.md holds. One concern per branch/PR. Cap: <N> turns.
```
**Human gate:** review RLS policies before merge.

## WP2 — The funnel (revenue)
```
/goal Execute WP2 (The funnel) per the plan. Product catalogue (4 devices) + tier configurator
(Conneqt/Care/Complete) → Stripe Checkout with SEPA Direct Debit + cards, using Stripe
Products/Prices as source of truth → stripe-webhook edge function that is the ONLY thing
that activates a member (checkout.session.completed / invoice.paid → subscription → activate
→ trigger provisioning) → Customer Portal. Success/cancel URLs point at apps/platform, not Supabase.
Stop only when a Playwright test completes a test-mode purchase AND the member is activated
by the webhook (not client code), and every criterion in GOALS.md holds. One concern per branch/PR. Cap: <N> turns.
```
**Human gate:** review the Stripe activation flow before merge.

## WP3 — Design system + rebrand
```
/goal Execute WP3 (Design system) per the plan. Build warm, premium, senior-accessible design
tokens and components in packages/ui; both apps consume them. WCAG AA contrast, scalable fonts,
keyboard-reachable labelled controls.
Stop only when both apps are themed from the one source, the a11y pass is green, and all §16
items hold. One concern per branch/PR. Cap: <N> turns.
```

## WP4 — Device ingestion (product core)
```
/goal Execute WP4 (Device ingestion) per the plan. In services/ingestion, build one hardened
endpoint per vendor (Vivago, Dosell, CGM, family-pack gateway): authenticate source, validate
payload, normalize into health_metrics and/or alerts. The SOS path is realtime and NEVER mocked:
pendant press → validated alerts insert → Supabase Realtime → hub alarm screen. Build the
device provisioning flow (triggered by WP2 activation). Add uptime checks on every endpoint.
Stop only when a harness/Playwright run fires an SOS and the operator screen updates in
UNDER 1 SECOND (measured, not asserted), and every criterion in GOALS.md holds. If Vivago/Dosell API specs
are missing, STOP and ask — do not guess an integration. One concern per branch/PR. Cap: <N> turns.
```
**Human gate:** review the SOS/alert path before merge. **Blocker:** needs Vivago/Dosell integration specs.

## WP5 — Client dashboards
```
/goal Execute WP5 (Client dashboards) per the plan. Member + family dashboards wired to real
WP4 ingestion and WP2 Stripe state. Family invitations (consent-scoped). Alert acknowledgement flow.
Stop only when live device data + alerts render, consent-scoped family access is verified by test,
and every criterion in GOALS.md holds. One concern per branch/PR. Cap: <N> turns.
```

## WP6 — Hub v2 (unified, incl. HR)
```
/goal Execute WP6 (Hub v2) per the plan. Alarm centre, clients, shifts, tickets, and HR/payroll
on the unified backend, role-walled. Port the salvaged Twilio/WhatsApp/Resend/Jitsi integrations
from the old repos (per SALVAGE_INDEX.md). Replace per-employee import functions with ONE generic
rota importer.
Stop only when an operator can run a shift end-to-end, HR is role-walled (a nurse can't see another
nurse's pay; no client sees any staff/HR data), salvaged integrations are live, and all §16 items
hold. One concern per branch/PR. Cap: <N> turns.
```

## WP7 — Clara (one AI)
```
/goal Execute WP7 (Clara) per the plan §9. One assistant on the Anthropic API, role-aware, EN/ES/NL.
Consolidate the tool registry into ai_functions with allowed_roles, requires_confirmation (default
true for writes/money), and risk tiers. HARD-BLOCK in code (not prompt): update_user_role,
manage_alert escalate/resolve, admit_resident, discharge_resident, toggle_user_status — Clara may
read, never execute. Enforce the red-lines (no medical advice/diagnosis, never dismiss an SOS,
never invent a reading, always escalate uncertainty). Clara queries AS THE USER (RLS), never service role.
Stop only when tool-permission tests prove human-only tools are unreachable, red-lines are verified,
and every criterion in GOALS.md holds. One concern per branch/PR. Cap: <N> turns.
```
**Human gate:** review Clara's tool permissions before merge.

## WP8 — Hardening
```
/goal Execute WP8 (Hardening) per the plan. Full critical-path test coverage (checkout→activation,
SOS→operator, RLS isolation, Clara permissions), accessibility pass, load test, GDPR/data-retention
documentation, runbooks.
Stop only when all quality gates in §13 are green and every criterion in GOALS.md holds. One concern per branch/PR. Cap: <N> turns.
```

## WP9 — Launch
```
/goal Execute WP9 (Launch) per the plan. Verify Resend domain, switch Stripe to live keys, stand up
monitoring dashboards, and walk the §15 launch checklist.
Stop only when every §15 checklist item is green and on-call + runbooks are ready. Cap: <N> turns.
```
**Human gate:** you sign off the §15 checklist personally.

---

## Babysitter loop (run continuously alongside WP work)
```
/loop 10m check open PRs, address review comments, fix failing CI, merge anything green and
approved. NEVER auto-merge changes to the SOS path, Stripe activation, RLS policies, or Clara's
tool permissions — flag those for me instead.
```

## Scheduled cloud routines (move here once WP0–WP2 are green)
```
/schedule nightly: run dependency + security audit; fail on any new critical CVE; file an issue.
```
```
/schedule every morning: check Vercel deploy status and runtime errors; file issues for anything failing.
```
```
/schedule weekly: run the SOS-path canary end-to-end; alert if latency > 1s or delivery fails.
```
```
/schedule weekly: check EN/ES/NL translation coverage and WCAG AA contrast; file issues for gaps.
```

---

## The one rule (from CLAUDE.md §Looping)
Loops implement, verify, and prepare. **You** personally review before merge: the SOS/alert path, Stripe activation, RLS policies, and Clara's tool permissions. Loops make you fast; they don't make you absent.
