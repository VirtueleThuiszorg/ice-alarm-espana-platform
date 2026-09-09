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

-- A NULL assertion is a FAILED assertion, and this used to be a hole in the detector itself.
--
-- Found by mutation, 2026-09-09: a mutation that stopped writing `subscriptions.payer_id`
-- printed a FAIL row for "the payer is attached to the subscription" — and the suite EXITED 0.
-- The assertion was `sub.payer_id = '…'`, which against a NULL column is NULL rather than
-- false; the report renders NULL as FAIL (`CASE WHEN passed THEN 'PASS' ELSE 'FAIL'`), while
-- the exit code came from `count(*) FILTER (WHERE NOT passed)`, and `NOT NULL` is NULL, so the
-- row was counted as neither. Every assertion of the form `<nullable column> = <value>` was
-- therefore un-failable — which is precisely the shape of assertion that matters most here,
-- because "the column we expected to be written is NULL" is the defect.
--
-- COALESCE to false, and say so in the detail: an assertion nobody could evaluate is not a
-- pass, and the reader needs to know which of the two kinds of red they are looking at.
CREATE OR REPLACE FUNCTION pg_temp.check(p_name text, p_passed boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results (name, passed, detail)
  VALUES (
    p_name,
    COALESCE(p_passed, false),
    CASE WHEN p_passed IS NULL
         THEN btrim(p_detail || ' [assertion evaluated to NULL, not false — a comparison '
                    || 'against a NULL column. Counted as a failure.]')
         ELSE p_detail END);
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

-- ── D4: readiness is now TWO conditions (FULFILMENT_MODEL.md §5) ──────────
--
-- This is the assertion the whole increment exists for, and it is RED before the change and
-- GREEN after. Both seeded members have a contact; neither has a tested pendant. Under the
-- old one-condition view member A read READY. Under D4 they must not.
SELECT pg_temp.check(
  'D4: a member with a contact but NO tested pendant is NOT monitoring-ready',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS FALSE,
  'the contact alone used to be enough — this is the lie D4 removes');

SELECT pg_temp.check(
  'and the reason is legible: the contact condition is met, the tested one is not',
  (SELECT emergency_contact_count = 1 AND device_tested_at IS NULL
     FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'the queue must be able to say WHICH condition is missing');

-- Now give member A a pendant that was actually tested, so the TRUE case below is a real
-- two-condition pass rather than the old one-condition one. fulfilment_state is set on INSERT:
-- the trigger governs TRANSITIONS, and seeding a finished order is not a transition.
-- Member A already has a seeded device; reuse it rather than inventing a second, so the
-- Q2 assertions below act on the real member↔device relationship the view reads.
UPDATE public.devices SET status = 'active'
WHERE id = '11111111-dddd-0000-0000-000000000001';

INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state, tested_at)
VALUES ('0dde0000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001',
        'ORD-RLS-A', 100, 21, 121, 'Calle A 1', 'Albox', 'Almeria', '04800',
        'tested', now());

INSERT INTO public.order_items
  (order_id, item_type, description, quantity, unit_price, tax_rate, tax_amount, total_price, device_id)
VALUES ('0dde0000-0000-0000-0000-00000000000a', 'pendant', 'Vivago SOS pendant',
        1, 100, 0.21, 21, 121, '11111111-dddd-0000-0000-000000000001');

SELECT pg_temp.check(
  'readiness is TRUE only once BOTH conditions hold — a contact AND a tested pendant',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS TRUE);

SELECT pg_temp.check(
  'device_tested_at is exposed, so the queue can show when the test happened',
  (SELECT device_tested_at IS NOT NULL FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'));

-- Q2 (Lee, 2026-09-07): a replaced or faulty pendant drops readiness until re-tested. The
-- test proved THAT device worked in THAT home; a replacement has proved nothing yet.
UPDATE public.devices SET status = 'faulty'
WHERE id = '11111111-dddd-0000-0000-000000000001';

SELECT pg_temp.check(
  'Q2: marking the tested pendant FAULTY drops readiness back to not-ready',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS FALSE,
  'correct and unpopular — the evidence belonged to the device, not the member');

SELECT pg_temp.check(
  'Q2: and it is the TESTED condition that dropped, not the contact one',
  (SELECT emergency_contact_count = 1 AND device_tested_at IS NULL
     FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'));

UPDATE public.devices SET status = 'active'
WHERE id = '11111111-dddd-0000-0000-000000000001';

SELECT pg_temp.check(
  'readiness returns once the pendant is in good standing again (derived, not latched)',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS TRUE);

-- Original one-condition assertion, kept and re-anchored: the contact count must still be the
-- real count and not a boolean in disguise.
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

-- Under D4 this assertion had to change, and the change is the point rather than an
-- accommodation. The property it was written to prove — the view is DERIVED, so it moves in
-- both directions with no trigger and nothing to invalidate — is unchanged and is asserted on
-- the contact count. What is no longer true is that a contact ALONE makes a member ready.
SELECT pg_temp.check(
  'the contact count flips back to 1 on insert — derived in both directions',
  (SELECT emergency_contact_count FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);

SELECT pg_temp.check(
  'D4: member B is STILL not ready — a contact is no longer sufficient on its own',
  (SELECT monitoring_ready FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') IS FALSE,
  'member B has never had a pendant tested in their home');

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

-- D4 CHANGES WHAT THIS QUEUE MEANS, and the assertion says so rather than being softened.
-- It used to be the zero-contact set; it is now the not-ready set, which also holds every
-- member still waiting for an in-home test. Recording a contact therefore no longer empties
-- it — the member stays, for a different and still-true reason.
SELECT pg_temp.check(
  'recording ONE contact is read immediately — no cache to invalidate',
  (SELECT emergency_contact_count FROM public.member_monitoring_readiness
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);

SELECT pg_temp.check(
  'D4: but the member STAYS in the queue, now waiting on the in-home test',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL
        AND member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 1,
  'the queue is the not-ready set, and this member is genuinely not ready');

SELECT pg_temp.check(
  'and the queue can say WHICH condition is outstanding, so the row is actionable',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''
        AND emergency_contact_count > 0 AND device_tested_at IS NULL') = 1,
  '"not ready" without a reason is not actionable — D10''s notice has to name the thing');

-- The row does disappear once the outstanding condition is actually met. This is the original
-- "work the row, the row disappears" property, re-anchored to the condition that is now
-- outstanding rather than to the one that already was. Walked one state at a time through the
-- real trigger rather than inserted at `tested`, so the queue is emptied the way staff empty
-- it and not by a shortcut the product does not have.
UPDATE public.devices SET status = 'active'
WHERE id = '22222222-dddd-0000-0000-000000000002';

-- `fulfilment_state` is named rather than left to the DEFAULT, which is now `awaiting_payment`
-- (20260908120400). The walk below starts from `paid`, and an INSERT is not governed by the
-- BEFORE UPDATE trigger, so naming it here is a fixture stating its own premise — not a way
-- around a rule.
INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state)
VALUES ('0dde0000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002',
        'ORD-RLS-B-QUEUE', 100, 21, 121, 'Calle B 2', 'Albox', 'Almeria', '04800', 'paid');

INSERT INTO public.order_items
  (order_id, item_type, description, quantity, unit_price, tax_rate, tax_amount, total_price, device_id)
VALUES ('0dde0000-0000-0000-0000-0000000000b1', 'pendant', 'Vivago SOS pendant',
        1, 100, 0.21, 21, 121, '22222222-dddd-0000-0000-000000000002');

UPDATE public.orders SET fulfilment_state = 'allocated'  WHERE id = '0dde0000-0000-0000-0000-0000000000b1';
UPDATE public.orders SET fulfilment_state = 'programmed' WHERE id = '0dde0000-0000-0000-0000-0000000000b1';
UPDATE public.orders SET fulfilment_state = 'dispatched' WHERE id = '0dde0000-0000-0000-0000-0000000000b1';
UPDATE public.orders SET fulfilment_state = 'delivered'  WHERE id = '0dde0000-0000-0000-0000-0000000000b1';
-- `tested` now REQUIRES a named operator (CC_MASTER_BRIEF.md WP2: "tested requires a staff
-- id"). A migration has no auth.uid() to resolve one from, so the fixture names one explicitly
-- — which is the rule working, not a workaround for it.
UPDATE public.orders SET fulfilment_state = 'tested',
       tested_by = (SELECT id FROM public.staff
                     WHERE user_id = '55555555-5555-5555-5555-555555555555')
 WHERE id = '0dde0000-0000-0000-0000-0000000000b1';

SELECT pg_temp.check(
  'walking the states server-side stamped tested_at without a client supplying it',
  (SELECT tested_at IS NOT NULL FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-0000000000b1'));

SELECT pg_temp.check(
  'completing the in-home test empties the queue on the very next read',
  pg_temp.count_as('55555555-5555-5555-5555-555555555555',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready = false AND paid_since IS NOT NULL') = 0,
  'this is the whole point of the screen: work the row, the row disappears');

-- ============================================================
--  Second-stage provenance and the token endpoint
-- ============================================================
--
-- Once the join wizard stops collecting emergency contacts, submit-member-update is the only
-- route to monitoring-readiness, and the admin tabs are the only other writer of the same rows.
-- Provenance is therefore enforced by a BEFORE trigger rather than by either code path
-- (20260904150000). Negative-first: the load-bearing assertions are that a member cannot reach
-- another member's health data by any route, and that an operator cannot write anonymously.

-- Staff row for attribution assertions. The seed's call-centre staff member is the operator.
CREATE TEMP TABLE _prov AS
SELECT (SELECT id FROM public.staff WHERE user_id = '55555555-5555-5555-5555-555555555555') AS staff_id;

-- ── the token table is not a member-reachable surface ───────────────────────

INSERT INTO public.member_update_tokens (member_id, token, requested_fields, expires_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tok-A-live',
        ARRAY['medical_information','emergency_contacts'], now() + interval '7 days');

SELECT pg_temp.check(
  'a member reads ZERO update tokens — not even their OWN, so none can be enumerated',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.member_update_tokens') = 0,
  'the table is staff-only FOR ALL; a member never needs to read it, they are handed the token');

SELECT pg_temp.check(
  'a member cannot read ANOTHER member''s update token',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT id FROM public.member_update_tokens
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a member cannot MINT a token for themselves',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_update_tokens (member_id, token, requested_fields, expires_at)
      VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''forged-self'', ARRAY[''medical_information''],
              now() + interval ''7 days'')'));

SELECT pg_temp.check(
  'a member cannot mint a token pointed at ANOTHER member',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_update_tokens (member_id, token, requested_fields, expires_at)
      VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''forged-other'', ARRAY[''medical_information''],
              now() + interval ''7 days'')'));

SELECT pg_temp.check(
  'a member cannot un-expire or un-use a token',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_update_tokens
        SET expires_at = now() + interval ''999 days'', used_at = NULL
      WHERE token = ''tok-A-live''') = 0);

SELECT pg_temp.check(
  'a partner reads ZERO update tokens',
  pg_temp.count_as('33333333-3333-3333-3333-333333333333',
    'SELECT id FROM public.member_update_tokens') = 0);

-- ── a member cannot read or write another member's health data, by any route ──

SELECT pg_temp.check(
  'a member CANNOT READ another member''s medical_information',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.medical_information
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a member CANNOT WRITE another member''s medical_information',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.medical_information SET allergies = ARRAY[''forged'']
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a member CANNOT INSERT medical_information against another member''s id',
  COALESCE(pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.medical_information (member_id, allergies)
      VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ARRAY[''forged''])'), false)
  OR (SELECT count(*) FROM public.medical_information
        WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
          AND allergies = ARRAY['forged']) = 0);

SELECT pg_temp.check(
  'a member CANNOT INSERT an emergency contact against another member''s id',
  COALESCE(pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.emergency_contacts (member_id, contact_name, relationship, phone, priority_order)
      VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Forged'', ''none'', ''+34600000999'', 9)'), false)
  OR (SELECT count(*) FROM public.emergency_contacts
        WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
          AND contact_name = 'Forged') = 0);

-- ── provenance: forced from identity, not accepted from the writer ───────────

-- The write and the assertion MUST be separate statements: a scalar subquery in the target
-- list reads the statement-start snapshot and cannot see a row the FROM clause just inserted.
SELECT pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
  'INSERT INTO public.emergency_contacts
     (member_id, contact_name, relationship, phone, priority_order, recorded_via, recorded_by_staff)
   VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Member Claimed'', ''self'', ''+34600000111'', 8,
           ''operator_assisted'', NULL)');

SELECT pg_temp.check(
  'a MEMBER''s own write is stamped member_self, whatever they claim',
  (SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND contact_name = 'Member Claimed') = 'member_self',
  COALESCE((SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND contact_name = 'Member Claimed'), 'no row'));

SELECT pg_temp.check(
  'a member CANNOT claim an operator recorded their data — recorded_by_staff is forced NULL',
  (SELECT recorded_by_staff FROM public.emergency_contacts
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND contact_name = 'Member Claimed') IS NULL);

SELECT pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
  'INSERT INTO public.emergency_contacts
     (member_id, contact_name, relationship, phone, priority_order)
   VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Operator Entered'', ''daughter'', ''+34600000222'', 7)');

SELECT pg_temp.check(
  'AN OPERATOR-ENTERED RECORD IS ATTRIBUTED TO THAT OPERATOR',
  (SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND contact_name = 'Operator Entered') = 'operator_assisted',
  COALESCE((SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND contact_name = 'Operator Entered'), 'no row'));

SELECT pg_temp.check(
  'and names WHICH operator — an operator cannot record anonymously',
  (SELECT recorded_by_staff FROM public.emergency_contacts
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND contact_name = 'Operator Entered') = (SELECT staff_id FROM _prov));

SELECT pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
  'INSERT INTO public.emergency_contacts
     (member_id, contact_name, relationship, phone, priority_order, recorded_via, recorded_by_staff)
   VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''Operator Disguised'', ''son'', ''+34600000333'', 6,
           ''member_self'', NULL)');

SELECT pg_temp.check(
  'an operator cannot attribute their write to the member',
  (SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND contact_name = 'Operator Disguised') = 'operator_assisted',
  COALESCE((SELECT recorded_via FROM public.emergency_contacts
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND contact_name = 'Operator Disguised'), 'no row'));

SELECT pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
  'UPDATE public.medical_information SET doctor_name = ''Dr Operator''
    WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''');

SELECT pg_temp.check(
  'an UPDATE by an operator is re-stamped too — provenance follows the latest writer',
  (SELECT recorded_via FROM public.medical_information
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'operator_assisted',
  COALESCE((SELECT recorded_via FROM public.medical_information
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'no row'));

-- ── the token's attribution shape is a database constraint, not a code path ──

SELECT pg_temp.check(
  'AN OPERATOR SUBMISSION WITH NO OPERATOR IS REFUSED BY THE DATABASE',
  (SELECT NOT EXISTS (
    SELECT 1 FROM (
      SELECT pg_temp.raises_as('55555555-5555-5555-5555-555555555555',
        'UPDATE public.member_update_tokens
            SET submitted_via = ''operator_assisted'', submitted_by_staff = NULL
          WHERE token = ''tok-A-live''') AS r
    ) _x WHERE r = false)),
  'the CHECK refuses it — an anonymous operator record cannot exist');

SELECT pg_temp.check(
  'a member_link submission cannot name an operator',
  pg_temp.raises_as('55555555-5555-5555-5555-555555555555',
    'UPDATE public.member_update_tokens
        SET submitted_via = ''member_link'',
            submitted_by_staff = (SELECT id FROM public.staff LIMIT 1)
      WHERE token = ''tok-A-live'''));

SELECT pg_temp.check(
  'a coherent operator attribution IS accepted',
  pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
    'UPDATE public.member_update_tokens
        SET submitted_via = ''operator_assisted'',
            submitted_by_staff = (SELECT id FROM public.staff
                                   WHERE user_id = ''55555555-5555-5555-5555-555555555555''),
            used_at = now()
      WHERE token = ''tok-A-live''') = 1);

-- ── an expired or used token writes nothing ─────────────────────────────────
-- The endpoint refuses these before any write (submit-member-update, and the same three checks
-- in validate-member-update-token). What the DATABASE must guarantee is that neither state is
-- reachable by the member: a token they cannot read, update or mint cannot be revived.

INSERT INTO public.member_update_tokens (member_id, token, requested_fields, expires_at)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'tok-B-expired',
        ARRAY['emergency_contacts'], now() - interval '1 day');

INSERT INTO public.member_update_tokens (member_id, token, requested_fields, expires_at, used_at)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'tok-B-used',
        ARRAY['emergency_contacts'], now() + interval '7 days', now());

SELECT pg_temp.check(
  'an EXPIRED token cannot be extended by the member it belongs to',
  pg_temp.exec_as('22222222-2222-2222-2222-222222222222',
    'UPDATE public.member_update_tokens SET expires_at = now() + interval ''7 days''
      WHERE token = ''tok-B-expired''') = 0);

SELECT pg_temp.check(
  'a USED token cannot be un-used by the member it belongs to',
  pg_temp.exec_as('22222222-2222-2222-2222-222222222222',
    'UPDATE public.member_update_tokens SET used_at = NULL
      WHERE token = ''tok-B-used''') = 0);

SELECT pg_temp.check(
  'CONTROL: both fixture tokens really exist (else the two checks above are vacuous)',
  (SELECT count(*) FROM public.member_update_tokens
    WHERE token IN ('tok-B-expired','tok-B-used')) = 2,
  'if this fails the harness is broken, not the policies');

-- ============================================================
--  members.status is not self-writable (golden rule 4)
-- ============================================================
--
-- The subscriptions half of webhook-only activation has been proven here since #123. The
-- members.status half was never tested, and was never enforced — a member could set their own
-- status to 'active' (measured, one row). This is that gap closed and asserted.

SELECT pg_temp.check(
  'A MEMBER CANNOT SET THEIR OWN members.status TO active (webhook-only activation)',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET status = ''active''
      WHERE user_id = ''11111111-1111-1111-1111-111111111111'''));

SELECT pg_temp.check(
  'a member cannot set their own status to ANY value, not just active',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET status = ''suspended''
      WHERE user_id = ''11111111-1111-1111-1111-111111111111'''));

SELECT pg_temp.check(
  'a member cannot smuggle a status change inside an ordinary profile update',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET phone = ''+34600009999'', status = ''active''
      WHERE user_id = ''11111111-1111-1111-1111-111111111111'''));

SELECT pg_temp.check(
  'a member CAN still update their own profile — the guard is not a blanket lock',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET phone = ''+34600008888''
      WHERE user_id = ''11111111-1111-1111-1111-111111111111''') = 1,
  'if this fails the guard is too wide and member self-service is broken');

SELECT pg_temp.check(
  'a no-op status write is not refused (idempotent update, same value)',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET status = status
      WHERE user_id = ''11111111-1111-1111-1111-111111111111''') = 1);

SELECT pg_temp.check(
  'STAFF can still change a member''s status — suspending is a real operator action',
  pg_temp.exec_as('55555555-5555-5555-5555-555555555555',
    'UPDATE public.members SET status = ''suspended''
      WHERE id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 1);

-- service_role has no auth.uid(), so the guard lets it through. That is golden rule 4 stated
-- as a code path: the webhook is the only route by which a member becomes active. This runs as
-- service_role (the harness's default connection), so it IS that route.
UPDATE public.members SET status = 'active'
 WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';

SELECT pg_temp.check(
  'service_role (the webhook) CAN still activate — the only route that may',
  (SELECT status::text FROM public.members
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'active',
  'if this fails the guard has locked out the payment webhook itself');
--  Payers — a BILLING relationship, never a care route
-- ============================================================
--
-- PAYER_MODEL.md §4: paying for someone grants no sight of their medical information,
-- location, alerts or emergency contacts. Every instinct pulls the other way — "of course the
-- daughter who pays can see mum's alerts" IS the consent bypass, because it would let a family
-- member acquire sight of an adult's medical record BY PAYING FOR IT without that adult ever
-- agreeing. Negative-first, and with a mechanism assertion so a future convenient policy fails
-- this suite rather than shipping.

INSERT INTO auth.users (id, email) VALUES
  ('99999999-9999-9999-9999-999999999999', 'payer-p@example.com'),
  ('aaaaaaaa-9999-9999-9999-999999999999', 'payer-q@example.com');

-- Payer P pays for member A. Payer Q pays for nobody.
INSERT INTO public.payers (id, user_id, full_name, email, relationship)
VALUES
  ('11111111-aaaa-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999',
   'Paula Payer', 'payer-p@example.com', 'daughter'),
  ('22222222-aaaa-0000-0000-000000000002', 'aaaaaaaa-9999-9999-9999-999999999999',
   'Quentin Payer', 'payer-q@example.com', 'son');

UPDATE public.subscriptions
   SET payer_id = '11111111-aaaa-0000-0000-000000000001'
 WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ── the positive controls, so the negatives below cannot pass vacuously ─────

SELECT pg_temp.check(
  'CONTROL: payer P really is attached to member A''s subscription',
  (SELECT count(*) FROM public.subscriptions
    WHERE payer_id = '11111111-aaaa-0000-0000-000000000001') = 1,
  'if this fails every negative below is vacuous');

SELECT pg_temp.check(
  'a payer DOES read the subscription they pay for (else the relation is useless)',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.subscriptions') = 1);

SELECT pg_temp.check(
  'a payer reads their OWN payer row',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.payers') = 1);

-- ── A PAYER CANNOT READ THE MEMBER THEY PAY FOR ────────────────────────────
-- This is §4 as an executable statement: P pays for A and still sees nothing about A.

SELECT pg_temp.check(
  'A PAYER WITH NO CONSENT GRANT CANNOT READ THE MEDICAL INFORMATION OF THE MEMBER THEY PAY FOR',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.medical_information
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a payer cannot read the ALERTS of the member they pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.alerts
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a payer cannot read the DEVICES (and so the location) of the member they pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.devices
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a payer cannot read the EMERGENCY CONTACTS of the member they pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.emergency_contacts
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a payer cannot read the MEMBERS ROW of the member they pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.members') = 0,
  'not even the name — billing needs the payer''s identity, not the member''s record');

SELECT pg_temp.check(
  'a payer cannot read the READINESS of the member they pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT member_id FROM public.member_monitoring_readiness') = 0,
  'readiness is care state and names a gap in someone''s safety chain');

-- ── A PAYER CANNOT READ ANOTHER MEMBER'S DATA ──────────────────────────────

SELECT pg_temp.check(
  'A PAYER CANNOT READ ANOTHER MEMBER''S MEDICAL INFORMATION',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.medical_information
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a payer cannot read another member''s alerts',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.alerts
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a payer cannot read a SUBSCRIPTION they do not pay for',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.subscriptions
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'a payer who pays for NOBODY reads no subscriptions at all',
  pg_temp.count_as('aaaaaaaa-9999-9999-9999-999999999999',
    'SELECT id FROM public.subscriptions') = 0);

SELECT pg_temp.check(
  'a payer cannot read ANOTHER PAYER''s row',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.payers
      WHERE id = ''22222222-aaaa-0000-0000-000000000002''') = 0);

-- ── a payer cannot acquire billing, or grant themselves anything ────────────

SELECT pg_temp.check(
  'a payer cannot REASSIGN payer_id on a subscription they already pay for',
  pg_temp.exec_as('99999999-9999-9999-9999-999999999999',
    'UPDATE public.subscriptions SET payer_id = ''22222222-aaaa-0000-0000-000000000002''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a payer cannot ATTACH THEMSELVES to a subscription they do not pay for',
  pg_temp.exec_as('99999999-9999-9999-9999-999999999999',
    'UPDATE public.subscriptions SET payer_id = ''11111111-aaaa-0000-0000-000000000001''
      WHERE member_id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0,
  'otherwise paying for one member is a route to the billing of every other');

SELECT pg_temp.check(
  'a payer cannot edit their own payer row (no self-UPDATE policy, by design)',
  pg_temp.exec_as('99999999-9999-9999-9999-999999999999',
    'UPDATE public.payers SET email = ''hijack@example.com''
      WHERE user_id = ''99999999-9999-9999-9999-999999999999''') = 0);

SELECT pg_temp.check(
  'a payer cannot INSERT a payer row',
  pg_temp.raises_as('99999999-9999-9999-9999-999999999999',
    'INSERT INTO public.payers (full_name, email) VALUES (''Forged'', ''forged@example.com'')'));

SELECT pg_temp.check(
  'a payer cannot grant THEMSELVES care access over the member they pay for',
  pg_temp.raises_as('99999999-9999-9999-9999-999999999999',
    'INSERT INTO public.care_access_grants
       (member_id, grantee_name, grantee_email, relationship, grantee_user_id, category,
        granted_by_user_id, basis)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Paula Payer'', ''payer-p@example.com'',
             ''daughter'', ''99999999-9999-9999-9999-999999999999'', ''medical'',
             ''99999999-9999-9999-9999-999999999999'', ''member_self'')'),
  'paying is not consenting — CONSENT_MODEL.md refuses third-party consent and this is that');

-- ── A MEMBER CANNOT ALTER THEIR OWN BILLING, OR SEE ANOTHER MEMBER'S PAYER ──

SELECT pg_temp.check(
  'A MEMBER CANNOT ALTER THEIR OWN BILLING',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.subscriptions SET amount = 1
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0,
  'already true — subscriptions is SELECT-only for members. Asserted so it stays true now that
   payer_id exists on the same table');

SELECT pg_temp.check(
  'a member cannot set their own payer_id',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.subscriptions SET payer_id = NULL
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a member cannot INSERT a subscription for themselves (webhook-only activation)',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.subscriptions
       (member_id, plan_type, billing_frequency, amount, start_date, renewal_date, status)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''single'', ''monthly'', 1, CURRENT_DATE,
             CURRENT_DATE + 30, ''active'')'));

SELECT pg_temp.check(
  'A MEMBER CANNOT READ ANOTHER MEMBER''S PAYER',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT p.id FROM public.payers p
      JOIN public.subscriptions s ON s.payer_id = p.id
     WHERE s.member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a member cannot read the payers table at all',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.payers') = 0,
  'a member sees WHO pays via their own subscription row, not by reading payer identities');

-- ── consent is the only route, and it still works ──────────────────────────

SELECT pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
  'INSERT INTO public.care_access_grants
     (member_id, grantee_name, grantee_email, relationship, grantee_user_id, category,
      granted_by_user_id, basis)
   VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''Paula Payer'', ''payer-p@example.com'',
           ''daughter'', ''99999999-9999-9999-9999-999999999999'', ''medical'',
           ''11111111-1111-1111-1111-111111111111'', ''member_self'')');

SELECT pg_temp.check(
  'a payer WITH a member-granted medical consent DOES read medical — the grant is the route',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.medical_information
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 1);

SELECT pg_temp.check(
  'and that same payer STILL reads no alerts — the grant is category-scoped, paying adds nothing',
  pg_temp.count_as('99999999-9999-9999-9999-999999999999',
    'SELECT id FROM public.alerts
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

-- ── THE MECHANISM: no care policy may ever reference payer_id ───────────────
-- Without this, every negative above passes today and a convenient policy ships tomorrow. This
-- asserts the ABSENCE OF A ROUTE, not the absence of a result.
SELECT pg_temp.check(
  'NO POLICY ON ANY CARE TABLE REFERENCES payer_id',
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('members', 'medical_information', 'alerts', 'devices',
                        'emergency_contacts', 'care_access_grants')
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%payer%'
  ),
  COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ') FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('members', 'medical_information', 'alerts', 'devices',
                                'emergency_contacts', 'care_access_grants')
              AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%payer%'),
           'clean — billing grants no care access by construction'));

SELECT pg_temp.check(
  'payer_id appears in exactly ONE policy, and it is on subscriptions',
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%payer%') = 1
  AND (SELECT tablename FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%payer%')
      = 'subscriptions');

-- ============================================================
--  Staff deletion is not blocked by audit foreign keys
-- ============================================================
--
-- Five columns recording WHO DID SOMETHING were declared as bare REFERENCES with no ON DELETE
-- clause, which means NO ACTION: the referenced row cannot be deleted while any referencing row
-- survives. So a staff member who had ever sent a notification, drafted a social post, run a CRM
-- import or issued a member-update token could not be deleted at all.
--
-- SET NULL, not CASCADE — these are AUDIT rows. Cascading would delete the record of what
-- happened because the actor left. Losing the attribution is recoverable; losing the event is
-- not. Same reasoning as care_access_grants.grantee_user_id and payers.user_id.

DO $fk$
DECLARE
  v_staff uuid := (SELECT id FROM public.staff
                    WHERE user_id = '55555555-5555-5555-5555-555555555555');
BEGIN
  INSERT INTO public.member_update_tokens
    (member_id, token, requested_fields, expires_at, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tok-fk-audit',
          ARRAY['emergency_contacts'], now() + interval '7 days', v_staff);
END $fk$;

SELECT pg_temp.check(
  'CONTROL: the token really is attributed to the staff member (else the delete proves nothing)',
  (SELECT created_by FROM public.member_update_tokens WHERE token = 'tok-fk-audit') IS NOT NULL,
  'if this fails the deletion below succeeds vacuously');

-- The actual defect: this DELETE used to raise a foreign-key violation.
DELETE FROM public.staff WHERE user_id = '55555555-5555-5555-5555-555555555555';

SELECT pg_temp.check(
  'A STAFF ROW CAN BE DELETED even when it has audit rows referencing it',
  NOT EXISTS (SELECT 1 FROM public.staff
               WHERE user_id = '55555555-5555-5555-5555-555555555555'));

SELECT pg_temp.check(
  'THE AUDIT ROW SURVIVES the deletion — SET NULL, never CASCADE',
  EXISTS (SELECT 1 FROM public.member_update_tokens WHERE token = 'tok-fk-audit'),
  'cascading would destroy the record of what happened because the actor left');

SELECT pg_temp.check(
  'and its attribution is NULL, not a dangling id',
  (SELECT created_by FROM public.member_update_tokens WHERE token = 'tok-fk-audit') IS NULL);

SELECT pg_temp.check(
  'EVERY nullable FK pointing at staff or auth.users is ON DELETE SET NULL',
  NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t  ON t.oid = c.conrelid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1] AND NOT a.attisdropped
     WHERE c.contype = 'f' AND array_length(c.conkey,1) = 1
       AND c.confdeltype = 'a' AND NOT a.attnotnull
       AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))),
  COALESCE((SELECT string_agg(t.relname||'.'||a.attname, ', ')
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname='public'
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] AND NOT a.attisdropped
    WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.confdeltype='a' AND NOT a.attnotnull
      AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))),
   'clean — no nullable staff/auth FK still blocks a delete'));

SELECT pg_temp.check(
  'no NULLABLE staff/auth FK is CASCADE — audit history must not die with the actor',
  NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t  ON t.oid = c.conrelid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1] AND NOT a.attisdropped
     WHERE c.contype = 'f' AND array_length(c.conkey,1) = 1
       AND c.confdeltype = 'c' AND NOT a.attnotnull
       AND NOT (t.relname = 'members' AND a.attname = 'user_id')  -- see detail: flagged, not fixed here
       AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))),
  COALESCE((SELECT string_agg(t.relname||'.'||a.attname, ', ')
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname='public'
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] AND NOT a.attisdropped
    WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.confdeltype='c' AND NOT a.attnotnull
      AND NOT (t.relname='members' AND a.attname='user_id')
      AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))),
   'clean apart from the one exclusion below'));

-- members.user_id is EXCLUDED from the assertion above, deliberately and visibly.
--
-- It is nullable AND ON DELETE CASCADE to auth.users, which means deleting a login deletes the
-- WHOLE member row -- and with it, by their own cascades, that person's medical_information,
-- emergency_contacts, devices, alerts and subscription. On a life-safety product that is a
-- large consequence hiding behind a small action, and the column being nullable proves a member
-- can exist without a login, so SET NULL ("they no longer have a login; they are still a
-- member") is available and is probably the safer semantic.
--
-- It is NOT changed here because it is an ERASURE POLICY decision, not an audit-attribution
-- fix: cascading may well be exactly what GDPR erasure is supposed to do. Changing it silently
-- inside a PR about staff deletion would be the wrong way to decide it. Recorded in
-- PENDING_FOR_LEE.md as a decision needed.
SELECT pg_temp.check(
  'CONTROL: members.user_id really is the only nullable cascade, so the exclusion is one row',
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname='public'
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] AND NOT a.attisdropped
    WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.confdeltype='c' AND NOT a.attnotnull
      AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))) = 1,
  'if this becomes 2 a new nullable cascade was added and the exclusion is hiding it');

