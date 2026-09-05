# PAYER_MODEL.md — the payer is a different person from the member

> **Status:** DESIGN. Nothing here is implemented. Each increment is a separate PR linking back.
>
> **Date:** 2026-09-04 · **Verified against:** `fb664d3` (main) · Companions:
> `MEMBER_ONBOARDING.md` (§4 the question, §8 the open list), `CONSENT_MODEL.md` (who may see
> whose data), `READINESS_MODEL.md` (the readiness axis), `ONBOARDING_SPLIT.md` (the second
> stage).

---

## 0. The decision this implements

**`MEMBER_ONBOARDING.md` §8 Q1 — option B. The payer is a distinct person from the member,
linked.** The adult child pays; the parent wears the pendant and their record stays truthful:
their email, their medical data, their emergency contacts, their completion link.

**Option A is rejected**, and the reason is operational rather than aesthetic: it puts the
payer's identity on the member row, so an operator handling an SOS reads *the payer's* name and
— worse — reaches for medical information that describes somebody who is not on the floor. A
data model that can mislead an operator mid-alert is a life-safety defect, not a schema
preference.

---

## 1. Verified on `fb664d3` before designing anything

| Claim | Verified |
|---|---|
| `subscriptions` keys on `member_id` only; no `payer_id`/`account_holder_id` anywhere | ✅ grep over all 160 migrations and `src/` finds no payer concept in schema or code |
| `create-checkout` takes `memberId` + `customerEmail` and stamps `member_id` into metadata | ✅ `create-checkout/index.ts:17,96,98,107` |
| `submit_registration_atomic(payload JSONB)` assumes one payload / one household | ✅ `20260302120000_…sql:3` |
| `care_access_grants` is the consent mechanism, categories `('alerts','location','medical')` | ✅ `20260814140000_care_access_grants.sql:22,42` |
| `member_status` is `('active','inactive','suspended')` — **no `draft`/`invited`/`registered`** | ✅ base migration line 3. `MEMBER_ONBOARDING.md` assumes those states; they do not exist yet |
| Migrations are **deliberately not auto-applied** | ✅ `deploy-functions.yml:5` says so in a comment |
| **A member CAN set their own `members.status = 'active'`** | 🔴 **measured, 1 row affected** — see §2 |
| A member **cannot** touch their own subscription | ✅ measured, 0 rows — `subscriptions` has SELECT-only for members |

Measured by adding four temporary probes to `scripts/rls/isolation.sql` and running the real
harness against the real migration set, then reverting them. Not read off the policies.

---

## 2. A live hole found while deciding where the payer belongs

`members` has:

```sql
CREATE POLICY "Members can update own profile" ON public.members
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
```

`FOR UPDATE` with no column restriction and no guard trigger. There is no trigger on `members`
at all beyond `update_members_updated_at`. So **a signed-in member can set their own
`members.status` to `'active'`** — measured, one row affected.

Golden rule 4 says a member is activated by the payment webhook and nothing else. The
`subscriptions` half of that is enforced (the harness has proven since #123 that a member
cannot self-activate a subscription, and the probe re-confirms 0 rows). The `members.status`
half is **not** enforced and never was. The harness tests the subscription and not the member
row, which is exactly the gap that let it survive.

**This is its own concern and its own PR** (§7 increment 4). It is recorded here because it is
the single strongest argument in the schema decision below: **anything placed on `members` is
member-writable today.** A `payer_id` column on `members` would be reassignable by the member
it belongs to.

> Whether `members.status = 'active'` alone grants anything is a separate question — most reads
> gate on the subscription — but a member flipping their own status to `active` while unpaid is
> at minimum a lie in the record the admin queue and the member list both read, and it is
> trivially exploitable. It is not hypothetical: it is one `UPDATE` from any logged-in member.

---

## 3. Where the payer lives — RECOMMENDATION

**A new `payers` table for the identity, plus `subscriptions.payer_id` for the link. Not a
column on `members`; not a bare column set on `subscriptions`.**

### Why not `members`

- **It is member-writable** (§2). The person being paid for could reassign who pays for them.
- It repeats option A's mistake one column over: the member row starts carrying somebody else's
  identity, and every screen that renders "the member" has to know which fields are not about
  them.
