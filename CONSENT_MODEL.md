# CONSENT_MODEL.md — consent scoping for family carers

**Status:** design, agreed scope not yet agreed by Lee. Implementation is a separate PR.
**Closes:** GOALS.md **G4** — *"family sees only what the member has consented to share… RLS enforces this in the database, not the UI. Consent scoping is tested."*
**Written:** 2026-08-14.

`PRELAUNCH_AUDIT.md` line 104 records the gap plainly: *"Family portal / consent scoping — **MISSING**… no consent-scope model exists"*, and line 106: *"**G4 is not met.** There is no consent scoping to test."* This document is the design that makes G4 testable.

---

## 1. Scope — deliberately small

This is **minimum viable consent scoping**, not a consent framework. The line is drawn here:

**In scope**
- A member grants a **named** family carer access to one or more **categories**: `alerts`, `location`, `medical`.
- Each grant records **when** it was made and **who made it** (the granting party).
- Each grant is independently **revocable**, and revocation takes effect on the very next query.
- **RLS in Postgres** is the enforcement, not the UI, not an edge function.
- Negative behaviour is proven by the isolation harness (`scripts/rls/isolation.sql`, from #123).

**Explicitly out of scope for this pass** (see §9)
- A family portal UI. No screens are built here.
- A carer invitation / account-claim flow (email, token, sign-up).
- Purpose limitation, retention timers, expiring grants, geofencing.
- A consent *receipt* document served to the member.
- Access logging of individual carer reads (§8 explains what we do and do not have).
- Anything that answers the diminished-capacity question (§7 — Lee's lawyer owns it).

The point of stopping here: the database becomes capable of enforcing consent, and the enforcement is proven by execution, before any UI exists that could claim consent scoping that the database does not actually apply. That is the failure mode `AddMemberWizard` had (`PRELAUNCH_AUDIT.md`) and it is the one to avoid.

---

## 2. What exists today

Inventory of the relevant surface as of `a173981`.

| Thing | Reality today |
|---|---|
| `members` | `user_id → auth.users`, unique. One member = one login. Carries name, DOB, NIE/DNI, full address. |
| `medical_information` | 1:1 with member. Conditions, medications, allergies, blood type, doctor. The most sensitive table in the schema. |
| `devices` | The pendant. Carries `last_location_lat/lng/address`, `last_checkin_at`, and also `imei` and `sim_phone_number`. |
| `alerts` | SOS and other alerts. Carries `member_id`, `alert_type`, `status`, and `location_lat/lng/address` **at the time of the alert**. |
| `emergency_contacts` | Name / relationship / phone of a family contact. **Not a login.** Nobody in this table can sign in or read anything. |
| Existing policies on those four | Two shapes only: `is_staff(auth.uid())`, and `user_id = auth.uid()` / `member_id = get_member_id(auth.uid())`. |
| Family carer as a *user* | **Does not exist.** There is no role, no table, no policy. `app_role` is `super_admin \| admin \| call_centre \| call_centre_supervisor` — all staff. |

So there is no family read path to scope down. There is a **hole to open carefully**, which is a better starting position than retrofitting consent onto an existing leak.

---

## 3. The model

### 3.1 One row per (member, carer, category)

A grant is the smallest revocable unit. One row per category — not a single row with three booleans — because:

- Revoking `medical` while keeping `alerts` is a row-level `UPDATE`, not a column edit, so the WITH CHECK that pins the immutable columns stays simple.
- Each category then carries its **own** `granted_at` and `granted_by_user_id`. A member who added medical access three months after alerts access has that fact recorded, which a boolean column cannot express.
- The audit trail is append-plus-revoke: nothing is overwritten.

### 3.2 The three categories, and exactly what each unlocks

| Category | Grants `SELECT` on | Does **not** grant |
|---|---|---|
| `alerts` | `public.alerts` rows for that member | any write; any other member's alerts; the member's profile |
| `location` | `public.devices` rows for that member | any write; device assignment or configuration changes |
| `medical` | `public.medical_information` rows for that member | any write; `member_notes`, `member_interactions` |

Three honest notes about the edges:

1. **An `alerts` grant necessarily reveals location at alert time.** `alerts.location_lat/lng/address` is on the alert row and an alert without a location is useless to a family member reacting to it. So the two categories are *not* disjoint. The distinction we are drawing, and which must be worded this way to the member, is: `alerts` = **where they were when something happened**; `location` = **where they are right now, at any time**. Continuous location is the far more intrusive of the two and is the one a member may reasonably want to withhold.
2. **A `location` grant currently exposes the whole `devices` row**, including `imei` and `sim_phone_number`. Postgres cannot fix this with column-level `GRANT`s, because staff, members and carers are all the same database role (`authenticated`) — a column grant cannot tell them apart. §9 has the phase-2 answer.
3. **`emergency_contacts` is not a category.** Being listed as an emergency contact grants nothing. That is deliberate and worth stating loudly, because "my name is in their phone" is exactly the intuition that leads someone to expect access they were never given.

### 3.3 Member identity is not a category

A carer with a live grant needs to know *whose* alerts they are looking at. The obvious move — add a carer `SELECT` policy to `public.members` — is rejected, because a `members` row carries the date of birth, NIE/DNI and full postal address. A daughter given alert access has not consented to her mother's identity documents, and the member has not consented to sharing them.

So `public.members` gains **no new policy at all**. A carer cannot read that table, ever, granted or not. Instead identity comes from a `SECURITY DEFINER` function that returns only the columns a carer needs:

```sql
public.carer_visible_members()
  → member_id, first_name, last_name, city, categories consent_category[]
```

This is column-scoped by construction and row-scoped by the same predicate as the policies. It is **not** RLS, and the doc says so rather than pretending otherwise: it is a deliberate, single, reviewable function whose entire body is one filtered `SELECT` over the grants table. The isolation harness asserts both halves — that the function returns the consented member, and that the carer still reads zero rows from `public.members` itself.

### 3.4 Nothing a carer can write

There is **no** carer `INSERT`, `UPDATE` or `DELETE` policy anywhere in this design. A carer is a reader. Consent to be watched is not consent to be edited, and a family portal that can change a medication list is a patient-safety problem, not a feature. This is asserted negatively in the harness.

---

## 4. Schema

```sql
CREATE TYPE public.consent_category AS ENUM ('alerts', 'location', 'medical');
CREATE TYPE public.consent_basis    AS ENUM ('member_self', 'staff_recorded');

CREATE TABLE public.care_access_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,

  -- the named carer
  grantee_name        text NOT NULL,
  grantee_email       text NOT NULL,
  relationship        text NOT NULL,
  grantee_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  category            public.consent_category NOT NULL,

  -- the grant event
  granted_at          timestamptz NOT NULL DEFAULT now(),
  granted_by_user_id  uuid NOT NULL,
  basis               public.consent_basis NOT NULL,

  -- the revocation event
  revoked_at          timestamptz,
  revoked_by_user_id  uuid,

  CONSTRAINT care_access_grants_revocation_complete
    CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL))
);
```

Design decisions worth defending:

- **`grantee_user_id` is nullable.** A grant can be recorded before the carer has an account. Until it is linked, the grant matches no `auth.uid()` and therefore grants nothing. `NULL` is the safe direction: it fails closed.
- **`ON DELETE SET NULL` on `grantee_user_id`.** If the carer deletes their account, the grant record survives for the member's audit trail but stops granting access. Access is lost, never gained. (It is also a `SET NULL`, not a `RESTRICT`, precisely so it can never become the thing that blocks an `auth.users` delete — that failure has already cost us once.)
- **`granted_by_user_id` / `revoked_by_user_id` carry no foreign key.** They are audit fields. They must survive the deletion of the account that performed the action, and they must never block that deletion.
- **`ON DELETE CASCADE` on `member_id`.** GDPR erasure of a member removes their grants with them (§10).
- Partial unique index on `(member_id, lower(grantee_email), category) WHERE revoked_at IS NULL` — one live grant per carer per category, and re-granting after revocation creates a **new** row rather than resurrecting the old one.
- Partial index on `(grantee_user_id, member_id, category) WHERE revoked_at IS NULL` — the predicate every policy evaluates.

### 4.1 The predicate

```sql
CREATE FUNCTION public.has_care_consent(_member_id uuid, _category public.consent_category)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.care_access_grants g
    WHERE g.member_id       = _member_id
      AND g.category        = _category
      AND g.grantee_user_id = auth.uid()
      AND g.revoked_at IS NULL
  )
$$;
```

`SECURITY DEFINER` so a policy on `alerts` can consult the grants table without recursing into the grants table's own policies. The explicit `auth.uid() IS NOT NULL` guard means an anonymous request can never match a row whose `grantee_user_id` happens to be `NULL`.

---

## 5. Where enforcement lives

| Table | New policy | Predicate |
|---|---|---|
| `public.alerts` | `SELECT` | `has_care_consent(member_id, 'alerts')` |
| `public.devices` | `SELECT` | `has_care_consent(member_id, 'location')` |
| `public.medical_information` | `SELECT` | `has_care_consent(member_id, 'medical')` |
| `public.members` | **none** | see §3.3 |

Each is `PERMISSIVE` and `FOR SELECT` only, added alongside the existing staff and member policies. Permissive policies are OR'd, so staff and member access is unchanged — this only *adds* a fourth way in, and only for a user holding a live grant.

`care_access_grants` itself:

| Who | Operation | Rule |
|---|---|---|
| Member | `SELECT` | `member_id = get_member_id(auth.uid())` — a member can always see who they have given access to |
| Member | `INSERT` | own `member_id`, `basis = 'member_self'`, `granted_by_user_id = auth.uid()`, `revoked_at IS NULL` |
| Member | `UPDATE` | revoke only — see §6 |
| Carer | `SELECT` | `grantee_user_id = auth.uid()` — a carer can see what they hold, and nothing else |
| Staff | `SELECT` / `INSERT` / `UPDATE` | `is_staff(auth.uid())`, with `basis = 'staff_recorded'` on insert |
| Anyone | `DELETE` | **no policy.** A grant is never deleted by a client; revocation is a state change, so the record survives |

---

## 6. Revocation

Revocation is a **one-way** `UPDATE` and nothing else:

- `USING (… AND revoked_at IS NULL)` — you can only revoke a grant that is currently live.
- `WITH CHECK (… AND revoked_at IS NOT NULL AND core_columns_unchanged(…))` — the write must land in the revoked state, and may not alter `member_id`, `grantee_user_id`, `category`, `basis`, `granted_at` or `granted_by_user_id`.

Together those two make un-revoking impossible: once `revoked_at` is set the row no longer satisfies `USING`, so no further update can touch it. Re-granting is a new `INSERT` with its own timestamp and its own granting party — which is the correct audit story anyway.

`WITH CHECK` sees only `NEW`, never `OLD`, so "these columns must not change" needs a `SECURITY DEFINER` helper that reads the stored row. This is the same pattern as `staff_privileged_columns_unchanged` (migration `20260814120000`), and is used here for the same reason: the policy should refuse on its own, not depend on a trigger being present.

**Immediacy.** There is no cache, no materialised view, no session-scoped grant list. Every policy evaluation runs the `EXISTS` above against the live table, so the first query after the revoking transaction commits already sees `revoked_at IS NOT NULL`. The harness proves this by reading as the carer, revoking in the same script, and reading again — within one run, not by waiting.

---

## 7. Who may grant — and the question we are not answering

`basis` records **on what footing** the grant was made:

- `member_self` — the member did it themselves, signed in as themselves. `granted_by_user_id` is their own auth user.
- `staff_recorded` — a staff member recorded a consent the member gave by another channel (on the phone, on paper at sign-up). `granted_by_user_id` is the staff user, so the record shows a human name against the act.

> ### ⚠️ OPEN LEGAL QUESTION — consent on behalf of an adult with diminished capacity
>
> **This design does not answer it, and the database currently refuses to let anyone pretend it has.**
>
> A real and common case for this product: the member has dementia, or has had a stroke, and cannot give informed consent. A daughter holding a Spanish *poder notarial*, or a court-appointed *curador*, wants access to her mother's alerts. Under GDPR Art. 9 the lawful basis for processing health data in that situation is **not** the member's consent, because there is none to give.
>
> **Lee is taking this to a Spanish data protection lawyer.** Until it comes back, the model deliberately leaves a hole rather than filling it with a guess:
>
> - `consent_basis` has **two** values and neither of them is a legal representative. There is no way to write a grant into this table that claims a third party consented *for* the member. An attempt to insert `'legal_representative'` is a type error at the database layer, not a policy decision buried in application code.
> - `staff_recorded` is **not** that hole and must not be used as it. It means *the member consented, and staff wrote it down*. It carries the same lawful basis as `member_self` — the member's own consent — and differs only in who typed it. Using it for an incapacitated member would be recording a consent that does not exist, which is the exact dishonesty G5 bans.
> - The extension point, when the answer arrives, is a new enum value plus the columns it requires (proof of authority: document type, reference, issuing notary or court, expiry). `ALTER TYPE … ADD VALUE` is a small migration; we did the same for `'nl'` in `20260814130000`.
>
> **What Lee needs from the lawyer, concretely:** (a) what instrument is sufficient in Spain — *poder notarial*, *curatela*, something else; (b) whether we must hold a copy of it or only a reference; (c) whether the member must be told access was granted, and by what means, when they cannot consent; (d) whether Art. 9(2)(c) *vital interests* covers alerts specifically, which would let alert access stand on a different footing from medical-record access; (e) how capacity is to be assessed and re-assessed, and by whom.
>
> Until then: **a member with diminished capacity cannot have a carer granted access through this system.** That is a real product limitation and it should be said out loud rather than worked around.

---

## 8. Auditability

G4 requires *"every access is auditable"*. What this design actually delivers, stated precisely:

- **Auditable now: the grant lifecycle.** Every grant and every revocation is a durable row with a timestamp and a named actor. Nothing is deleted. A member (or a regulator) can ask "who has ever been given access to my medical record, by whom, and when was it taken away" and the table answers completely.
- **Not delivered here: per-read logging.** We do not record that a carer opened an alert at 14:32. Doing that properly means logging at the query layer, which is a separate concern with its own retention and cost questions, and building it badly (a trigger on `SELECT`, which Postgres does not have) is worse than not building it.

Calling the grant trail "every access is auditable" would be overclaiming. It is not. G4's audit clause is **partially** met by this work, and `STATE.md` should say so in those words.

---

## 9. What this deliberately does not do

| Deferred | Why | What it would take |
|---|---|---|
| Family portal UI | Nothing should render consented data until the database provably scopes it. That order is the whole point. | Routes under `src/pages/family`, a carer session, `carer_visible_members()` as the entry query |
| Carer invite / account claim | The grant already tolerates `grantee_user_id IS NULL`, so the flow can be added without touching the model | An edge function issuing a token, in the shape of `member_update_tokens` |
| Column-scoping `devices` (§3.2 note 2) | Impossible while staff, members and carers share the `authenticated` role | A distinct `carer` database role, or a `SECURITY DEFINER` accessor per category, mirroring `carer_visible_members()` |
| Expiring / time-boxed grants | Not needed for launch; adds a scheduler dependency | `expires_at` plus `AND (expires_at IS NULL OR expires_at > now())` in the predicate — a one-line change to `has_care_consent` |
| Per-read access log | §8 | A logged accessor function per category, replacing direct table reads |
| Consent receipt to the member | Needs the email transport that is still not cut over | A template plus the existing notification path |

---

## 10. GDPR notes

- **Erasure of the member** removes their grants by `ON DELETE CASCADE`. Because `grantee_email` and `grantee_name` are the *carer's* personal data held in the member's record, that cascade is required, not incidental. `gdpr-delete-member` deletes the `members` row, so this is covered without changing that function — but the audit-tables list in it should name `care_access_grants` so a future reader does not assume it was missed.
- **Erasure of the carer** is `ON DELETE SET NULL`: the link dies, the member's record that a grant once existed survives. If a carer exercises erasure against *their* name and email in the grant row, that is a separate request against a separate data subject and is not automated here.
- **Data minimisation** (G4's "collect only what's needed") is the reason for §3.3 and for the category split. A carer given `alerts` sees alerts, not an address and a DNI.
- **Lawful basis** for the carer's access is the member's Art. 9(2)(a) explicit consent, recorded by `basis` and `granted_at`. §7 is where that basis does not hold.

---

## 11. How this is proven

Assertions added to `scripts/rls/isolation.sql` (the #123 harness), negative-first per GOALS.md's adversarial stop conditions. Seeded: member A, member B, carer C granted `alerts` **only** on member A, and carer D granted nothing by anyone.

| # | Assertion | Shape |
|---|---|---|
| 1 | carer C reads member A's alerts | positive — the mechanism works at all |
| 2 | carer C reads **zero** rows of member A's `medical_information` | negative |
| 3 | carer C reads **zero** rows of member A's `devices` | negative |
| 4 | carer C reads **zero** rows of `public.members` — consent is not identity | negative |
| 5 | carer C reads member A's identity via `carer_visible_members()` | positive — §3.3 both halves |
| 6 | carer C reads **zero** of member B's alerts (never granted) | negative |
| 7 | carer D — granted nothing — sees zero alerts, zero medical, zero devices, zero members | negative |
| 8 | after revoking C's `alerts` grant, C reads **zero** alerts, in the same run | negative, immediacy |
| 9 | C cannot un-revoke: `UPDATE … SET revoked_at = NULL` affects 0 rows | negative, §6 |
| 10 | C cannot `UPDATE` or `DELETE` an alert, a device or a medical record | negative, §3.4 |
| 11 | C cannot insert a grant for themselves on member B | negative — the escalation that matters most |
| 12 | member A cannot forge `basis`/`granted_by_user_id` on insert | negative |
| 13 | a live grant with `grantee_user_id IS NULL` grants nothing to anonymous | negative, fails-closed |
| 14 | CONTROL: the seed really contains alerts for both members | the suite must be able to fail |

---

## 12. Open questions for Lee

1. **§7 — diminished capacity.** The blocker. Nothing else here is contentious by comparison.
2. **Does staff-recorded consent go live at launch, or member-self only?** `staff_recorded` is the pragmatic path (members are elderly; the phone is the real channel) but it puts an operator between the member and the record. Both are built; which is exposed first is a product call.
3. **Is `location` sold as a feature, or offered as a permission?** It is the most intrusive category and the one most likely to be granted by default if the UI presents three tick-boxes with all three pre-ticked. Recommendation: nothing pre-ticked, and `location` phrased as continuous tracking in plain language.
4. **Should a member be *told* when a carer reads something?** Cheaper and arguably more useful than a full access log (§8), and a strong dignity signal. Not built.
5. **Does the payer get access automatically?** `MEMBER_ONBOARDING.md` §4 asks whether the payer is the member. If Lee picks option B (payer is a distinct linked person), the follow-up is whether paying implies a grant. **Recommendation: no.** Paying for someone's care is not consent from that someone, and coupling them would undo this whole model. It should be an explicit grant like any other.
