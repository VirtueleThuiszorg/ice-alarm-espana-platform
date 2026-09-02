-- Consent scoping for family carers — GOALS.md G4.
--
-- Design: CONSENT_MODEL.md. Read it before changing anything here; the
-- decisions below are argued there rather than repeated in full.
--
-- G4 requires that "family sees only what the member has consented to share"
-- and that "RLS enforces this in the database, not the UI". Until now there was
-- no family carer in this schema at all — no role, no table, no policy — so
-- PRELAUNCH_AUDIT.md recorded G4 as unmet with nothing to test. This migration
-- opens that door, and opens it narrowly.
--
-- Shape: one revocable row per (member, carer, category) over three categories.
-- Every policy consults a live EXISTS against this table, so a revocation takes
-- effect on the next query — there is no cache, no materialised view and no
-- session-scoped grant list to invalidate.
--
-- Carers are READERS. There is deliberately no carer INSERT, UPDATE or DELETE
-- policy anywhere below. Consent to be watched is not consent to be edited.

-- ── Types ───────────────────────────────────────────────────────────────────

CREATE TYPE public.consent_category AS ENUM ('alerts', 'location', 'medical');

-- `basis` records the footing the grant was made on, NOT who typed it.
--
--   member_self    — the member did it themselves, signed in as themselves.
--   staff_recorded — the member consented by another channel (phone, paper at
--                    sign-up) and staff wrote it down. Same lawful basis, same
--                    consent, different typist.
--
-- There is deliberately NO third value for a legal representative consenting on
-- behalf of an adult with diminished capacity. That is an open question with a
-- Spanish data protection lawyer (CONSENT_MODEL.md §7), and until it is
-- answered the database refuses to record a claim we cannot justify: an attempt
-- to write 'legal_representative' is a type error here, not a policy decision
-- buried in application code. staff_recorded must not be pressed into that role
-- — using it would mean recording a consent that does not exist.
CREATE TYPE public.consent_basis AS ENUM ('member_self', 'staff_recorded');

-- ── The grant ───────────────────────────────────────────────────────────────

CREATE TABLE public.care_access_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,

  -- The named carer. grantee_user_id is nullable so a grant can be recorded
  -- before the carer has an account; until it is linked the grant matches no
  -- auth.uid() and therefore grants nothing. NULL fails closed.
  --
  -- ON DELETE SET NULL, not CASCADE: if the carer deletes their account the
  -- member's record that a grant existed survives, and access is lost rather
  -- than gained. It is also not RESTRICT, so it can never become the thing that
  -- blocks an auth.users delete.
  grantee_name        text NOT NULL,
  grantee_email       text NOT NULL,
  relationship        text NOT NULL,
  grantee_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  category            public.consent_category NOT NULL,

  -- The grant event. granted_by_user_id carries no foreign key on purpose: it
  -- is an audit field, it must survive deletion of the account that performed
  -- the act, and it must never block that deletion.
  granted_at          timestamptz NOT NULL DEFAULT now(),
  granted_by_user_id  uuid NOT NULL,
  basis               public.consent_basis NOT NULL,

  -- The revocation event. Same reasoning on the missing foreign key.
  revoked_at          timestamptz,
  revoked_by_user_id  uuid,

  CONSTRAINT care_access_grants_revocation_complete
    CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL))
);

COMMENT ON TABLE public.care_access_grants IS
  'One revocable consent grant per (member, carer, category). Never deleted by a client — revocation is a state change so the audit trail survives. Design: CONSENT_MODEL.md.';
COMMENT ON COLUMN public.care_access_grants.basis IS
  'The footing the consent stands on, not who typed it. No legal-representative value exists yet — CONSENT_MODEL.md §7.';
COMMENT ON COLUMN public.care_access_grants.grantee_user_id IS
  'NULL until the carer has an account, and NULL again if they delete it. A NULL grantee grants nothing.';

-- One live grant per carer per category. Re-granting after revocation creates a
-- NEW row with its own timestamp and granting party rather than resurrecting
-- the old one, which is what makes the trail readable.
CREATE UNIQUE INDEX care_access_grants_one_live_per_category
  ON public.care_access_grants (member_id, lower(grantee_email), category)
  WHERE revoked_at IS NULL;

-- The predicate every policy below evaluates.
CREATE INDEX care_access_grants_live_lookup
  ON public.care_access_grants (grantee_user_id, member_id, category)
  WHERE revoked_at IS NULL;

CREATE INDEX care_access_grants_member_idx
  ON public.care_access_grants (member_id);

ALTER TABLE public.care_access_grants ENABLE ROW LEVEL SECURITY;