- `members` is the row an operator reads under time pressure. Nothing that is not about the
  monitored person belongs on it.

### Why not columns directly on `subscriptions`

`payer_name`/`payer_email` inline would work for one subscription, but the common real case is
**one payer, two parents** — two subscriptions, one person. Inline columns duplicate that
identity, and two copies of an email address drift the moment one is corrected.

### Why `payers` + `subscriptions.payer_id`

1. **A payer is the counterparty of a subscription, not of a person.** The billing relationship
   already lives on `subscriptions`; `stripe_customer_id` hangs off it. Today that column
   implicitly claims the member is the Stripe customer, which is precisely the falsehood being
   fixed. `payer_id` makes the true statement instead.
2. **The cardinality falls out for free.** One payer, two parents = two subscriptions sharing a
   `payer_id`. No join table, no household concept, no collision with `plan_type='couple'`
   (which means *two monitored people* and must not be conflated — `MEMBER_ONBOARDING.md` §4
   option C).
3. **It is not client-writable.** `subscriptions` has **no** member INSERT or UPDATE policy —
   measured, 0 rows. So the billing link inherits that, by construction rather than by a new
   guard. This is the decisive difference from `members`.
4. **Reversible in two statements**: `ALTER TABLE subscriptions DROP COLUMN payer_id;` then
   `DROP TABLE payers;`. No data loss for anything that exists today, because nothing does.
5. **`create-checkout` need not change shape.** It keeps taking `memberId`; the payer is
   resolved server-side from the subscription. See §6 — and it is not touched by these
   increments.

### The shape

```sql
CREATE TABLE public.payers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a payer taken down over the phone has no account yet, and may never have one.
  -- NULL matches no auth.uid(), so it grants nothing. NULL fails closed — the same reasoning
  -- as care_access_grants.grantee_user_id.
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
  full_name     text NOT NULL,
  email         text NOT NULL,
  phone         text,
  -- Their relationship to the people they pay for, for a human reading the record. NOT a
  -- consent category and NOT load-bearing for access.
  relationship  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.staff(id)
);

ALTER TABLE public.subscriptions
  ADD COLUMN payer_id uuid REFERENCES public.payers(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` on both, deliberately: losing the payer must never cascade into deleting a
subscription or block deleting an `auth.users` row. A subscription with a NULL payer reads as
"the member pays for themselves", which is the correct default and what every existing row means.

---

## 4. THE PAYER IS NOT A CONSENT ROUTE

**Paying for someone grants no sight of their care data. None. Not their medical information,
not their location, not their alerts, not their emergency contacts.**

This is the single most important sentence in this document, so it is stated as a rule and
proven as a negative rather than left as an intention:

- **No policy on any care table may reference `payer_id`.** Not `medical_information`, not
  `alerts`, not `devices`, not `emergency_contacts`, not `member_monitoring_readiness`.