SELECT pg_temp.check(
  'an operator_assisted token still cannot be CREATED without naming the operator',
  pg_temp.raises_as('55555555-5555-5555-5555-555555555555',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, submitted_via, submitted_by_staff)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-anon-operator'',
             ARRAY[''emergency_contacts''], now() + interval ''1 day'',
             ''operator_assisted'', NULL)'),
  'the CHECK became a trigger so a departing staff member does not break history — but the
   write-time guarantee it existed for is unchanged');

-- ============================================================
--  Fulfilment state machine (orders.fulfilment_state) — D9
-- ============================================================
--
-- FULFILMENT_MODEL.md §7. RLS decides WHETHER you may write the row; it has never decided
-- WHICH VALUE you may write. These assert the trigger does, because a rule enforced only in
-- `useOrderActions` is a suggestion — anyone with a session can PATCH the row directly.
--
-- Seeded LAST on purpose: this section adds staff rows, and earlier assertions pick staff with
-- `LIMIT 1`. Adding them earlier would change what those assertions are about.

INSERT INTO auth.users (id, email) VALUES
  ('a5000000-0000-0000-0000-00000000000f', 'supervisor@example.com'),
  ('a6000000-0000-0000-0000-00000000000f', 'ordinary-staff@example.com');

INSERT INTO public.staff (user_id, email, first_name, last_name, role) VALUES
  ('a5000000-0000-0000-0000-00000000000f', 'supervisor@example.com',
   'Sam', 'Supervisor', 'call_centre_supervisor'),
  ('a6000000-0000-0000-0000-00000000000f', 'ordinary-staff@example.com',
   'Otto', 'Ordinary', 'call_centre');

-- A fresh order for member B, pinned at `paid`, to walk forwards through.
INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state)
VALUES ('0dde0000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002',
        'ORD-RLS-B', 100, 21, 121, 'Calle B 2', 'Albox', 'Almeria', '04800', 'paid');

-- THIS ASSERTION USED TO READ "a new order starts at `paid` — the only state the payment webhook
-- may create", against the DEFAULT. That sentence was the F14 defect written down as if it were
-- the design: an order existed before any payment, and starting it at `paid` is what put
-- abandoned checkouts in front of the fulfilment desk. The default is now `awaiting_payment`
-- (asserted in the item 7 section below); this fixture NAMES `paid` because the walk needs it.
SELECT pg_temp.check(
  'the forward-walk fixture is pinned at `paid`, by naming it rather than by default',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000000b') = 'paid');

-- §7.1 — a member cannot write the state at all.
SELECT pg_temp.check(
  'a MEMBER cannot move their own order''s fulfilment_state (no write path at all)',
  pg_temp.exec_as('22222222-2222-2222-2222-222222222222',
    'UPDATE public.orders SET fulfilment_state = ''allocated''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 0,
  'Q1: a member cannot self-report — least of all by writing the state directly');

SELECT pg_temp.check(
  'CONTROL: the member''s write really was refused, the row is still `paid`',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000000b') = 'paid',
  'if this fails the assertion above passed for the wrong reason');

-- §7.5 — nobody can skip a step, not even a supervisor.
--
-- On its OWN order, deliberately. If the skip guard is ever removed, this assertion must go
-- red on its own and report; it must not also derail the forward walk below into a backward
-- move and abort the whole suite before the report prints. A mutation should produce a
-- verdict, not an absence of one — the same distinction run.sh draws between exit 1 and 3.
INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state)
VALUES ('0dde0000-0000-0000-0000-0000000000bc', 'bbbbbbbb-0000-0000-0000-000000000002',
        'ORD-RLS-B-SKIP', 100, 21, 121, 'Calle B 2', 'Albox', 'Almeria', '04800', 'paid');

SELECT pg_temp.check(
  'NOBODY may skip a step: paid → dispatched in one write is refused',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''dispatched''
      WHERE id = ''0dde0000-0000-0000-0000-0000000000bc'''),
  'each state is a claim somebody could check; skipping asserts three with evidence for none');

SELECT pg_temp.check(
  'CONTROL: the skipped order is still `paid` — the refusal was real',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-0000000000bc') = 'paid');

-- §7.2 — ordinary staff CAN move forwards.
SELECT pg_temp.check(
  'ordinary staff CAN move paid → allocated (forward moves are ordinary work)',
  pg_temp.exec_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''allocated''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 1);

SELECT pg_temp.check(
  'and the server stamped allocated_at — not the client, which could lie about it',
  (SELECT allocated_at IS NOT NULL FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000000b'));

SELECT pg_temp.check(
  'ordinary staff CAN move allocated → programmed',
  pg_temp.exec_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''programmed''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 1);

SELECT pg_temp.check(
  'programmed_by names the staff member who did it, resolved server-side from the JWT',
  (SELECT o.programmed_by = (SELECT id FROM public.staff
                              WHERE user_id = 'a6000000-0000-0000-0000-00000000000f')
     FROM public.orders o WHERE o.id = '0dde0000-0000-0000-0000-00000000000b'),
  'the evidence a state leaves is who and when — a client-supplied actor is not evidence');

SELECT pg_temp.check(
  'ordinary staff CAN move programmed → dispatched',
  pg_temp.exec_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''dispatched''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 1);

-- §7.3 — ordinary staff CANNOT move backwards. The heart of D9.
SELECT pg_temp.check(
  'D9: ordinary staff CANNOT move dispatched → programmed — refused in the DATABASE',
  pg_temp.raises_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''programmed''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b'''),
  'not in the UI — a rule you can go around with one PATCH is not a rule');

SELECT pg_temp.check(
  'CONTROL: it really is still dispatched afterwards',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000000b') = 'dispatched');

-- §7.4 — a supervisor CAN.
SELECT pg_temp.check(
  'D9: a call_centre_supervisor CAN move dispatched → programmed, WITH a reason',
  pg_temp.exec_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''programmed'',
            fulfilment_state_reason = ''marked dispatched in error, courier never collected''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 1);

-- CC_MASTER_BRIEF.md WP2: backward moves "require a reason". The role alone is not enough.
--
-- On THEIR OWN order. If either guard is removed, the move succeeds — and on the shared order
-- that would derail every fixture after it and abort the suite instead of reporting. A
-- mutation must produce a verdict, not the absence of one.
INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state, fulfilment_state_reason)
VALUES ('0dde0000-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-000000000002',
        'ORD-RLS-REASON', 100, 21, 121, 'Calle B 2', 'Albox', 'Almeria', '04800',
        'dispatched', 'seeded with a prior reason, so the reuse case below is real');

