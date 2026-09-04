# READINESS_MODEL.md — monitoring readiness as a second axis

> **Status:** DESIGN. Nothing in this document is implemented on `main` at the time it is
> written. Each implementation increment is a separate PR that links back here. Per GOALS.md
> G5, no row below is marked working until a named test proves it.
>
> **Date:** 2026-09-04 · **Verified against:** `dff29b7` (main) · **Author:** design loop for
> "tell the truth about missing contacts".

---

## 0. The decision this document implements

**Monitoring readiness is a second axis, independent of payment.**

| Axis | Who sets it | Today's mechanism |
|---|---|---|
| **Paid / active** | The payment webhook, and nothing else (golden rule 4) | `subscriptions.status='active'`, `members.status='active'` |
| **Monitoring-ready** | The existence of at least one `emergency_contacts` row for the member | **does not exist** |

The pendant ships on payment. There is no shipping hold and this design does not add one. So
the window between "paid" and "monitoring-ready" is real, expected, and can be days long. It
must be **visible at every point a human makes a decision, and never silent.**

A member in that window is *not* unprotected in the sense of having no product — they have a
working pendant that reaches a real operator. What they do not have is a **next-of-kin chain**.
The operator can still speak to them, dispatch 112, and resolve. What the operator cannot do
is what the ladder assumes at Level 5: phone somebody who knows them. That is the specific
capability readiness measures, and the specific thing the current code lies about.

---

## 1. What is broken today — verified, not asserted

### 1-A `emergency-contact-notify` reports "no-one to call" as success

`supabase/functions/emergency-contact-notify/index.ts:73-78`, verified on `dff29b7`:

```ts
if (contactsError || !contacts || contacts.length === 0) {
  console.log("No emergency contacts found for member:", member_id);
  return new Response(
    JSON.stringify({ success: true, notified: 0, reason: "no_contacts" }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

Three separate defects in six lines:

1. **`success: true` for a member nobody can be called for.** A caller checking `success`
   cannot distinguish "the entire chain was reached" from "there was nobody to call". The
   `reason` field is the only tell, and it is optional, undocumented, and unread.
2. **HTTP 200.** Even a caller that ignores the body and checks the status code is told this
   went fine.
3. **`contactsError` is folded into the same branch as `length === 0`.** A *database failure*
   reading the contacts table — a real outage, contacts that exist and could have been
   called — returns the identical `success: true, reason: "no_contacts"` payload. These are
   opposite conditions: one is a member who was never set up, the other is a system that
   just failed to read a member who *was*. Collapsing them means an outage in the contacts
   read is indistinguishable from an empty table, on the highest-priority path in the product.

This is live today. GOALS.md G2 ("fail safe, loud, and logged — never silent"; "never leave
the user believing they're protected when they aren't") is not met on the emergency path.

### 1-B Nothing reads the answer anyway

Both callers fire-and-forget. `ev07b-sos-alert/index.ts:197-210` and
`ev07b-checkin/index.ts:221-233` both `await fetch(...)` and then discard the `Response`
entirely — no `.json()`, no `.ok` check. The `catch` only fires on a transport error.

So fixing the return shape alone changes nothing observable. **The callers must read it.**
That is why increment 1 is "the function tells the truth AND the escalation path treats it as
a failure to escalate", not just the former.

### 1-C Level 5 of the ladder goes silent on exactly this member

`sos-escalation-runner/index.ts:357-368` — Level 5 dials emergency contacts:

```ts
const { data: contacts } = await sb.from("emergency_contacts")...
for (const contact of contacts || []) {
  if (!contact.phone) continue;
  await attempt("emergency_contact_call", contact.phone, null);
}
```

With zero contacts the loop body never runs, so `outcomes` is `[]`. In
`_shared/escalation-outcome.ts:58,69`:

```ts
const attempted = input.outcomes.length > 0;
const fireCallFailedAlert = attempted && !input.priorAttemptExists;
```

`attempted === false` ⇒ **`fireCallFailedAlert === false`.** The comment on line 68 justifies
this: *"doesn't alert when the tier simply had no targets to dial — that is a staffing gap the
shift monitor covers"*. That justification is correct for Levels 2–4, whose targets are staff
and which `staff-shift-monitor` does cover. **It is wrong for Level 5.** There is no shift
monitor for a member's next of kin. Nobody is watching. A member with zero emergency contacts
walks the entire ladder — browser, staff, supervisor, admin, contacts — and the terminal tier
produces no attempt, no failure alert, and (after the L5 grace) `markReached: true`, recording
the tier as *reached*.

So the escalation record for such an alert reads "escalated to level 5" when level 5 did
nothing. That is the same class of defect the `escalation-outcome.ts` module was written to
fix — it fixed the "all calls failed" case and left the "no calls possible" case behind.

### 1-D No completeness concept exists anywhere

`grep -rn "profile_complete\|monitoring_ready\|setup_complete\|onboarding_complete"` over the
repo returns **nothing** (verified on `dff29b7`). A member is `active` or not. There is no
column, no view, no function, no UI state, and no query that can answer "is this member's
monitoring chain set up".

### 1-E The operator card says it in grey 12px

`src/components/call-centre/sos/SOSActionPanel.tsx:346`:

```tsx
{contacts.length === 0 ? (
  <p className="text-xs text-zinc-500">{t("sos.action.noContacts", "No emergency contacts on file")}</p>
) : (
```

`text-xs` (12px) `text-zinc-500` (grey-on-dark) inside a collapsed panel, below the member
dial button, with a `0` badge in the panel header. Under stress, at speed, on a live SOS, this
is invisible. It is also a **WCAG AA contrast failure**: `zinc-500` (#71717a) on
`zinc-800/50` over `zinc-900` (an effective #232326) computes to **3.2:1** by the WCAG 2.1
relative-luminance formula — under the 4.5:1 required for text at that size. GOALS.md G3 ("emergency actions must be reachable and obvious under stress")
is not met. The information is technically present and practically absent.

### 1-F What is NOT broken (corrections to the goal brief)

Two items in the brief are already fixed on `main` and this design does not touch them:

- **CI typecheck.** The brief states `.github/workflows/ci.yml:40` runs `npx tsc --noEmit`
  against the `{"files": []}` stub and so checks nothing. That was true; it was fixed on
  `main` in **`cf2ae84` "fix(ci): the typecheck gate was checking nothing"**, which now runs
  `npx tsc -p tsconfig.app.json --noEmit` *and* `-p tsconfig.node.json --noEmit`, with the
  reasoning recorded in a comment above the step and guarded by
  `src/test/ciTypecheckGate.test.ts`.
- **The 78 errors.** `npx tsc -p tsconfig.app.json --noEmit` on `dff29b7` exits **0** with
  **zero** errors (run 2026-09-04 in this sandbox). They were cleared in `1dc74e7`
  (`chore/typecheck-green`). "Green main" is meaningful again; the real typecheck is the gate.

Nothing else in the brief's verified list was contradicted: 1-A, 1-D and the absence of any
readiness concept all reproduce exactly as described.

### 1-G Three referenced documents do not exist

`ICE_LIVE_READINESS_2026-09-02.md`, `ICE_OPERATOR_CARD_SPEC_2026-09-02.md` and
`ICE_PAYER_DESIGN_2026-09-02.md` are **absent from the working tree and from every branch and
commit in this repository** (`git log --all --diff-filter=A --name-only` finds no add of any
of them). This document therefore cannot be written "against" them and the operator-card spec
cannot be "updated in the same PR" — there is nothing to update.

What increment 2 does instead: it **creates** `ICE_OPERATOR_CARD_SPEC.md` (undated name, so it
is a living spec rather than a snapshot) containing the operator-card contract for the
readiness states defined in §4 below. If the dated file exists somewhere outside this repo,
that content should be reconciled into it and this decision revisited — flagged, not guessed.

---

## 2. Derived, not stored — and why

**Decision: readiness is DERIVED. A `security_invoker` view over `emergency_contacts`, plus a
matching helper for the escalation path. No column, no trigger, no stored flag.**

### Why not stored

A `members.monitoring_ready boolean` maintained by a trigger on `emergency_contacts` would
drift, and the drift would be silent and in the dangerous direction:

- Every write path that can create or delete a contact must fire the trigger. Today that is
  the join wizard's atomic registration RPC (`20260302_submit_registration_atomic.sql`),
  `submit-member-update`, staff CRUD through the admin UI, `ON DELETE CASCADE` from a member
  delete, and any future import. A trigger missed on one path leaves a member reading
  `monitoring_ready = true` with zero contacts — which is **worse than today's bug**, because
  today's bug at least reflects a live count.
- A `TRUNCATE` or a bulk `DELETE` in a migration bypasses row triggers or fires them in ways
  that are easy to get wrong. A restore from backup can repopulate contacts without ever
  re-running the trigger.
- Two sources of truth on a life-safety fact is precisely the failure this project banned:
  golden rule 1 ("never introduce a second database or sync layer") is about a second
  database, but the reasoning — one source of truth, no sync — applies at the column level.
- A stored flag invites a client write. Golden rule 3 forbids client-writable roles and tiers
  for the same reason: anything writable is eventually written by the wrong actor. A view has
  no INSERT path to abuse.

The one thing a stored column buys is a cheap indexed filter for the admin queue. That is
bought instead with a partial index (§3), at no correctness cost.

### Why the view is safe under RLS

`emergency_contacts` already has exactly the policies readiness needs
(`20260121143325...sql:342-345`):

```sql
CREATE POLICY "Staff can view emergency contacts"  ... USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own contacts"      ... USING (member_id = public.get_member_id(auth.uid()));
```

A view created with `WITH (security_invoker = on)` evaluates those policies **as the querying
user**, not as the view's owner. So:

- a member reading the view sees exactly one row — their own readiness;
- a member **cannot** see another member's readiness, because they cannot see the underlying
  contact rows that produce it;
- staff see all rows, because `is_staff` says so;
- readiness inherits its access rules from the data it is derived from, automatically, with no
  second policy to keep in sync.

This is the whole argument for derived-over-stored restated at the security layer: a stored
column on `members` would need its **own** policy, and `members` is readable by carers under
`care_access_grants`, so the readiness flag's exposure would silently follow `members`'
policies rather than `emergency_contacts`'. Derived keeps the blast radius correct by
construction.

> **Note — `security_invoker` is new to this codebase.** All five existing views
> (`partner_monthly_referral_counts`, `staff_holiday_balance`, `staff_on_shift_now`) are
> created without it, i.e. they run with the definer's rights and bypass RLS. That is a
> pre-existing issue, out of scope here, and worth its own audit. This design does **not**
> follow that precedent. `security_invoker = on` requires PostgreSQL 15+; prod is 16.

---

## 3. The schema increment

One migration, reversible, no data change:

```sql
-- Readiness is derived. No column, no trigger, no stored flag: see READINESS_MODEL.md §2.
CREATE OR REPLACE VIEW public.member_monitoring_readiness
WITH (security_invoker = on) AS
SELECT
  m.id                                        AS member_id,
  count(ec.id)                                AS emergency_contact_count,
  count(ec.id) > 0                            AS monitoring_ready,
  m.created_at                                AS member_since,
  min(s.created_at)                           AS paid_since        -- NULL until the webhook fires
FROM public.members m
LEFT JOIN public.emergency_contacts ec ON ec.member_id = m.id
LEFT JOIN public.subscriptions s ON s.member_id = m.id AND s.status = 'active'
GROUP BY m.id, m.created_at;

-- The admin queue's only filter. Partial, so it indexes the small set that matters.
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_member_id_present
  ON public.emergency_contacts (member_id);   -- already exists as idx_emergency_contacts_member_id
```

**Rollback:** `DROP VIEW IF EXISTS public.member_monitoring_readiness;`. A view drop removes no
data and no policy; the migration is reversible in one statement, and the index it relies on
already exists (line 398 of the base migration), so the migration adds no index at all.

**Golden rule 2 note.** A view is not a table and cannot itself carry RLS — its safety comes
entirely from `security_invoker` delegating to the base tables' policies. So "RLS + isolation
test on every new table" is satisfied here not by a new policy but by **new isolation
assertions proving the delegation actually holds** (§6). The isolation harness's existing
"every table in public has RLS enabled" sweep will not see a view; the explicit assertions are
the only proof, which is why they are non-optional in this design.

**Why `paid_since` is `subscriptions.created_at`.** `subscriptions` has **no** `activated_at`
column — verified against the full migration set: the base table
(`20260121143325...sql`) has `start_date date`, `renewal_date date`, `created_at timestamptz`,
and the only later additions are Mollie's two id columns. Because the subscription row is
*created* by the payment webhook (golden rule 4 — activation happens nowhere else),
`created_at` **is** the activation instant, exactly, not an approximation. `start_date` is a
`date` and so cannot order a same-day queue; `created_at` is the right column on both counts.

---

## 4. Every surface that must show it

Readiness appears **only where a human makes a decision**. Not as decoration.

### 4-A Operator alert card — the loud one

Spec written in full in `ICE_OPERATOR_CARD_SPEC.md` (created by increment 2). Contract:

| State | Presentation |
|---|---|
| ≥1 contact | Unchanged. The contact list, with the count badge. No readiness chrome at all. |
| **0 contacts** | A **full-width destructive banner at the top of the action panel**, above the member dial button — not inside the contacts panel. Text: **"NO EMERGENCY CONTACTS — nobody can be called for this member"** plus the one thing the operator should do instead: *"Speak to the member. Escalate to 112 on your own judgement. Level 5 of the ladder will do nothing."* |

Requirements that make it un-missable, and testable:

- **Not colour alone** (G3): an `AlertTriangle` icon, a bold uppercase heading, and the
  sentence. Removing colour must leave the meaning intact.
- **Contrast ≥ 4.5:1** at the rendered size, on the dark operator theme. This is the fix for
  1-E, so the test asserts the token, not the vibe: the banner uses the existing
  `destructive` / alert tokens from `src/index.css`, consistent with `SOSAlertBar`.
- **Non-collapsible, non-dismissible.** An operator under load must not be able to make it go
  away and then forget.
- **Reuses the existing count** already fetched at `SOSActionPanel.tsx:104-114`. No second
  query, no new hook, no duplicate implementation (engineering bar §9). The view from §3 is
  for the *staff queue* (§4-C), not for the operator card — the card already has the truth in
  hand and only mis-renders it. Adding a view read here would be a second source of the same
  fact on the SOS path, which is exactly what §2 argues against.
- **The zero state must be distinguishable from the loading state.** Today `contacts` starts
  as `[]` and is `[]` while the fetch is in flight, so a naive banner flashes on every alert
  open. The implementation must track load state explicitly and render the banner only once
  the query has returned. A banner that cries wolf on every alert is a banner operators learn
  to ignore — and that failure mode is worse than the grey text it replaces.

### 4-B The alert / escalation path

- `emergency-contact-notify` returns the new outcome shape (§5), HTTP 409, `success: false`.
- Both callers **read the response** and, on `no_contacts`, fire the loud admin alert rather
  than continuing silently. The alert is `escalation.no_emergency_contacts` — a new
  `notify-admin` event alongside the existing `escalation.call_failed`, not a reuse of it,
  because the operational response is different: `call_failed` means "dial again / check
  Twilio", `no_emergency_contacts` means "phone this member and get their next of kin".
- `decideLevelOutcome` gains the Level-5 distinction (§5-B): a terminal tier with no targets
  is a **failure to escalate**, not a quiet no-op.

### 4-C Admin member list and the stuck queue

- **Member list** (`src/pages/admin/MembersPage.tsx`): a readiness column, and a value in the
  existing status filter for "not monitoring-ready". The list already selects
  `subscriptions (plan_type, status)` in one round trip; readiness joins the same way.
- **Stuck queue** (increment 3): paid-but-not-ready, **oldest paid first**, so the member who
  has been exposed longest is phoned first. Columns: name, phone, `paid_since`, days waiting,
  and a direct dial. The point of the screen is that somebody phones them, so the phone
  number and the wait duration are the two things it exists to show.
- **Member detail** (`src/pages/admin/MemberDetailPage.tsx`): the same readiness state, next
  to the contacts section, so the person who just phoned the member can see it flip.

### 4-D Member's own dashboard

In scope for §4 only as a statement of principle; **implemented in Goal 2**, not here. A
member who is paid but not ready should be told, on their own dashboard, that their emergency
contacts are missing and what to do about it. It is deliberately deferred because it is the
same surface Goal 2 rebuilds when the wizard splits, and building it twice would be the
duplicate-parallel-implementation the engineering bar forbids.

### 4-E Explicitly NOT a surface

- **No shipping hold.** The device ships on payment. Unchanged, by decision.
- **No block on `members.status = 'active'`.** Readiness is a second axis; it does not
  gate activation and must never be confused with it. Golden rule 4 stands untouched:
  `create-checkout` and `stripe-webhook` are not modified by any increment in this goal.
- **No member-facing email.** The production domain is not connected and email is not
  deliverable. Nothing in this design sends mail.

---

## 5. What `emergency-contact-notify` returns instead

### 5-A The four outcomes

The function's answer becomes a discriminated union on `outcome`, with `success` reserved for
the case where it is actually true. Every response carries `outcome`, so a caller that reads
only that field is correct.

| `outcome` | HTTP | `success` | Meaning | Caller must |
|---|---|---|---|---|
| `notified` | 200 | `true` | ≥1 contact reached on ≥1 channel | nothing |
| `all_failed` | 502 | `false` | Contacts exist; every channel failed for every one | fire the loud alert |
| `no_contacts` | **409** | **`false`** | The member has **no** emergency contacts. Nobody could be called. | fire the loud alert; treat the tier as **not** escalated |
| `contacts_unreadable` | **503** | **`false`** | The read of `emergency_contacts` **failed**. Contacts may well exist. | fire the loud alert; **retry** |

Notes on the choices:

- **409 for `no_contacts`.** Not 200 (that is the lie), not 500 (nothing failed — the request
  was processed correctly and the answer is "there is nobody"), not 404 (the member exists;
  `404` is already this function's "member not found"). 409 Conflict says: the request is
  well-formed but the resource is in a state that makes it impossible to satisfy. A caller
  that only ever checks `res.ok` now gets the right answer for free — which is the point.
- **`success: false` on three of four.** The field stays for compatibility with anything that
  reads it, but it now means what its name says. Any existing consumer checking `success` gets
  *safer*, never less safe, from this change.
- **`contacts_unreadable` split out from `no_contacts`.** This is defect 1-A(3). "I read the
  table and it was empty" and "I could not read the table" are opposite facts and must not
  share a response. The retry semantics differ: an empty table will still be empty in ten
  seconds; a failed read might succeed.
- **`total` and `notified` counts stay** in the body for the operational log; they are no
  longer load-bearing for correctness.

### 5-B The escalation path treats `no_contacts` as a failure to escalate

Two changes, both in the runner's decision layer so they are unit-testable without Deno:

1. **`decideLevelOutcome` learns that a terminal tier with no targets is a failure.** A new
   input field distinguishes "no targets existed" from "targets existed and all failed". For
   Level 5, no-targets ⇒ `fireCallFailedAlert: true` (once, on the first sweep at the tier,
   same anti-storm rule as today) and — the important half — the tier is **not** silently
   marked reached as a success. It is still bounded by `L5_RETRY_GRACE_MS` so the runner does
   not retry forever; what changes is that giving up is now recorded and alerted, not silent.
   Levels 2–4 keep today's behaviour exactly, because `staff-shift-monitor` genuinely does
   cover a staffing gap and a second alert there would be noise.
2. **The two ingest callers read the response.** `ev07b-sos-alert` and `ev07b-checkin` parse
   the `outcome` and, on anything but `notified`, log structured context and fire
   `notify-admin`. They must remain non-blocking on the SOS path — the alert row is already
   written and the operator screen already has it, so this notification cannot be allowed to
   delay or fail the ingest. Fire-and-forget stays; *ignoring the answer* is what stops.

**Human gate.** Both changes touch the SOS/alert path. GOALS.md and `CLAUDE.md` require human
review before merge, and no increment in this goal is merged.

---

## 6. Negative assertions — how staff and tests prove it

### 6-A `scripts/rls/isolation.sql` (the #123 harness, currently 77 checks, 0 failures on `dff29b7`)

Negative-first, per GOALS.md's adversarial stop conditions. Seeded members A and B already
exist in the harness; A gets one contact, B gets none.

| Assertion | Shape |
|---|---|
| readiness is **false** with zero contacts | member B's row reads `monitoring_ready = false`, `emergency_contact_count = 0` |
| readiness is **true** with one contact | member A's row reads `true` / `1` |
| readiness **flips** on insert and on delete | insert a contact for B ⇒ `true`; delete it ⇒ `false`. Proves derived, not cached |
| **member A cannot read member B's readiness** | `count_as(A, 'select 1 from member_monitoring_readiness where member_id = B')` = **0** |
| **member A cannot read member B's contacts** | already asserted; re-anchored next to the readiness checks so the pair cannot drift apart |
| **a member sees exactly one readiness row** | `count_as(A, 'select 1 from member_monitoring_readiness')` = **1** — not "A's row is correct", but "A's row is the *only* row A can see" |
| a carer holding a consent grant on `alerts` reads **no** readiness | consent is category-scoped; readiness is not a granted category |
| a partner reads **no** readiness | partners are not a member-data route |
| the view is **not** writable | `exec_as(A, 'insert into member_monitoring_readiness ...')` raises. A derived fact has no write path |
| **`security_invoker` is actually on** | read `pg_class.reloptions` and assert `security_invoker=on`. Without this the four negative reads above could pass for the wrong reason on a definer view owned by a role that happens to see little — this makes the *mechanism* the assertion, not just the outcome |
| CONTROL: `service_role` sees **both** members' readiness | if this fails the harness is broken, not the policies |

### 6-B `src/test/` — the notify-outcome contract

| Assertion | Test |
|---|---|
| **a member with zero contacts is never reported as successfully notified** | the `no_contacts` branch returns `success: false`, `outcome: "no_contacts"`, HTTP **409**. Asserted as: no response with `notified: 0` may ever carry `success: true` — a sweep over every branch, so a future branch cannot reintroduce it |
| a read failure is **not** reported as no-contacts | `contactsError` ⇒ `outcome: "contacts_unreadable"`, 503 — distinct payload from the empty case |
| the callers **do not ignore** the answer | source-level assertion that `ev07b-sos-alert` and `ev07b-checkin` read the response body of the `emergency-contact-notify` fetch. This is the 1-B defect and the only thing that makes 5-A matter; a shape-only test would pass while the bug stayed |
| Level 5 with **no targets** fires the loud alert | `escalationOutcome.test.ts`: `level: 5`, `outcomes: []`, no prior attempt ⇒ `fireCallFailedAlert: true` |
| Levels 2–4 with no targets are **unchanged** | same input at levels 2/3/4 ⇒ `fireCallFailedAlert: false`. Proves the fix is scoped and did not turn the staffing gap into an alert storm |
| the operator banner renders **only** on a settled zero | banner absent while loading, present on `[]` after load, absent on ≥1. The 4-A cry-wolf failure mode, asserted |
| the banner does not rely on colour alone | icon + text present; meaning survives with colour removed |

### 6-C How staff find members who are stuck

Three routes, deliberately overlapping, because a single route that nobody opens is not a
control:

1. **The queue (pull).** Admin → Members → "Not monitoring-ready", oldest paid first. This is
   the worklist: somebody works it, top to bottom, and phones people.
2. **The alert (push).** `escalation.no_emergency_contacts` fires the first time a real alert
   for that member hits a tier that cannot be served. Nobody has to be looking at a screen.
3. **The card (in the moment).** The operator handling the live SOS sees it, loudly, while it
   matters — and is told what to do instead.

Route 1 is preventive and route 2 is reactive; route 3 is neither, it is harm reduction on the
call that is already happening. The queue is the one that is supposed to make routes 2 and 3
never fire.

---

## 7. Increments — one concern per branch, each cut from `main`, never stacked

| # | Branch | Concern | Human gate |
|---|---|---|---|
| 0 | `…-gm9vg2` | **This document.** No code. | no |
| 1 | `…-gm9vg2-notify-outcome` | `emergency-contact-notify` outcome union; both callers read it; `decideLevelOutcome` Level-5 no-targets; tests §6-B | **YES — SOS/alert path** |
| 2 | `…-gm9vg2-operator-card` | Operator card loud zero state + `ICE_OPERATOR_CARD_SPEC.md` | **YES — SOS/alert path** |
| 3 | `…-gm9vg2-readiness-view` | The `security_invoker` view migration + isolation assertions §6-A | **YES — RLS** |
| 4 | `…-gm9vg2-admin-queue` | Admin member-list column + paid-but-not-ready queue | no |
| — | — | **CI typecheck: already fixed on `main` in `cf2ae84`.** No increment. See §1-F | — |

Increment 2 depends on nothing (the card already has the count). Increment 4 depends on 3's
view; it is cut from `main` regardless and is not merged until 3 is, which is the "never
stacked" rule applied honestly rather than by pretending the dependency is absent.

`CLAUDE.md`'s merge discipline applies: serially, on a green `main`, never red, and the human
gate on 1, 2 and 3 before any of them merges. **Nothing in this goal is merged by the loop.**

---

## 8. Open questions for the human

1. **`ICE_LIVE_READINESS_2026-09-02.md`, `ICE_OPERATOR_CARD_SPEC_2026-09-02.md` and
   `ICE_PAYER_DESIGN_2026-09-02.md` are not in this repository** (§1-G). If they exist
   elsewhere, this design needs reconciling against them before increment 2's spec is taken as
   authoritative.
2. **Is one contact really enough?** This design says readiness ⇔ `count > 0`, as decided.
   A single contact who does not answer leaves the ladder's terminal tier effectively empty,
   which is the same hole one rung further in. A `contacts_sufficient` threshold of 2 is a
   one-line change to the view if wanted — worth a decision, not a silent default.
3. **`paid_since` = `subscriptions.created_at`** — resolved during design, not left open
   (§3). Flagged here only so the reasoning is reviewable: it is exact *because* the webhook
   is the only thing that creates the row. If that ever stops being true, this column stops
   being right, and golden rule 4 is the thing that keeps it true.
4. **Existing views bypass RLS** (§2 note). Three views are `security_definer` by default.
   Out of scope here; probably a finding worth its own PR.
