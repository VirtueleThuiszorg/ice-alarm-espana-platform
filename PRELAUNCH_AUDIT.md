# PRELAUNCH_AUDIT.md — every user-facing journey, classified

> **Audit date:** 2026-08-14 · **Against:** `main` @ `776bda2` · **Method:** source and
> migration reading, plus the executable evidence already standing in this repo (the
> vitest suite, `e2e/`, and `scripts/rls/`). **No production data was queried** — there
> is no DB access from this environment, and nothing below is a claim about live rows.
>
> **Classification:**
> **WORKING** — a named test, harness or click-through proves it · **BROKEN** — proven
> wrong, with the evidence · **MISSING** — expected by the plan, not present ·
> **UNPROVEN** — code exists, nothing proves it runs.
>
> `UNPROVEN` is not a soft `WORKING`. Most of this codebase is `UNPROVEN`, and saying so
> is the point of the document (GOALS.md G5).

---

## 0. The five things that matter most

1. **`AddMemberWizard` tells staff it created a member and creates nothing.** Ten
   steps, a "Complete Registration" button, a success screen, and **zero** data
   access in the file. Staff-side member creation does not exist. (§3, §4-A)
2. **A GDPR erasure request leaves live access tokens behind.** `gdpr-delete-member`
   anonymises the `members` row rather than deleting it, so
   `member_update_tokens.ON DELETE CASCADE` never fires. Unexpired tokens keep
   resolving after erasure — on health data. (§4-B)
3. **Staff self-service is dead.** `guard_staff_self_update` raises on *any*
   non-super-admin self-update. **Human-gated — reported, not touched.** (§4-C)
4. **Dutch is rejected by the database** while LAUNCH_SCOPE §6 locks EN+ES+NL for
   launch. The UI is trilingual; the column constraint is not. (§4-G)
5. **Two of the nine items in the brief are already handled** — one is fixed and
   PR'd (#127), one was never true at the stated location. Detail in §4, because an
   audit that repeats a stale finding is worth less than one that retires it.

---

## 1. What "proven" means here

The repo does have real executable evidence, and this audit leans on it rather than
re-deriving it:

| Harness | What it actually proves |
|---|---|
| `npm test` — 1029 tests, 67 files | Unit + contract logic. Includes `auth.test.tsx` (role matrix, 2FA gate), `partnerStatusAllowlist`, `partnerValidationParity` (imports the REAL server zod schema), `localeParse` (key parity across en/es/nl). |
| `scripts/rls/run.sh` — 29 checks | Real PostgreSQL, real migration set (135 of 139 applied), real policies. Cross-tenant isolation, PHI, golden rules 3 and 4. Mutation-tested: one `USING (true)` turns it red. |
| `e2e/public.spec.ts` — 92 passed | 14 public routes × dead anchors, route resolution, brand leaks, i18n keys in 3 languages, no-op buttons. |
| `e2e/partnerJourney.spec.ts` — 12 passed | Register → verify → log in → dashboard, real browser, real bundle, **Supabase HTTP stubbed**. |

**What none of them prove:** anything against the live project. No SOS has been timed,
no real payment has been taken, no real email has been delivered in a test.

---

## 2. Journey by journey

### 2.1 Member — public self-serve (`/join`)

| Step | Status | Evidence |
|---|---|---|
| Reach `/join`, wizard renders in en/es/nl | **WORKING** | `public.spec.ts` — renders with zero missing keys in all three |
| Draft persistence mid-wizard | **UNPROVEN** | `save-registration-draft` exists (97 lines); nothing exercises it |
| Submit → member + subscription + order created atomically | **UNPROVEN** | `submit_registration_atomic` RPC exists and is called; no test runs it |
| Member row is created `inactive` before payment | **WORKING** | Read directly from the RPC body |
| Checkout (Stripe / Mollie) | **UNPROVEN** | `create-checkout` requires `memberId`; no contract test |
| Webhook flips subscription to `active` | **UNPROVEN** | `stripe-webhook` sets it; **no webhook contract test exists** — a named CI gate that does not exist |
| Post-payment: link auth user to member | **UNPROVEN** | `complete-member-registration` exists |

**The gap that matters:** activation is the golden-rule-4 chokepoint and it is
completely untested. CLAUDE.md lists "webhook contract tests" as a required CI gate;
there is no such job.

### 2.2 Member — staff-initiated (what Lee asked for)

| Step | Status |
|---|---|
| Staff create a partial record | **BROKEN** — the UI claims it, the code does nothing (§3) |
| Member invite → set password | **MISSING** — `staff-send-invite` is a *staff* function |
| Member picks a package and pays | **MISSING** for this path (checkout itself exists) |
| Member completes their own details | **HALF** — mechanism exists, entry point does not |
| Staff request a records update | **WORKING** (see 2.3) |

