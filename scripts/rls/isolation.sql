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
--  8. Controls — the suite must be capable of failing
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
--  9. Blanket golden-rule-2 sweep over every table
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
