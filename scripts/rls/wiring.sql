-- ============================================================================
-- WIRING CONTRACT — the register's proofs that need a real database.
--
-- Two things WIRING_REGISTER.md claims which only PostgreSQL can settle:
--
--   1. every table `src/` subscribes to is in the `supabase_realtime`
--      publication, so the subscription can actually fire;
--   2. a lead arriving in `leads` raises a notification for every active staff
--      member — the defect this whole register came from.
--
-- Run by scripts/rls/run.sh against the same throwaway database as the
-- isolation suite, because that database already exists and booting a second
-- PostgreSQL to ask two questions would be a duplicate harness.
--
-- Assertions here are plain SQL with a RAISE, rather than isolation.sql's
-- pg_temp.check() helper: that helper lives in the isolation session and this
-- runs in its own, and lifting it into a shared file would mean editing the RLS
-- gate itself for the convenience of a new check. Deliberate, and noted so the
-- next person does not "tidy" it into a copy of check().
--
-- ── 1. REALTIME CONTRACT — every subscribed table must be published.
--
-- Run by scripts/rls/run.sh against the same throwaway database, because this
-- needs the real `pg_publication_tables` and that already exists there. Booting
-- a second PostgreSQL to ask one question would be a duplicate harness.
--
-- WHAT THIS CATCHES, AND WHY NOTHING ELSE DOES:
--
-- `supabase.channel(…).on('postgres_changes', { table: 't' }).subscribe()`
-- SUCCEEDS whether or not `t` is in the `supabase_realtime` publication. There
-- is no error, no rejected promise and no log line. The callback is simply
-- never invoked, forever. Five subscriptions in this repo were in that state,
-- including the shift-handover list whose own comment promised operators that
-- notes from other operators "appear without a reload".
--
-- Nothing in a unit test can see this: the client is mocked, so the callback is
-- called by the mock. Nothing in a type check can see it. Only the database
-- knows, which is why the assertion lives here.
--
-- The subscribed-table list is NOT written down here — it is generated from the
-- source by `node scripts/wiring/inventory.mjs --channels` and loaded below, so
-- a subscription added next week is covered next week without anyone
-- remembering to update this file.
-- ============================================================================

-- `wiring_subscribed` is created and filled by the generated prelude that
-- run.sh concatenates in front of this file. It is not loaded with \copy:
-- \copy does not interpolate psql variables, so a filename passed that way
-- expands to nothing and the contract "passes" over an empty table — a check
-- that cannot fail, which is worse than no check.
\set ON_ERROR_STOP on

\echo
\echo '── realtime contract: postgres_changes subscriptions vs supabase_realtime ──'

-- An empty list would make every assertion below vacuously true. Fail loudly
-- instead: the generator refuses to emit nothing, and this is the second lock.
DO $$
BEGIN
  IF (SELECT count(*) FROM wiring_subscribed) = 0 THEN
    RAISE EXCEPTION 'the subscribed-table list is empty — the contract would pass over nothing';
  END IF;
END $$;

SELECT
  count(*) FILTER (WHERE p.tablename IS NOT NULL) AS published,
  count(*) FILTER (WHERE p.tablename IS NULL)     AS unpublished,
  count(*)                                        AS subscribed
FROM wiring_subscribed s
LEFT JOIN pg_publication_tables p
  ON p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = s.tbl;

-- Name them before failing, so the CI log says which screens are affected
-- rather than only that a count was wrong.
SELECT '  DEAD SUBSCRIPTION → ' || s.tbl AS problem
FROM wiring_subscribed s
LEFT JOIN pg_publication_tables p
  ON p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = s.tbl
WHERE p.tablename IS NULL
ORDER BY 1;

DO $$
DECLARE
  bad text[];
BEGIN
  SELECT array_agg(s.tbl ORDER BY s.tbl) INTO bad
  FROM wiring_subscribed s
  LEFT JOIN pg_publication_tables p
    ON p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = s.tbl
  WHERE p.tablename IS NULL;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'REALTIME CONTRACT BROKEN — % subscription(s) can never fire: %\n'
      '  A postgres_changes subscription on an unpublished table succeeds silently and\n'
      '  the callback is never called. Either add the table to supabase_realtime (with\n'
      '  REPLICA IDENTITY FULL, so RLS-filtered UPDATE events are not dropped), or\n'
      '  remove the subscription and stop promising a live screen.',
      array_length(bad, 1), array_to_string(bad, ', ');
  END IF;

  RAISE NOTICE 'realtime contract OK — every subscribed table is published';