- The only mechanism by which anyone who is not the member or staff sees care data is
  `care_access_grants` (#135), scoped to a `consent_category`, granted by the member, revocable
  by the member, and audited.
- **A payer who should also see care data goes through a consent grant like anybody else.** The
  two facts are independent: paying is not consenting, and consenting is not paying. A payer
  with a grant sees what the grant says; a payer without one sees billing and nothing else.
- The reverse also holds: revoking a consent grant must not affect billing, and cancelling a
  subscription must not revoke a grant. They are separate lifecycles.

**Why this needs saying explicitly.** The payer is the person with the card, the email address,
the login and the motivation. Every product instinct pulls toward "of course the daughter who
pays can see mum's alerts". That instinct is exactly the consent bypass: it would let a family
member acquire sight of an adult's medical record by paying for it, without that adult ever
agreeing. `CONSENT_MODEL.md` already refuses to let a third party consent on the member's behalf
(`consent_basis` offers no such footing, and the harness proves it). A payer-derived read path
would reintroduce that by the back door, and it would be invisible — nobody audits a policy that
was written to be convenient.

Proven in the harness (§5), negative-first and mutation-tested.

---

## 5. What must be proven — `scripts/rls/isolation.sql`

Current suite: 147 checks on `fb664d3`. Negative-first, and every assertion mutation-tested — an
assertion that has not been made to fail has not been tested.

| Assertion | Shape |
|---|---|
| **a payer cannot read another member's data** | payer P pays for member A; P reads **zero** rows of member B's `members`, `medical_information`, `emergency_contacts`, `alerts`, `devices` |
| **a payer with no consent grant cannot read the member they pay for** | P reads **zero** of A's `medical_information`, `alerts`, `devices`, `emergency_contacts` — the member they are paying for. This is §4 as an executable statement |
| a payer reads **only** their own payer row | `count = 1`, and zero rows for another payer |
| a payer **does** read the subscriptions they pay for | otherwise the relationship is useless — the positive control |
| a payer cannot read a subscription they do **not** pay for | |
| a payer cannot **reassign** `payer_id` on any subscription | including one they already pay for — a payer must not be able to acquire another member's billing |
| **a member cannot alter their own billing** | 0 rows on `UPDATE subscriptions`; and cannot INSERT one. Already true today (`subscriptions` is SELECT-only for members) — asserted so it stays true once `payer_id` exists |
| **a member cannot read another member's payer** | member B reads zero of A's subscription and therefore zero of A's payer |
| a member **can** see who pays for them | the positive control — their own payer row, via their own subscription |
| a payer with a **granted** `medical` consent reads medical | proves the grant is the route, and that the payer relationship neither helps nor hinders it |
| that same payer still reads **no** `alerts` | the grant is category-scoped; being the payer adds nothing |
| **no policy anywhere references `payer_id` on a care table** | read `pg_policies.qual`/`with_check` across `medical_information`, `alerts`, `devices`, `emergency_contacts` and assert `payer_id` appears in none. This is the mechanism assertion — without it the reads above could pass today and a convenient policy could be added tomorrow |

---

## 6. `create-checkout`, `stripe-webhook`, and `submit_registration_atomic`

**FLAGGED, NOT TOUCHED.** `create-checkout` and `stripe-webhook` are the golden-rule-4
chokepoint and carry the human gate. No increment in this design modifies either.

That is possible because of how the link is shaped: `payer_id` lives on `subscriptions`, which
the **webhook** already writes. So the migration path is:

1. **Now (increment 1):** the schema and its RLS exist. `payer_id` is NULL everywhere, which
   reads as "the member pays for themselves" — true of every existing row.
2. **Now (increment 2):** staff-initiated onboarding can *create* a payer and attach it, because
   staff writes go through the staff policies, not through checkout.
3. **Later, human-gated:** `create-checkout` learns to accept an optional `payerId` and pass it
   in metadata; `stripe-webhook` stamps it onto the subscription row it already creates. **That
   is a separate PR behind the human gate and it is not in this goal.** Until it lands,
   self-serve `/join` continues to produce member-pays-for-self subscriptions, which is correct
   and unchanged.

`submit_registration_atomic` is likewise untouched. It writes `members` +
`medical_information` + `emergency_contacts` with an explicit `'inactive'` status; a payer is
not part of that transaction, and adding one there would put a billing concern inside the
registration write.

**Existing rows:** nothing to migrate. `payer_id` is additive and nullable, and there are no
production subscriptions at all (§9).

---

## 7. Does a payer need an auth account and a dashboard?

**Yes eventually; deliberately NOT in these increments.**

- `payers.user_id` is nullable from the start so a payer taken down over the phone needs no
  account, and one can be linked later without a migration.
- **What a payer may see, when they do have one:** their own payer record; the subscriptions
  they pay for and their status, amount, renewal date; invoices and payment method. That is the
  whole list.
- **What a payer may NOT see:** anything in §4. Including, specifically, whether the member they
  pay for is monitoring-ready — that is care state, not billing state, and it names a gap in the
  member's safety chain.
- **Recommendation for later:** a payer dashboard is a *billing* surface and should be built as
  one, on the payer's own route, not as a variant of the member dashboard. Reusing
  `ClientDashboard` with conditionals is how a care read gets added by accident.

The one thing that must be true before a payer account exists at all: the negatives in §5 must
already hold, because an account is what makes them reachable.

---

## 8. `MEMBER_ONBOARDING.md` §8 Q2–Q8 — where each bears on a choice

Not blocking. Recommendations, for Lee at review.

| Q | Bears on | Recommendation |
|---|---|---|
| **Q2** — what may a member with no account do? | Increment 2: a staff-created member has no login, so the second-stage token is their only route. | **Keep the token path for account-less members.** "Set your password first" is a worse first experience for an 80-year-old than one link, and the token is already scoped, expiring and single-use. Fewer bearer tokens is safer in general; this is the case where the alternative is worse. |
| **Q3** — who may create a member? | Increment 2 directly: the wizard's route guard. | **Any staff role, not admin-only.** `call_centre` taking details on a phone call is the primary use case, and it is the same people who already read every member's medical record. Restricting creation to admins while call-centre staff can read everything is theatre. Attribution (`created_by`) is the real control, and it is in the schema. |
| **Q4** — what does a registered, unpaid member see? | Increment 2 creates exactly these members. | **A dashboard with an unmissable not-yet-covered banner, not a plan wall.** The pattern already exists and is proven: the not-monitoring-ready banner (#161). A wall implies the account is broken; a banner tells the truth about what is and is not active. G2. |
| **Q5** — token lifetime, 72h or 7 days? | The second stage, already built. | **Keep 7 days.** An elderly member checking email weekly is the actual population, and the operator route now exists as the fallback for anyone who misses it, so the cost of expiry is a phone call rather than a dead end. Revisit if a token is ever abused. |
| **Q6** — may a member self-report blood type? | The second-stage form. | **No — remove it from the member-facing form; keep it on the operator form.** A confidently-wrong blood type is worse than a blank one, and an operator can say "we have this from your doctor" where a web form cannot. This is a small change to a form that already exists, and it is not in this goal. |
| **Q7** — retention for records that never became members | Increment 2 creates them. | **90 days, then delete.** Long enough for a follow-up call cycle, short enough to defend. Needs to be a scheduled job, which is its own PR. |
| **Q8** — consent before the first email to a staff-created record | Increment 2. | **Record that the member agreed on the call, with the operator and timestamp** — the provenance mechanism from #160 already does exactly this shape and can carry it. Whether that is a sufficient lawful basis is a GDPR question, not an engineering one, and it should go to whoever owns that. |

---

## 9. Production reality — do not build around it

Verified by Lee, not by me (this sandbox has no DB credentials):

- **All 24 previously-pending migrations are now applied.** The database is current with `main`
  for the first time. So the RLS harness — which runs the real migration set against real
  PostgreSQL — is now testing the schema production actually has.
- **Migrations do not auto-deploy.** Every merge that adds one needs a manual `supabase db
  push`. Assume nothing is applied until it is. Increment 3 is the control for this.
- **Production has exactly two members, both test rows, both `active` with zero
  subscriptions** — a state golden rule 4 says cannot happen. They predate #138.
  **Nothing in this design accommodates them.** They are test data in an impossible state and
  the right treatment is deletion, not a code path. Recorded in `STATE.md` rather than designed
  around.
  > §2 is a plausible mechanism for how a row reaches `active` with no subscription, and it is
  > still open. That does not mean it is how these two got there — they predate the relevant
  > changes and nobody has traced them. Stated as a hypothesis, not a finding.

---

## 10. Increments — one concern per branch, each cut from a green `main`, never stacked

| # | Branch | Concern | Human gate |
|---|---|---|---|
| 0 | `docs/payer-model-design` | **This document.** No code. | no |
| 1 | `feat/payer-billing-relation` | `payers` + `subscriptions.payer_id` + RLS + §5 assertions | **YES — RLS** |
| 2 | `feat/staff-initiated-onboarding` | The real `AddMemberWizard`: creates a member, optionally a payer, issues a second-stage token | no schema; staff surface |
| 3 | `ci/migration-drift-gate` | CI fails a PR that adds a migration while an earlier one is still unapplied | no |
| 4 | `fix/member-status-not-self-writable` | §2 — a member can set their own `members.status = 'active'` | **YES — activation-adjacent** |

**Increment 1 before increment 2** (2 attaches a payer, 1 defines one). 3 and 4 are independent
of both. **Nothing is merged by the loop.**