-- ── Predicates ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER so a policy on `alerts` can consult the grants table without
-- recursing into the grants table's own policies.
--
-- The explicit auth.uid() IS NOT NULL guard matters: without it an anonymous
-- request (auth.uid() = NULL) would still be compared against rows whose
-- grantee_user_id is NULL. `NULL = NULL` is NULL rather than true so EXISTS
-- would not match anyway, but relying on three-valued logic for an
-- authorisation decision is not a thing to do in a life-safety product.
CREATE OR REPLACE FUNCTION public.has_care_consent(
  _member_id uuid,
  _category public.consent_category
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.care_access_grants g
    WHERE g.member_id       = _member_id
      AND g.category        = _category
      AND g.grantee_user_id = auth.uid()
      AND g.revoked_at IS NULL
  )
$$;

COMMENT ON FUNCTION public.has_care_consent(uuid, public.consent_category) IS
  'True when the calling user holds a live grant of this category over this member. Evaluated per query, so revocation is immediate.';

-- "Does this carer hold anything at all over this member" — used by the
-- identity accessor, never by a table policy.
CREATE OR REPLACE FUNCTION public.has_any_care_consent(_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.care_access_grants g
    WHERE g.member_id       = _member_id
      AND g.grantee_user_id = auth.uid()
      AND g.revoked_at IS NULL
  )
$$;

-- A member UPDATE on a grant is only ever a revocation, so everything except
-- the revocation columns must be identical to what is stored.
--
-- WHY jsonb RATHER THAN A COLUMN LIST: a hand-written list of columns to pin
-- silently stops being exhaustive the day someone adds a column and forgets to
-- add it here. Subtracting the two mutable keys from the whole row and
-- comparing what is left stays exhaustive by construction.
--
-- WHY A FUNCTION AT ALL: a WITH CHECK expression sees only the NEW row, never
-- OLD, so it cannot express "this must not change" without asking the table
-- what is currently stored. Same pattern, same reason, as
-- staff_privileged_columns_unchanged (20260814120000).
CREATE OR REPLACE FUNCTION public.care_grant_revocation_only(
  _new public.care_access_grants
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.care_access_grants g
    WHERE g.id = _new.id
      AND (to_jsonb(g)    - 'revoked_at' - 'revoked_by_user_id')
        = (to_jsonb(_new) - 'revoked_at' - 'revoked_by_user_id')
  )
$$;

COMMENT ON FUNCTION public.care_grant_revocation_only(public.care_access_grants) IS
  'WITH CHECK helper: the only column an UPDATE may move is the revocation pair. Stays exhaustive when columns are added.';

-- Member identity for a carer, column-scoped.
--
-- public.members deliberately gains NO carer policy: that row carries date of
-- birth, NIE/DNI and the full postal address, and a daughter given alert access
-- has not consented to her mother's identity documents. Postgres cannot
-- column-scope this with GRANTs because staff, members and carers are all the
-- same database role (`authenticated`), so a column grant cannot tell them
-- apart. A SECURITY DEFINER accessor can, and does — it is column-scoped by
-- construction and row-scoped by the same predicate as the policies.
--
-- This half is NOT RLS and CONSENT_MODEL.md §3.3 says so rather than implying
-- otherwise. It is one function whose entire body is one filtered SELECT.
CREATE OR REPLACE FUNCTION public.carer_visible_members()
RETURNS TABLE (
  member_id  uuid,
  first_name text,
  last_name  text,
  city       text,
  categories public.consent_category[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.first_name, m.last_name, m.city,
         array_agg(DISTINCT g.category ORDER BY g.category)
  FROM public.care_access_grants g
  JOIN public.members m ON m.id = g.member_id
  WHERE auth.uid() IS NOT NULL
    AND g.grantee_user_id = auth.uid()
    AND g.revoked_at IS NULL
  GROUP BY m.id, m.first_name, m.last_name, m.city
$$;

COMMENT ON FUNCTION public.carer_visible_members() IS
  'The only route by which a family carer learns a member''s name. Returns name and city only — never DOB, NIE/DNI or address. CONSENT_MODEL.md §3.3.';

REVOKE ALL ON FUNCTION public.has_care_consent(uuid, public.consent_category) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_care_consent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.care_grant_revocation_only(public.care_access_grants) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.carer_visible_members() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_care_consent(uuid, public.consent_category) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_care_consent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.care_grant_revocation_only(public.care_access_grants) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carer_visible_members() TO authenticated, service_role;

-- ── Policies on the grants themselves ───────────────────────────────────────

-- A member can always see who they have given access to. This is the whole
-- point of recording it.
CREATE POLICY "Members view their own grants"
  ON public.care_access_grants FOR SELECT TO authenticated
  USING (member_id = public.get_member_id(auth.uid()));

-- A carer sees what they hold, and nothing else — not other carers of the same
-- member, not grants they do not hold.
CREATE POLICY "Carers view grants held by them"
  ON public.care_access_grants FOR SELECT TO authenticated
  USING (grantee_user_id IS NOT NULL AND grantee_user_id = auth.uid());

CREATE POLICY "Staff view all grants"
  ON public.care_access_grants FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- The member may only grant over their OWN record, only on their own footing,
-- and only naming themselves as the granting party. All three are pinned in the
-- WITH CHECK rather than trusted from the client.
CREATE POLICY "Members grant access over their own record"
  ON public.care_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    member_id          = public.get_member_id(auth.uid())
    AND basis          = 'member_self'
    AND granted_by_user_id = auth.uid()
    AND revoked_at IS NULL
  );

-- Staff record a consent the member gave by another channel. The staff user is
-- named as the granting party, so the record shows a human against the act.
CREATE POLICY "Staff record a grant given by the member"
  ON public.care_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND basis          = 'staff_recorded'
    AND granted_by_user_id = auth.uid()
    AND revoked_at IS NULL
  );

