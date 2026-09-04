# ONBOARDING_SPLIT.md — the join wizard stops collecting health data

> **Status:** DESIGN. Nothing here is implemented. Each increment is a separate PR that links
> back to this document.
>
> **Date:** 2026-09-04 · **Verified against:** `2b9444b` (main) · Companion docs:
> `READINESS_MODEL.md` (the readiness axis, shipped #150–#155), `ICE_OPERATOR_CARD_SPEC.md`
> (§5.1 the contact-state contract), `CONSENT_MODEL.md` (who may see whose data).

---

## 0. The decision this implements

**The join wizard stops collecting emergency contacts and medical information.** It becomes
seven steps:

```
1 plan → 2 personal → 3 address → 4 device → 5 review → 6 payment → 7 complete
```

Contacts and medical are collected **after** payment, through the second-stage mechanism that
already exists. Steps 4 (contacts) and 5 (medical) are removed; nothing else moves.

**Pendant shipping does not change.** It ships on payment. That is intended and this design
does not add a hold.

### What this trades

Today a member cannot finish the wizard without at least one emergency contact
(`JoinWizard.tsx:236`, `case 4`). After this change they can — so **paying while
not-monitoring-ready becomes the normal path rather than the exception.** That is exactly the
window `READINESS_MODEL.md` was written for, and the three surfaces that make it visible
(operator banner, escalation alert, admin queue) are already merged. This change is only safe
*because* they landed first.

The thing it must not become: a member who pays, receives a pendant, and is never chased. The
admin queue (#155) is the control for that, and the operator route below is what makes it
workable while email is undeliverable.

---

## 1. Reuse, do not rebuild — what already exists

Verified on `2b9444b`:

| Piece | Where | State |
|---|---|---|
| `member_update_tokens` | `20260127152647_…sql` | `token` UNIQUE, `requested_fields TEXT[]`, `expires_at`, `used_at`, `created_by → staff(id)`. RLS: staff-only `FOR ALL`. Indexed on `token` and `member_id`. |
| Issue a link | `send-member-update-request` | 7-day expiry, `SITE_URL` base, sends via `_shared/email.ts`, logs to `activity_logs`. |
| Check a link | `validate-member-update-token` | Returns `valid:false` + `token_missing`/`token_invalid`/`token_used`/`token_expired`/`member_not_found`, else member + `requestedFields`. |
| Accept a submission | `submit-member-update` | Re-validates the token, then writes `members`, `medical_information` (`:104-137`) **and** `emergency_contacts` (`:139-183`), marks the token used, logs activity. |

**This is the best-built flow in the product** (`PRELAUNCH_AUDIT.md` §2.3) and it is not being
rebuilt. What follows tightens it and adds a second route into the same endpoint.

---

## 2. Four defects in `submit-member-update` that this change makes load-bearing

These are live today. They matter little while contacts are collected in the wizard; they
matter a great deal once this endpoint becomes *the* way a member becomes monitoring-ready.

### 2-A Emergency-contact write failures are swallowed

`submit-member-update/index.ts:159-161` and `:178-180`:

```ts
if (contactError) {
  console.error("Error creating contact:", contactError);
}
// …loop continues, nothing propagates
```

A member can submit three contacts, have **every insert fail**, and receive
`{success: true, message: "Profile updated successfully"}`. **This is the same class of lie as
`emergency-contact-notify`'s `{success: true, notified: 0}`** (`READINESS_MODEL.md` §1-A) — on
the endpoint that is about to become the only route to monitoring-readiness. The member is told
they are done; readiness stays false; only the admin queue notices, and only if somebody works
it.

### 2-B The token is burned even when the write failed

`:186-189` marks `used_at` unconditionally, after the swallowed errors. So a submission that
wrote nothing still consumes the one-shot token. The member cannot retry with the same link,
and the failure is invisible to them because of 2-A.

### 2-C An empty submission is a success

`:140` guards `emergencyContacts.length > 0`. An empty array skips the block entirely and still
returns success and still burns the token. A member who opens the link and submits nothing is
recorded as having completed the second stage.

### 2-D Every submission is attributed to the member

`:192-197` logs `action: "member_self_update"` with `new_values: { updated_via:
"member_update_link" }` — **hardcoded**. There is no field distinguishing who actually keyed the
data. Today that is merely imprecise. Once an operator can enter it, an unattributed record is a
health-data provenance failure (GOALS.md G4: *"every access is auditable"*).

**All four are fixed in increment 1.** They are not separate concerns from the operator route:
2-D *is* the attribution requirement, and 2-A/B/C are what make "the member says they're done"
mean something.

---

## 3. The couples question — DECISION NEEDED (Lee answers at design review)

`submit-member-update` takes **one** token bound to **one** `member_id`. A couple is **two**
`members` rows, two sets of emergency contacts, two sets of medical information, two data
subjects, two consents.

### Option A — one token, one link, both members in one submission

Extend the payload to `members: [{member_id, medical, emergencyContacts}, …]` and let one token
cover the household.

- ✅ One email, one form, one thing to chase. Best completion rate.
- ❌ Changes the endpoint's contract from "a token is one member" to "a token is a household",
  which is also the RLS boundary. Every isolation assertion about this endpoint would have to be
  re-reasoned.
- ❌ **One person supplies another person's medical data with no record of who.** The goal
  explicitly forbids a route where the payer supplies the member's medical data unattributed,
  and a couple's link is exactly that route wearing a different hat.

### Option B — two tokens, two links, one per member — **RECOMMENDED**

Issue one token per `members` row. The endpoint is unchanged.

- ✅ **The token boundary stays the consent boundary.** One token, one data subject, one
  attribution. `CONSENT_MODEL.md` already treats each member as the sole author of consent over
  their own health data; this keeps that true by construction rather than by policy.
- ✅ No contract change, so #123's existing token assertions keep their meaning and the new ones
  (§7) are about the same shape.
- ✅ The admin queue already rows **per member**, so a half-completed couple shows as exactly
  what it is: one ready, one not. Option A would hide that behind a single household row.
- ❌ Two emails. For a couple sharing one inbox, two links look like a mistake or a phish.
  *Mitigation:* one email listing both links, clearly labelled by name — one message, two
  scoped tokens. This is a copy problem, not an architecture problem.
- ❌ Partner may never act. *Mitigation:* the operator route does both in one phone call, which
  is the realistic path for couples anyway (§5).

### Option C — a household token that fans out

A new `household_update_tokens` concept above the member.

- ❌ A new mechanism, which the goal forbids. Rejected without further analysis.

### Recommendation

**Option B**, with the single-email-two-links mitigation. The deciding argument is not
completion rate: it is that a couple is two data subjects, and the moment one token can write
two people's medical records, "who supplied this" stops being answerable from the data. Option A
buys convenience by giving up provenance on health data about vulnerable people — the one trade
GOALS.md G4 does not allow.

**If Lee chooses A**, the change is contained: the payload grows a `members` array, the token
gains a `covers_member_ids UUID[]`, and every §7 assertion is rewritten to prove a household
token cannot reach a member outside its own household. That is a real increment, not a tweak,
and it should be sequenced after increment 1 rather than folded in.

---

## 4. The seven-step wizard

### What is removed

- Step 4 `contacts` (`JoinContactsStep`) and step 5 `medical` (`JoinMedicalStep`) leave the
  wizard. The components are **not deleted** — the operator route (§5) renders the same fields,
  and deleting them would mean rebuilding them.
- `case 4: return wizardData.emergencyContacts.length >= 1` goes. `case 5: return true` goes.
- `registrationPayload.ts` stops sending `medicalInfo`, `partnerMedicalInfo`,
  `emergencyContacts`.

### The renumbering hazards — all three, with the fix

**4-A Hardcoded step numbers inside the wizard.** `JoinWizard.tsx` hardcodes `setCurrentStep(9)`
(`:142,152,162`) and `setCurrentStep(8)` (`:177`) on the Stripe-return path, plus
`currentStep < 9` (`:360`) and `currentStep !== 8 && currentStep !== 9` (`:404`). These are the
resume-after-payment path — get one wrong and a member returning from Stripe lands on the wrong
screen. **Fix:** named constants (`STEP_PAYMENT`, `STEP_COMPLETE`) derived from the `steps`
array, so the numbers cannot drift again.

**4-B `registration_drafts.current_step` is raw and already misread.**
`useRegistrationDraft.ts:38` saves the raw step; `:70` hardcodes `currentStep: 9` on conversion.
Rows written by the 9-step wizard will be read after the renumbering. And the reader is
**already wrong today**, before any change of ours — `admin/LeadsPage.tsx`:

```js
const getStepProgress = (step) => ({ step, total: 8, percentage: Math.round((step / 8) * 100), … })
// :1068  "Step {n} of 8"   ← a 9-step wizard
// :114   STEP_NAMES = [ …, "Address", "Medical Info", "Emergency Contacts", … ]
//                                      ↑ index 4        ↑ index 5
//        but the wizard has contacts at 4 and medical at 5 — SWAPPED
```

So the admin abandoned-registration view currently reports the wrong step name *and* a
denominator of 8 for 9 steps. **Fix:** add `schema_version INTEGER NOT NULL DEFAULT 1` to
`registration_drafts`; the new wizard writes `2`; `LeadsPage` keeps a step-name table **per
version** and renders "Step n of m" from that table rather than from a literal. Reversible: one
`DROP COLUMN`, and version-1 rows keep behaving as version-1 rows.

**Old drafts are not migrated and not resumed.** An in-flight version-1 draft carries
`wizardData` with contacts/medical the new wizard has no step for. Rather than guess a mapping,
a version-1 draft is **explicitly not resumable**: the wizard starts fresh, and the admin view
labels it `v1 (pre-split)`. Discarding is honest; silently resuming it on step 4 of a 7-step
wizard is not. (The localStorage draft `join_wizard_data` stores only `wizardData`, never a
step, so it needs a version marker too but carries no step hazard.)

**4-C Deep links are safe.** `joinLink.ts` returns only step 1 or 2. Verified, no change.

### `registrationPayload.ts` must not recreate the bug it exists for

That module exists because medical data was once silently dropped from the payload — a shipped
life-safety bug, and `src/test/registrationPayload.test.ts` is its guard. Removing those fields
is *exactly* the shape of the original bug, so removal must be **loud, not quiet**:

- the payload builder **rejects** `medicalInfo` / `emergencyContacts` if present, rather than
  ignoring them — a caller that still passes them is a bug and says so;
- the test is rewritten (not deleted, §6) to assert the fields are **absent by construction**
  and that passing them throws.

Quietly deleting three lines from the builder is how the first bug happened.

---

## 5. Two routes to the same endpoint

The member is the data subject. But the payer is frequently not the member, many members are
elderly and will not complete an emailed form, and **email is not deliverable today**
(`send-member-update-request` needs an unset secret, `icealarm.es` is unverified with Resend,
SPF/DKIM/DMARC unpublished). So the operator route is **not optional and not a follow-up** — it
is what makes this change safe to ship before email works. Both routes land in
`submit-member-update`.

### 5-A The member route

Member opens their link → `validate-member-update-token` → the same contacts/medical fields the
wizard used to show → `submit-member-update`. Unchanged except for the §2 fixes.

### 5-B The operator route

An operator, with the member on the phone, opens the member in admin and fills the same fields.

- It **posts to the same endpoint** with a token the operator mints for the purpose. One write
  path, one set of validations, one set of assertions. An operator-only bypass would be a second
  implementation of the same write, and the two would drift.
- **Migrating ICE customers are handled here**, on the migration call. They already own
  pendants, so they never pass through the wizard at all; the operator route is their only route
  and must therefore be able to create a first-time record, not just edit one.
- No new UI framework: it reuses `JoinContactsStep` / `JoinMedicalStep`'s field set, which is
  why §4 keeps those components.

### 5-C Attribution — what gets recorded

`member_update_tokens` gains two columns:

```sql
submitted_via       TEXT REFERENCES ... CHECK (submitted_via IN ('member_link','operator_assisted'))
submitted_by_staff  UUID REFERENCES public.staff(id)
```

- `member_link` → `submitted_by_staff` is **NULL**, enforced by a CHECK.
- `operator_assisted` → `submitted_by_staff` is **NOT NULL**, enforced by the same CHECK. An
  operator-entered record with no operator is rejected by the database, not by a code path.
- `activity_logs` records the route and the operator instead of today's hardcoded
  `"member_update_link"`.

Reversible: two `DROP COLUMN`s plus dropping the CHECK. No data loss — existing rows are
version-less and read as `member_link` with a NULL operator, which is what they were.

**What is deliberately NOT built:** a route by which the payer supplies the member's medical
data. A payer who is not the member and not an operator has no path to this endpoint. If they
are on the phone with the member, that is the operator route and the operator is recorded.

### 5-D What the member is told, on each route

Nothing on either route may imply monitoring is active before at least one contact exists. The
member route's success screen states which of the two things is now true — contacts recorded,
medical recorded — rather than a generic "profile updated".

---

## 6. Confirmation, dashboard, and expiry

### 6-A The confirmation screen (step 7)

Currently `JoinConfirmationStep` says registration is complete, shows the order reference and
shipping city, and offers the dashboard. After the split it must say the **one remaining thing**:

> **Your pendant is on its way. One thing left: we need your emergency contacts.**
> Until we have at least one person to call, we can answer your alarm but we cannot reach your
> family. Use the link we've emailed you, or call us on <number> and we'll take the details now.

Both routes offered, on the screen, with the phone number — because email is not deliverable and
the screen is the one surface we know the member sees. It must not say "you're all set".

### 6-B The email

Same content, same two routes. It is written and shipped in the same increment but **is not
relied upon**: the increment's acceptance does not include "the email arrives", because it
cannot today. Nothing domain-dependent is built.

### 6-C The member dashboard before completion

`ClientDashboard` shows a persistent, non-dismissible banner while the member is not
monitoring-ready — the member-facing counterpart of the operator banner, and deliberately
deferred out of `READINESS_MODEL.md` §4-D until this change made it necessary. It reads
readiness from `member_monitoring_readiness` (a member reads exactly their own row — proven in
#153), states plainly that no one can be called for them yet, and offers both routes. It
disappears the moment a contact exists, with no cache to invalidate.

### 6-D A token that expires unused

7-day expiry, `used_at` NULL. Today: nothing happens. The member is simply never ready and the
link silently dies.

**Decision: expiry is not an endpoint, it is a queue entry.** No automated re-send — email is
undeliverable and a silent re-send failure looks identical to a member ignoring us
(`READINESS_MODEL.md`'s reasoning for the queue, applied again). Instead:

- the member stays on the **paid-but-not-ready queue** (#155), which already orders by days
  waiting and already exists;
- the member detail view shows the token's state — `sent`, `expired unused`, `used` — so the
  operator phoning them knows whether the link was ever opened;
- issuing a fresh token is an explicit operator action, on the call.

An expired token is therefore not a dead end; it is a row somebody works. **No schema change and
no new mechanism** — which is the point.

---

## 7. Proof

### 7-A Gate F5 — rewritten, not deleted

F5 (`CUTOVER_RUNBOOK` step F5; in-repo guard `src/test/registrationPayload.test.ts`) proves
medical data is written for **single AND couple, member AND partner**. That requirement does not
change; only the mechanism does.

**Sequencing so F5 is never absent:**

1. **Increment 1 adds the new F5** — the second-stage gate — while the old one still passes.
   Both green at once.
2. **Increment 2 rewrites the old one** in the same PR that removes the fields, so the payload
   change and its guard move together.

New F5 asserts, against `submit-member-update`: medical **and** contacts are written for a
single member; for **both** members of a couple, each through their own token (Option B); a
partner's data lands on the partner's `member_id` and not the primary's; and — the negative the
old gate could not express — **a submission whose writes fail is not reported as success**
(§2-A) and **does not burn the token** (§2-B).

### 7-B `scripts/rls/isolation.sql` (the #123 harness, 125 checks on `2b9444b`)

Negative-first. Every one mutation-tested — an assertion that has not been made to fail has not
been tested.

| Assertion | Shape |
|---|---|
| a member **cannot read** another member's medical via the token path | member A's token cannot reach member B's `medical_information` |
| a member **cannot write** another member's medical or contacts | a submission bound to A's token cannot create rows on B, even when B's `member_id` is supplied explicitly in the payload |
| `member_update_tokens` is **not member-readable at all** | the table is staff-only `FOR ALL`; a member reads **zero** rows, including their own — so a member cannot enumerate or guess tokens |
| an **expired** token writes nothing | zero new rows on `medical_information` and `emergency_contacts` after an expired submission |
| an **already-used** token writes nothing | same, and the first submission's rows are unchanged |
| an operator-entered record is **attributed to that operator** | `submitted_via='operator_assisted'` implies `submitted_by_staff` is that operator's id |
| an operator-entered record **cannot be anonymous** | `operator_assisted` with NULL `submitted_by_staff` **raises** — the CHECK, not a code path |
| a member-route record **cannot claim an operator** | `member_link` with a non-NULL `submitted_by_staff` raises |
| a member cannot **forge** the attribution | a member has no write path to `member_update_tokens` at all |

### 7-C What will not be asserted, and must be said

Neither route is proven by a real browser click-through in these increments, and **the email is
not proven to arrive because it cannot be** (§6-B). The operator route is the mitigation, and
its proof is a test plus an operator walking it once with a real phone call — a human step,
recorded in `STATE.md` when it happens, not claimed before.

---

## 8. Increments — one concern per branch, each cut from a green `main`, never stacked

| # | Branch | Concern | Human gate |
|---|---|---|---|
| 0 | `docs/onboarding-split-design` | **This document.** No code. | no |
| 1 | `…/second-stage-honesty-and-operator-route` | §2 fixes · §5 operator route + attribution migration · new F5 · §7-B assertions | **YES — RLS + a life-safety write path** |
| 2 | `…/join-wizard-seven-steps` | §4 wizard · draft `schema_version` · `LeadsPage` step naming · §6-A/B/C copy and dashboard · old F5 rewritten | no (no schema, no SOS path) |
| 3 | `chore/project-refs-repo-rename` | `PROJECT_REFS.md` names the old repo | no |
| — | — | **`tel:` → Twilio: already tracked in issue #156.** Not re-filed. | — |

**Increment 1 must merge before increment 2.** Increment 2 removes the only working route to
monitoring-readiness; increment 1 is what replaces it. Landing 2 first would leave a window in
which a member can pay and there is no route at all — the failure this whole design exists to
prevent.

`create-checkout` and `stripe-webhook` are **untouched** by every increment. Golden rule 4
stands: activation remains webhook-only, and nothing here reads or writes activation state.

---

## 9. Open questions for the human

1. **The couples decision (§3).** Recommendation is Option B, two tokens, one email listing
   both. Needs Lee's answer before increment 1's F5 shape is final.
2. **Should the wizard offer contacts as an optional step rather than removing it?** Not
   recommended — an optional step that most people skip is worse than no step, because it makes
   the confirmation screen's "one thing left" message a lie for the minority who filled it in.
   Raised because it is the obvious cheaper alternative and should be rejected explicitly.
3. **Token expiry is 7 days (§6-D).** For a member who has already paid and is waiting on a
   pendant, is 7 days right, or should the second-stage token be longer-lived than a
   staff-initiated profile-update token? These are now two different jobs sharing one lifetime.
4. **`STEP_NAMES` in `LeadsPage` is already wrong on `main`** (§4-B) — medical and contacts are
   swapped and the denominator is 8 for 9 steps. Fixed in increment 2 as part of versioning, but
   worth knowing it predates this work.