END $$;

-- A published table also needs a replica identity that survives RLS filtering
-- on UPDATE. DEFAULT sends only the primary key as the old row, so Realtime can
-- fail to decide the row was visible to a subscriber and drop the event — the
-- reason 20260903090000 set FULL on `members`. Reported, not fatal: the tables
-- carrying INSERT-only subscriptions do not need it.
\echo
\echo '── replica identity of subscribed tables (FULL is required for UPDATE events) ──'
SELECT
  s.tbl,
  CASE c.relreplident WHEN 'f' THEN 'FULL' WHEN 'd' THEN 'default (UPDATE events may be dropped)'
                      WHEN 'i' THEN 'index' ELSE 'nothing' END AS replica_identity
FROM wiring_subscribed s
JOIN pg_class c ON c.relname = s.tbl
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
ORDER BY 1;

DROP TABLE wiring_subscribed;

-- ============================================================================
-- ── 2. A NEW LEAD TELLS SOMEBODY ────────────────────────────────────────────
--
-- Lee submitted the public Contact form and found nothing in Communications,
-- Messages or notifications. The row was in `leads`; the table's only trigger
-- was `update_leads_updated_at`. These assertions are the thing that goes red
-- if that ever becomes true again.
--
-- Every assertion is written to fail for exactly one reason, and each is
-- preceded by a CONTROL where a vacuous pass is possible — an assertion that
-- "no notification reached the inactive staff member" passes just as well when
-- no notification reached anybody at all.
-- ============================================================================
\echo
\echo '── wiring contract: a new lead notifies the team ──'

BEGIN;

-- Three staff: two active, one terminated. Only the two active are told.
--
-- There is deliberately no "active staff member with no user_id" fixture:
-- `staff.user_id` is NOT NULL, so that row cannot exist. The trigger's
-- `user_id IS NOT NULL` guard is therefore belt-and-braces rather than a case
-- under test, and asserting on a row the schema forbids would be testing the
-- fixture rather than the wire.
INSERT INTO auth.users (id, email) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 'operator.a@example.com'),
  ('aaaa2222-2222-2222-2222-222222222222', 'operator.b@example.com'),
  ('aaaa3333-3333-3333-3333-333333333333', 'left.the.company@example.com')
ON CONFLICT (id) DO NOTHING;