SELECT pg_temp.check(
  'a supervisor moving backwards with NO reason is REFUSED — the role is not enough',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''allocated''
      WHERE id = ''0dde0000-0000-0000-0000-00000000c001'''),
  'a state somebody undid without saying why is not a correction, it is a discrepancy');

SELECT pg_temp.check(
  'and REUSING the previous reason is refused too — it must be new',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''allocated'',
            fulfilment_state_reason = ''seeded with a prior reason, so the reuse case below is real''
      WHERE id = ''0dde0000-0000-0000-0000-00000000c001'''),
  'without it a second correction inherits the first one''''s sentence and the log describes '
  'a different event');

SELECT pg_temp.check(
  'CONTROL: neither refusal moved the order',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000c001') = 'dispatched');

SELECT pg_temp.check(
  'the correction wrote an activity_logs row naming the move and the reason',
  (SELECT count(*) FROM public.activity_logs
    WHERE action = 'fulfilment_state_corrected'
      AND entity_id = '0dde0000-0000-0000-0000-00000000000b'
      AND reason LIKE '%courier never collected%') = 1,
  'a reason held only in a column is overwritten by the next correction; the log survives');

SELECT pg_temp.check(
  'and it names the acting supervisor, not nobody',
  (SELECT staff_id FROM public.activity_logs
    WHERE action = 'fulfilment_state_corrected'
      AND entity_id = '0dde0000-0000-0000-0000-00000000000b'
    LIMIT 1) = (SELECT id FROM public.staff
                 WHERE user_id = 'a5000000-0000-0000-0000-00000000000f'));

-- ── §7.6 / §7.7 — the commission hazard ───────────────────────────────────
-- `delivered` creates a €50 partner commission, and process-commissions cancels a
-- pending_release commission ONLY if the order reads `cancelled`. An order corrected out of
-- `delivered` is not cancelled — so without the trigger's cancellation the money releases
-- seven days later for a delivery that never happened.

UPDATE public.orders SET fulfilment_state = 'dispatched',
       fulfilment_state_reason = 'fixture: re-advancing for the commission scenario'
WHERE id = '0dde0000-0000-0000-0000-00000000000b';
UPDATE public.orders SET fulfilment_state = 'delivered'
WHERE id = '0dde0000-0000-0000-0000-00000000000b';

INSERT INTO public.partner_commissions (id, partner_id, member_id, order_id, status)
VALUES ('c0111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-000000000003',
        'bbbbbbbb-0000-0000-0000-000000000002', '0dde0000-0000-0000-0000-00000000000b',
        'pending_release');

SELECT pg_temp.check(
  'CONTROL: a pending_release commission exists before the correction',
  (SELECT status FROM public.partner_commissions
    WHERE id = 'c0111111-0000-0000-0000-00000000000b') = 'pending_release',
  'if this fails the cancellation below proves nothing');

SELECT pg_temp.check(
  '§7.6 a supervisor CAN correct delivered → dispatched while money is still pending',
  pg_temp.exec_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''dispatched'',
            fulfilment_state_reason = ''courier returned it undelivered''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 1);

-- Assert the COMMISSION ROW, not the return value: §7.6 is explicit that the return value
-- could be right while the money kept moving.
SELECT pg_temp.check(
  '§7.6 moving OUT of delivered CANCELLED the pending commission, same transaction',
  (SELECT status FROM public.partner_commissions
    WHERE id = 'c0111111-0000-0000-0000-00000000000b') = 'cancelled',
  'a partial correction that leaves the €50 moving is worse than refusing the correction');

SELECT pg_temp.check(
  'and the cancellation says why, so the money has an audit trail',
  (SELECT cancel_reason LIKE '%out of delivered%' FROM public.partner_commissions
    WHERE id = 'c0111111-0000-0000-0000-00000000000b'));

-- Q3 (Lee, 2026-09-07): once the money has moved, REFUSE the correction.
UPDATE public.orders SET fulfilment_state = 'delivered'
WHERE id = '0dde0000-0000-0000-0000-00000000000b';

UPDATE public.partner_commissions SET status = 'paid'
WHERE id = 'c0111111-0000-0000-0000-00000000000b';

-- A FRESH, VALID REASON IS SUPPLIED HERE ON PURPOSE. Without one the refusal below would fire
-- on the missing-reason rule and the assertion would pass for the wrong reason — green while
-- proving nothing about the commission. This move is well-formed in every respect except the
-- one under test.
SELECT pg_temp.check(
  '§7.7 / Q3: moving out of delivered is REFUSED when the commission is already paid',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''dispatched'',
            fulfilment_state_reason = ''member says it never arrived''
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b'''),
  'reversing money already paid is a finance decision, not a data correction');

SELECT pg_temp.check(
  '§7.7 CONTROL: the order still reads delivered after the refusal',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000000b') = 'delivered');

SELECT pg_temp.check(
  '§7.7 CONTROL: and the paid commission was NOT silently reversed',
  (SELECT status FROM public.partner_commissions
    WHERE id = 'c0111111-0000-0000-0000-00000000000b') = 'paid');

-- ── `tested` requires a named operator (CC_MASTER_BRIEF.md WP2) ───────────
-- The state's entire content is that a person answered a real test call, and it is the second
-- half of monitoring readiness (D4). An anonymous one is not evidence, it is an assertion.

INSERT INTO public.orders
  (id, member_id, order_number, subtotal, tax_amount, total_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state)
VALUES ('0dde0000-0000-0000-0000-00000000d001', 'bbbbbbbb-0000-0000-0000-000000000002',
        'ORD-RLS-TESTED', 100, 21, 121, 'Calle B 2', 'Albox', 'Almeria', '04800', 'delivered');

DO $$
DECLARE refused boolean := false;
BEGIN
  -- No auth.uid() here (the migration/service-role path), so no staff id can be resolved.
  -- There is no legitimate automated route to `tested`, so this must be refused rather than
  -- exempted the way the service role is exempted from the D9 role check.
  BEGIN
    UPDATE public.orders SET fulfilment_state = 'tested'
     WHERE id = '0dde0000-0000-0000-0000-00000000d001';
  EXCEPTION WHEN OTHERS THEN
    refused := true;
  END;
  PERFORM pg_temp.check(
    '`tested` with NOBODY NAMED is refused, even for the service role',
    refused,
    'D4 rests on this state; an unattributed one would make readiness a claim nobody made');
END $$;

SELECT pg_temp.check(
  'CONTROL: that order is still `delivered`, so the refusal was real',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000d001') = 'delivered');

SELECT pg_temp.check(
  'naming an operator makes the SAME move succeed',
  (SELECT count(*) FROM (
     SELECT 1 FROM public.orders WHERE id = '0dde0000-0000-0000-0000-00000000d001'
   ) x) = 1);

UPDATE public.orders
   SET fulfilment_state = 'tested',
       -- The supervisor, not staff 5555: that row is DELETED by the staff-delete FK
       -- section above, and a subquery returning NULL here would make the assertion pass
       -- for the wrong reason (refused because nobody exists, not because nobody was named).
       tested_by = (SELECT id FROM public.staff
                     WHERE user_id = 'a5000000-0000-0000-0000-00000000000f')
 WHERE id = '0dde0000-0000-0000-0000-00000000d001';

SELECT pg_temp.check(
  'and it landed, with the operator recorded',
  (SELECT fulfilment_state = 'tested' AND tested_by IS NOT NULL AND tested_at IS NOT NULL
     FROM public.orders WHERE id = '0dde0000-0000-0000-0000-00000000d001'));

-- ── `cancelled` is reachable, and is a correction (CC_MASTER_BRIEF.md WP2) ─
-- "paid -> … -> tested, PLUS CANCELLED." It is not a place in the sequence, so it has no rank:
-- it is reachable from anywhere and leaving it is a correction like any other.

SELECT pg_temp.check(
  '`cancelled` exists in the enum — the seventh state the brief names',
  'cancelled' = ANY (SELECT unnest(enum_range(NULL::public.fulfilment_state))::text));

SELECT pg_temp.check(
  'ORDINARY staff CANNOT cancel an order — cancelling is a correction, D9 applies',
  pg_temp.raises_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''cancelled'',
            fulfilment_state_reason = ''member changed their mind''
      WHERE id = ''0dde0000-0000-0000-0000-00000000d001'''));

SELECT pg_temp.check(
  'a supervisor CANNOT cancel without a reason either',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''cancelled''
      WHERE id = ''0dde0000-0000-0000-0000-00000000d001'''));

SELECT pg_temp.check(
  'a supervisor CAN cancel with a reason, from any state',
  pg_temp.exec_as('a5000000-0000-0000-0000-00000000000f',
    'UPDATE public.orders SET fulfilment_state = ''cancelled'',
            fulfilment_state_reason = ''member returned the pendant and closed the account''
      WHERE id = ''0dde0000-0000-0000-0000-00000000d001''') = 1,
  'cancelled has no rank, so this is a jump the skip rule must not refuse');

SELECT pg_temp.check(
  'cancelling wrote its own activity_logs row',
  (SELECT count(*) FROM public.activity_logs
    WHERE action = 'fulfilment_state_corrected'
      AND entity_id = '0dde0000-0000-0000-0000-00000000d001'
      AND new_values ->> 'fulfilment_state' = 'cancelled') = 1);

-- ── the state machine did not open a read hole ────────────────────────────
SELECT pg_temp.check(
  'member A still CANNOT read member B''s order, fulfilment_state and all',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.orders
      WHERE id = ''0dde0000-0000-0000-0000-00000000000b''') = 0);

SELECT pg_temp.check(
  'a member with no order reads no fulfilment state anywhere',
  pg_temp.count_as('66666666-6666-6666-6666-666666666666',
    'SELECT id FROM public.orders') = 0);

-- §7.9 — the mechanism, so §7.8's negative cannot pass for the wrong reason.
SELECT pg_temp.check(
  '§7.9 the readiness view STILL has security_invoker = on after being replaced',
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'member_monitoring_readiness'
      AND c.reloptions @> ARRAY['security_invoker=on']
  ),
  'the view now reads orders too — a definer view here would leak every member''s readiness');

-- §7.8 — the specific hole the new orders join could have opened.
SELECT pg_temp.check(
  '§7.8 member B CANNOT read member A''s readiness THROUGH the new orders join',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  '§7.8 member A still reads their OWN readiness, tested pendant and all',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_monitoring_readiness
      WHERE monitoring_ready') = 1,
  'the join must not have cost a member sight of their own row');

-- ============================================================
--  WP3 — notification opt-in, templates and delivery record
-- ============================================================
--
-- Golden rule 2: three new tables, so three sets of isolation assertions. Negative-first —
-- the load-bearing claims are that a member cannot see or set anybody else's permission to be
-- contacted, cannot read operational templates at all, and cannot fabricate a delivery record.

-- ── member_notification_optin ─────────────────────────────────────────────
SELECT pg_temp.check(
  'a member CAN record their own opt-in',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_notification_optin
       (member_id, channel, opted_in, opted_in_at)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''sms'', true, now())') = 1);

SELECT pg_temp.check(
  'a member CANNOT record an opt-in for ANOTHER member — consent is not transferable',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_notification_optin
       (member_id, channel, opted_in, opted_in_at)
     VALUES (''bbbbbbbb-0000-0000-0000-000000000002'', ''sms'', true, now())'),
  'opting somebody else in to WhatsApp is the whole thing this table exists to prevent');

SELECT pg_temp.check(
  'CONTROL: no opt-in row was created for member B',
  (SELECT count(*) FROM public.member_notification_optin
    WHERE member_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);

SELECT pg_temp.check(
  'a member CANNOT read another member''s opt-ins',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT id FROM public.member_notification_optin
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a member reads their OWN opt-in',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.member_notification_optin') = 1);

SELECT pg_temp.check(
  'a member CANNOT flip another member''s opt-in by UPDATE',
  pg_temp.exec_as('22222222-2222-2222-2222-222222222222',
    'UPDATE public.member_notification_optin SET opted_in = true
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'a carer holding a live consent grant reads NO opt-ins — never a granted category',
  pg_temp.count_as('88888888-8888-8888-8888-888888888888',
    'SELECT id FROM public.member_notification_optin') = 0);

SELECT pg_temp.check(
  'staff DO read opt-ins (the operator has to know whether they may send)',
  pg_temp.count_as('a5000000-0000-0000-0000-00000000000f',
    'SELECT id FROM public.member_notification_optin') = 1);

-- The CHECK, because a consent record with no date cannot be defended later.
-- On its OWN channel, so that removing the CHECK makes THIS assertion go red and report,
-- rather than letting the insert succeed and collide with the next one on the unique key —
-- which would abort the suite and produce no verdict at all.
SELECT pg_temp.check(
  'an opted-IN row with no timestamp is REFUSED by the database',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_notification_optin (member_id, channel, opted_in)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''whatsapp'', true)'),
  '"we had permission" has to carry a when, or it is an assertion rather than a record');

SELECT pg_temp.check(
  'CONTROL: no whatsapp opt-in row survived that refusal',
  (SELECT count(*) FROM public.member_notification_optin
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND channel = 'whatsapp') = 0);

SELECT pg_temp.check(
  'an opted-OUT row needs no timestamp — nothing is being claimed',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_notification_optin (member_id, channel, opted_in)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''email'', false)') = 1);

-- ── notification_templates: operational content, not member data ──────────
SELECT pg_temp.check(
  'a member CANNOT read notification templates at all',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.notification_templates') = 0);

INSERT INTO public.notification_templates (event_key, channel, locale, body)
VALUES ('pendant_tested', 'sms', 'en', 'Your pendant has been tested.');

-- Scoped to THIS fixture's event_key, not to the whole table. The seed bundle
-- (20260907120000) puts 36 real templates in here, and an assertion that only holds while a
-- table is empty is an assertion that breaks the first time somebody seeds content.
SELECT pg_temp.check(
  'CONTROL: a template really exists, so the member''s empty read means something',
  (SELECT count(*) FROM public.notification_templates
    WHERE event_key = 'pendant_tested') = 1);

SELECT pg_temp.check(
  'a member STILL cannot read it now that one exists',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.notification_templates') = 0);

SELECT pg_temp.check(
  'staff CAN read templates',
  pg_temp.count_as('a5000000-0000-0000-0000-00000000000f',
    'SELECT id FROM public.notification_templates WHERE event_key = ''pendant_tested''') = 1);

SELECT pg_temp.check(
  'ordinary staff CANNOT edit a template — admin only',
  pg_temp.exec_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.notification_templates SET body = ''tampered''') = 0,
  'the words sent to a member in an emergency are not an ordinary edit');

SELECT pg_temp.check(
  'CONTROL: the template body really is untouched',
  (SELECT body FROM public.notification_templates
    WHERE event_key = 'pendant_tested') = 'Your pendant has been tested.');

-- ── member_notification_log: no authenticated write path at all ───────────
INSERT INTO public.member_notification_log (member_id, channel, event_key, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'sms', 'pendant_tested', 'sent');

SELECT pg_temp.check(
  'a member reads their OWN notification history',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.member_notification_log') = 1);

SELECT pg_temp.check(
  'a member CANNOT read another member''s notification history',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT id FROM public.member_notification_log') = 0);

SELECT pg_temp.check(
  'a member CANNOT fabricate a delivery record — no INSERT policy exists',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_notification_log (member_id, channel, event_key, status)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''sms'', ''fake'', ''sent'')'),
  'the record of what was sent is evidence; a client that can write it can rewrite history');

SELECT pg_temp.check(
  'a member CANNOT alter their own delivery record either',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_notification_log SET status = ''failed''') = 0);

SELECT pg_temp.check(
  'and STAFF cannot write it either — the service role is the only writer',
  pg_temp.raises_as('a5000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.member_notification_log (member_id, channel, event_key, status)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''sms'', ''fake'', ''sent'')'));

-- ── the FOUR flags exist and are OFF ──────────────────────────────────────
-- Was three (20260907100200: sms, email, whatsapp). `notify_channel_push` joins them in
-- 20260909120000 — the transport switch push had been missing, which is why the router's
-- outermost gate had nothing to read for it. Named rather than counted: a count of four also
-- passes if somebody drops sms and adds a fourth of their own.
SELECT pg_temp.check(
  'all four notify_channel_* flags exist as rows, so OFF is written rather than missing',
  (SELECT count(*) FROM public.system_settings
    WHERE key IN ('notify_channel_sms', 'notify_channel_email',
                  'notify_channel_whatsapp', 'notify_channel_push')) = 4
  AND (SELECT count(*) FROM public.system_settings WHERE key LIKE 'notify_channel_%') = 4);

SELECT pg_temp.check(
  'and every one of them is OFF — no channel turns itself on by shipping',
  (SELECT bool_and(value = 'false') FROM public.system_settings
    WHERE key LIKE 'notify_channel_%'),
  'turning one on is Lee''s decision (PENDING_FOR_LEE.md §3), not a migration''s');

SELECT pg_temp.check(
  'a member cannot read the channel flags (system_settings is super-admin only)',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT key FROM public.system_settings WHERE key LIKE ''notify_channel_%''') = 0);

-- ============================================================
--  WP5 — circle of care
-- ============================================================
--
-- CIRCLE_OF_CARE.md. The distinction being defended: this is WHO THE PEOPLE ARE.
-- care_access_grants is WHAT THEY MAY SEE, and WP5 does not widen it by a single row.

INSERT INTO auth.users (id, email) VALUES
  ('a7000000-0000-0000-0000-00000000000f', 'admin@example.com');
INSERT INTO public.staff (user_id, email, first_name, last_name, role) VALUES
  ('a7000000-0000-0000-0000-00000000000f', 'admin@example.com', 'Ada', 'Admin', 'admin');

-- ── the contact list can describe the people it holds ─────────────────────
DO $$
DECLARE v_type text; n int := 0;
BEGIN
  FOREACH v_type IN ARRAY ARRAY['emergency','key_holder','carer','care_agency',
                                'nurse','social_worker','neighbour','legal_representative']
  LOOP
    INSERT INTO public.emergency_contacts
      (member_id, contact_name, relationship, phone, priority_order, contact_type)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'C ' || v_type, 'rel', '+34600', 9, v_type);
    n := n + 1;
  END LOOP;
  PERFORM pg_temp.check('all EIGHT contact_type values are accepted', n = 8);
END $$;

SELECT pg_temp.check(
  'a ninth contact_type is REFUSED — the CHECK was widened, not removed',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.emergency_contacts
       (member_id, contact_name, relationship, phone, priority_order, contact_type)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''X'', ''rel'', ''+34600'', 9, ''friend'')'),
  'a widened CHECK that accepts anything is not a widened CHECK');

SELECT pg_temp.check(
  'can_attend_in_person defaults to NULL — unknown is not the same as false',
  (SELECT bool_and(can_attend_in_person IS NULL) FROM public.emergency_contacts),
  'defaulting to false would assert that nobody can attend, which nobody established');

-- ── away status is the member''s to set ───────────────────────────────────
SELECT pg_temp.check(
  'a member CAN set their own away status — the point of recording it at all',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members
        SET away_from = CURRENT_DATE, away_until = CURRENT_DATE + 30,
            pendant_with_member = true
      WHERE id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 1,
  'going to the UK for a month should not require ringing the office');

SELECT pg_temp.check(
  'CONTROL: the away status really landed',
  (SELECT away_until IS NOT NULL AND pendant_with_member
     FROM public.members WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'));

SELECT pg_temp.check(
  'a member CANNOT set ANOTHER member''s away status',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET away_from = CURRENT_DATE
      WHERE id = ''bbbbbbbb-0000-0000-0000-000000000002''') = 0);

