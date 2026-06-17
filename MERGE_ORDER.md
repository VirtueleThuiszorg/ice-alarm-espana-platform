# MERGE_ORDER.md — branch stack merge plan

> Plan for merging the open feature branches into `main`. Date: **2026-06-17.**
> Conflict dry-run done (`git merge --no-commit --no-ff <branch>` from main, then abort).
> **Result: every branch merges into `main` with ZERO conflicts, and no two pending
> branches modify the same file** — they are fully independent, so merge order is low-risk
> for code. The one real hazard is the **scattered planning docs** (see §Doc hazard).

`main` currently = `eab298b` (isabella-gate already merged).

---

## Branches

| Branch | Purpose (one line) | In main? | Conflicts | Needs live smoke-test post-deploy? |
|---|---|---|---|---|
| `feat/isabella-gate` | Server-side enforcement of `isabella_settings` toggles (ai-run / ai-execute-action / ai-dispatch-events) | ✅ MERGED | — | YES — deploy the 3 fns; verify discretionary gating + safety-critical fail-open |
| `feat/join-medical-fix` | Fix /join dropping medical data — route medicalInfo/partnerMedicalInfo through to submit-registration | no | none | **YES — BLOCKING** (CUTOVER Step F5): real /join → confirm `medical_information` + `emergency_contacts` rows |
| `feat/sos-hardening` | HMAC on EV07B ingress (transition-safe) + code-enforced verification gates (#6/#7) | no | none | YES — set `EV07B_HMAC_SECRET` both sides; confirm HMAC accepted + legacy key still works; do NOT set `EV07B_ENFORCE_HMAC=true` until verified |
| `feat/admin-bootstrap` | Guarded first-admin bootstrap (self-disabling) + CUTOVER_RUNBOOK.md | no | none | YES (functional) — run bootstrap once at cutover Step C; confirm 2nd call refused |
| `feat/stripe-billing-actions` | Subscription pause/resume/cancel drive Stripe (not DB-only); Mollie blocked | no | none | YES — needs Stripe secrets; confirm cancel/pause/resume hit Stripe, DB follows only on success |
| `feat/broken-link-fixes` | Order detail route, call-centre task links, dead buttons, audit CSV, /pendant→/products/pendant | no | none | Light — click-through: order detail, CC task→member link, audit CSV full export |
| `feat/frontend-polish` | Pendant image 404, legal i18n keys, #pricing anchor, Products i18n, Notify-Me lead capture | no | none | Light — visual: pendant image loads, /#pricing scrolls, Terms/Privacy headers, Notify-Me writes a `leads` row |
| `feat/logo-fraunces` | Wordmark + headings → Fraunces; + BRAND_ASSETS.md, LEARN.md | no | none | Light — visual: Fraunces renders (Google Fonts), icon SVG unchanged |

---

## Recommended merge order

Order is low-risk (no code overlaps), so this is sequenced by **risk/foundational-first,
cosmetic-last**, and to handle the doc hazard cleanly:

0. **Resolve the doc hazard FIRST** (see below) — decide whether planning docs live tracked
   on `main` or stay untracked. Do this before merging `logo-fraunces` / `admin-bootstrap`.
1. `feat/admin-bootstrap` — foundational for cutover (Step C); brings CUTOVER_RUNBOOK.md.
2. `feat/join-medical-fix` — critical correctness, tiny, isolated.
3. `feat/sos-hardening` — safety; only branch touching `ai-run` (on top of isabella, already in main) + EV07B fns + gps-gateway.
4. `feat/stripe-billing-actions` — billing; isolated (SubscriptionsPage + new fn + _shared/billing).
5. `feat/broken-link-fixes` — admin/call-centre wiring; isolated.
6. `feat/frontend-polish` — public cosmetic; isolated (Products, locales, ScrollToTop).
7. `feat/logo-fraunces` — cosmetic; brings LEARN.md + BRAND_ASSETS.md (do after the doc decision).

After each merge: run `npx vitest run` (expect the lone pre-existing `crmEvents` failure)
and `npm run build`. Deploy edge functions only for branches that change them
(isabella-gate, sos-hardening, stripe-billing-actions, admin-bootstrap, join-medical-fix —
note join-medical-fix is frontend-only but depends on submit-registration already deployed).

---

## ⚠️ Doc hazard (the real gotcha)

Planning docs got committed onto feature branches piecemeal and are otherwise untracked:
- **`LEARN.md` + `BRAND_ASSETS.md`** are committed only on **`feat/logo-fraunces`**.
- **`CUTOVER_RUNBOOK.md`** is committed only on **`feat/admin-bootstrap`** (incl. the Step F5
  medical gate, commit `da86fbc`).
- **Untracked across the tree:** `CLAUDE.md`, `MERGE_ORDER.md` (this file), `FRONTEND_GAPS.md`,
  `SPEC_GAP_ANALYSIS.md`, `APP_AUDIT_2026-06.md`, `AUDIT_REPORT_2026-06.md`,
  `CRITICAL_VERIFICATION_2026-06.md`, `ISABELLA_GATE_PLAN.md`, `LEGAL.md`.

**Risk:** when merging `logo-fraunces` (or `admin-bootstrap`), if an **untracked** copy of
`LEARN.md`/`BRAND_ASSETS.md`/`CUTOVER_RUNBOOK.md` is present in the working tree, git aborts
with *"untracked working tree file would be overwritten by merge."* The dry-run did not hit
this only because those files happen to be absent on `main` right now.

**Recommended fix (do once, before step 0 merges):** decide the canonical home for planning
docs — recommend committing them all to `main` in a single "docs" commit so every branch/
session shares them, instead of leaving them untracked and scattered. Then the
logo-fraunces/admin-bootstrap doc commits merge as normal text (and any overlap is a normal
3-way merge, not an untracked-overwrite abort). If kept untracked instead, `git stash -u`
(or move them aside) before merging those two branches.

---

## Notes
- `feat/sos-hardening` is the only pending branch that edits `ai-run/index.ts`; it branched
  from main-with-isabella, so its ai-run already contains the isabella gate — clean merge.
- Not type-checked under Deno locally (no Deno CLI): the edge-function branches
  (sos-hardening, stripe-billing-actions, admin-bootstrap) bundle on Supabase deploy —
  smoke-test there.
- `crmEvents.test.ts` fails on every branch (pre-existing test-hygiene issue, not a defect).