-- Revocation is one-way, and it is the ONLY update anyone can perform.
--
--   USING      … AND revoked_at IS NULL      — you may only revoke a live grant
--   WITH CHECK … AND revoked_at IS NOT NULL  — the write must land revoked
--
-- Together those make un-revoking impossible: once revoked_at is set the row no
-- longer satisfies USING, so no later update can reach it. Re-granting is a new
-- INSERT with its own timestamp and its own granting party.
CREATE POLICY "Members revoke their own grants"
  ON public.care_access_grants FOR UPDATE TO authenticated
  USING (
    member_id = public.get_member_id(auth.uid())
    AND revoked_at IS NULL
  )
  WITH CHECK (
    member_id = public.get_member_id(auth.uid())
    AND revoked_at IS NOT NULL
    AND revoked_by_user_id = auth.uid()
    AND public.care_grant_revocation_only(care_access_grants)
  );

CREATE POLICY "Staff revoke a grant"
  ON public.care_access_grants FOR UPDATE TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND revoked_at IS NULL
  )
  WITH CHECK (
    public.is_staff(auth.uid())
    AND revoked_at IS NOT NULL
    AND revoked_by_user_id = auth.uid()
    AND public.care_grant_revocation_only(care_access_grants)
  );

-- No DELETE policy for anyone. A grant is never removed by a client; the
-- revoked row IS the audit trail. (Erasure of the member cascades it away,
-- which is the one case where it should disappear — CONSENT_MODEL.md §10.)

-- ── The three category policies ─────────────────────────────────────────────
--
-- Each is PERMISSIVE and FOR SELECT only, added alongside the existing staff
-- and member policies. Permissive policies are OR'd, so staff and member access
-- is completely unchanged: this only adds a fourth way in, only for a user
-- holding a live grant, and only for reads.
--
-- A note on the seam between the first two, worth carrying into the member-
-- facing wording: an `alerts` grant necessarily reveals where the member was at
-- the moment something happened, because alerts.location_* is on the alert row
-- and an alert without a location is useless to a family member reacting to it.
-- `location` is the different and more intrusive thing — where they are right
-- now, at any time, whether or not anything has happened.

CREATE POLICY "Consented carers view member alerts"
  ON public.alerts FOR SELECT TO authenticated
  USING (public.has_care_consent(member_id, 'alerts'));

CREATE POLICY "Consented carers view member device location"
  ON public.devices FOR SELECT TO authenticated
  USING (member_id IS NOT NULL AND public.has_care_consent(member_id, 'location'));

CREATE POLICY "Consented carers view member medical information"
  ON public.medical_information FOR SELECT TO authenticated
  USING (public.has_care_consent(member_id, 'medical'));

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Reverses cleanly and completely: the three category policies were added by
-- this migration and nothing else touches them, and dropping the table takes
-- its own policies and indexes with it. Rolling back returns the schema to
-- having no family carer concept at all, which is exactly where it started.
--
--   DROP POLICY IF EXISTS "Consented carers view member medical information" ON public.medical_information;
--   DROP POLICY IF EXISTS "Consented carers view member device location" ON public.devices;
--   DROP POLICY IF EXISTS "Consented carers view member alerts" ON public.alerts;
--   DROP FUNCTION IF EXISTS public.carer_visible_members();
--   DROP FUNCTION IF EXISTS public.has_care_consent(uuid, public.consent_category);
--   DROP FUNCTION IF EXISTS public.has_any_care_consent(uuid);
--   DROP TABLE IF EXISTS public.care_access_grants;   -- takes care_grant_revocation_only's dependency with it
--   DROP FUNCTION IF EXISTS public.care_grant_revocation_only(public.care_access_grants);
--   DROP TYPE IF EXISTS public.consent_basis;
--   DROP TYPE IF EXISTS public.consent_category;
--
-- Rolling back after grants exist DESTROYS the consent audit trail. Export
-- care_access_grants first if there is any live data.
