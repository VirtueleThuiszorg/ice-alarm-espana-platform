# CLAUDE.md — operating rules for this repo

You are building the ICE Alarm España platform. Read `ice-alarm-espana-master-build-plan.md` for the full plan, and `GOALS.md` for the standing acceptance criteria every loop is measured against. This file is the set of rules you must never break. If a request conflicts with these, stop and flag it.

## What this is
A direct-to-consumer connected-care business in Spain: 4 devices (Vivago SOS watch/pendant, glucose monitor, Dosell dispenser, family health pack) sold with a recurring monitoring subscription. **One Vite SPA on one Supabase backend**, with the two surfaces separated by route group inside the single app: the client surface (`src/pages/{client,join}` + marketing) and the staff/admin surface (`src/pages/{admin,call-centre,staff,partner}`). One AI assistant, Isabella. This is a life-safety product — a real SOS must reach a real operator.

## Golden rules (never break)
1. **One Supabase project.** Never introduce a second database or sync layer.
2. **RLS on every table.** No table ships without Row-Level Security and a test proving isolation.
3. **No client-writable roles or tiers.** Roles (today: `staff.role` / `app_role` enum — there is no `user_roles` table) are assigned by trigger/admin only. Subscription plan/status (today: `subscriptions.status` / `plan_type` / `billing_frequency` — there is no `subscription_tier` column) changes only via the payment webhook. Never let a user set their own role or plan.
4. **Payments activate via webhook only.** A member is activated by the payment webhook (`stripe-webhook` / `mollie-webhook`), never by client-side code or onboarding forms.
5. **Isabella queries as the user**, never with the service role for user-facing reads. Her data access is whatever RLS allows — nothing more.
6. **Isabella's hard-blocked tools are unreachable in code**, not just discouraged in the prompt: `update_user_role`, `manage_alert` escalate/resolve, `admit_resident`, `discharge_resident`, `toggle_user_status`. She may read, never execute these.
7. **Isabella red-lines:** never give medical advice or a diagnosis; never triage/dismiss/resolve an SOS; never invent or alter a health reading; always escalate uncertainty to a human.
8. **The SOS path is never mocked** and always has an end-to-end test. Target: pendant press → operator screen < 1 second.
9. **No secrets in git.** Env / Supabase secrets only. Maintain `.env.example`. Never commit `.env`.
10. **No new tests skipped.** Every work package ends with its tests green. Zero-test code does not merge.

## Do not do
- Do not reintroduce Lovable anything (`lovable-tagger`, `.lovable/`, Lovable AI gateway). AI runs on the Anthropic API.
- Do not build a password/credential vault. Team secrets live in 1Password/Bitwarden.
- Do not create per-entity one-off functions (e.g. `import-mary-shifts`). Write generic, parameterized code.
- Do not add agent-to-agent handoffs or extra AI personas. There is one Isabella.
- Do not `console.log` auth state or PII in production code.
- Do not add a dependency with a known critical CVE.

## How to work
- Work **one work package at a time** (WP0–WP9 in the plan). Do not start a WP whose dependencies aren't green.
- Before editing the schema, read the current migration set; keep it clean — no accreted patch-on-patch policies.
- Prefer small, reviewable commits. Explain what each migration changes and why.
- When porting from the old repos (read-only reference), port deliberately — copy the good part, leave the debris.
- If a spec is ambiguous (esp. Vivago/Dosell device APIs), stop and ask rather than guessing an integration.

## Merging (never break)
Two production outages (2026-07-23, 2026-07-25) came from the same thing: several PRs
touching `src/i18n/locales/*.json` merged back-to-back, each resolving the conflict by
**keeping both sides**. The second outage took five collision sites across four PRs, and
the fix PR undid itself the same way.

- **One at a time.** When more than one open PR touches the same large file — locale JSON
  above all, but the same goes for big shared modules and migrations — merge them
  **serially**: rebase PR *n* on a **green** main, wait for its build to pass, merge, wait
  for main to go green, and only then start PR *n+1*. Never merge a queue of them in a burst.
- **Never merge red.** CI failing on a PR means the merge does not happen. In both outages
  the guard test was already red on the PR and the merge button was pressed anyway.
- **Resolving a locale conflict is not concatenation.** Take one side's block whole, then
  re-apply the other side's newer values onto it, and diff the key list before committing.
  Two adjacent blocks with the same keys is always wrong — it is invalid JSON at best, and a
  silently-overwritten translation at worst (`JSON.parse` keeps the *last* duplicate).
- **Re-verify after every `Merge branch 'main' into <feature>`.** That merge commit is where
  both outages were actually created, and it is *not* what a green PR run tested earlier.
  Run `npm test` on the merge result before merging the PR.
- Locale integrity is enforced by `src/test/localeParse.test.ts`: parse, deep key parity,
  array-length parity, no duplicate keys, no English left in member-facing namespaces. If it
  is red, main is broken — fix it, never pin around it.

### WIRING_REGISTER.md: run this once per clone

```
npm run setup
```

**Do it before your first merge.** It registers a git merge driver that REGENERATES the register
instead of merging it, plus a `post-merge` hook that regenerates again once the tree is whole.
Git will not take either from a committed file — executing code named by a clone is how a clone
becomes an exploit — so `.gitattributes` can only declare the intent, and each checkout opts in.

**This replaces the old instruction to resolve the register by hand.** That instruction was here
for weeks, `.gitattributes` said `-merge` so git would raise a conflict and make somebody run the
generator, and the file was still hand-merged twice in one week. A rule that depends on the
person holding the conflict doing the right thing fails exactly when it matters. So there is no
longer a conflict to resolve: the driver regenerates, and if you never ran `npm run setup`, the
CI job on main regenerates and commits it for you rather than going red over a generated file.