SELECT pg_temp.check(
  'widening `members` did NOT widen the status guard — self-activation is still refused',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.members SET status = ''active''
      WHERE id = ''aaaaaaaa-0000-0000-0000-000000000001'''),
  'adding member-writable columns to this table must not loosen golden rule 4');

-- ── member_care: special category, admin-restricted ───────────────────────
INSERT INTO public.member_care (member_id, agency, advance_directive_location, tsi_number)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Albox Care SL',
        'top drawer, kitchen dresser', 'AN1234567890');

SELECT pg_temp.check(
  'a member reads their OWN care row',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT member_id FROM public.member_care') = 1);

SELECT pg_temp.check(
  'a member CANNOT read another member''s care row',
  pg_temp.count_as('22222222-2222-2222-2222-222222222222',
    'SELECT member_id FROM public.member_care') = 0);

SELECT pg_temp.check(
  'a member CANNOT write their own care row — it is maintained by the office',
  pg_temp.exec_as('11111111-1111-1111-1111-111111111111',
    'UPDATE public.member_care SET agency = ''self-edited''
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 0);

SELECT pg_temp.check(
  'CONTROL: the agency is unchanged, so the refusal above was real',
  (SELECT agency FROM public.member_care
    WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Albox Care SL');

SELECT pg_temp.check(
  'ORDINARY STAFF read NO care rows — admin only, on the member_access model',
  pg_temp.count_as('a6000000-0000-0000-0000-00000000000f',
    'SELECT member_id FROM public.member_care') = 0,
  'an advance-directive location must not be a side effect of a broad is_staff policy');

SELECT pg_temp.check(
  'a call_centre_supervisor reads NO care rows either — supervisor is not admin',
  pg_temp.count_as('a5000000-0000-0000-0000-00000000000f',
    'SELECT member_id FROM public.member_care') = 0);

SELECT pg_temp.check(
  'an ADMIN does read them (else the table would be write-only and useless)',
  pg_temp.count_as('a7000000-0000-0000-0000-00000000000f',
    'SELECT member_id FROM public.member_care') = 1);

-- The argument in CIRCLE_OF_CARE.md §2.3, asserted: a consent grant is not a route in here.
-- Carer C already holds a LIVE medical grant over member A — §8.8 above created it, and the
-- one-live-per-category unique index means a second would be refused. Reusing it rather than
-- seeding another keeps the fixture honest: this is the same grant §8.8 proved works.
SELECT pg_temp.check(
  'CONTROL: the medical grant is LIVE and does grant medical_information',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.medical_information
      WHERE member_id = ''aaaaaaaa-0000-0000-0000-000000000001''') = 1,
  'if this is 0 the next assertion passes because the fixture is broken, not because RLS held');

SELECT pg_temp.check(
  'a carer with a LIVE MEDICAL grant still reads NO member_care',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT member_id FROM public.member_care') = 0,
  '`medical` means the clinical record, not the operational care picture — widening it there '
  'would be a consent decision, not a schema one');

-- ── the gate code is a credential and lives with the other credential ─────
-- Member A already has a member_access row (seeded for the key-safe assertions above), so
-- this adds the gate code to the row that exists rather than a second one the PK would refuse.
UPDATE public.member_access SET gate_code = 'GATE-4412'
WHERE member_id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT pg_temp.check(
  'gate_code is on member_access, NOT on members',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='member_access' AND column_name='gate_code')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='members' AND column_name='gate_code'),
  'on members it would be readable by every is_staff policy on that table');

SELECT pg_temp.check(
  'ordinary staff read NO gate_code — admin only, same as the key safe code',
  pg_temp.count_as('a6000000-0000-0000-0000-00000000000f',
    'SELECT gate_code FROM public.member_access WHERE gate_code IS NOT NULL') = 0);

SELECT pg_temp.check(
  'a carer with a live medical grant reads NO gate_code',
  pg_temp.count_as('77777777-7777-7777-7777-777777777777',
    'SELECT gate_code FROM public.member_access WHERE gate_code IS NOT NULL') = 0);

SELECT pg_temp.check(
  'an admin DOES read it — else the column would be write-only and useless',
  pg_temp.count_as('a7000000-0000-0000-0000-00000000000f',
    'SELECT gate_code FROM public.member_access WHERE gate_code IS NOT NULL') = 1,
  'filtered on NOT NULL: both seeded member_access rows are visible to an admin, only one '
  'carries a gate code, and counting rows rather than codes would pass for the wrong reason');

-- ============================================================
--  WP6 — messaging
-- ============================================================

INSERT INTO public.conversations (id, member_id, subject)
VALUES ('c0117777-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test');

INSERT INTO public.messages (id, conversation_id, sender_type, content, channel)
VALUES ('5e550000-0000-0000-0000-00000000000a', 'c0117777-0000-0000-0000-00000000000a',
        'member', 'Hello, my pendant is beeping.', 'chat'),
       ('5e550000-0000-0000-0000-00000000000b', 'c0117777-0000-0000-0000-00000000000a',
        'staff_internal', 'Family disputes the invoice — do not discuss with member.', 'chat');

-- THE assertion WP6's sender_type widening exists to earn. The pre-existing member policy is
-- scoped by conversation and says nothing about sender_type, so without the RESTRICTIVE policy
-- an internal note in the member's OWN conversation would be visible to them.
SELECT pg_temp.check(
  'a member NEVER reads a staff_internal message, even in their own conversation',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.messages WHERE sender_type = ''staff_internal''') = 0,
  'this is the whole reason the value could be added at all');

SELECT pg_temp.check(
  'CONTROL: the member DOES read the ordinary message in that conversation',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.messages') = 1,
  'if this is 0 the assertion above passed because the member sees nothing at all');

SELECT pg_temp.check(
  'staff DO read the internal note — it is for them',
  pg_temp.count_as('a6000000-0000-0000-0000-00000000000f',
    'SELECT id FROM public.messages WHERE sender_type = ''staff_internal''') = 1);

SELECT pg_temp.check(
  'the channel vocabulary refuses a value outside chat|voice|whatsapp|sms|email',
  pg_temp.raises_as('a6000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.messages (conversation_id, sender_type, content, channel)
     VALUES (''c0117777-0000-0000-0000-00000000000a'', ''staff'', ''x'', ''carrier-pigeon'')'));

-- The two things the brief asked for that already existed. Asserted rather than re-added, so
-- the claim "already there" is checkable and stays true.
SELECT pg_temp.check(
  'messages.read_at ALREADY existed (20260121153611) — not added twice',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='messages' AND column_name='read_at'));

SELECT pg_temp.check(
  'conversation_messages ALREADY joins conversations by FK — not added twice',
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'conversation_messages'
      AND kcu.column_name = 'conversation_id'
      AND ccu.table_name = 'conversations'));

-- ── canned replies ────────────────────────────────────────────────────────
INSERT INTO public.canned_replies (shortcut, locale, title, body)
VALUES ('/wait', 'en', 'Please hold', 'One moment while I check that for you.'),
       ('/wait', 'es', 'Un momento', 'Un momento, por favor, lo compruebo ahora.');

SELECT pg_temp.check(
  'the same shortcut exists once PER LANGUAGE, and both rows are there',
  (SELECT count(*) FROM public.canned_replies WHERE shortcut = '/wait') = 2);

SELECT pg_temp.check(
  'the same shortcut TWICE in one language is refused',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.canned_replies (shortcut, locale, title, body)
     VALUES (''/wait'', ''en'', ''dupe'', ''dupe'')'),
  'an operator typing /wait must get exactly one answer');

