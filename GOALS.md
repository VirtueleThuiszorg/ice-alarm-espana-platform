# GOALS.md — standing acceptance criteria

These are the goals **every** loop is measured against, on top of each work package's own Definition of Done. They do not change between WPs. A loop has not met its goal until all of these hold. "Clean", "good", "done", "complete" are never acceptable stop words — the criteria below are provable or they don't count.

Read alongside `CLAUDE.md` (the rules) and `care-conneqt-master-build-plan.md` §16 (the professional bar). Where they overlap, the stricter wording wins.

---

## Prime directive
This is a life-safety product. Families buy it to protect vulnerable elderly people. Nothing ships that a human hasn't proven safe. Speed never beats safety. When in doubt, stop and ask.

---

## The five non-negotiables (product-specific)

### G1 — The emergency path is sacred
- No change merges if it touches the SOS → operator path without that path being re-proven **end-to-end**, with latency **measured** (target < 1 second, alert if exceeded).
- The SOS path is never mocked, never stubbed, never "temporarily disabled". If it can't be tested in a change, the change waits.
- This path carries a stricter gate than anything else in the codebase: a human reviews it before every merge that touches it.

### G2 — Fail safe, loud, and logged — never silent
- Every critical path (device ingestion, alert delivery, Stripe charge/activation, auth) has a tested answer to: *what happens when this fails, and who is told, how fast?*
- Failures surface to a human immediately (alerting/monitoring), are logged with structured context, and never leave the user believing they're protected when they aren't.
- Silent catch-and-continue on a critical path is a defect, not a style choice.

### G3 — Accessibility is a feature
- Real end users are elderly people with reduced vision/dexterity and their family in a crisis. The bar is "could a 75-year-old use this unaided", not "passes the linter".
- WCAG AA is the **minimum**: sufficient contrast, scalable fonts, large touch targets, full keyboard reach, labelled controls, no reliance on colour alone.
- Emergency actions must be reachable and obvious under stress.

### G4 — Data dignity, not just data security
- Health data about vulnerable people. Beyond "no breach": collect only what's needed, family sees only what the member has consented to share, every access is auditable.
- RLS enforces this in the database, not the UI. Consent scoping is tested. GDPR/data-retention is the legal floor, documented, not the aspiration.

### G5 — Honesty in the codebase
- No aspirational docs. No "100% complete" that isn't. No TODO pretending to be done. No feature marked working without the test or click-through that proves it.
- `STATE.md` tells the truth or it is a bug. It lists what is VERIFIED WORKING (with the proving test), what is BROKEN, what is MISSING — nothing else.
- The failure mode that started this project — claiming done while not done — is banned by policy.

---

## The engineering bar (applies to every loop — mirrors plan §16)
1. **Proven, not claimed** — a test or real browser click-through, or it isn't done.
2. **Typed & clean** — typecheck 0 errors, lint 0 warnings, no `any` on public boundaries, no dead code.
3. **Tested at the right level** — critical paths have E2E/contract tests; coverage serves the path, not a vanity number.
4. **Secure by construction** — RLS + isolation test on every new table; no secret in code; no client-writable roles or tiers; no new critical CVE.
5. **Small & reviewable** — one concern per branch, one PR per concern, clear description. No God commits.
6. **Documented honestly** — `STATE.md` updated (see G5).
7. **Accessible** — see G3.
8. **Observable** — see G2; no PII/auth in logs.
9. **Consistent** — reuse `src/components` and shared modules; no duplicate parallel implementations.
10. **Reverts cleanly** — every migration reversible or with a documented rollback.

---

## Adversarial stop conditions (defeat early victory)
A loop must prove work by **execution, not inspection**, and prefer **negative assertions**:
- Prove by running: "Playwright completes a test-mode purchase AND the member row flips to active" > "checkout implemented".
- Prove the negative: "a family carer **cannot** read another family's data"; "Isabella **cannot** call `update_user_role`". Negatives are harder to fake than positives.
- Measure the number: "SOS reaches operator screen in **< 1s, measured**" > "SOS is fast".
- If the criteria can't be proven, the feature is not done — keep looping or stop and ask. Never lower the bar to stop.

---

## Human gate (mandatory review before merge — unchanged)
A human reviews and signs off before merge on:
1. The SOS / alert path.
2. Stripe activation flow.
3. RLS policies.
4. Isabella's tool permissions.

Loops implement, verify, and prepare. The human owns the safety-critical decisions. Loops make you fast; they do not make you absent.

---

## How loops reference this
Every `/goal` ends with: **"…and every criterion in GOALS.md holds."** If any G1–G5 item or engineering-bar item fails, the loop is not done. Turn caps control cost; hitting a cap surfaces the blocker to a human rather than lowering the standard.