-- `status` is written, never `is_active`: is_active is GENERATED ALWAYS AS
-- (status = 'active') STORED, and writing it directly is rejected.
INSERT INTO public.staff (id, user_id, first_name, last_name, email, role, status) VALUES
  ('bbbb1111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'Ada',  'Operator', 'operator.a@example.com', 'call_centre', 'active'),
  ('bbbb2222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222', 'Bea',  'Admin',    'operator.b@example.com', 'admin',       'active'),
  ('bbbb3333-3333-3333-3333-333333333333', 'aaaa3333-3333-3333-3333-333333333333', 'Cal',  'Former',   'left.the.company@example.com', 'call_centre', 'terminated');

-- The contact form's own payload shape, as an anonymous visitor sends it.
INSERT INTO public.leads (id, first_name, last_name, email, phone, preferred_language, enquiry_type, message, source, status)
VALUES ('cccc1111-1111-1111-1111-111111111111', 'Maria', 'Gómez', 'maria@example.es', '+34600000000',
        'es', 'pendant', 'Necesito información sobre el colgante.', 'contact_form', 'new');

DO $$
DECLARE
  n_total int;
  n_ada int;
  n_inactive int;
  n_broadcast int;
  n_active int;
  msg text;
  ent text;
  ent_id uuid;
BEGIN
  SELECT count(*) INTO n_total FROM public.notification_log WHERE entity_id = 'cccc1111-1111-1111-1111-111111111111';
  SELECT count(*) INTO n_ada FROM public.notification_log
    WHERE entity_id = 'cccc1111-1111-1111-1111-111111111111' AND admin_user_id = 'aaaa1111-1111-1111-1111-111111111111';
  SELECT count(*) INTO n_inactive FROM public.notification_log
    WHERE entity_id = 'cccc1111-1111-1111-1111-111111111111' AND admin_user_id = 'aaaa3333-3333-3333-3333-333333333333';
  SELECT count(*) INTO n_broadcast FROM public.notification_log
    WHERE entity_id = 'cccc1111-1111-1111-1111-111111111111' AND admin_user_id IS NULL;

  -- CONTROL first: if nothing at all was written, every exclusion below would
  -- pass for the wrong reason. This is the assertion the original defect fails.
  IF n_total = 0 THEN
    RAISE EXCEPTION 'a lead arrived and NOBODY was notified — this is the original defect';
  END IF;

  IF n_ada <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 notification for the active operator, got %', n_ada;
  END IF;

  IF n_inactive <> 0 THEN
    RAISE EXCEPTION 'an INACTIVE staff member was notified (% rows) — they have left', n_inactive;
  END IF;

  -- A broadcast row is shared: the first person to mark it read clears it for
  -- everyone, which is how an enquiry would disappear a second time. The
  -- trigger must target individuals.
  IF n_broadcast <> 0 THEN
    RAISE EXCEPTION 'a BROADCAST notification was written (% rows) — mark-as-read would clear it for the whole team', n_broadcast;
  END IF;

  -- EVERY active staff member, no more and no fewer. The expected count is read
  -- from `staff` rather than hardcoded: earlier migrations seed real staff rows,
  -- so a literal 2 would only be counting this test's own fixtures and would
  -- break the day someone seeds a third. This phrasing also states the property
  -- that matters — nobody active is left out.
  SELECT count(*) INTO n_active FROM public.staff WHERE is_active AND user_id IS NOT NULL;
  IF n_total <> n_active THEN
    RAISE EXCEPTION 'expected one notification per active staff member (% of them), got %', n_active, n_total;
  END IF;

  SELECT message, entity_type, entity_id INTO msg, ent, ent_id
  FROM public.notification_log WHERE entity_id = 'cccc1111-1111-1111-1111-111111111111' LIMIT 1;

  -- The bell routes by entity_type; 'lead' is what sends the operator to the
  -- enquiry rather than to /admin/settings.
  IF ent <> 'lead' THEN
    RAISE EXCEPTION 'entity_type is %, so the bell cannot route to the enquiry', ent;
  END IF;

  -- The message has to say what arrived. "New lead" would make an operator open
  -- it to find out whether it mattered.
  IF msg NOT LIKE '%pendant%' OR msg NOT LIKE '%Maria%' THEN
    RAISE EXCEPTION 'the notification does not name the enquiry type and the person: %', msg;
  END IF;
  IF msg NOT LIKE '%es%' THEN
    RAISE EXCEPTION 'a Spanish-speaking enquirer must be flagged as such: %', msg;
  END IF;

  RAISE NOTICE 'wiring contract OK — lead notified % staff, targeted, routable, and named', n_total;
END $$;

-- A lead whose name is BLANK must still notify, and must still read as English
-- rather than as a template with a hole in it. `first_name`/`last_name` are NOT
-- NULL on this table, so the case that can actually occur is empty strings —
-- which is what `NULLIF(TRIM(…))` in the trigger exists to handle.
INSERT INTO public.leads (id, first_name, last_name, email, phone, enquiry_type, source, status)
VALUES ('cccc2222-2222-2222-2222-222222222222', '', '  ', 'anon@example.es', '+34600111222', 'general', 'contact_form', 'new');

DO $$
DECLARE n int; expected int; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.notification_log WHERE entity_id = 'cccc2222-2222-2222-2222-222222222222';
  SELECT count(*) INTO expected FROM public.staff WHERE is_active AND user_id IS NOT NULL;
  IF n <> expected THEN
    RAISE EXCEPTION 'a nameless lead notified % staff, expected % (every active staff member)', n, expected;
  END IF;
  SELECT message INTO msg FROM public.notification_log WHERE entity_id = 'cccc2222-2222-2222-2222-222222222222' LIMIT 1;
  IF msg IS NULL OR msg = '' OR msg LIKE '%null%' OR msg LIKE '%from %  %' THEN
    RAISE EXCEPTION 'a blank-name lead produced an unusable message: %', COALESCE(msg, '<null>');
  END IF;
  IF msg NOT LIKE '%left no name%' THEN
    RAISE EXCEPTION 'a blank name should read as such, not as a gap: %', msg;
  END IF;
  RAISE NOTICE 'wiring contract OK — a nameless lead still reaches the team: %', msg;
END $$;

ROLLBACK;