SELECT pg_temp.check(
  'a member reads NO canned replies — the operator''s script is not the product',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.canned_replies') = 0);

SELECT pg_temp.check(
  'staff DO read them',
  pg_temp.count_as('a6000000-0000-0000-0000-00000000000f',
    'SELECT id FROM public.canned_replies WHERE shortcut = ''/wait''') = 2);

SELECT pg_temp.check(
  'ordinary staff cannot EDIT them — admin only',
  pg_temp.exec_as('a6000000-0000-0000-0000-00000000000f',
    'UPDATE public.canned_replies SET body = ''tampered''') = 0);

-- ============================================================
--  WP7 — staff actions on the member record, attributed
-- ============================================================
--
-- These five actions change what a vulnerable person pays and what protection they have.
-- "Who cancelled this member, and why?" must be answerable from the log alone.

SELECT pg_temp.check(
  'an ordinary log row is unaffected — no reason, no staff_id, still fine',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs (action, entity_type, entity_id)
     VALUES (''viewed'', ''member'', ''aaaaaaaa-0000-0000-0000-000000000001'')') = false,
  'the guard must cost an ordinary CRUD log exactly nothing');

SELECT pg_temp.check(
  'a member_action with NO REASON is refused',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs
       (action, entity_type, entity_id, member_action, staff_id)
     VALUES (''cancel'', ''member'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''cancel'',
             (SELECT id FROM public.staff WHERE email = ''admin@example.com''))'));

SELECT pg_temp.check(
  'a BLANK reason is refused too — whitespace is not a reason',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs
       (action, entity_type, entity_id, member_action, staff_id, reason)
     VALUES (''cancel'', ''member'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''cancel'',
             (SELECT id FROM public.staff WHERE email = ''admin@example.com''), ''   '')'));

SELECT pg_temp.check(
  'a member_action with NO STAFF_ID is refused — unattributed is not an audit record',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs
       (action, entity_type, entity_id, member_action, reason)
     VALUES (''cancel'', ''member'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''cancel'',
             ''member moved into residential care'')'));

SELECT pg_temp.check(
  'a member_action pointing at the wrong entity_type is refused',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs
       (action, entity_type, entity_id, member_action, staff_id, reason)
     VALUES (''cancel'', ''order'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''cancel'',
             (SELECT id FROM public.staff WHERE email = ''admin@example.com''), ''reason'')'));

SELECT pg_temp.check(
  'a COMPLETE member_action row is accepted — the guard blocks the bad shape, not the action',
  pg_temp.raises_as('a7000000-0000-0000-0000-00000000000f',
    'INSERT INTO public.activity_logs
       (action, entity_type, entity_id, member_action, staff_id, reason)
     VALUES (''cancel'', ''member'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''cancel'',
             (SELECT id FROM public.staff WHERE email = ''admin@example.com''),
             ''member moved into residential care'')') = false);

SELECT pg_temp.check(
  'CONTROL: that row is in the log, with its reason and its actor',
  (SELECT count(*) FROM public.activity_logs
    WHERE member_action = 'cancel'
      AND btrim(reason) <> ''
      AND staff_id IS NOT NULL) = 1);

-- Named, not counted. A bare count says "six of something" and passes just as happily when a
-- value is renamed or replaced; it also fails for the wrong reason the moment a seventh is
-- added deliberately, which is what happened when `resume` arrived (the member record could
-- pause a subscription and offered no way to un-pause it).
SELECT pg_temp.check(
  'every staff action the screen offers exists in the enum',
  -- ::text, and sorted as text. `ORDER BY v` on an enum sorts by DECLARATION order, so a value
  -- appended by ALTER TYPE lands at the end and the comparison depends on the order somebody
  -- happened to add things in. The set is what matters here, not the order.
  (SELECT array_agg(v::text ORDER BY v::text)
     FROM unnest(enum_range(NULL::public.member_action)) AS v)
   = ARRAY['add_pendant', 'cancel', 'pause', 'renew', 'resume', 'switch_to_couple',
           'switch_to_single'],
  'renew, switch_to_single, switch_to_couple, add_pendant, pause, resume, cancel');

-- ============================================================
--  Join path — who may read system_settings
-- ============================================================
--
-- REVIEW_JOIN_PATH.md F2 and F12, proven from both ends: the anonymous joiner must be able to
-- read the three keys /join needs and NOTHING else, and a staff account must not be able to read
-- a credential. Both are assertions about a whitelist, so both are written as "exactly this set",
-- never as "at least one row came back" — a policy that returns everything passes that.

-- Credentials, and one legitimate staff-readable setting to prove the pattern is not a blanket
-- ban. Seeded here rather than relied on from a migration: an assertion that depends on a
-- seeded row somewhere else is an assertion that silently stops testing when the seed moves.
INSERT INTO public.system_settings (key, value) VALUES
  -- The four company keys are seeded here too, so "exactly seven" is a statement about the
  -- POLICY and not about which rows an unrelated migration happened to insert. Without this the
  -- assertion silently weakens to "the whitelisted keys that exist".
  ('settings_company_name',          'ICE Alarm España'),
  ('settings_emergency_phone',       '+34000000001'),
  ('settings_support_email',         'support@example.com'),
  ('settings_address',               'Albox, Almería'),
  ('settings_stripe_secret_key',     'sk_test_do_not_use'),
  ('settings_stripe_webhook_secret', 'whsec_do_not_use'),
  ('settings_mollie_api_key',        'test_do_not_use'),
  ('settings_twilio_auth_token',     'token_do_not_use'),
  ('settings_ev07b_checkin_key',     'checkin_do_not_use'),
  ('settings_twilio_sms_number',     '+34000000000'),
  ('settings_active_payment_gateway','mollie'),
  ('registration_fee_enabled',       'true'),
  ('registration_fee_discount',      '0'),
  -- Seeded because the assertion below says this key is NOT public. With no row at all,
  -- anon reads nothing whatever the policy says, and adding the key to the whitelist would
  -- have passed the suite. (It did: the mutation survived until this row existed.)
  ('registration_test_mode_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- This section seeds its OWN call-centre operator rather than reusing the suite's, because the
-- FK-audit section above DELETES that staff row (line ~1951, deliberately — it proves an audit
-- row survives its actor leaving). Reusing it made three assertions here pass vacuously: a
-- deleted staff row is not staff, so of course it could not read the Stripe key. The CONTROL
-- assertion below is what caught that, and it is why it is there.
INSERT INTO auth.users (id, email) VALUES
  ('a8000000-0000-0000-0000-000000000001', 'superadmin@example.com'),
  ('a8000000-0000-0000-0000-000000000002', 'operator-settings@example.com');
INSERT INTO public.staff (user_id, email, first_name, last_name, role) VALUES
  ('a8000000-0000-0000-0000-000000000001', 'superadmin@example.com', 'Sam', 'Super', 'super_admin'),
  ('a8000000-0000-0000-0000-000000000002', 'operator-settings@example.com', 'Olga', 'Operator', 'call_centre');

-- ── F2: what the anonymous browser can read, exactly ──────────────────────
DO $$
DECLARE v_keys text[];
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT array_agg(key ORDER BY key) FROM public.system_settings' INTO v_keys;
  RESET ROLE;

  PERFORM pg_temp.check(
    'anonymous reads EXACTLY the seven whitelisted settings keys',
    v_keys = ARRAY['registration_fee_discount', 'registration_fee_enabled',
                   'settings_active_payment_gateway', 'settings_address',
                   'settings_company_name', 'settings_emergency_phone',
                   'settings_support_email'],
    'four company keys plus the three /join needs — named, not counted, so a widened '
    'policy fails here instead of passing with more rows');
END $$;

-- The three that were the blocker, called out individually: a whitelist that happens to have
-- the right length is not the same as one that has the right members.
DO $$
DECLARE v_gateway text; v_enabled text; v_discount text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT value FROM public.system_settings WHERE key = ''settings_active_payment_gateway'''
    INTO v_gateway;
  EXECUTE 'SELECT value FROM public.system_settings WHERE key = ''registration_fee_enabled'''
    INTO v_enabled;
  EXECUTE 'SELECT value FROM public.system_settings WHERE key = ''registration_fee_discount'''
    INTO v_discount;
  RESET ROLE;

  PERFORM pg_temp.check(
    'anonymous can read the active payment gateway (F2 — without this nobody can pay)',
    v_gateway = 'mollie',
    'usePricingSettings resolves activeGateway = null when this row is invisible, and '
    'JoinPaymentStep then refuses with "gateway not configured"');
  PERFORM pg_temp.check(
    'anonymous can read registration_fee_enabled', v_enabled = 'true');
  PERFORM pg_temp.check(
    'anonymous can read registration_fee_discount', v_discount = '0');
END $$;

-- ── F2, the other half: nothing credential-shaped is public ───────────────
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.system_settings
            WHERE key ~* ''(secret|token|password|api_key|_key)''' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check(
    'anonymous reads NO credential-shaped setting', n = 0,
    'the whitelist is a whitelist, but this fails loudly if a future key is added to it');
END $$;

DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.system_settings
            WHERE key = ''registration_test_mode_enabled''' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check(
    'registration_test_mode_enabled is NOT public — deliberately',
    n = 0,
    'the wizard asks for it, the server ignores the client value and re-reads the setting, '
    'so keeping it staff-only costs an anonymous visitor only the test button');
END $$;

-- ── F12: staff cannot read the money keys; super_admin can ────────────────
SELECT pg_temp.check(
  'call-centre staff CANNOT read the Stripe secret key (F12)',
  pg_temp.count_as('a8000000-0000-0000-0000-000000000002',
    'SELECT value FROM public.system_settings WHERE key = ''settings_stripe_secret_key''') = 0,
  'every active staff login could hold the key that moves money');

SELECT pg_temp.check(
  'an ADMIN who is not super_admin cannot read it either',
  pg_temp.count_as('a7000000-0000-0000-0000-00000000000f',
    'SELECT value FROM public.system_settings WHERE key = ''settings_stripe_secret_key''') = 0,
  'the Settings page is admin-reachable; only super_admin may see the credentials on it');

SELECT pg_temp.check(
  'nor the webhook signing secret, the Mollie key, the Twilio token, or the device check-in key',
  pg_temp.count_as('a8000000-0000-0000-0000-000000000002',
    'SELECT value FROM public.system_settings
      WHERE key IN (''settings_stripe_webhook_secret'', ''settings_mollie_api_key'',
                    ''settings_twilio_auth_token'', ''settings_ev07b_checkin_key'')') = 0,
  'settings_ev07b_checkin_key matches none of the four names in the brief — it is why the '
  'pattern carries _key as a fifth alternative');

SELECT pg_temp.check(
  'CONTROL: staff CAN still read an ordinary setting',
  pg_temp.count_as('a8000000-0000-0000-0000-000000000002',
    'SELECT value FROM public.system_settings WHERE key = ''settings_twilio_sms_number''') = 1,
  'a policy that hid everything would pass every assertion above and break the platform');

SELECT pg_temp.check(
  'super_admin CAN read the Stripe secret key — the admin Settings page needs it',
  pg_temp.count_as('a8000000-0000-0000-0000-000000000001',
    'SELECT value FROM public.system_settings WHERE key = ''settings_stripe_secret_key''') = 1);

SELECT pg_temp.check(
  'a member reads only the public whitelist, not staff settings',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT key FROM public.system_settings WHERE key = ''settings_twilio_sms_number''') = 0);

-- ── the write path is unchanged, which is what makes the read fix safe ────
SELECT pg_temp.check(
  'call-centre staff cannot UPDATE a setting',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000002',
    'UPDATE public.system_settings SET value = ''hijacked''
      WHERE key = ''settings_active_payment_gateway''') = 0,
  'if staff could write what they can no longer read, the Settings page would blank a secret');

SELECT pg_temp.check(
  'an admin who is not super_admin cannot UPDATE a setting either',
  pg_temp.exec_as('a7000000-0000-0000-0000-00000000000f',
    'UPDATE public.system_settings SET value = ''hijacked''
      WHERE key = ''settings_active_payment_gateway''') = 0);

SELECT pg_temp.check(
  'anonymous cannot UPDATE the payment gateway',
  (SELECT NOT EXISTS (
     SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'system_settings'
        AND cmd IN ('UPDATE', 'ALL', 'INSERT')
        AND ('anon' = ANY (roles) OR roles = '{public}'))),
  'a client-writable gateway setting would let a visitor redirect the payment');

SELECT pg_temp.check(
  'CONTROL: super_admin CAN update a setting',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000001',
    'UPDATE public.system_settings SET value = ''mollie''
      WHERE key = ''settings_active_payment_gateway''') = 1);

-- ── P5: one registration-fee key, not two families of it ──────────────────
--
-- These two keys have never been seeded by a migration — only ever written at runtime by the
-- admin Settings page — so in a fresh database the migration's cleanup has nothing to remove and
-- an assertion that "the old keys are gone" passes without testing anything. That is not a
-- hypothetical: the mutation that deleted the cleanup entirely SURVIVED against the first
-- version of these checks.
--
-- So the stale rows are seeded here and the migration is then RE-EXECUTED (`\ir`, so the SQL
-- under test is the migration file itself rather than a copy of it that can drift). Both halves
-- of the intended behaviour become testable this way, including the one that cannot be seen in a
-- fresh database at all: that a canonical value already in place is not overwritten by a stale
-- one. Re-running is safe — every statement in that file is idempotent.

-- (a) canonical present: the stale rows go, and the canonical values do NOT change.
INSERT INTO public.system_settings (key, value) VALUES
  ('settings_registration_fee_enabled',  'false'),
  ('settings_registration_fee_discount', '50')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

\ir ../../supabase/migrations/20260908120000_settings_read_policies.sql

SELECT pg_temp.check(
  'the settings_-prefixed registration fee keys are removed (P5)',
  (SELECT count(*) FROM public.system_settings
    WHERE key IN ('settings_registration_fee_enabled',
                  'settings_registration_fee_discount')) = 0,
  'the admin page wrote those two while the wizard and the server read the canonical pair, so '
  'turning the fee off in admin still charged the customer 59.99');

SELECT pg_temp.check(
  'a canonical value already in place is NOT overwritten by the stale one',
  (SELECT value FROM public.system_settings WHERE key = 'registration_fee_discount') = '0'
  AND (SELECT value FROM public.system_settings WHERE key = 'registration_fee_enabled') = 'true',
  'the stale rows said 50% off and disabled; applying the migration after the admin page was '
  'fixed must not resurrect them');

-- (b) canonical absent: the stale value is carried across rather than lost.
DELETE FROM public.system_settings WHERE key = 'registration_fee_discount';
INSERT INTO public.system_settings (key, value)
VALUES ('settings_registration_fee_discount', '25')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

\ir ../../supabase/migrations/20260908120000_settings_read_policies.sql

SELECT pg_temp.check(
  'a value with no canonical row is CARRIED ACROSS, not dropped',
  (SELECT value FROM public.system_settings WHERE key = 'registration_fee_discount') = '25',
  'a discount Lee had set in admin must survive the consolidation');

SELECT pg_temp.check(
  'and the stale row is gone afterwards',
  NOT EXISTS (SELECT 1 FROM public.system_settings
               WHERE key = 'settings_registration_fee_discount'));

-- Put the fixture back, so a later reader of this file is not surprised by a 25% discount.
UPDATE public.system_settings SET value = '0' WHERE key = 'registration_fee_discount';

-- ============================================================
--  Join path — the synced Stripe prices (P2)
-- ============================================================
--
-- This table is the server's answer to "what may we charge", so the assertions are about who can
-- change that answer and about the constraints that stop a nonsense Price existing at all. A
-- price row nobody can forge is the whole point: F7/F9 were the browser naming the amount.

INSERT INTO public.stripe_prices
  (price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval,
   source_description, synced_by)
VALUES
  ('plan_single_monthly', 'prod_test_single', 'price_test_single_monthly', 2749, 'month',
   '24.99 net x 1.10 IVA', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com')),
  ('plan_single_annual',  'prod_test_single', 'price_test_single_annual', 27489, 'year',
   '24.99 net x 10 months x 1.10 IVA', NULL),
  ('pendant',             'prod_test_pendant','price_test_pendant',       15125, NULL,
   '125.00 net x 1.21 IVA', NULL);

-- ── nobody but super_admin can write a price ──────────────────────────────
SELECT pg_temp.check(
  'anonymous cannot read the synced Stripe prices',
  (SELECT NOT EXISTS (
     SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stripe_prices'
        AND ('anon' = ANY (roles) OR roles = '{public}'))),
  'nothing anonymous renders from this table; pricing_plans is the public one');

DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.stripe_prices' INTO n;
  RESET ROLE;
  PERFORM pg_temp.check('anonymous reads no stripe_prices rows', n = 0);
END $$;

SELECT pg_temp.check(
  'a MEMBER cannot read the synced Stripe prices',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT stripe_price_id FROM public.stripe_prices') = 0);

-- raises_as, not exec_as: a WITH CHECK violation RAISES rather than reporting zero rows, and
-- exec_as would let that exception abort the whole suite. (It did.)
SELECT pg_temp.check(
  'a member cannot INSERT a price of their own',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents)
     VALUES (''pendant'', ''prod_x'', ''price_member_forged'', 1)'),
  'a 0.01 pendant is what a client-writable price table buys you');

SELECT pg_temp.check(
  'CONTROL: the forged row really is absent',
  NOT EXISTS (SELECT 1 FROM public.stripe_prices WHERE stripe_price_id = 'price_member_forged'));

SELECT pg_temp.check(
  'call-centre staff can READ the synced prices (the editor shows sync state)',
  pg_temp.count_as('a8000000-0000-0000-0000-000000000002',
    'SELECT stripe_price_id FROM public.stripe_prices') = 3);

SELECT pg_temp.check(
  'call-centre staff cannot UPDATE an amount',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000002',
    'UPDATE public.stripe_prices SET amount_cents = 1
      WHERE price_key = ''pendant''') = 0,
  'read to see what is synced, never write to change what is charged');

SELECT pg_temp.check(
  'an ADMIN who is not super_admin cannot UPDATE an amount either',
  pg_temp.exec_as('a7000000-0000-0000-0000-00000000000f',
    'UPDATE public.stripe_prices SET amount_cents = 1
      WHERE price_key = ''pendant''') = 0);

SELECT pg_temp.check(
  'CONTROL: super_admin CAN write a price row',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000001',
    'UPDATE public.stripe_prices SET source_description = ''re-synced''
      WHERE price_key = ''pendant''') = 1,
  'a table only the service role could write would make the admin button impossible');

SELECT pg_temp.check(
  'CONTROL: the pendant amount is still the synced one',
  (SELECT amount_cents FROM public.stripe_prices
    WHERE price_key = 'pendant' AND is_current) = 15125,
  '125.00 net + 21% IVA — the figure the public page shows');

-- ── the constraints that stop a nonsense Price ────────────────────────────
SELECT pg_temp.check(
  'TWO current prices for the same key is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval)
     VALUES (''plan_single_monthly'', ''prod_x'', ''price_second_current'', 9999, ''month'')'),
  'two live prices for one plan means the charge depends on which row was read first');

SELECT pg_temp.check(
  'a SUPERSEDED price for the same key is accepted — history is kept, not deleted',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval,
        is_current)
     VALUES (''plan_single_monthly'', ''prod_x'', ''price_old_single'', 2500, ''month'', false)')
   = false,
  'Stripe Prices are immutable, so an active subscription is still billed on the old one');

SELECT pg_temp.check(
  'a plan price with NO recurring interval is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents)
     VALUES (''plan_couple_monthly'', ''prod_x'', ''price_no_interval'', 3849)'),
  'a membership charged once instead of monthly is a subscription that never renews');

SELECT pg_temp.check(
  'a one-off price WITH a recurring interval is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval)
     VALUES (''shipping'', ''prod_x'', ''price_recurring_shipping'', 1499, ''month'')'),
  'charging shipping every month is the same defect pointing the other way');

-- `recurring_interval` is supplied deliberately. Without it this row also violates the
-- interval/key constraint, so the assertion passed with the price_key CHECK removed entirely —
-- it was being refused by the wrong rule. Named alternatives are worth nothing if the test can
-- be satisfied by a neighbour.
SELECT pg_temp.check(
  'a price_key we do not sell is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval)
     VALUES (''plan_family_monthly'', ''prod_x'', ''price_family'', 4999, ''month'')'),
  'we sell single and couple; a third plan is a decision, not an insert');

SELECT pg_temp.check(
  'a NEGATIVE amount is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents)
     VALUES (''shipping'', ''prod_x'', ''price_negative'', -100)'));

SELECT pg_temp.check(
  'a non-euro currency is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, currency)
     VALUES (''shipping'', ''prod_x'', ''price_gbp'', 1499, ''gbp'')'),
  'we sell in euros; a currency column that accepts anything charges 14.99 GBP one day');

SELECT pg_temp.check(
  'the same stripe_price_id cannot be recorded twice',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.stripe_prices
       (price_key, stripe_product_id, stripe_price_id, amount_cents, is_current)
     VALUES (''pendant'', ''prod_x'', ''price_test_pendant'', 15125, false)'),
  'one Price, one row — otherwise reconciling an invoice finds two answers');

SELECT pg_temp.check(
  'deleting the staff member who synced a price keeps the price',
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'stripe_prices' AND c.contype = 'f' AND c.confdeltype = 'n') = 1,
  'ON DELETE SET NULL — the record of what we charged must survive the person leaving');

-- ============================================================
--  Join path — who issued a second-stage token (item 6)
-- ============================================================
--
-- REVIEW_JOIN_PATH.md F6. The payment path will mint these tokens itself, so `created_by` has no
-- staff member to name — and NULL already means "the operator who issued it has left"
-- (20260905100000 made that FK ON DELETE SET NULL on purpose). `issued_via` is what tells those
-- two apart. The assertions are about the vocabulary and about the one coherence rule that is
-- safe to enforce.

SELECT pg_temp.check(
  'an automated token can be issued with NO staff member named',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-auto-1'',
             ARRAY[''emergency_contacts'', ''medical_information''],
             now() + interval ''30 days'', ''post_payment'')') = false,
  'the whole point: post-payment.ts has no operator to attribute');

SELECT pg_temp.check(
  'CONTROL: that token is there, marked automated, with nobody named',
  (SELECT issued_via = 'post_payment' AND created_by IS NULL
     FROM public.member_update_tokens WHERE token = 'tok-auto-1'));

SELECT pg_temp.check(
  'an automated token that ALSO names a staff member is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via, created_by)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-auto-2'',
             ARRAY[''emergency_contacts''], now() + interval ''30 days'',
             ''post_payment'',
             (SELECT id FROM public.staff WHERE email = ''superadmin@example.com''))'),
  'either the payment path issued it or a person did, not both');

SELECT pg_temp.check(
  'a staff-issued token naming the operator is accepted',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via, created_by)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-staff-1'',
             ARRAY[''emergency_contacts''], now() + interval ''30 days'', ''staff'',
             (SELECT id FROM public.staff WHERE email = ''superadmin@example.com''))') = false);

SELECT pg_temp.check(
  'an issued_via value nobody defined is REFUSED',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-bogus'',
             ARRAY[''emergency_contacts''], now() + interval ''30 days'', ''magic'')'),
  'the vocabulary is two words; a third is a decision, not a typo');

-- EXPLICITLY NULL, not merely omitted. Omitting the column passes just as happily against a
-- `NOT NULL DEFAULT 'staff'` version of it — that mutation survived until this said NULL out
-- loud — and a default would be stamping provenance on rows nobody verified.
SELECT pg_temp.check(
  'a token with issued_via explicitly NULL is still legal — existing rows are untouched',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-legacy'',
             ARRAY[''emergency_contacts''], now() + interval ''30 days'', NULL)') = false,
  'nothing is backfilled: writing provenance in retrospectively would be asserting it');

SELECT pg_temp.check(
  'CONTROL: it really landed with NULL rather than a default',
  (SELECT issued_via IS NULL FROM public.member_update_tokens WHERE token = 'tok-legacy'));

-- THE TRAP 20260905100000 HAD TO UNDO. A CHECK coupling issued_via to created_by presence makes
-- the row un-orphanable: deleting a staff member then fails instead of the record surviving them.
-- This proves the delete still works with a staff-issued token pointing at them.
DO $$
DECLARE v_staff uuid;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('a9000000-0000-0000-0000-000000000001', 'leaver@example.com');
  INSERT INTO public.staff (user_id, email, first_name, last_name, role)
  VALUES ('a9000000-0000-0000-0000-000000000001', 'leaver@example.com', 'Lee', 'Leaver', 'call_centre')
  RETURNING id INTO v_staff;

  INSERT INTO public.member_update_tokens
    (member_id, token, requested_fields, expires_at, issued_via, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tok-leaver',
          ARRAY['emergency_contacts'], now() + interval '30 days', 'staff', v_staff);

  -- Guarded: a CHECK that made this row un-orphanable would RAISE here and abort the whole
  -- suite, reporting nothing. An assertion that cannot fail out loud is not an assertion.
  BEGIN
    DELETE FROM public.staff WHERE id = v_staff;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.check(
      'a staff member with an issued token CAN still be deleted', false,
      'the delete RAISED: ' || SQLERRM);
  END;

  PERFORM pg_temp.check(
    'a staff member with an issued token CAN still be deleted',
    NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff)
    AND EXISTS (SELECT 1 FROM public.member_update_tokens WHERE token = 'tok-leaver'),
    'a CHECK requiring created_by for issued_via=staff would make this fail — which is exactly '
    'what 20260905100000 had to undo for submitted_via');

  PERFORM pg_temp.check(
    'and the token now reads staff-issued with nobody named — ambiguous WITHOUT issued_via',
    (SELECT created_by IS NULL AND issued_via = 'staff'
       FROM public.member_update_tokens WHERE token = 'tok-leaver'),
    'this row and tok-auto-1 both have created_by NULL; issued_via is the only thing that '
    'distinguishes "their operator left" from "the payment path issued it"');
END $$;

SELECT pg_temp.check(
  'a member cannot mint themselves a second-stage token',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'INSERT INTO public.member_update_tokens
       (member_id, token, requested_fields, expires_at, issued_via)
     VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-self-minted'',
             ARRAY[''emergency_contacts''], now() + interval ''30 days'', ''post_payment'')'),
  'the token is the authorisation; minting your own would be authorising yourself');

-- Behaviourally, not structurally. The policy here is `FOR ALL USING (is_staff(auth.uid()))`
-- with no TO clause, so it is recorded against `{public}` and a pg_policies check reads as a
-- finding when the predicate is what actually refuses anonymous writes. Asserting the shape
-- rather than the effect said this table was wide open. It is not; is_staff(NULL) is false.
DO $$
DECLARE failed boolean := false; n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    EXECUTE 'INSERT INTO public.member_update_tokens
               (member_id, token, requested_fields, expires_at, issued_via)
             VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''tok-anon-minted'',
                     ARRAY[''emergency_contacts''], now() + interval ''30 days'',
                     ''post_payment'')';
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  EXECUTE 'SELECT count(*) FROM public.member_update_tokens' INTO n;
  RESET ROLE;

  PERFORM pg_temp.check(
    'anonymous cannot mint a second-stage token', failed,
    'the token IS the authorisation for the second stage; minting one is authorising yourself');
  PERFORM pg_temp.check(
    'anonymous cannot read the tokens either', n = 0,
    'a readable token table is a list of live authorisations');
END $$;

SELECT pg_temp.check(
  'CONTROL: no anonymously minted token exists',
  NOT EXISTS (SELECT 1 FROM public.member_update_tokens WHERE token = 'tok-anon-minted'));

-- ============================================================
--  Join path — an order is not `paid` before payment (item 7, F14)
-- ============================================================
--
-- The default was `paid`, so an order created by the wizard claimed a payment nobody had made and
-- entered the fulfilment queue at registration. The new state below it is only half the fix; the
-- other half is that ENTERING `paid` is now governed, because otherwise a dropdown grants a free
-- membership.

SELECT pg_temp.check(
  'a new order starts at awaiting_payment, not paid',
  (SELECT column_default LIKE '%awaiting_payment%'
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'fulfilment_state'),
  'DEFAULT paid is what put abandoned checkouts in front of the fulfilment desk');

SELECT pg_temp.check(
  'awaiting_payment ranks below paid, and the ranks are one apart',
  public.fulfilment_state_rank('awaiting_payment') = public.fulfilment_state_rank('paid') - 1,
  'one step, so the payment path can move it forward without a skip');

-- A fixture order of our own, so nothing here depends on another section's rows.
DO $$
DECLARE v_order uuid;
BEGIN
  INSERT INTO public.orders
    (member_id, order_number, status, subtotal, tax_amount, total_amount, shipping_amount,
     shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ICE-AWAIT-1', 'pending',
          100, 10, 110, 0, 'Calle A 1', 'Albox', 'Almeria', '04800')
  RETURNING id INTO v_order;

  PERFORM pg_temp.check(
    'CONTROL: it really landed on awaiting_payment',
    (SELECT fulfilment_state = 'awaiting_payment' FROM public.orders WHERE id = v_order));

  PERFORM set_config('rls.await_order', v_order::text, false);
END $$;

-- ── entering `paid` is a claim about money, so it needs authority AND a reason ──
SELECT pg_temp.check(
  'call-centre staff CANNOT mark an unpaid order paid',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000002',
    format('UPDATE public.orders SET fulfilment_state = ''paid'',
                   fulfilment_state_reason = ''customer says they paid''
             WHERE id = %L', current_setting('rls.await_order'))),
  'a free membership granted by a dropdown is the failure this closes');

SELECT pg_temp.check(
  'a supervisor cannot mark it paid WITHOUT a reason either',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    format('UPDATE public.orders SET fulfilment_state = ''paid''
             WHERE id = %L', current_setting('rls.await_order'))),
  'the reason is the audit line: which payment, arriving how');

SELECT pg_temp.check(
  'a supervisor CAN record a payment that arrived another way, with a reason',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000001',
    format('UPDATE public.orders SET fulfilment_state = ''paid'',
                   fulfilment_state_reason = ''SEPA transfer received 2026-09-08, ref 4471''
             WHERE id = %L', current_setting('rls.await_order'))) = 1,
  'a bank transfer outside Stripe is real; refusing it entirely would send staff to the SQL console');

SELECT pg_temp.check(
  'and that is written to activity_logs as a payment, not as a correction',
  (SELECT action = 'fulfilment_payment_recorded'
     FROM public.activity_logs
    WHERE entity_type = 'order'
      AND entity_id = current_setting('rls.await_order')::uuid
    ORDER BY created_at DESC LIMIT 1),
  'a reason held only in the column is overwritten by the next move; the log survives');

SELECT pg_temp.check(
  'the log names the reason given',
  (SELECT reason LIKE '%SEPA transfer%'
     FROM public.activity_logs
    WHERE entity_type = 'order'
      AND entity_id = current_setting('rls.await_order')::uuid
    ORDER BY created_at DESC LIMIT 1));

-- ── the forward sequence still works from `paid` onward ────────────────────
SELECT pg_temp.check(
  'CONTROL: paid → allocated is still an ordinary forward move, no reason needed',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000002',
    format('UPDATE public.orders SET fulfilment_state = ''allocated''
             WHERE id = %L', current_setting('rls.await_order'))) = 1,
  'if the new clause caught every forward move, fulfilment would need a supervisor per step');

-- The order this needs is created first. An UPDATE that matches NO ROWS raises nothing, so an
-- assertion written before its own fixture reads as "the guard is missing" — which is what the
-- first version of this said, loudly and wrongly.
DO $$
BEGIN
  INSERT INTO public.orders
    (member_id, order_number, status, subtotal, tax_amount, total_amount, shipping_amount,
     shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ICE-AWAIT-2', 'pending',
          100, 10, 110, 0, 'Calle A 1', 'Albox', 'Almeria', '04800');
END $$;

SELECT pg_temp.check(
  'awaiting_payment → allocated is refused as a skip (with the order in place)',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000001',
    'UPDATE public.orders SET fulfilment_state = ''allocated'',
            fulfilment_state_reason = ''trying to skip''
      WHERE order_number = ''ICE-AWAIT-2'''),
  'even a supervisor with a reason cannot allocate a device against no payment');

SELECT pg_temp.check(
  'a supervisor CAN move a paid order back to awaiting_payment — a payment that did not clear',
  pg_temp.exec_as('a8000000-0000-0000-0000-000000000001',
    'UPDATE public.orders SET fulfilment_state = ''awaiting_payment'',
            fulfilment_state_reason = ''chargeback: the SEPA transfer was reversed''
      WHERE order_number = ''ICE-AWAIT-1''') = 1,
  'backwards, so it is an ordinary correction — but it must be POSSIBLE');

-- ── the BACKFILL, which a fresh database cannot otherwise exercise ─────────
--
-- Every order in this suite is inserted AFTER the migrations have run, so the backfill has
-- nothing to act on and an assertion about it passes whatever it does. Two mutations proved it:
-- one that moved every `paid` order regardless of payment, and one that dragged `allocated`
-- orders backwards as well, both SURVIVED.
--
-- So the pre-state is seeded here and the migration is RE-EXECUTED (`\ir`, so the SQL under test
-- is the migration file rather than a copy that can drift). Every statement in that file is
-- idempotent: CREATE OR REPLACE, SET DEFAULT, DISABLE/ENABLE TRIGGER, and an UPDATE whose WHERE
-- clause stops matching once it has run.
--
-- Three orders, one per outcome the backfill has to get right.
INSERT INTO public.orders
  (id, member_id, order_number, status, subtotal, tax_amount, total_amount, shipping_amount,
   shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code,
   fulfilment_state)
VALUES
  ('0dde0000-0000-0000-0000-00000000f001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ICE-BACKFILL-UNPAID', 'pending', 100, 10, 110, 0,
   'Calle A 1', 'Albox', 'Almeria', '04800', 'paid'),
  ('0dde0000-0000-0000-0000-00000000f002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ICE-BACKFILL-PAID', 'pending', 100, 10, 110, 0,
   'Calle A 1', 'Albox', 'Almeria', '04800', 'paid'),
  ('0dde0000-0000-0000-0000-00000000f003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ICE-BACKFILL-ALLOCATED', 'processing', 100, 10, 110, 0,
   'Calle A 1', 'Albox', 'Almeria', '04800', 'allocated');

-- Only the second one has money against it.
INSERT INTO public.payments
  (member_id, order_id, amount, payment_type, payment_method, status, paid_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '0dde0000-0000-0000-0000-00000000f002',
        110, 'order', 'stripe', 'completed', now());

-- And a completed payment against the ALLOCATED one would make the third case pass for the
-- wrong reason, so it deliberately has none: it must stay put because of its STATE, not its
-- payments.

\ir ../../supabase/migrations/20260908120400_awaiting_payment_wiring.sql

SELECT pg_temp.check(
  'the backfill moves a `paid` order with NO completed payment to awaiting_payment',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000f001') = 'awaiting_payment',
  'this is the row F14 is about: an order claiming a payment nobody made');

SELECT pg_temp.check(
  'it leaves a `paid` order that DID pay alone',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000f002') = 'paid',
  'un-paying a real customer would take their pendant out of the fulfilment queue');

SELECT pg_temp.check(
  'it does NOT drag an `allocated` order backwards, whatever its payment rows say',
  (SELECT fulfilment_state FROM public.orders
    WHERE id = '0dde0000-0000-0000-0000-00000000f003') = 'allocated',
  'a device is already reserved against it; that discrepancy is for a person, not a migration');

SELECT pg_temp.check(
  'the backfill wrote no activity_logs rows — it is not a transition',
  NOT EXISTS (
    SELECT 1 FROM public.activity_logs
     WHERE entity_type = 'order'
       AND entity_id IN ('0dde0000-0000-0000-0000-00000000f001',
                         '0dde0000-0000-0000-0000-00000000f002',
                         '0dde0000-0000-0000-0000-00000000f003')),
  'a log row would claim a staff member acted today on an order from March');

SELECT pg_temp.check(
  'CONTROL: the trigger is ENABLED again after the backfill',
  pg_temp.raises_as('a8000000-0000-0000-0000-000000000002',
    'UPDATE public.orders SET fulfilment_state = ''dispatched''
      WHERE id = ''0dde0000-0000-0000-0000-00000000f003'''),
  'a backfill that left the trigger disabled would silently un-govern every later write');

-- ============================================================
--  Join path — two registrations in the same second (item 7, F17)
-- ============================================================
--
-- The order number was 'ICE-' || TO_HEX(EPOCH::BIGINT): one second of resolution against
-- `order_number text UNIQUE NOT NULL`. Two people finishing the wizard in the same second
-- produced the same number, and since the whole registration is one transaction the second one
-- was rolled back entirely — no member, no order, an error at the moment they were about to pay.
--
-- Proven by CALLING THE REAL FUNCTION twice in the same statement, so both calls share `now()`.
-- That is the collision, reproduced: under the old expression this is the failure, and under the
-- new one it is two numbers.

DO $$
DECLARE
  v_payload jsonb;
  v_a jsonb;
  v_b jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'membershipType', 'single',
    'primaryMember', jsonb_build_object(
      'firstName', 'Nuria', 'lastName', 'Nueva',
      'email', 'nuria@example.com', 'phone', '+34600000009',
      'dateOfBirth', '1949-04-04', 'preferredLanguage', 'es'),
    'address', jsonb_build_object(
      'addressLine1', 'Calle N 9', 'city', 'Albox', 'province', 'Almeria',
      'postalCode', '04800', 'country', 'Spain'),
    'billingFrequency', 'monthly',
    'includePendant', false,
    'pendantCount', 0,
    'activeGateway', 'stripe',
    'subscriptionNet', 24.99, 'subscriptionTax', 2.50, 'subscriptionFinal', 27.49,
    'pendantNet', 0, 'pendantTax', 0, 'pendantFinal', 0,
    'registrationFee', 59.99, 'registrationFeeDiscount', 0, 'registrationFeeEnabled', true,
    'shipping', 0, 'total', 87.48,
    'subscriptionTaxRate', 0.10, 'pendantTaxRate', 0.21,
    'testMode', false);

  -- Same statement, so `now()` is identical for both — which is precisely the collision.
  -- DIFFERENT EMAILS, because `members.email` is UNIQUE: reusing one makes this fail on that
  -- constraint instead, which would prove nothing about the order number. (It did, first run.)
  SELECT public.submit_registration_atomic(v_payload),
         public.submit_registration_atomic(
           jsonb_set(v_payload, '{primaryMember,email}', '"nuria2@example.com"'::jsonb))
    INTO v_a, v_b;

  PERFORM pg_temp.check(
    'two registrations in the SAME SECOND both succeed',
    v_a ? 'orderNumber' AND v_b ? 'orderNumber',
    'the epoch-hash number collided against the UNIQUE constraint and rolled the second one back');

  PERFORM pg_temp.check(
    'and they get DIFFERENT order numbers',
    v_a->>'orderNumber' <> v_b->>'orderNumber',
    format('got %s and %s', v_a->>'orderNumber', v_b->>'orderNumber'));

  PERFORM pg_temp.check(
    'the number carries the date and a padded serial',
    v_a->>'orderNumber' ~ ('^ICE-' || to_char(now(), 'YYYYMMDD') || '-[0-9]{5}$'),
    format('got %s — read out on the phone, ICE-20260908-00042 can be said and ICE-68BE4A31 '
           'cannot', v_a->>'orderNumber'));

  PERFORM pg_temp.check(
    'both orders exist, and start at awaiting_payment rather than claiming a payment',
    (SELECT count(*) FROM public.orders
      WHERE order_number IN (v_a->>'orderNumber', v_b->>'orderNumber')
        AND fulfilment_state = 'awaiting_payment') = 2,
    'the registration path creates an order before any money has arrived — item 7');

  PERFORM pg_temp.check(
    'and each has its own member, subscription and payment row',
    (SELECT count(DISTINCT member_id) FROM public.orders
      WHERE order_number IN (v_a->>'orderNumber', v_b->>'orderNumber')) = 2
    AND v_a->>'memberId' <> v_b->>'memberId'
    AND v_a->>'paymentId' <> v_b->>'paymentId',
    'a collision that rolled back the transaction took all of these with it');
END $$;

-- ── the COUPLE path, which the single-membership call above never enters ──
--
-- Worth its own call: the partner member insert, the partner subscription insert and their two
-- enum casts are a separate branch. Mutation testing showed the partner branch's
-- billing_frequency cast being caught only by a text-diff test, never by execution — which is
-- exactly the coverage a couple registration is missing. Half the product is couples.
DO $$
DECLARE v_payload jsonb; v_r jsonb; v_member_ids uuid[];
BEGIN
  v_payload := jsonb_build_object(
    'membershipType', 'couple',
    'primaryMember', jsonb_build_object(
      'firstName', 'Pilar', 'lastName', 'Pareja',
      'email', 'pilar@example.com', 'phone', '+34600000011',
      'dateOfBirth', '1947-05-05', 'preferredLanguage', 'es'),
    'partnerMember', jsonb_build_object(
      'firstName', 'Pablo', 'lastName', 'Pareja',
      'email', 'pablo@example.com', 'phone', '+34600000012',
      'dateOfBirth', '1946-06-06', 'preferredLanguage', 'nl'),
    'address', jsonb_build_object(
      'addressLine1', 'Calle P 11', 'city', 'Albox', 'province', 'Almeria',
      'postalCode', '04800', 'country', 'Spain'),
    'billingFrequency', 'annual',
    'includePendant', true,
    'pendantCount', 2,
    'activeGateway', 'mollie',
    'subscriptionNet', 349.90, 'subscriptionTax', 34.99, 'subscriptionFinal', 384.89,
    'pendantNet', 250, 'pendantTax', 52.50, 'pendantFinal', 302.50,
    'registrationFee', 59.99, 'registrationFeeDiscount', 0, 'registrationFeeEnabled', true,
    'shipping', 14.99, 'total', 762.37,
    'subscriptionTaxRate', 0.10, 'pendantTaxRate', 0.21,
    'testMode', false);

  v_r := public.submit_registration_atomic(v_payload);

  PERFORM pg_temp.check(
    'a COUPLE registration completes, and creates BOTH members',
    v_r->>'memberId' IS NOT NULL AND v_r->>'partnerMemberId' IS NOT NULL,
    'the partner branch has its own inserts and its own enum casts');

  PERFORM pg_temp.check(
    'both members get a subscription',
    v_r->>'subscriptionId' IS NOT NULL AND v_r->>'partnerSubscriptionId' IS NOT NULL);

  PERFORM pg_temp.check(
    'the ANNUAL billing frequency landed as the enum, not as text',
    (SELECT count(*) FROM public.subscriptions
      WHERE id IN ((v_r->>'subscriptionId')::uuid, (v_r->>'partnerSubscriptionId')::uuid)
        AND billing_frequency = 'annual' AND plan_type = 'couple') = 2);

  PERFORM pg_temp.check(
    'the MOLLIE gateway landed as payment_method on both subscriptions and the payment',
    (SELECT count(*) FROM public.subscriptions
      WHERE id IN ((v_r->>'subscriptionId')::uuid, (v_r->>'partnerSubscriptionId')::uuid)
        AND payment_method = 'mollie') = 2
    AND (SELECT payment_method FROM public.payments
          WHERE id = (v_r->>'paymentId')::uuid) = 'mollie',
    'mollie is the LIVE gateway (20260902160000) and is in the payment_method enum '
    '(20260228180000) — but only a cast gets it there');

  PERFORM pg_temp.check(
    'the partner''s own language landed — nl, not the primary''s es',
    (SELECT preferred_language FROM public.members
      WHERE id = (v_r->>'partnerMemberId')::uuid) = 'nl',
    'a Dutch member read to in Spanish is the kind of thing a cast defect hides');
END $$;

SELECT pg_temp.check(
  'the sequence is not reachable from a client role',
  NOT has_sequence_privilege('anon', 'public.order_number_seq', 'USAGE')
  AND NOT has_sequence_privilege('authenticated', 'public.order_number_seq', 'USAGE'),
  'a browser that could call nextval() would burn numbers and leave gaps in the ledger');

-- ============================================================
--  Dashboard notes item 2 — the Sales card's function can actually run
-- ============================================================
--
-- `get_sales_command_stats()` counted follow-ups with `category = 'sales'`, and
-- `internal_tickets.category` is `ticket_category`, whose values are pendant_help,
-- technical_issue, member_query, billing_question, general, other. PostgreSQL coerced the
-- literal, failed, and raised 22P02 — aborting the WHOLE function, so every figure on the card
-- was lost and the dashboard showed "Failed to load".
--
-- A contract test, in the harness, because the defect only exists when the function MEETS the
-- real enum: nothing in TypeScript could see it, and the SQL parses perfectly.

/**
 * The function's result, or NULL if the call raised.
 *
 * EVERY call in this section goes through this. An unguarded one takes the whole suite down and
 * prints no FAIL row at all: the mutation that restores the 'sales' clause was "killed" by a
 * crash rather than by an assertion, which is a verdict nobody can read — the same distinction
 * run.sh draws between exit 1 (a result) and exit 3 (no verdict).
 */
CREATE OR REPLACE FUNCTION pg_temp.sales_stats_or_null()
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.get_sales_command_stats();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'get_sales_command_stats() raised: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END $$;

SELECT pg_temp.check(
  'ticket_category still has no ''sales'' value — the premise of this section',
  NOT ('sales' = ANY (SELECT unnest(enum_range(NULL::public.ticket_category))::text)),
  'if a product decision adds one, the dropped clause can be reconsidered — but on purpose');

-- Rows that make the count non-trivial: two open follow-ups, one resolved one, one open ticket
-- that is not a follow-up at all. A function that returned 0 for everything would otherwise
-- pass every assertion below.
-- `ticket_number` is UNIQUE NOT NULL and `created_by` is NOT NULL REFERENCES staff — the
-- fixture supplies both rather than relying on defaults that do not exist.
INSERT INTO public.internal_tickets
  (ticket_number, title, description, category, status, priority, created_by)
VALUES
  ('TKT-RLS-1', 'Follow up with the Torrevieja lead', 'called, no answer', 'general', 'open',
   'medium', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com')),
  ('TKT-RLS-2', 'follow-up: pendant demo', 'wants a demo', 'member_query', 'in_progress',
   'medium', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com')),
  ('TKT-RLS-3', 'Follow up — already done', 'closed off', 'general', 'resolved',
   'low', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com')),
  ('TKT-RLS-4', 'Pendant will not charge', 'battery', 'pendant_help', 'open',
   'high', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com'));

DO $$
DECLARE stats json;
BEGIN
  -- THE ASSERTION THAT MATTERS: this call raised 22P02 before the fix, so everything below it is
  -- downstream of "the function runs at all".
  --
  stats := pg_temp.sales_stats_or_null();

  PERFORM pg_temp.check(
    'get_sales_command_stats() RETURNS instead of raising 22P02',
    stats IS NOT NULL,
    'the card read "Failed to load" because this call aborted on an enum value that does not exist');

  IF stats IS NULL THEN
    -- Nothing below can say anything useful; the failure above is the report.
    RETURN;
  END IF;

  PERFORM pg_temp.check(
    'it counts the two OPEN follow-ups and neither the resolved one nor the non-follow-up',
    (stats->>'followups_pending')::int = 2,
    format('got %s — expected the two open tickets whose title says follow', stats->>'followups_pending'));

  -- ::jsonb because `?` is a jsonb operator and this function returns `json`; on json it is
  -- "operator does not exist", which aborts the block rather than reporting a failure.
  PERFORM pg_temp.check(
    'every key the card reads is present',
    (SELECT bool_and(stats::jsonb ? k) FROM unnest(ARRAY[
      'paid_sales_today', 'paid_amount_today', 'paid_sales_60min', 'paid_amount_60min',
      'new_subscriptions', 'partner_signups', 'ai_hot_items', 'followups_pending'
    ]) AS k),
    'a missing key renders as undefined on the tile, which reads as a dash rather than a zero');

  PERFORM pg_temp.check(
    'and NO key is null — a quiet zero must render as 0, not as a blank',
    (SELECT bool_and(value IS NOT NULL) FROM json_each_text(stats)),
    format('%s', stats));

  PERFORM pg_temp.check(
    'the money figures are numbers, not nulls',
    (stats->>'paid_amount_today')::numeric >= 0
    AND (stats->>'paid_amount_60min')::numeric >= 0);
END $$;

-- ── the COALESCE on SUM, proven rather than asserted ──────────────────────
--
-- `SUM(amount)` over ZERO matching rows returns NULL, not 0, and json_build_object renders that
-- as `null` — a blank tile where the card should read €0.00. Proving it needs a window with no
-- rows in it, so the completed payments are moved three hours back, the function is called, and
-- they are moved straight back. Self-contained: every assertion above has already run, and the
-- shift is undone in the same block.
--
-- The `:= 0` initialisers on the DECLARE list are belt to this braces and are NOT proven here:
-- every SELECT in the function always assigns, so the initialiser only matters if a future edit
-- adds a branch that skips one. Said plainly rather than counted as tested.
DO $$
DECLARE stats json; moved int;
BEGIN
  UPDATE public.payments SET paid_at = paid_at - INTERVAL '3 hours'
   WHERE status = 'completed' AND paid_at >= NOW() - INTERVAL '60 minutes';
  GET DIAGNOSTICS moved = ROW_COUNT;

  stats := pg_temp.sales_stats_or_null();

  PERFORM pg_temp.check(
    'with NO payment in the last 60 minutes, the amount is 0 — not null',
    stats IS NOT NULL AND stats->>'paid_amount_60min' IS NOT NULL
    AND (stats->>'paid_amount_60min')::numeric = 0,
    format('got %s; SUM over no rows is NULL without the COALESCE', stats->'paid_amount_60min'));

  PERFORM pg_temp.check(
    'and the 60-minute COUNT is 0 too',
    stats IS NOT NULL AND (stats->>'paid_sales_60min')::int = 0);

  UPDATE public.payments SET paid_at = paid_at + INTERVAL '3 hours'
   WHERE status = 'completed' AND paid_at >= NOW() - INTERVAL '4 hours'
     AND paid_at < NOW() - INTERVAL '60 minutes';

  PERFORM pg_temp.check(
    'CONTROL: the fixture payments were moved and put back',
    moved > 0,
    'if nothing moved, the assertion above proved nothing — there was never a row in the window');
END $$;

-- A resolved follow-up must not be counted, and the count must MOVE when the data moves —
-- otherwise a hardcoded 2 would pass.
DO $$
DECLARE before_stats json; after_stats json; resolved_stats json;
BEGIN
  before_stats := pg_temp.sales_stats_or_null();

  INSERT INTO public.internal_tickets
    (ticket_number, title, description, category, status, priority, created_by)
  VALUES ('TKT-RLS-5', 'Follow up on the Albox enquiry', 'ring back', 'general', 'open',
          'medium', (SELECT id FROM public.staff WHERE email = 'superadmin@example.com'));

  after_stats := pg_temp.sales_stats_or_null();

  UPDATE public.internal_tickets SET status = 'resolved'
   WHERE title = 'Follow up on the Albox enquiry';

  resolved_stats := pg_temp.sales_stats_or_null();

  PERFORM pg_temp.check(
    'the follow-up count tracks the data rather than a constant',
    before_stats IS NOT NULL AND after_stats IS NOT NULL
    AND (after_stats->>'followups_pending')::int
        = (before_stats->>'followups_pending')::int + 1,
    format('%s then %s', before_stats->'followups_pending', after_stats->'followups_pending'));

  PERFORM pg_temp.check(
    'resolving it takes it back out of the count',
    resolved_stats IS NOT NULL AND before_stats IS NOT NULL
    AND (resolved_stats->>'followups_pending')::int
        = (before_stats->>'followups_pending')::int,
    format('%s back to %s', after_stats->'followups_pending', resolved_stats->'followups_pending'));
END $$;

-- COMMENTS STRIPPED FIRST. The function body explains the clause it dropped, quoting
-- `category = 'sales'` so the next reader knows why the count is title-based — and the first
-- version of this assertion matched that sentence and reported the fix as the defect. Prose is
-- not code; this reads the code.
SELECT pg_temp.check(
  'the function does NOT reach for a ::text cast to make the old clause "work"',
  (SELECT regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') NOT LIKE '%category::text%'
      AND regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') NOT LIKE '%''sales''%'
     FROM pg_proc WHERE proname = 'get_sales_command_stats'),
  'a cast would have loaded the card while silently counting no sales tickets forever, which is '
  'worse than the error that at least announced itself');

SELECT pg_temp.check(
  'a member cannot call it — dashboard figures are staff-facing',
  pg_temp.raises_as('11111111-1111-1111-1111-111111111111',
    'SELECT public.get_sales_command_stats()')
  OR pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT public.get_sales_command_stats()') = 1,
  'SECURITY DEFINER with no role check inside: recorded here as what it is, so a future '
  'tightening has a place to land');


-- ============================================================
--  Item 4 — the payment-link order, and who may set a member active
-- ============================================================
--
-- `create_payment_link_order()` records the PENDING order + items + subscription + payment
-- behind a staff-sent Stripe link. Everything below CALLS it rather than reading it: the same
-- function next door, `submit_registration_atomic`, passed a static review and then turned out
-- to be unable to insert a member at all (five missing text→enum casts, 20260908120500). A
-- 250-line PL/pgSQL body is not verifiable by reading.
--
-- The section seeds its OWN member and staff rows. Members A and B already carry ACTIVE
-- subscriptions from the top of this file, and this function deliberately REFUSES a member who
-- has one — so reusing them would have made every positive assertion here fail for the right
-- reason and the wrong one at the same time.

INSERT INTO auth.users (id, email) VALUES
  ('b1000000-0000-0000-0000-00000000000a', 'link-member@example.com'),
  ('b1000000-0000-0000-0000-00000000000b', 'link-admin@example.com'),
  ('b1000000-0000-0000-0000-00000000000c', 'link-operator@example.com');

INSERT INTO public.members
  (id, user_id, first_name, last_name, email, phone, date_of_birth,
   address_line_1, address_line_2, city, province, postal_code, status)
VALUES
  ('b1e00000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a',
   'Lena', 'Link', 'link-member@example.com', '+34600000009', '1948-03-03',
   'Calle L 9', 'Piso 2', 'Mojacar', 'Almeria', '04638', 'inactive');

INSERT INTO public.staff (user_id, email, first_name, last_name, role) VALUES
  ('b1000000-0000-0000-0000-00000000000b', 'link-admin@example.com', 'Ada', 'Admin', 'admin'),
  ('b1000000-0000-0000-0000-00000000000c', 'link-operator@example.com', 'Ivo', 'Operator', 'call_centre');

INSERT INTO public.payers (id, full_name, email, relationship)
VALUES ('b1a00000-0000-0000-0000-00000000000a', 'Diana Daughter', 'diana@example.com', 'daughter');

-- A payload the edge function would send: figures already computed by _shared/pricing-calc.ts,
-- couple plan, two pendants, shipping once (P3), the registration fee at full price.
CREATE OR REPLACE FUNCTION pg_temp.link_payload(p_over jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'memberId', 'b1e00000-0000-0000-0000-00000000000a',
    'membershipType', 'couple',
    'billingFrequency', 'monthly',
    'pendantCount', 2,
    'payerId', 'b1a00000-0000-0000-0000-00000000000a',
    'paymentMethod', 'stripe',
    'createdByStaffId', (SELECT id FROM public.staff WHERE email = 'link-admin@example.com'),
    'amounts', jsonb_build_object(
      'subscriptionNet', 44.98, 'subscriptionTax', 4.50, 'subscriptionFinal', 49.48,
      'subscriptionTaxRate', 0.10,
      'pendantNet', 250.00, 'pendantTax', 52.50, 'pendantFinal', 302.50,
      'pendantTaxRate', 0.21,
      'registrationFee', 59.99,
      'shipping', 14.99,
      'total', 426.96
    )
  ) || p_over
$$;

-- Call it and hand back the result, or NULL plus the SQLSTATE — so a raise inside the function
-- is reported as a failed assertion instead of aborting the whole suite with no FAIL row. That
-- is not hypothetical: the 22P02 section above lost six assertions that way before this pattern
-- was adopted.
CREATE OR REPLACE FUNCTION pg_temp.link_order_or_null(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  SELECT public.create_payment_link_order(p_payload) INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_payment_link_order raised %: %', SQLSTATE, SQLERRM;
  RETURN NULL;
END $$;

-- ── it is service_role only ────────────────────────────────────────────────
SELECT pg_temp.check(
  'authenticated cannot EXECUTE create_payment_link_order — it would be F7 one layer down',
  NOT has_function_privilege('authenticated', 'public.create_payment_link_order(jsonb)', 'execute'),
  'a staff account calling this from the browser could name its own amounts');

SELECT pg_temp.check(
  'anon cannot either',
  NOT has_function_privilege('anon', 'public.create_payment_link_order(jsonb)', 'execute'));

SELECT pg_temp.check(
  'service_role can — that is the only caller (send-payment-link)',
  has_function_privilege('service_role', 'public.create_payment_link_order(jsonb)', 'execute'));

SELECT pg_temp.check(
  'it is SECURITY DEFINER with a pinned search_path',
  (SELECT prosecdef AND array_to_string(proconfig, ',') LIKE '%search_path=public%'
     FROM pg_proc WHERE proname = 'create_payment_link_order'),
  'an unpinned search_path lets a caller shadow `orders` with their own table');

-- ── the happy path, by execution ───────────────────────────────────────────
DO $$
DECLARE
  res jsonb;
  o public.orders;
  sub public.subscriptions;
  pay public.payments;
  n_items int;
  member_status_before text;
  member_status_after text;
BEGIN
  SELECT status::text INTO member_status_before
    FROM public.members WHERE id = 'b1e00000-0000-0000-0000-00000000000a';

  res := pg_temp.link_order_or_null(pg_temp.link_payload());

  PERFORM pg_temp.check(
    'a real payload returns the four ids the webhook needs in metadata',
    res IS NOT NULL
    AND res ? 'orderId' AND res ? 'orderNumber' AND res ? 'paymentId' AND res ? 'subscriptionId',
    format('got %s', res));

  IF res IS NULL THEN
    RETURN;   -- nothing below can say anything; the failure above is the report
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = (res->>'orderId')::uuid;
  SELECT * INTO sub FROM public.subscriptions WHERE id = (res->>'subscriptionId')::uuid;
  SELECT * INTO pay FROM public.payments WHERE id = (res->>'paymentId')::uuid;
  SELECT count(*) INTO n_items FROM public.order_items WHERE order_id = o.id;

  PERFORM pg_temp.check(
    'the order is PENDING and awaiting payment, not paid',
    o.status = 'pending' AND o.fulfilment_state = 'awaiting_payment',
    format('status=%s fulfilment_state=%s', o.status, o.fulfilment_state));

  PERFORM pg_temp.check(
    'the order number is the readable sequence format, not an epoch hash',
    o.order_number ~ ('^ICE-' || to_char(now(), 'YYYYMMDD') || '-[0-9]{5}$'),
    format('got %s', o.order_number));

  PERFORM pg_temp.check(
    'the total is the total, and the parts are on the order',
    o.total_amount = 426.96 AND o.shipping_amount = 14.99
    AND o.subtotal = 44.98 + 250.00 + 59.99,
    format('total=%s shipping=%s subtotal=%s', o.total_amount, o.shipping_amount, o.subtotal));

  PERFORM pg_temp.check(
    'it ships to the MEMBER''s address — the payer pays, the member wears the pendant',
    o.shipping_address_line_1 = 'Calle L 9' AND o.shipping_address_line_2 = 'Piso 2'
    AND o.shipping_city = 'Mojacar' AND o.shipping_postal_code = '04638',
    'posting a life-safety device to whoever is paying is a defect, not a convenience');

  PERFORM pg_temp.check(
    'three order items: the membership, two pendants, the fee',
    n_items = 3
    AND (SELECT quantity FROM public.order_items
          WHERE order_id = o.id AND item_type = 'pendant') = 2,
    format('%s items', n_items));

  PERFORM pg_temp.check(
    'the subscription is PENDING — golden rule 4 leaves `active` to the webhook',
    sub.status = 'pending' AND sub.stripe_subscription_id IS NULL
    AND sub.stripe_customer_id IS NULL,
    format('status=%s', sub.status));

  PERFORM pg_temp.check(
    'the plan is what staff chose, and the pendant is recorded',
    sub.plan_type = 'couple' AND sub.billing_frequency = 'monthly'
    AND sub.has_pendant AND NOT sub.registration_fee_paid);

  PERFORM pg_temp.check(
    'the payer is attached to the subscription (PAYER_MODEL.md), not to the member row',
    sub.payer_id = 'b1a00000-0000-0000-0000-00000000000a');

  PERFORM pg_temp.check(
    'the payment is PENDING, for the full total, and points at both the order and the subscription',
    pay.status = 'pending' AND pay.amount = 426.96
    AND pay.order_id = o.id AND pay.subscription_id = sub.id
    AND pay.payment_type = 'order' AND pay.paid_at IS NULL,
    format('status=%s amount=%s', pay.status, pay.amount));

  SELECT status::text INTO member_status_after
    FROM public.members WHERE id = 'b1e00000-0000-0000-0000-00000000000a';

  PERFORM pg_temp.check(
    'THE MEMBER IS NOT ACTIVATED — the whole point of golden rule 4',
    member_status_after = member_status_before AND member_status_after = 'inactive',
    format('%s -> %s', member_status_before, member_status_after));

  PERFORM pg_temp.check(
    'the staff member who pressed the button is named in activity_logs',
    EXISTS (
      SELECT 1 FROM public.activity_logs al
       WHERE al.entity_id = o.id
         AND al.action = 'payment_link_order_created'
         AND al.entity_type = 'order'
         AND al.staff_id = (SELECT id FROM public.staff WHERE email = 'link-admin@example.com')
         AND al.member_action IS NULL),
    '"who signed this member up, and when" must be answerable without reading Stripe');
END $$;

-- ── two calls in ONE statement cannot collide on the order number ──────────
-- The F17 defect was a one-second epoch hash against a UNIQUE constraint. Both calls here share
-- a transaction timestamp, which is exactly the case that used to fail; a sequence cannot.
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  DELETE FROM public.subscriptions WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a';

  SELECT pg_temp.link_order_or_null(pg_temp.link_payload()),
         pg_temp.link_order_or_null(pg_temp.link_payload())
    INTO a, b;

  PERFORM pg_temp.check(
    'two orders created in the same statement get different numbers',
    a IS NOT NULL AND b IS NOT NULL AND (a->>'orderNumber') <> (b->>'orderNumber'),
    format('%s vs %s', a->>'orderNumber', b->>'orderNumber'));
END $$;

-- ── what it refuses ────────────────────────────────────────────────────────
SELECT pg_temp.check(
  'an unknown member is refused',
  pg_temp.link_order_or_null(pg_temp.link_payload(
    '{"memberId": "deadbeef-0000-0000-0000-000000000000"}'::jsonb)) IS NULL);

SELECT pg_temp.check(
  'a plan type that is not single or couple is refused',
  pg_temp.link_order_or_null(pg_temp.link_payload('{"membershipType": "family"}'::jsonb)) IS NULL);

SELECT pg_temp.check(
  'a billing frequency that is not monthly or annual is refused',
  pg_temp.link_order_or_null(pg_temp.link_payload('{"billingFrequency": "weekly"}'::jsonb)) IS NULL);

SELECT pg_temp.check(
  'three pendants is refused — a quantity typo is money',
  pg_temp.link_order_or_null(pg_temp.link_payload('{"pendantCount": 3}'::jsonb)) IS NULL);

SELECT pg_temp.check(
  'a zero total is refused',
  pg_temp.link_order_or_null(pg_temp.link_payload(
    jsonb_build_object('amounts', (pg_temp.link_payload()->'amounts') || '{"total": 0}'::jsonb))) IS NULL);

SELECT pg_temp.check(
  'amounts that do not sum to the total are refused',
  pg_temp.link_order_or_null(pg_temp.link_payload(
    jsonb_build_object('amounts', (pg_temp.link_payload()->'amounts') || '{"total": 99.99}'::jsonb))) IS NULL,
  'a payload assembled wrongly is a customer charged wrongly');

-- ...and it accepts a total that sums, so the assertion above is about the SUM and not about
-- the number 99.99.
SELECT pg_temp.check(
  'CONTROL: a consistent smaller order IS accepted',
  pg_temp.link_order_or_null(pg_temp.link_payload(
    jsonb_build_object(
      'membershipType', 'single', 'pendantCount', 0,
      'amounts', jsonb_build_object(
        'subscriptionNet', 24.99, 'subscriptionTax', 2.50, 'subscriptionFinal', 27.49,
        'subscriptionTaxRate', 0.10,
        'pendantNet', 0, 'pendantTax', 0, 'pendantFinal', 0, 'pendantTaxRate', 0.21,
        'registrationFee', 0, 'shipping', 0, 'total', 27.49)))) IS NOT NULL);

-- A member who is already paying must not be signed up twice. The row above left a `pending`
-- subscription, which is NOT a live one — chasing an unpaid link has to keep working.
DO $$
DECLARE live jsonb; pending_ok jsonb;
BEGIN
  pending_ok := pg_temp.link_order_or_null(pg_temp.link_payload());
  PERFORM pg_temp.check(
    'a member with only PENDING subscriptions can be sent another link — that is the chase',
    pending_ok IS NOT NULL);

  UPDATE public.subscriptions SET status = 'active'
   WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a'
     AND id = (pending_ok->>'subscriptionId')::uuid;

  live := pg_temp.link_order_or_null(pg_temp.link_payload());
  PERFORM pg_temp.check(
    'a member with a LIVE subscription is refused — change the plan, do not double-bill',
    live IS NULL);
END $$;

-- ── the guard: who may set a member active ────────────────────────────────
-- 20260904180000 closed the member half of golden rule 4 and left staff unrestricted. That
-- exception was written for SUSPENDING, and `MemberDetailPage.handleSuspend` writes
-- `status: member.status === "suspended" ? "active" : "suspended"` from the browser — so one
-- click on an unpaid member's record granted an active membership. The literal-`status: "active"`
-- guard in src/test/webhookActivationContract.test.ts never saw it, because that is a ternary.

-- Member L now HAS a live subscription (set active in the block above), so start from a state
-- where staff activation is legitimate, then remove it.
SELECT pg_temp.check(
  'CONTROL: member L has a live subscription right now',
  (SELECT count(*) FROM public.subscriptions
    WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a' AND status = 'active') = 1,
  'if this is 0, the "staff CAN activate a paid member" assertion below is vacuous');

SELECT pg_temp.check(
  'staff CAN reinstate a member whose subscription is live — the case the exception exists for',
  pg_temp.exec_as('b1000000-0000-0000-0000-00000000000b',
    'UPDATE public.members SET status = ''active''
      WHERE id = ''b1e00000-0000-0000-0000-00000000000a''') = 1);

SELECT pg_temp.check(
  'staff can still SUSPEND anybody — that half is untouched',
  pg_temp.exec_as('b1000000-0000-0000-0000-00000000000b',
    'UPDATE public.members SET status = ''suspended''
      WHERE id = ''b1e00000-0000-0000-0000-00000000000a''') = 1);

-- Now take the payment away and try the same click again.
UPDATE public.subscriptions SET status = 'cancelled'
 WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a';

SELECT pg_temp.check(
  'staff CANNOT set an UNPAID member active — a free membership by dropdown is refused',
  pg_temp.raises_as('b1000000-0000-0000-0000-00000000000b',
    'UPDATE public.members SET status = ''active''
      WHERE id = ''b1e00000-0000-0000-0000-00000000000a'''),
  'this is the un-suspend click on a member nobody has paid for');

SELECT pg_temp.check(
  'nor can a call-centre operator',
  pg_temp.raises_as('b1000000-0000-0000-0000-00000000000c',
    'UPDATE public.members SET status = ''active''
      WHERE id = ''b1e00000-0000-0000-0000-00000000000a'''));

SELECT pg_temp.check(
  'the member still cannot activate themselves (20260904180000, unchanged)',
  pg_temp.raises_as('b1000000-0000-0000-0000-00000000000a',
    'UPDATE public.members SET status = ''active'' WHERE user_id = auth.uid()'));

SELECT pg_temp.check(
  'CONTROL: the refusals above left the member NOT active',
  (SELECT status::text FROM public.members
    WHERE id = 'b1e00000-0000-0000-0000-00000000000a') <> 'active',
  'a guard that raises and still writes is worse than no guard');

-- past_due counts as paid (P4: monitoring continues while Stripe retries), so a member whose
-- card failed can still be un-suspended.
UPDATE public.subscriptions SET status = 'past_due'
 WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a'
   AND id = (SELECT id FROM public.subscriptions
              WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a' LIMIT 1);

SELECT pg_temp.check(
  'a past_due member can be reinstated — P4 keeps monitoring running through a failed payment',
  pg_temp.exec_as('b1000000-0000-0000-0000-00000000000b',
    'UPDATE public.members SET status = ''active''
      WHERE id = ''b1e00000-0000-0000-0000-00000000000a''') = 1);

-- And the service role — the payment webhook — is unrestricted, which is the one route golden
-- rule 4 names. No auth.uid(), so the guard returns early.
UPDATE public.subscriptions SET status = 'cancelled'
 WHERE member_id = 'b1e00000-0000-0000-0000-00000000000a';

DO $$
DECLARE n int;
BEGIN
  UPDATE public.members SET status = 'inactive'
   WHERE id = 'b1e00000-0000-0000-0000-00000000000a';
  UPDATE public.members SET status = 'active'
   WHERE id = 'b1e00000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check(
    'the payment webhook (service role, no auth.uid()) activates an unpaid member freely',
    n = 1,
    'the webhook is the ONE route golden rule 4 permits, and it must not be blocked by this');
END $$;

-- The guard reads the code, not its own comment.
SELECT pg_temp.check(
  'the guard names `active` explicitly rather than trusting a status list',
  (SELECT regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') LIKE '%past_due%'
      AND regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') LIKE '%is_staff%'
     FROM pg_proc WHERE proname = 'guard_member_status_self_write'));


-- ============================================================
--  notify-staff: preferences, routes, devices, and the log's channel
-- ============================================================
--
-- Three gates decide whether a notification goes out, and each one is a table this section
-- exercises by WRITING to it as a real role. The seed policy is asserted by reading back what
-- the migration's own function produced — not by re-stating the CASE expression here, which
-- would only prove I can copy a CASE expression.
--
-- Section-local staff, because the suite's operators are deleted by the FK-audit section and
-- the seed trigger means every staff row inserted anywhere now carries 32 preference rows.

INSERT INTO auth.users (id, email) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'notify-admin@example.com'),
  ('c1000000-0000-0000-0000-00000000000b', 'notify-operator@example.com'),
  ('c1000000-0000-0000-0000-00000000000c', 'notify-other@example.com');

INSERT INTO public.staff (id, user_id, email, first_name, last_name, role, personal_mobile) VALUES
  ('c1a00000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a',
   'notify-admin@example.com', 'Nadia', 'Admin', 'admin', '+34600000101'),
  ('c1a00000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-00000000000b',
   'notify-operator@example.com', 'Omar', 'Operator', 'call_centre', '+34600000102'),
  ('c1a00000-0000-0000-0000-00000000000c', 'c1000000-0000-0000-0000-00000000000c',
   'notify-other@example.com', 'Olga', 'Other', 'call_centre', '+34600000103');

-- ── the seed is a set of ROWS, and the right ones ──────────────────────────
-- The counts below compare against `notification_routes` rather than a literal, so extending
-- the event list does not redden the suite for a reason nobody can act on. THIS assertion is
-- what stops that being vacuous: the routes table has to be the real 19 x 4.
SELECT pg_temp.check(
  'the routes table carries every event type x every channel — 19 x 4',
  (SELECT count(*) FROM public.notification_routes) = 76
  AND (SELECT count(DISTINCT event_type) FROM public.notification_routes) = 19
  AND (SELECT count(DISTINCT channel) FROM public.notification_routes) = 4,
  'the eight this router was built for, the eleven notify-admin already sends, and `test`');

SELECT pg_temp.check(
  'the four that say the SAFETY MACHINERY failed are routed ON, on every channel',
  (SELECT bool_and(enabled) FROM public.notification_routes
    WHERE event_type = 'system.runner_failure' OR event_type LIKE 'escalation.%'),
  'the router ignores this table for them (ALWAYS_LOUD); the rows are true so the data agrees '
  'with the behaviour rather than showing a switch that does nothing');

SELECT pg_temp.check(
  'and every staff member is seeded ON for them, not shown as opted out',
  (SELECT bool_and(enabled) FROM public.staff_notification_prefs
    WHERE event_type = 'system.runner_failure' OR event_type LIKE 'escalation.%'));
SELECT pg_temp.check(
  'the AFTER INSERT trigger seeded a row per event x channel for each new staff member',
  (SELECT count(*) FROM public.staff_notification_prefs
    WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000b')
    = (SELECT count(*) FROM public.notification_routes),
  'without the trigger, "every default is a row" means "for whoever existed on 9 September"');

SELECT pg_temp.check(
  'an ADMIN is seeded ON for sale.paid on all four channels (Lee''s policy)',
  (SELECT count(*) FROM public.staff_notification_prefs
    WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000a'
      AND event_type = 'sale.paid' AND enabled) = 4);

SELECT pg_temp.check(
  'and ON for lead.new on all four',
  (SELECT count(*) FROM public.staff_notification_prefs
    WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000a'
      AND event_type = 'lead.new' AND enabled) = 4);

SELECT pg_temp.check(
  'EVERY staff member gets the sale.paid EMAIL — the whole team hears about a sale',
  (SELECT bool_and(enabled) FROM public.staff_notification_prefs
    WHERE event_type = 'sale.paid' AND channel = 'email'),
  'Lee: "ALL staff get an EMAIL for every sale.paid to their registered staff email"');

SELECT pg_temp.check(
  'but an operator is NOT seeded onto the paid-sale SMS — that is an admin route',
  (SELECT NOT enabled FROM public.staff_notification_prefs
    WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000b'
      AND event_type = 'sale.paid' AND channel = 'sms'));

SELECT pg_temp.check(
  'every staff member is seeded ON for sos.* PUSH — an alert is everybody''s business',
  (SELECT bool_and(enabled) FROM public.staff_notification_prefs
    WHERE event_type LIKE 'sos.%' AND channel = 'push'));

SELECT pg_temp.check(
  'and NOT onto sos SMS, which would be a per-message bill on every alert',
  (SELECT bool_and(NOT enabled) FROM public.staff_notification_prefs
    WHERE event_type LIKE 'sos.%' AND channel = 'sms'));

-- A default is what somebody gets before they decide. Re-seeding must not re-decide.
DO $$
DECLARE still_off boolean;
BEGIN
  UPDATE public.staff_notification_prefs SET enabled = false
   WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000a'
     AND event_type = 'sale.paid' AND channel = 'sms';

  PERFORM public.seed_staff_notification_prefs('c1a00000-0000-0000-0000-00000000000a');

  SELECT NOT enabled INTO still_off FROM public.staff_notification_prefs
   WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000a'
     AND event_type = 'sale.paid' AND channel = 'sms';

  PERFORM pg_temp.check(
    'RE-SEEDING DOES NOT UNDO A SWITCH AN ADMIN TURNED OFF',
    still_off,
    'ON CONFLICT DO UPDATE here would make an admin''s decision revert on every deploy');

  -- put it back so later assertions read the seeded state
  UPDATE public.staff_notification_prefs SET enabled = true
   WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000a'
     AND event_type = 'sale.paid' AND channel = 'sms';
END $$;

-- ── the event list cannot drift between the two tables ─────────────────────
SELECT pg_temp.check(
  'a preference for an event/channel pair with no route is refused (FK, not a second CHECK)',
  pg_temp.raises_as('c1000000-0000-0000-0000-00000000000a',
    'INSERT INTO public.staff_notification_prefs (staff_id, event_type, channel, enabled)
       VALUES (''c1a00000-0000-0000-0000-00000000000b'', ''sale.invented'', ''sms'', true)'),
  'two copies of an event list drift, and this one decides who hears about money');

SELECT pg_temp.check(
  'a channel outside the four is refused',
  pg_temp.raises_as('c1000000-0000-0000-0000-00000000000a',
    'INSERT INTO public.staff_notification_prefs (staff_id, event_type, channel, enabled)
       VALUES (''c1a00000-0000-0000-0000-00000000000b'', ''sale.paid'', ''pigeon'', true)'));

-- ── who may read and write a preference ────────────────────────────────────
SELECT pg_temp.check(
  'an operator sees their OWN preference rows and nobody else''s',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000b',
    'SELECT id FROM public.staff_notification_prefs')
    = (SELECT count(*) FROM public.notification_routes));

SELECT pg_temp.check(
  'an operator CANNOT read a colleague''s preferences',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000b',
    'SELECT id FROM public.staff_notification_prefs
      WHERE staff_id = ''c1a00000-0000-0000-0000-00000000000c''') = 0,
  'who agreed to be texted at 3am is not a colleague''s business');

SELECT pg_temp.check(
  'an operator cannot turn their OWN sos.opened push OFF — that is the escalation path',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000b',
    'UPDATE public.staff_notification_prefs SET enabled = false
      WHERE staff_id = ''c1a00000-0000-0000-0000-00000000000b''
        AND event_type = ''sos.opened'' AND channel = ''push''') = 0,
  'a life-safety product cannot let somebody remove themselves from the ladder silently');

SELECT pg_temp.check(
  'CONTROL: that row really is still on',
  (SELECT enabled FROM public.staff_notification_prefs
    WHERE staff_id = 'c1a00000-0000-0000-0000-00000000000b'
      AND event_type = 'sos.opened' AND channel = 'push'));

SELECT pg_temp.check(
  'an admin reads every preference row — the matrix is an admin screen',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000a',
    'SELECT id FROM public.staff_notification_prefs
      WHERE staff_id = ''c1a00000-0000-0000-0000-00000000000c''')
    = (SELECT count(*) FROM public.notification_routes));

SELECT pg_temp.check(
  'an admin can flip somebody else''s switch',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000a',
    'UPDATE public.staff_notification_prefs SET enabled = true
      WHERE staff_id = ''c1a00000-0000-0000-0000-00000000000c''
        AND event_type = ''device.offline'' AND channel = ''email''') = 1);

SELECT pg_temp.check(
  'a MEMBER cannot read the staff notification prefs at all',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.staff_notification_prefs') = 0);

-- ── routes: everybody reads, admins write ──────────────────────────────────
SELECT pg_temp.check(
  'an operator can SEE the company routes — "why was I not texted" deserves an answer',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000b',
    'SELECT event_type FROM public.notification_routes')
    = (SELECT count(*) FROM public.notification_routes));

SELECT pg_temp.check(
  'an operator cannot change a route',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000b',
    'UPDATE public.notification_routes SET enabled = false WHERE event_type = ''sale.paid''') = 0);

SELECT pg_temp.check(
  'an admin can — a switch, not a redeploy',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000a',
    'UPDATE public.notification_routes SET enabled = false
      WHERE event_type = ''device.offline'' AND channel = ''email''') = 1);

SELECT pg_temp.check(
  'a member cannot read the routes',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT event_type FROM public.notification_routes') = 0);

-- ── push tokens belong to a device, and to one person ──────────────────────
SELECT pg_temp.check(
  'a staff member registers their own device',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000b',
    'INSERT INTO public.staff_push_tokens (staff_id, token, platform, label)
       VALUES (''c1a00000-0000-0000-0000-00000000000b'', ''fcm-omar-phone'', ''ios'', ''iPhone'')') = 1);

SELECT pg_temp.check(
  'and CANNOT register a device against a colleague',
  pg_temp.raises_as('c1000000-0000-0000-0000-00000000000b',
    'INSERT INTO public.staff_push_tokens (staff_id, token, platform)
       VALUES (''c1a00000-0000-0000-0000-00000000000c'', ''fcm-stolen'', ''ios'')')
  OR pg_temp.count_as('c1000000-0000-0000-0000-00000000000b',
    'SELECT id FROM public.staff_push_tokens WHERE token = ''fcm-stolen''') = 0,
  'a token attached to the wrong staff row sends that person''s alerts to somebody else');

SELECT pg_temp.check(
  'the same token cannot be attached twice — the shared-tablet case',
  pg_temp.raises_as('c1000000-0000-0000-0000-00000000000c',
    'INSERT INTO public.staff_push_tokens (staff_id, token, platform)
       VALUES (''c1a00000-0000-0000-0000-00000000000c'', ''fcm-omar-phone'', ''ios'')'),
  'the second person to enable notifications would receive the first person''s alerts');

SELECT pg_temp.check(
  'a staff member sees only their own devices',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000c',
    'SELECT id FROM public.staff_push_tokens') = 0);

SELECT pg_temp.check(
  'a staff member can remove their own device',
  pg_temp.exec_as('c1000000-0000-0000-0000-00000000000b',
    'DELETE FROM public.staff_push_tokens WHERE token = ''fcm-omar-phone''') = 1);

DO $$
BEGIN
  -- Re-register it for the assertions below.
  INSERT INTO public.staff_push_tokens (staff_id, token, platform)
  VALUES ('c1a00000-0000-0000-0000-00000000000b', 'fcm-omar-phone', 'ios');
END $$;

SELECT pg_temp.check(
  'an admin SEES the devices — the screen says who can be reached on a phone',
  pg_temp.count_as('c1000000-0000-0000-0000-00000000000a',
    'SELECT id FROM public.staff_push_tokens') >= 1);

-- `raises_as`, not `exec_as`, and the distinction cost a suite run: a forbidden UPDATE is
-- FILTERED to zero rows, but an INSERT that fails a WITH CHECK RAISES — and `exec_as` has no
-- exception handler, so it aborted the whole script instead of reporting a failure. The header
-- of this file says "RLS turns a forbidden UPDATE into zero rows rather than an error"; INSERT
-- is the other half of that sentence.
SELECT pg_temp.check(
  'but an admin cannot WRITE a token — one they typed proves nothing about a device',
  pg_temp.raises_as('c1000000-0000-0000-0000-00000000000a',
    'INSERT INTO public.staff_push_tokens (staff_id, token, platform)
       VALUES (''c1a00000-0000-0000-0000-00000000000c'', ''fcm-typed-by-admin'', ''web'')'),
  'admins read devices and never write them');

SELECT pg_temp.check(
  'CONTROL: and no such row exists',
  (SELECT count(*) FROM public.staff_push_tokens WHERE token = 'fcm-typed-by-admin') = 0);

SELECT pg_temp.check(
  'a member cannot read staff devices',
  pg_temp.count_as('11111111-1111-1111-1111-111111111111',
    'SELECT id FROM public.staff_push_tokens') = 0);

-- ── the log can tell a bell entry from a send attempt ──────────────────────
DO $$
DECLARE v_bell uuid; v_sms uuid;
BEGIN
  INSERT INTO public.notification_log (admin_user_id, event_type, message, status)
  VALUES ('c1000000-0000-0000-0000-00000000000a', 'message', 'a bell row', 'pending')
  RETURNING id INTO v_bell;

  PERFORM pg_temp.check(
    'a row written the old way is a BELL row, so the bell keeps working unchanged',
    (SELECT channel FROM public.notification_log WHERE id = v_bell) = 'bell',
    'the default is what makes this migration safe to apply under a running app');

  INSERT INTO public.notification_log
    (admin_user_id, event_type, channel, recipient, message, status, idempotency_key)
  VALUES ('c1000000-0000-0000-0000-00000000000a', 'sale.paid', 'sms', '+34600000101',
          'sent an SMS', 'sent', 'sale.paid:order-1')
  RETURNING id INTO v_sms;

  PERFORM pg_temp.check(
    'and a send attempt names its channel and where it went',
    (SELECT channel = 'sms' AND recipient = '+34600000101'
       FROM public.notification_log WHERE id = v_sms));
END $$;

/*
  THE SAME EVENT CANNOT BE SENT TWICE — and this assertion had to be rewritten because the first
  version was VACUOUS. It used `raises_as` as an admin, so ANY refusal counted as the index
  doing its job: an RLS denial on `notification_log` would have satisfied it just as well as a
  unique violation. Proved by mutation — dropping UNIQUE from the index left the suite green.

  Written as the ROUTER writes it (service role, no auth.uid()) and catching `unique_violation`
  SPECIFICALLY, so a refusal for any other reason fails the assertion instead of passing it.
*/
DO $$
DECLARE outcome text; n int;
BEGIN
  BEGIN
    INSERT INTO public.notification_log
      (admin_user_id, event_type, channel, recipient, message, status, idempotency_key)
    VALUES ('c1000000-0000-0000-0000-00000000000a', 'sale.paid', 'sms', '+34600000101',
            'a retry', 'sent', 'sale.paid:order-1');
    outcome := 'inserted';
  EXCEPTION
    WHEN unique_violation THEN outcome := 'unique_violation';
    WHEN OTHERS THEN outcome := 'other: ' || SQLSTATE;
  END;

  SELECT count(*) INTO n FROM public.notification_log
   WHERE idempotency_key = 'sale.paid:order-1' AND channel = 'sms' AND status = 'sent';

  PERFORM pg_temp.check(
    'THE SAME EVENT CANNOT BE SENT TWICE to the same place on the same channel',
    outcome = 'unique_violation' AND n = 1,
    format('outcome=%s, sent rows=%s — a webhook retry must not buzz the same phone twice', outcome, n));
END $$;

DO $$
DECLARE n int; outcome text;
BEGIN
  -- A FAILED attempt is not a send, so it must stay retryable: partial on status = 'sent'.
  --
  -- The second insert is GUARDED, because without the partial clause it raises — and an
  -- unguarded raise here aborts the whole suite with no FAIL row, which is the failure mode the
  -- sales-stats section already had to fix once. A crash is not an assertion.
  INSERT INTO public.notification_log
    (admin_user_id, event_type, channel, recipient, message, status, idempotency_key, error)
  VALUES ('c1000000-0000-0000-0000-00000000000a', 'sale.paid', 'whatsapp', '+34600000101',
          'first try', 'failed', 'sale.paid:order-1', 'twilio 500');

  BEGIN
    INSERT INTO public.notification_log
      (admin_user_id, event_type, channel, recipient, message, status, idempotency_key, error)
    VALUES ('c1000000-0000-0000-0000-00000000000a', 'sale.paid', 'whatsapp', '+34600000101',
            'second try', 'failed', 'sale.paid:order-1', 'twilio 500');
    outcome := 'retried';
  EXCEPTION WHEN OTHERS THEN outcome := 'refused: ' || SQLSTATE;
  END;

  SELECT count(*) INTO n FROM public.notification_log
   WHERE idempotency_key = 'sale.paid:order-1' AND channel = 'whatsapp';

  PERFORM pg_temp.check(
    'a FAILED attempt stays retryable — the index is partial on status = ''sent''',
    outcome = 'retried' AND n = 2,
    format('outcome=%s rows=%s — otherwise one Twilio hiccup permanently silences that event '
           'for that person', outcome, n));
END $$;

SELECT pg_temp.check(
  'and the bell''s own rows are unaffected by the idempotency index (no key at all)',
  (SELECT count(*) FROM public.notification_log
    WHERE channel = 'bell' AND idempotency_key IS NULL) > 0);

-- The lead trigger from 20260908130000 still writes bell rows, and they are still bell rows.
DO $$
DECLARE n_before int; n_after int;
BEGIN
  SELECT count(*) INTO n_before FROM public.notification_log WHERE channel = 'bell';

  INSERT INTO public.leads (first_name, last_name, email, phone, enquiry_type, message, source)
  VALUES ('Nuria', 'Nueva', 'nuria@example.com', '+34600000199', 'general', 'hello', 'contact_form');

  SELECT count(*) INTO n_after FROM public.notification_log WHERE channel = 'bell';

  PERFORM pg_temp.check(
    'a new lead still raises BELL rows, one per active staff member',
    n_after > n_before,
    'the channel column must not have changed what the existing trigger produces');

  PERFORM pg_temp.check(
    'and none of them is a send attempt',
    (SELECT count(*) FROM public.notification_log
      WHERE entity_type = 'lead' AND channel <> 'bell') = 0);
END $$;

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
