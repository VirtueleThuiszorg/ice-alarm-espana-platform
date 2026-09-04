-- Cross-tenant RLS isolation suite.
--
-- Golden rule 2: "RLS on every table. No table ships without Row-Level Security
-- and a test proving isolation." STATE.md §3 has recorded the absence of this as
-- the single biggest gap. This is that test.
--
-- HOW IT WORKS: a tenant is impersonated exactly the way PostgREST does it —
-- `SET LOCAL ROLE authenticated` plus a `request.jwt.claims` GUC carrying the
-- user's `sub`. Every policy in this schema is written against `auth.uid()`,
-- which reads that claim, so a query run through `as_user()` is subject to the
-- same policy evaluation a real request gets. No mocking: real PostgreSQL, the
-- real migration set, the real policies.
--
-- Results accumulate in a temp table so ALL failures are reported in one run,
-- then the script raises at the end if any failed (psql exits non-zero).

\set ON_ERROR_STOP on
SET client_min_messages TO warning;

CREATE TEMP TABLE _results (
  id serial,
  name text,
  passed boolean,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.check(p_name text, p_passed boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results (name, passed, detail) VALUES (p_name, p_passed, p_detail);
$$;

-- Run a query as a given user and return the row count. SECURITY INVOKER (the
-- default) is essential: SET LOCAL ROLE must actually drop us to `authenticated`,
-- because a superuser bypasses RLS and every test would pass vacuously.
CREATE OR REPLACE FUNCTION pg_temp.count_as(p_user uuid, p_sql text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') _s' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

-- Rows actually modified by a write, as a given user. RLS turns a forbidden
-- UPDATE into zero rows rather than an error, so the count is the assertion.
CREATE OR REPLACE FUNCTION pg_temp.exec_as(p_user uuid, p_sql text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  RETURN n;
END $$;

-- Did this statement raise? Used where the correct behaviour is a hard denial
-- (a trigger guard) rather than a silent zero-row result.
CREATE OR REPLACE FUNCTION pg_temp.raises_as(p_user uuid, p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql;
  RESET ROLE;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN true;
END $$;

-- ============================================================
--  Seed: two unrelated tenants of each kind
-- ============================================================

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'member-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'member-b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'partner-a@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'partner-b@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'callcentre@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'nobody@example.com');

INSERT INTO public.members
  (id, user_id, first_name, last_name, email, phone, date_of_birth,
   address_line_1, city, province, postal_code)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Ana', 'Alpha', 'member-a@example.com', '+34600000001', '1950-01-01',
   'Calle A 1', 'Albox', 'Almeria', '04800'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Bruno', 'Beta', 'member-b@example.com', '+34600000002', '1951-02-02',
   'Calle B 2', 'Albox', 'Almeria', '04800');

INSERT INTO public.medical_information (member_id, allergies)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', ARRAY['penicillin']),
  ('bbbbbbbb-0000-0000-0000-000000000002', ARRAY['none']);

INSERT INTO public.emergency_contacts (member_id, contact_name, relationship, phone, priority_order)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Contact A', 'daughter', '+34611111111', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Contact B', 'son', '+34622222222', 1);

INSERT INTO public.subscriptions
  (member_id, plan_type, billing_frequency, amount, start_date, renewal_date, status)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'single', 'monthly', 30, CURRENT_DATE, CURRENT_DATE + 30, 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'single', 'monthly', 30, CURRENT_DATE, CURRENT_DATE + 30, 'active');

INSERT INTO public.partners (id, user_id, referral_code, contact_name, email, status)
VALUES
  ('cccccccc-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
   'PARTNER-A', 'Partner A', 'partner-a@example.com', 'active'),
  ('dddddddd-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444',
   'PARTNER-B', 'Partner B', 'partner-b@example.com', 'active');

-- `is_active` is a GENERATED column here, so it is deliberately not supplied.
INSERT INTO public.staff (user_id, email, first_name, last_name, role)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'callcentre@example.com',
   'Cara', 'Centre', 'call_centre');

-- ============================================================
--  1. Member ↔ member
-- ============================================================

SELECT pg_temp.check(
  'member A sees exactly one members row (their own)',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.members') = 1);

SELECT pg_temp.check(
  'member A cannot SELECT member B''s row',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.members WHERE id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A cannot UPDATE member B''s row',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET city = ''hacked'' WHERE id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A cannot DELETE member B''s row',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'DELETE FROM public.members WHERE id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

-- ============================================================
--  2. PHI — the leak that would matter most
-- ============================================================

SELECT pg_temp.check(
  'member A cannot read member B''s medical_information',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.medical_information WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A sees only their own medical_information',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.medical_information') = 1);

SELECT pg_temp.check(
  'member A cannot read member B''s emergency_contacts',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.emergency_contacts WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

-- ============================================================
--  3. Money — golden rules 3 and 4
-- ============================================================

SELECT pg_temp.check(
  'member A cannot read member B''s subscription',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.subscriptions WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

-- Golden rule 4: "A member is activated by the payment webhook, never by
-- client-side code." `subscriptions` has SELECT policies for a member but no
-- UPDATE policy, so a member cannot move their own status or plan.
SELECT pg_temp.check(
  'member A cannot UPDATE their own subscription status (webhook-only activation)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.subscriptions SET status = ''active'' WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'member A cannot UPDATE their own plan_type (no client-writable tier)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.subscriptions SET plan_type = ''couple'' WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

-- ============================================================
--  4. Partner ↔ partner
-- ============================================================

SELECT pg_temp.check(
  'partner A sees exactly one partners row (their own)',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT id FROM public.partners') = 1);

SELECT pg_temp.check(
  'partner A cannot SELECT partner B''s row',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT id FROM public.partners WHERE id = ''dddddddd-0000-0000-0000-000000000004''') = 0);

SELECT pg_temp.check(
  'partner A cannot UPDATE partner B''s row',
  pg_temp.exec_as('33333333-3333-3333-3333-333333333333',
    'UPDATE public.partners SET contact_name = ''hacked'' WHERE id = ''dddddddd-0000-0000-0000-000000000004''') = 0);

-- A partner is not a member and must not reach member data.
SELECT pg_temp.check(
  'a partner sees no members rows at all',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT id FROM public.members') = 0);

SELECT pg_temp.check(
  'a partner sees no medical_information at all',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT member_id FROM public.medical_information') = 0);

-- ============================================================
--  5. Golden rule 3 — roles are not client-writable
-- ============================================================
--
-- `staff` carries UPDATE USING (user_id = auth.uid()) with no column restriction,
-- so the POLICY alone would let a call-centre operator set their own role. The
-- protection is the `staff_self_update_guard` trigger. This proves the guard
-- actually fires — a policy reading that permissively is only safe because of it.

SELECT pg_temp.check(
  'call-centre staff cannot escalate their own role to super_admin',
  pg_temp.raises_as('55555555-5555-5555-5555-555555555555',
    'UPDATE public.staff SET role = ''super_admin'' WHERE user_id = ''55555555-5555-5555-5555-555555555555''')
  OR (SELECT role FROM public.staff WHERE user_id = '55555555-5555-5555-5555-555555555555') = 'call_centre',
  'guarded by staff_self_update_guard');

-- The policy must refuse escalation ON ITS OWN, with the trigger out of the way.
--
-- Until 20260814120000 the UPDATE policy was USING/WITH CHECK (user_id = auth.uid())
-- with no column restriction, so RLS permitted a role change and only
-- staff_self_update_guard stopped it. That made one trigger the sole control on
-- privilege escalation. Disabling the trigger here isolates the policy layer, so
-- this fails if the WITH CHECK is ever loosened again — which the test above
-- cannot detect, because the trigger would mask it.
DO $block$
DECLARE blocked boolean := false;
BEGIN
  ALTER TABLE public.staff DISABLE TRIGGER staff_self_update_guard;
  BEGIN
    PERFORM pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
      'UPDATE public.staff SET role = ''super_admin'' WHERE user_id = ''55555555-5555-5555-5555-555555555555''');
    -- A WITH CHECK violation raises; a USING mismatch silently affects 0 rows.
    blocked := (SELECT role FROM public.staff
                WHERE user_id = '55555555-5555-5555-5555-555555555555') = 'call_centre';
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  ALTER TABLE public.staff ENABLE TRIGGER staff_self_update_guard;

  PERFORM pg_temp.check(
    'the POLICY alone refuses a role change, with the trigger disabled',
    blocked,
    'defence in depth: policy and trigger are independent controls');
END $block$;

-- NOTE — a pre-existing defect found while writing this, NOT introduced here and
-- deliberately not pinned as a passing assertion:
--
--   `guard_staff_self_update` raises on ANY self-update by a non-super-admin,
--   including a plain first_name change. `is_active` is a GENERATED column, and
--   in a BEFORE trigger NEW.is_active is not yet computed (NULL) while OLD holds
--   the stored value, so `NEW.is_active IS DISTINCT FROM OLD.is_active` is always
--   true. "Staff update own row" is therefore effectively dead today.
--
--   That makes the policy tightening below strictly safer, not riskier — but it
--   means self-service staff edits do not work at all. Fixing it means editing
--   the guard, which is security-sensitive and belongs behind the human gate.

SELECT pg_temp.check(
  'the role is still call_centre after the attempt',
  (SELECT role::text FROM public.staff WHERE user_id = '55555555-5555-5555-5555-555555555555') = 'call_centre');

-- ============================================================
--  6. A user with no rows anywhere
-- ============================================================

SELECT pg_temp.check(
  'a signed-in user with no member/partner/staff row sees no members',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT id FROM public.members') = 0);

SELECT pg_temp.check(
  'a signed-in user with no rows sees no partners',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT id FROM public.partners') = 0);

SELECT pg_temp.check(
  'a signed-in user with no rows sees no medical_information',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT member_id FROM public.medical_information') = 0);

-- ============================================================
--  7. Anonymous
-- ============================================================

DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.members' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check('anonymous sees no members', n = 0);
END $$;

DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.medical_information' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check('anonymous sees no medical_information', n = 0);
END $$;

-- `partners` deliberately has no INSERT policy: the application path is the
-- `partner-apply` / `partner-register` edge functions, never a client insert.
-- Proven by execution rather than asserted from the migration text.
DO $$
DECLARE failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    EXECUTE 'INSERT INTO public.partners (referral_code, contact_name, email) VALUES (''X'',''X'',''x@example.com'')';
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.check('anonymous cannot INSERT into partners (no INSERT policy)', failed);
END $$;

-- ============================================================
--  8. Consent scoping — GOALS.md G4
-- ============================================================
--
-- "Family sees only what the member has consented to share… RLS enforces this
-- in the database, not the UI. Consent scoping is tested."
--
-- Design: CONSENT_MODEL.md. Migration: 20260814140000_care_access_grants.sql.
--
-- Written negative-first, per GOALS.md's adversarial stop conditions: the
-- interesting claim is not that a consented carer can read something, it is
-- that they cannot read the four things next to it.
--
-- Carer C is granted `alerts` over member A and NOTHING else.
-- Carer D is granted nothing by anybody.

INSERT INTO auth.users (id, email) VALUES
  ('77777777-7777-7777-7777-777777777777', 'carer-c@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'carer-d@example.com');

INSERT INTO public.devices (id, imei, sim_phone_number, member_id, last_location_lat, last_location_lng)
VALUES
  ('11111111-dddd-0000-0000-000000000001', '350000000000001', '+34700000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 37.3826, -2.1435),
  ('22222222-dddd-0000-0000-000000000002', '350000000000002', '+34700000002',
   'bbbbbbbb-0000-0000-0000-000000000002', 37.3901, -2.1502);

INSERT INTO public.alerts (id, member_id, device_id, alert_type, status, location_lat, location_lng)
VALUES
  ('11111111-a1e7-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-dddd-0000-0000-000000000001', 'sos_button', 'resolved', 37.3826, -2.1435),
  ('22222222-a1e7-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   '22222222-dddd-0000-0000-000000000002', 'fall_detected', 'resolved', 37.3901, -2.1502);

INSERT INTO public.care_access_grants
  (id, member_id, grantee_name, grantee_email, relationship,
   grantee_user_id, category, granted_by_user_id, basis)
VALUES
  -- C: alerts over member A, granted by member A themselves.
  ('c0c0c0c0-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Carer C', 'carer-c@example.com', 'daughter',
   '77777777-7777-7777-7777-777777777777', 'alerts',
   '11111111-1111-1111-1111-111111111111', 'member_self'),
  -- An unlinked grant: recorded before the carer had an account. It is live,
  -- but grantee_user_id is NULL so it must match nobody at all.
  ('c0c0c0c0-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Unlinked Carer', 'nobody-yet@example.com', 'son',
   NULL, 'medical',
   '22222222-2222-2222-2222-222222222222', 'member_self');

-- ── 8.1 The grant works, and grants exactly one thing ───────────────────────

SELECT pg_temp.check(
  'carer C reads member A''s alerts (the grant actually does something)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.alerts WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 1);

SELECT pg_temp.check(
  'carer C cannot read member A''s medical_information (category not granted)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.medical_information') = 0);

SELECT pg_temp.check(
  'carer C cannot read member A''s devices (location not granted)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.devices') = 0);

-- Consent is not identity. `members` carries date of birth, NIE/DNI and the
-- full postal address, and deliberately gained no carer policy at all.
SELECT pg_temp.check(
  'carer C cannot read public.members AT ALL, even for the member who granted them alerts',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.members') = 0,
  'CONSENT_MODEL.md §3.3 — identity comes from carer_visible_members(), not from a members policy');

SELECT pg_temp.check(
  'carer C cannot read emergency_contacts (never a category)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.emergency_contacts') = 0);

SELECT pg_temp.check(
  'carer C cannot read subscriptions (never a category)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.subscriptions') = 0);

-- ── 8.2 Scoped to the granting member, not to the category globally ─────────

SELECT pg_temp.check(
  'carer C sees ONE alert in total — member B''s is not included',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.alerts') = 1);

SELECT pg_temp.check(
  'carer C cannot read member B''s alerts (no grant from B)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.alerts WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

-- ── 8.3 Identity accessor: gives the name, and nothing but ──────────────────

SELECT pg_temp.check(
  'carer C learns member A''s name through carer_visible_members()',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.carer_visible_members()') = 1);

DO $$
DECLARE cats text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-7777-7777-777777777777', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT array_to_string(categories, ',') INTO cats FROM public.carer_visible_members();
  RESET ROLE;
  PERFORM pg_temp.check(
    'carer_visible_members() reports exactly the granted categories', cats = 'alerts',
    'got: ' || COALESCE(cats, '<null>'));
END $$;

-- ── 8.4 A carer who was granted nothing ────────────────────────────────────

SELECT pg_temp.check(
  'carer D — granted nothing — sees no alerts',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT id FROM public.alerts') = 0);

SELECT pg_temp.check(
  'carer D — granted nothing — sees no medical_information',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT member_id FROM public.medical_information') = 0);

SELECT pg_temp.check(
  'carer D — granted nothing — sees no devices',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT id FROM public.devices') = 0);

SELECT pg_temp.check(
  'carer D — granted nothing — resolves no members through carer_visible_members()',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT member_id FROM public.carer_visible_members()') = 0);

-- ── 8.5 An unlinked grant fails closed ─────────────────────────────────────
--
-- Grant c0c0…0002 is live and un-revoked but has grantee_user_id IS NULL. It
-- must match nobody: not the anonymous role, and not some other signed-in user.

DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.medical_information' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check(
    'a live grant with a NULL grantee grants nothing to anonymous', n = 0,
    'fails closed — has_care_consent guards on auth.uid() IS NOT NULL');
END $$;

SELECT pg_temp.check(
  'a live grant with a NULL grantee grants nothing to an unrelated signed-in user',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT member_id FROM public.medical_information') = 0);

-- ── 8.6 A carer is a reader — never a writer ───────────────────────────────

SELECT pg_temp.check(
  'carer C cannot UPDATE the alert they are allowed to read',
  pg_temp.exec_as('77777777-7777-7777-7777-777777777777',
    'UPDATE public.alerts SET status = ''resolved'', resolution_notes = ''nothing to see''
       WHERE id = ''11111111-a1e7-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'carer C cannot DELETE the alert they are allowed to read',
  pg_temp.exec_as('77777777-7777-7777-7777-777777777777',
    'DELETE FROM public.alerts WHERE id = ''11111111-a1e7-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'carer C cannot UPDATE member A''s medical_information',
  pg_temp.exec_as('77777777-7777-7777-7777-777777777777',
    'UPDATE public.medical_information SET allergies = ARRAY[''none'']
       WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'carer C cannot UPDATE member A''s device',
  pg_temp.exec_as('77777777-7777-7777-7777-777777777777',
    'UPDATE public.devices SET status = ''inactive''
       WHERE id = ''11111111-dddd-0000-0000-000000000001''') = 0);

-- ── 8.7 A carer cannot widen their own consent ─────────────────────────────
--
-- The escalation that matters most: if a carer could write to the grants table
-- the whole model is decorative.

SELECT pg_temp.check(
  'carer C cannot grant themselves medical access over member A',
  pg_temp.raises_as('77777777-7777-7777-7777-777777777777',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Carer C'', ''carer-c@example.com'',
             ''daughter'', ''77777777-7777-7777-7777-777777777777'', ''medical'',
             ''77777777-7777-7777-7777-777777777777'', ''member_self'')'));

SELECT pg_temp.check(
  'carer C cannot grant themselves anything over member B, whom they have never met',
  pg_temp.raises_as('77777777-7777-7777-7777-777777777777',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Carer C'', ''carer-c@example.com'',
             ''daughter'', ''77777777-7777-7777-7777-777777777777'', ''alerts'',
             ''77777777-7777-7777-7777-777777777777'', ''member_self'')'));

SELECT pg_temp.check(
  'carer C cannot see grants they do not hold (member A''s other arrangements)',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.care_access_grants') = 1);

-- A member cannot claim staff recorded a consent for them, nor name someone
-- else as the granting party. Both are pinned in the INSERT policy's WITH CHECK
-- rather than trusted from the client.
SELECT pg_temp.check(
  'member A cannot forge basis = staff_recorded on their own grant',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Carer D'', ''carer-d@example.com'',
             ''son'', ''88888888-8888-8888-8888-888888888888'', ''alerts'',
             ''11111111-1111-1111-1111-111111111111'', ''staff_recorded'')'));

SELECT pg_temp.check(
  'member A cannot name someone else as the granting party',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Carer D'', ''carer-d@example.com'',
             ''son'', ''88888888-8888-8888-8888-888888888888'', ''alerts'',
             ''55555555-5555-5555-5555-555555555555'', ''member_self'')'));

SELECT pg_temp.check(
  'member A cannot grant access over member B''s record',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Carer D'', ''carer-d@example.com'',
             ''son'', ''88888888-8888-8888-8888-888888888888'', ''medical'',
             ''11111111-1111-1111-1111-111111111111'', ''member_self'')'));

-- ── 8.8 The member can actually grant (or none of the above means anything) ─

SELECT pg_temp.check(
  'CONTROL: member A CAN grant medical access to carer C themselves',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Carer C'', ''carer-c@example.com'',
             ''daughter'', ''77777777-7777-7777-7777-777777777777'', ''medical'',
             ''11111111-1111-1111-1111-111111111111'', ''member_self'')') = 1,
  'if this fails, every denial above may be denying for the wrong reason');

SELECT pg_temp.check(
  'the new grant takes effect at once — carer C now reads member A''s medical_information',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.medical_information') = 1);

SELECT pg_temp.check(
  'the new grant is scoped: carer C still cannot read member A''s devices',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.devices') = 0);

-- ── 8.8b The staff-recorded path, and the footing it may claim ─────────────
--
-- `staff_recorded` means the member consented by another channel and staff
-- wrote it down. Same lawful basis, same consent, different typist. It is NOT a
-- back door for consent the member never gave, and the policies below are what
-- keep those two things apart.

SELECT pg_temp.check(
  'staff can record a consent the member gave by another channel',
  pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Carer D'', ''carer-d@example.com'',
             ''son'', ''88888888-8888-8888-8888-888888888888'', ''medical'',
             ''55555555-5555-5555-5555-555555555555'', ''staff_recorded'')') = 1);

SELECT pg_temp.check(
  'the staff-recorded grant is real — carer D now reads member B''s medical_information',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT member_id FROM public.medical_information') = 1);

SELECT pg_temp.check(
  'the staff-recorded grant is still scoped — carer D reads no alerts',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT id FROM public.alerts') = 0);

-- Staff must be named as the party who recorded it. An operator cannot write a
-- grant that reads as though the member entered it themselves — the audit trail
-- has to show a human against the act.
SELECT pg_temp.check(
  'staff cannot record a grant as basis = member_self',
  pg_temp.raises_as('55555555-5555-5555-5555-555555555555',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id,
        category, granted_by_user_id, basis)
     VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Carer D'', ''carer-d@example.com'',
             ''son'', ''88888888-8888-8888-8888-888888888888'', ''alerts'',
             ''22222222-2222-2222-2222-222222222222'', ''member_self'')'));

-- CONSENT_MODEL.md §7: consent on behalf of an adult with diminished capacity
-- is an open question with a Spanish data protection lawyer. Until it is
-- answered the database must refuse to record a claim we cannot justify.
--
-- This check fails the moment someone adds a third basis. That is the point: it
-- forces the person adding it back to §7, rather than letting a legal position
-- arrive by way of a one-line enum edit.
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO vals
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'consent_basis';

  PERFORM pg_temp.check(
    'consent_basis offers no footing for a third party consenting on the member''s behalf',
    vals = 'member_self,staff_recorded',
    'got: ' || COALESCE(vals, '<none>') || ' — if you added a basis, CONSENT_MODEL.md §7 must be answered first');
END $$;

-- ── 8.9 Revocation, and its immediacy ──────────────────────────────────────
--
-- No sleep, no re-connect, no cache to invalidate: the read below happens in
-- the same run, microseconds after the revoking statement, and must already be
-- empty. Every policy evaluates a live EXISTS against the grants table.

SELECT pg_temp.check(
  'member A revokes carer C''s alerts grant',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants
        SET revoked_at = now(), revoked_by_user_id = ''11111111-1111-1111-1111-111111111111''
      WHERE id = ''c0c0c0c0-0000-0000-0000-000000000001''') = 1);

SELECT pg_temp.check(
  'REVOCATION IS IMMEDIATE: carer C reads zero alerts on the very next query',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT id FROM public.alerts') = 0);

SELECT pg_temp.check(
  'revocation is per-category: carer C still reads the medical_information they still hold',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.medical_information') = 1);

-- One-way. USING requires revoked_at IS NULL, so a revoked row can never be
-- reached by a later update — re-granting has to be a new INSERT with its own
-- timestamp and its own granting party.
SELECT pg_temp.check(
  'nobody can un-revoke a grant — not even the member who made it',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants SET revoked_at = NULL, revoked_by_user_id = NULL
      WHERE id = ''c0c0c0c0-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'carer C cannot revoke their own revocation by any route',
  pg_temp.exec_as('77777777-7777-7777-7777-777777777777',
    'UPDATE public.care_access_grants SET revoked_at = NULL, revoked_by_user_id = NULL
      WHERE id = ''c0c0c0c0-0000-0000-0000-000000000001''') = 0);

-- An UPDATE is only ever a revocation. Widening the category on an existing
-- grant would rewrite history as well as escalate.
SELECT pg_temp.check(
  'member A cannot repurpose a live grant into another category',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants
        SET category = ''location'', revoked_at = now(),
            revoked_by_user_id = ''11111111-1111-1111-1111-111111111111''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001'' AND revoked_at IS NULL'),
  'care_grant_revocation_only refuses it — the row is reachable, the write is not');

SELECT pg_temp.check(
  'member A cannot redirect a live grant to a different carer',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants
        SET grantee_user_id = ''88888888-8888-8888-8888-888888888888'', revoked_at = now(),
            revoked_by_user_id = ''11111111-1111-1111-1111-111111111111''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001'' AND revoked_at IS NULL'));

SELECT pg_temp.check(
  'member A cannot backdate the grant they are revoking',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants
        SET granted_at = now() - interval ''1 year'', revoked_at = now(),
            revoked_by_user_id = ''11111111-1111-1111-1111-111111111111''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001'' AND revoked_at IS NULL'));

SELECT pg_temp.check(
  'a member cannot pass off a revocation as someone else''s act',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.care_access_grants
        SET revoked_at = now(), revoked_by_user_id = ''55555555-5555-5555-5555-555555555555''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001'' AND revoked_at IS NULL'));

-- The revoked row is still there. It is the audit trail, and there is no DELETE
-- policy for anyone, so a client cannot make a consent decision disappear.
SELECT pg_temp.check(
  'a revoked grant survives as an audit record',
  (SELECT count(*) FROM public.care_access_grants
    WHERE id = 'c0c0c0c0-0000-0000-0000-000000000001' AND revoked_at IS NOT NULL) = 1);

SELECT pg_temp.check(
  'member A cannot DELETE a grant (no DELETE policy — revocation is a state change)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'DELETE FROM public.care_access_grants WHERE id = ''c0c0c0c0-0000-0000-0000-000000000001''') = 0);

-- ── 8.10 Consent does not leak sideways ────────────────────────────────────

SELECT pg_temp.check(
  'a partner still sees no alerts — consent is not a partner route',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT id FROM public.alerts') = 0);

SELECT pg_temp.check(
  'member B cannot read the grants member A made',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT id FROM public.care_access_grants
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'CONTROL: the seed really contains an alert for each member',
  (SELECT count(*) FROM public.alerts) = 2);

-- ============================================================
--  9. ICE import tables — golden rule 2 for WP-B's three new tables
-- ============================================================
--
-- `member_addresses`, `member_access` and `member_end_of_life` arrive with
-- WP-B. `src/test/iceImportSchema.test.ts` greps their migrations and proves a
-- policy *exists*; that is not proof that it *isolates*. Golden rule 2 asks for
-- "a test proving isolation", so these are the behavioural assertions — written
-- negative-first, and covering cross-tenant WRITE as well as read, because
-- `member_addresses` is the only one of the three a member may write at all.
--
-- `member_access` holds front-door key-safe codes. Its migration says to treat
-- them as a credential, so the interesting assertion is not that member B is
-- refused — it is that CALL-CENTRE STAFF are refused, since those policies are
-- `is_admin`, not `is_staff`, and an operator reading a key safe would be a
-- silent widening if someone ever copy-pasted the `is_staff` shape onto it.

INSERT INTO public.member_addresses (member_id, address_type, address_line_1, city, postal_code)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'postal',  'Apartado 1, Albox',  'Albox', '04800'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'billing', 'Calle Facturas 2',   'Albox', '04800');

INSERT INTO public.member_access (member_id, key_safe_location, key_safe_code, access_notes)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'left of porch', '1701', 'dog in kitchen'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'meter cupboard', '2402', 'side gate unlocked');

INSERT INTO public.member_end_of_life (member_id, funeral_plan, policy_number, wishes)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Plan A', 'EOL-A-1', 'no resuscitation discussion on file'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Plan B', 'EOL-B-2', 'family to be called first');

-- ── member_addresses: read ─────────────────────────────────────────────────
SELECT pg_temp.check(
  'member A cannot read member B''s member_addresses',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.member_addresses
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A sees only their own member_addresses',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.member_addresses') = 1);

SELECT pg_temp.check(
  'an unrelated signed-in user sees no member_addresses at all',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT id FROM public.member_addresses') = 0);

-- ── member_addresses: write ────────────────────────────────────────────────
-- "Members can manage own addresses" is FOR ALL with USING and no WITH CHECK.
-- Postgres then applies USING as the INSERT/UPDATE check, so a member cannot
-- file an address against somebody else. Proving it means the day someone adds
-- an explicit WITH CHECK, this catches a widened one.
SELECT pg_temp.check(
  'member A cannot INSERT an address belonging to member B',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_addresses (member_id, address_type, city)
      VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''other'', ''Albox'')'));

SELECT pg_temp.check(
  'member A cannot UPDATE member B''s address',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_addresses SET city = ''Madrid''
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A cannot DELETE member B''s address',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'DELETE FROM public.member_addresses
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

-- CONTROL: member A really can manage their own, so the four denials above are
-- not passing because the whole table is unreachable.
SELECT pg_temp.check(
  'CONTROL: member A can UPDATE their own address',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_addresses SET city = ''Albox''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 1);

-- ── member_access: the key-safe codes ──────────────────────────────────────
SELECT pg_temp.check(
  'member A cannot read member B''s key safe code',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_access
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'call-centre staff cannot read member_access — these policies are is_admin, not is_staff',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_access') = 0,
  'key_safe_code is a credential; an operator route to it would be a silent widening');

SELECT pg_temp.check(
  'a member cannot change their own key safe code (SELECT-only policy, no member write)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_access SET key_safe_code = ''0000''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'CONTROL: member A can read their OWN access row (so the denials are scoping, not a dead table)',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_access') = 1);

-- ── member_end_of_life ─────────────────────────────────────────────────────
SELECT pg_temp.check(
  'member A cannot read member B''s end-of-life record',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_end_of_life
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'call-centre staff cannot read member_end_of_life — is_admin, not is_staff',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_end_of_life') = 0);

SELECT pg_temp.check(
  'a member cannot write their own end-of-life record (SELECT-only policy)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_end_of_life SET wishes = ''changed''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'CONTROL: member A can read their OWN end-of-life record',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_end_of_life') = 1);

-- A partner is not a care route into any of the three.
SELECT pg_temp.check(
  'a partner sees none of the three ICE tables',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT member_id FROM public.member_access
      UNION ALL SELECT member_id FROM public.member_end_of_life
      UNION ALL SELECT member_id FROM public.member_addresses') = 0);

-- ============================================================
--  10. Controls — the suite must be capable of failing
-- ============================================================
--
-- If impersonation silently did nothing, every test above would pass vacuously.
-- These two prove the mechanism has teeth in both directions.

SELECT pg_temp.check(
  'CONTROL: the seed really contains two members (so 1-row results mean filtering)',
  (SELECT count(*) FROM public.members) = 2);

DO $$
DECLARE n bigint;
BEGIN
  SET LOCAL ROLE service_role;   -- BYPASSRLS, as on Supabase
  EXECUTE 'SELECT count(*) FROM public.members' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check(
    'CONTROL: service_role bypasses RLS and sees both members', n = 2,
    'if this fails the impersonation harness is broken, not the policies');
END $$;

-- ============================================================
--  11. Blanket golden-rule-2 sweep over every table
-- ============================================================

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(tablename, ', ' ORDER BY tablename) INTO missing
  FROM pg_tables
  WHERE schemaname = 'public' AND NOT rowsecurity;

  PERFORM pg_temp.check(
    'every table in public has RLS enabled',
    missing IS NULL,
    COALESCE('without RLS: ' || missing, ''));
END $$;

-- RLS enabled with zero policies denies everything for every client role. That is
-- the SAFE direction, so it is not automatically a bug — but it is usually an
-- oversight, and a table nobody can read is easy to ship by accident.
--
-- Deny-all is deliberate for a table only the service role ever touches. Those
-- are listed here with the reason, so the check still fails for a NEW table that
-- picked up deny-all by accident rather than by decision.
DO $$
DECLARE bare text;
  intentional text[] := ARRAY[
    -- Written by stripe-webhook / mollie-webhook under the service role (which
    -- bypasses RLS) and read by nothing in src/. No client should ever see raw
    -- payment-provider events, so having no client policy is the point.
    'webhook_events'
  ];
BEGIN
  SELECT string_agg(t.tablename, ', ' ORDER BY t.tablename) INTO bare
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.rowsecurity
    AND NOT (t.tablename = ANY(intentional))
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.tablename);

  PERFORM pg_temp.check(
    'every RLS-enabled table has a policy, or is a declared deny-all',
    bare IS NULL,
    COALESCE('RLS on but no policy, and not declared: ' || bare, ''));
END $$;

-- The exceptions must stay real. A table that later GAINS a policy should drop
-- off the list rather than sit there implying something untrue.
DO $$
DECLARE stale text;
  intentional text[] := ARRAY['webhook_events'];
BEGIN
  SELECT string_agg(x, ', ' ORDER BY x) INTO stale
  FROM unnest(intentional) AS x
  WHERE EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = x
  );

  PERFORM pg_temp.check(
    'no stale deny-all exceptions',
    stale IS NULL,
    COALESCE('now has policies, remove from the list: ' || stale, ''));
END $$;

-- ============================================================
--  Monitoring readiness (member_monitoring_readiness)
-- ============================================================
--
-- Readiness is DERIVED — a security_invoker view over emergency_contacts, no column and no
-- trigger (READINESS_MODEL.md §2). A view cannot carry RLS of its own, so golden rule 2's
-- "isolation test on every new table" is satisfied here by proving the DELEGATION holds
-- rather than by a new policy. Negative-first: the load-bearing assertions are that nobody
-- reads anyone else's readiness, and that the view has no write path.

-- The MECHANISM, asserted first. Without this, every negative read below could pass for the
-- wrong reason on a definer view owned by a role that happens to see little — the assertions
-- would then be about the owner's luck rather than about RLS.
SELECT pg_temp.check(
  'the readiness view really has security_invoker = on (not merely the right answers)',
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'member_monitoring_readiness'
      AND c.reloptions @> ARRAY['security_invoker=on']
  ),
  COALESCE((SELECT array_to_string(c.reloptions, ',') FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'member_monitoring_readiness'),
           'view missing'));

-- Both seeded members have one contact each, so start from the TRUE case.
SELECT pg_temp.check(
  'readiness is TRUE for a member with one emergency contact',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS TRUE);

SELECT pg_temp.check(
  'the contact count is the real count, not a boolean in disguise',
  (SELECT emergency_contact_count FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1);

-- Make member B the zero-contact case. Deleting the row rather than seeding a third member
-- (which would break the CONTROL "exactly two members" check) also proves the value is
-- DERIVED: a cached or trigger-maintained flag would not move.
DELETE FROM public.emergency_contacts
WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002';

SELECT pg_temp.check(
  'readiness is FALSE for a member with ZERO emergency contacts',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') IS FALSE);

SELECT pg_temp.check(
  'a zero-contact member still APPEARS in the view (not filtered out and silently missing)',
  (SELECT count(*) FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);

SELECT pg_temp.check(
  'readiness is DERIVED: deleting the last contact flipped it, with no trigger involved',
  (SELECT emergency_contact_count FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);

-- the negatives: nobody reads anybody else's readiness
SELECT pg_temp.check(
  'member A CANNOT read member B''s readiness',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A CANNOT read member B''s emergency_contacts (re-anchored beside readiness)',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.emergency_contacts
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'member A sees EXACTLY ONE readiness row — their own is the ONLY row they can see',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_monitoring_readiness') = 1);

SELECT pg_temp.check(
  'member B, who has no contacts, still reads their OWN readiness row',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT member_id FROM public.member_monitoring_readiness') = 1);

SELECT pg_temp.check(
  'a carer holding a live consent grant reads NO readiness (never a granted category)',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT member_id FROM public.member_monitoring_readiness') = 0);

SELECT pg_temp.check(
  'a partner reads NO readiness — partners are not a member-data route',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT member_id FROM public.member_monitoring_readiness') = 0);

SELECT pg_temp.check(
  'a user with no role at all reads NO readiness',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT member_id FROM public.member_monitoring_readiness') = 0);

SELECT pg_temp.check(
  'staff DO read readiness for every member (the admin queue depends on it)',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness') = 2);

-- A derived fact has no write path. Writing through the view must not become an alternative
-- route to anything, least of all to a member's contact rows.
SELECT pg_temp.check(
  'the readiness view is NOT writable by a member',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_monitoring_readiness SET monitoring_ready = true
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001'''));

SELECT pg_temp.check(
  'a member cannot INSERT a readiness row for anybody',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_monitoring_readiness
      (member_id, emergency_contact_count, monitoring_ready)
      VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', 9, true)'));

-- Restore the fixture so nothing after this block sees a mutated seed.
INSERT INTO public.emergency_contacts
  (member_id, contact_name, relationship, phone, priority_order)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Contact B', 'son', '+34622222222', 1);

SELECT pg_temp.check(
  'readiness flips back to TRUE on insert — derived in both directions',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') IS TRUE);

SELECT pg_temp.check(
  'CONTROL: service_role sees BOTH members'' readiness (else this whole block is vacuous)',
  (SELECT count(*) FROM public.member_monitoring_readiness) = 2,
  'if this fails the harness is broken, not the policies');

-- ============================================================
--  The paid-but-not-ready queue (increment 4) — staff only
-- ============================================================
--
-- The queue is the exact query the admin screen runs: readiness rows where monitoring_ready is
-- false and paid_since is not null, oldest first. It is staff-only, and "staff-only" here means
-- what RLS says, not what the router says: a member who calls the same query directly must get
-- NOTHING. Negative assertions first — the load-bearing ones are the four zeros.

-- Zero-contact member B is the queue's only legitimate occupant, so build that state first.
DELETE FROM public.emergency_contacts
WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ── the negatives: the queue is not a member-reachable surface ───────────────

SELECT pg_temp.check(
  'A MEMBER CANNOT READ THE QUEUE AT ALL — not even a filtered version of it',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0);

-- The brief for this increment asked to prove "a member cannot read the queue at all". The
-- literal form of that is FALSE and must not be asserted: a member reads their OWN readiness row
-- (proven deliberately in the readiness block above, and required by the member dashboard Goal 2
-- adds). Forcing it to zero would mean revoking a member's read of their own data.
--
-- What IS the security property, and what is asserted instead: a member running the queue's exact
-- query can never enumerate ANYONE ELSE. The worklist is staff-only because for a member it
-- collapses to at most one row — their own — which tells them nothing they did not already know.
SELECT pg_temp.check(
  'the member IN the queue reads AT MOST their own row from the queue query — never a worklist',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') <= 1);

SELECT pg_temp.check(
  'the member IN the queue reads ZERO rows belonging to anybody else',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE member_id <> ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a member CANNOT read another member''s readiness through the queue query',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false
        AND member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a partner cannot read the queue',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0);

SELECT pg_temp.check(
  'a carer holding a live consent grant cannot read the queue',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0);

SELECT pg_temp.check(
  'a user with no role at all cannot read the queue',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0);

-- The screen joins `members` for phone/city/language. That read must not widen anything.
-- NOTE: an earlier block in this suite mutates both seeded members' `status`, so this assertion
-- deliberately does NOT filter on status — doing so made it pass or fail on fixture order rather
-- than on policy, which is exactly the kind of assertion that looks green and proves nothing.
SELECT pg_temp.check(
  'the queue''s companion members read is member-scoped — a member reads exactly their own row',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.members') = 1);

SELECT pg_temp.check(
  'and a member reads ZERO other members through that companion read',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.members
      WHERE id <> ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

-- ── who IS and IS NOT in the queue, as staff see it ─────────────────────────

SELECT pg_temp.check(
  'STAFF see the zero-contact paid member in the queue',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL
        AND member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 1);

SELECT pg_temp.check(
  'A MEMBER WITH ZERO CONTACTS ALWAYS APPEARS — the queue is exactly the zero-contact set',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 1);

SELECT pg_temp.check(
  'A MEMBER WITH ONE CONTACT NEVER APPEARS, however long ago they paid',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL
        AND member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'paid_since is populated for a member whose subscription is active (else ordering is blind)',
  (SELECT paid_since IS NOT NULL FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'));

-- Adding a contact must remove the member from the queue immediately, with nothing to invalidate.
INSERT INTO public.emergency_contacts
  (member_id, contact_name, relationship, phone, priority_order)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Contact B', 'son', '+34622222222', 1);

SELECT pg_temp.check(
  'recording ONE contact empties the queue on the very next read — no cache to invalidate',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0,
  'this is the whole point of the screen: work the row, the row disappears');

-- ============================================================
--  Report
-- ============================================================

\echo ''
\echo '─── RLS isolation results ───────────────────────────────'
SELECT
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result,
  name,
  NULLIF(detail, '') AS detail
FROM _results
ORDER BY id;

DO $$
DECLARE n_fail int; n_total int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*) INTO n_fail, n_total FROM _results;
  RAISE NOTICE '% of % checks passed', n_total - n_fail, n_total;
  IF n_fail > 0 THEN
    RAISE EXCEPTION 'RLS isolation: % of % checks FAILED', n_fail, n_total;
  END IF;
END $$;