Design is in `MEMBER_ONBOARDING.md` (PR #128). Phases 1+ are blocked on the
payer-vs-member decision.

### 2.3 Member — update-your-records loop

| Step | Status | Evidence |
|---|---|---|
| Staff see which fields are missing and pick them | **WORKING** | `MemberUpdateRequestModal`, mounted in `CRMTab` |
| Token issued, scoped, 7-day expiry | **WORKING** | `send-member-update-request`; `requested_fields` column |
| Token rejected when used / expired / invalid | **WORKING** | `validate-member-update-token` returns `token_used` / `token_expired` |
| Member submits; token marked used | **WORKING** | `submit-member-update` stamps `used_at` |
| Email actually arrives | **UNPROVEN** | Interim Gmail SMTP — `LAUNCH_CHECKLIST.md` blocker |
| Token survives a GDPR erasure | **BROKEN** | §4-B |

This is the best-built flow in the product. It should not be rebuilt — only tightened.

### 2.4 Family / emergency contacts

| Step | Status |
|---|---|
| Contacts stored, RLS-isolated from other members | **WORKING** — `scripts/rls/isolation.sql` proves member A cannot read member B's contacts |
| Contact notified on an alert | **UNPROVEN** — `emergency-contact-notify` exists; no delivery test |
| Family portal / consent scoping | **MISSING** — GOALS G4 requires "family sees only what the member consented to share"; no consent-scope model exists |

**G4 is not met.** There is no consent scoping to test.

> **Follow-up 2026-08-14 — the consent-scope half of that row is answered; the portal half is not.**
> `CONSENT_MODEL.md` designs it and `20260814140000_care_access_grants.sql` implements it, with
> 48 new checks in `scripts/rls/isolation.sql` (29 → 77), written negative-first. Both are **open PRs behind the RLS
> human gate — not merged**, so the row above is still true of `main`. When they land, what
> changes is "no consent-scope model exists"; what does **not** change is **MISSING** for the
> family portal itself (no UI, no carer invite, no carer account), nor for per-read access
> logging. See STATE.md for the precise split.

### 2.5 Staff (employee lifecycle)

| Step | Status |
|---|---|
| Staff invite → accept → account | **UNPROVEN** — `staff-send-invite` real, revokes prior invites |
| Staff login, role routing | **WORKING** — `auth.test.tsx`, incl. the `call_centre_supervisor` regression |
| Mandatory 2FA for admins | **WORKING (client-side only)** — enforced in `ProtectedRoute` (#125), 23 tests. Server-side is §4-E |
| 2FA enrolment reachable | **WORKING** — Security tab, `?tab=security` |
| Staff edit their own profile | **BROKEN** — §4-C |
| Staff cannot escalate their own role | **WORKING** — proven twice: trigger *and* policy (`scripts/rls/isolation.sql`, #126) |

### 2.6 Call centre

| Step | Status |
|---|---|
| Reach `/call-centre` as `call_centre` / `call_centre_supervisor` | **WORKING** — `auth.test.tsx` |
| SOS lands on an operator screen | **UNPROVEN** — the code path exists; **latency has never been measured** |
| Escalation ladder 2→5 | **WORKING** — `sosEscalation.e2e.test.ts`, `escalationLoop.test.ts` |
| Failed call does not silently advance | **WORKING** — `escalationOutcome.test.ts` |
| Inbound SOS < 1s (G1 target) | **UNPROVEN** — no instrumentation; the assertion is skipped with a TODO rather than faked |
| MedConneqt | **N/A** — iframe to an external system |

**G1 is not met.** The number in the goal has never been measured. That is the single
largest unproven claim in the product.

### 2.7 Admin

| Step | Status |
|---|---|
| Members CRM list + detail | **UNPROVEN** — renders; not click-tested |
| Add a member | **BROKEN** — §3 |
| Convert a partner application | **WORKING** — `partnerConvertAction.test.tsx`, gate matches the server decision (#126) |
| Settings, incl. Security tab | **WORKING** — `auth.test.tsx` asserts the tab exists and is reachable |
| Admin sees all members (RLS) | **WORKING** — `is_staff()` policies, isolation harness |

### 2.8 Partner

| Step | Status | Evidence |
|---|---|---|
| `/partner` application | **WORKING** | `partnerJourney.spec.ts` — `partner-apply` is actually invoked |
| Choice of paths shown before the form | **WORKING** | #124-era change; `partnerLoginReachable.test.ts` |
| `/partner/join` self-serve registration | **WORKING** | 12-test journey spec |
| Verification | **WORKING** | `partner-verify` token exchange asserted |
| Login refuses non-`active` with a reason | **WORKING** | Allowlist + `partnerLoginRefusal`, browser-proven |
| Dashboard reached | **WORKING** | Journey spec |
| Applicant who then tries `/partner/join` | **BROKEN by design** | 409. §4-I |
| Partner alert notifications | **UNPROVEN + PII leak** | §4-H |

---

## 3. The AddMemberWizard test — results

I swept for the class: *does a UI claim an outcome the code does not produce?*

**Method.** Every file with a success/submitted state, checked for a write in-file or
via an imported hook; then every page in the admin, staff, call-centre, client and
join surfaces checked for any data access at all.

**Result: exactly one true positive.**

| File | Verdict |
|---|---|
| `pages/admin/AddMemberWizard.tsx` | **BROKEN.** 363 lines, 10 steps, `grep -cE "supabase\|invoke\|fetch\(\|mutate"` = **0**. Only outward action is `navigate("/admin/members")`. |
| `pages/admin/AIOutreachPage.tsx` | Clean — tab shell, children hold the data access |
| `pages/call-centre/MedConneqtPage.tsx` | Clean — iframe embed of an external system, no local data by design |
| `pages/call-centre/HolidayApprovalsPage.tsx` | Clean — role guard delegating to `AdminHolidaysPage` |
| `components/FeedbackWidget.tsx` | Clean — delegates to `useFeedback` → `member-self-service`, and gates `setSubmitted` on the result |
| `components/products/NotifyInterestDialog.tsx` | Clean — inserts into `leads` |

The last two were false positives of my first line-based grep and are recorded here so
the next reader does not re-flag them.

**No other success screen in the product lies.** That is a genuinely good result, and
it makes the one exception starker.

---

## 4. The named items — current status on `main`

| # | Item | Status on `main` @ `776bda2` | Disposition |
|---|---|---|---|
| A | `AddMemberWizard` writes nothing | **CONFIRMED BROKEN** — 0 data refs | **Phase 2** |
| B | GDPR erasure leaves live tokens | **CONFIRMED BROKEN** — `gdpr-delete-member` anonymises (line ~111, "keep for referential integrity"); `member_update_tokens` appears **0** times in it, so the cascade never fires | **Phase 2** |
| C | `guard_staff_self_update` kills self-service | **CONFIRMED BROKEN** — `is_active` is GENERATED, so `NEW.is_active` is NULL in a BEFORE trigger and always reads as changed | **GATED — reported, not touched** |
| D | `hasVerifiedFactor` reads `mfaData.totp` | **CONFIRMED on main** — but **already fixed and PR'd in #127** (unmerged) | **Already handled — do not duplicate** |
| E | 2FA enforcement is client-side only | **CONFIRMED** — `getAuthenticatorAssuranceLevel` / `aal2` appear **0** times in `src/` | **GATED** — the server-side path is an RLS policy |
| F | `auth-email-hook` hardcodes `icehealthsync.com` | **NOT TRUE.** The file declares `const ROOT_DOMAIN = 'careconneqt.es'`, and `icehealthsync` appears **nowhere** in runtime code — only in the forbidden-brand list and its guard test | **Retire this item** |
| G | `preferred_language` is `('en','es')` | **CONFIRMED, and broader than stated** — it is a `CREATE TYPE ... ENUM ('en','es')` used by `members`, *plus* a separate `TEXT ... CHECK (... IN ('en','es'))` on `partners`. LAUNCH_SCOPE §6 LOCKS EN+ES+NL | **Phase 2** |
| H | `partner-alert-notify` PII log leak | **CONFIRMED** — logs `partner.email` verbatim (`Email notification to ${partner.email}`) | **G1 gate — report only, per brief** |
| I | `/partner/join` 409 for a prior applicant | **CONFIRMED, and deliberate** — `partner-register` refuses a duplicate email. Lee decided not to make it complete existing applications | **Phase 2 (copy only)** |

---

## 5. Gated, blocked, or out of scope

| Item | Why it is not being fixed now |
|---|---|
| C — `guard_staff_self_update` | Security trigger. Explicit human gate in the brief. |
| E — server-side 2FA (`aal2`) | Requires an RLS policy change. Human gate. |
| H — `partner-alert-notify` PII | On the alert path (G1). Brief says report, do not fix. |
| Member onboarding phases 1+ | Blocked on the payer-vs-member decision (`MEMBER_ONBOARDING.md` Q1). |
| Email deliverability | Interim Gmail SMTP; blocked on the production domain, which is not connected. |
| G1 SOS latency measurement | Needs instrumentation on `ev07b-sos-alert` — the SOS path. Human gate. |
| Webhook contract tests | Touches Stripe activation. Human gate. |
| G4 consent scoping | Absent by design so far; a product decision, not a defect to patch. |

---

## 6. Phase 2 worklist

Non-gated, not blocked on a decision, each its own branch and PR:

1. **`AddMemberWizard` honesty** — stop claiming a creation that does not happen
   (`MEMBER_ONBOARDING.md` phase 0, explicitly not phases 1+).
2. **GDPR erasure revokes tokens** — `gdpr-delete-member` must invalidate
   `member_update_tokens` for the erased member.
3. **Dutch** — add `nl` to the language enum and the partners CHECK, with the
   server-side validation schemas that mirror them. Reversible migration.
4. **`/partner/join` refusal copy** — an applicant who returns should be told they
   have already applied and an invitation follows, not "email already exists".

Everything else is in §5 with its reason.

---

## 7. What this audit did not do

- **No production data.** No row counts, no "how many members are active", nothing
  about the live project's actual state.
- **No live click-through.** The browser evidence cited is the stubbed-backend
  journey spec and the public page audit, both of which say so themselves.
- **No latency measurement.** G1's number remains unmeasured; this audit records that
  rather than estimating it.
- **No review of `docs/archive`** or historical material — current runtime surfaces only.