What has NOT changed: on a pull request a stale register is still a hard failure. You are present
there, and the register is part of what is being reviewed.

## Stack
Single Vite + React 18 + TypeScript SPA (npm, **not** a pnpm monorepo) · Tailwind + shadcn/ui in `src/components/ui` · Supabase (Postgres/Auth/Edge Functions/Realtime), one project — **`crpsuhoixfdhjugprbuc`** (care-conneqt-prod, LifeLink Sync org, Pro; LOCKED 2026-07-22, LAUNCH_SCOPE.md §0). The planned `cfwnrcogikjycjcobsay` migration is **CANCELLED** (historical); `qkfvojbcxaptufsepupo` is **DEFERRED** — a possible future migration target, never a deploy target, and **not** to be deleted (correction 2026-08-11). Per-file ref map: `PROJECT_REFS.md`. · Stripe + Mollie (SEPA + cards, webhook-driven) · AI is Isabella on the **Anthropic API** (`claude-opus-4-8` via `_shared/anthropic.ts`, `ISABELLA_MODEL` overridable; core migrated 2026-07-24 — only the archive-candidate growth fns still touch Lovable) · Vercel deploy · Sentry.

## Looping discipline
- Run one work package as one `/goal` loop; its stop condition IS the WP's Definition of Done plus **every criterion in GOALS.md** (the five non-negotiables + the engineering bar) holding. Cap turns.
- **Highest professional standard is the bar, defined concretely (plan §16):** proven not claimed (no feature "done" without a test or click-through) · zero type errors, zero lint warnings, no dead code · critical-path tests green · RLS + isolation test on every new table · one concern per branch/PR, no God commits · STATE.md updated honestly · WCAG AA + scalable fonts · observable, no PII/auth logs · consistent with existing `src/components` and shared modules (no duplicate parallel implementations) · migrations reversible. If any item fails, keep looping — do not stop.
- Success criteria must be deterministic. "Clean"/"good"/"polished" are never stop criteria. Vague quality words don't count; the §16 checklist does.
- A `/loop 10m` may handle PRs and CI, merging each one when it is green.

## Merge authority (rule change, Lee, 9 Sep 2026 — supersedes the human gate)
**Nothing is held for Lee.** There are no `[HOLD FOR LEE]` PRs and no gate waiting on his read. Every PR targets `main` and merges when CI is green — **schema included**, and including the SOS/alert path, Stripe activation, RLS policies and Isabella's tool permissions, all four of which previously required his sign-off.

What this replaces, so the change is not mistaken for drift: until this date the rule was *"the human gate is mandatory before merge on: the SOS/alert path, Stripe activation, RLS policies, and Isabella's tool permissions."* Holding those turned out to cost more than it bought — #271 sat open carrying a **live** fix for a payment path that charged browser-supplied amounts, so the gate was protecting the defect rather than production.

**Green is now the only gate, which puts the whole weight on CI being honest.** Two things follow, and they are not optional:
- **Never merge red.** Unchanged, and now the single line of defence rather than one of two.
- **A check that cannot fail is not a check.** No `continue-on-error` on a gate, no job that skips its work and reports success, and no gate sharing a job with another — a failing step marks every later step `skipped`, and `skipped` is not red. Enforced by `src/test/ciJobIsolation.test.ts`.

**Merges are to be gated by the branch ruleset, so that a red required check cannot be merged past by anyone** — no human, no session, no bot. The six required checks are Tests, Lint/Type Check & Build, Wiring register, Cross-tenant isolation, Security Audit and Migration drift gate.

**⚠️ As of 12 Sep 2026 the ruleset is active but requires NO status checks, so the paragraph above describes the intent and not yet the state of the repository.** Ruleset `main` (id 19055263) was switched on 11 Sep at 16:28 UTC and now applies to the default branch; `GET /rules/branches/main` returns `deletion`, `non_fast_forward` and `pull_request` — and no `required_status_checks` rule of any kind. **So a red check still blocks nothing.** `Merge gate is enforced` is red on main saying precisely that, and it is the only red gate there. Two edits remain, both browser-only (the REST write path is refused to agent sessions by the proxy): add the six required checks, and allow merge commits. The exact values and the verifications are in `PENDING_FOR_LEE.md` §2 S16.

One consequence is already live and is not a caveat but a rule: **the `pull_request` rule refuses every direct push to main**, including CI's own. GitHub Actions cannot be a bypass actor here — it is not an installed app — so both workflow steps that write to main (`migrate.yml`'s migration manifest, `ci.yml`'s wiring-register self-heal) authenticate with the `MANIFEST_PUSH_TOKEN` PAT, enforced by `RULE 6` in `src/test/ciJobIsolation.test.ts`. **Anything new that pushes to main must do the same**, and that test will tell you so on the day you add it.

**Until the status checks are required, "never merge red" is enforced by discipline alone, and that has now failed three times: 23 July, 25 July and 11 September — every time with the guard test already red on the PR.**

Golden rules 1–10 above are **not** affected. Merge authority changed; what the code may do did not. A missing RLS policy or a client-writable role is still a defect that must not merge, and CI failing is still what stops it.

## Quality gates (CI, must be green to merge)
typecheck · lint · migration drift · wiring register · RLS isolation tests · webhook contract tests · E2E on checkout→activation and SOS→operator · no known-critical CVEs.

**Each gate gets its own CI job.** Until 9 Sep 2026 drift, register, typecheck and build were four steps of one job, so the drift gate — legitimately red for days while production trails `main` — reported the other three as `skipped` for a whole day. A syntax error and a dropped security fix both landed through that hole. A required secret that is absent **fails** its job (`scripts/ci/require-secrets.mjs`); it never skips the work and reports green.
