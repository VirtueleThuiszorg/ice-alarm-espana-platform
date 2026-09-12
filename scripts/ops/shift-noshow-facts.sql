-- THE FACTS BEHIND A SHIFT NO-SHOW FLOOD — read from production, READ-ONLY, before anything changes.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
--
-- An operator worked a night shift with the platform open and the bell filled with
-- `shift.no_show` notifications about him. Three candidate mechanisms sit in the code and they
-- imply DIFFERENT fixes, so guessing between them is how the wrong one gets fixed and the flood
-- comes back on the next night shift:
--
--   1. the dedupe read — `.maybeSingle()` answers `{data: null, error}` once two rows match, and
--      `staff-shift-monitor` destructures only `data`, so "no existing alert" would be the answer
--      for ever. A partial unique index already exists, which should make that impossible;
--      section 2 below is what decides whether it is holding.
--   2. duplicate `staff_shifts` rows — the runner loops over ROWS, so a cover row beside the
--      original is a second pass and a second alert.
--   3. two clocks — `staff_on_shift_now` filters on CURRENT_DATE/CURRENT_TIME, the DATABASE's
--      clock, while the runner keys its rows on `getShiftContext` in Europe/Madrid. Across
--      midnight on a 23:00–07:00 night shift they can disagree about the shift DATE, and about
--      the shift TYPE once Madrid has moved to `morning` while the view still returns `night`.
--      Every disagreement is a fresh dedupe key, and the runner writes ITS key, not the view's.
--
-- ── READ-ONLY IS ENFORCED BY POSTGRES, NOT PROMISED BY ME ───────────────────
--
-- The whole file runs inside a transaction declared READ ONLY. Any INSERT, UPDATE, DELETE or DDL
-- that reached this file — by edit or by mistake — is refused by the server with
-- "cannot execute ... in a read-only transaction". `ON_ERROR_STOP` makes that a failed job rather
-- than a warning scrolled past. `src/test/shiftNoShowFacts.test.ts` asserts the declaration is
-- present and that no writing verb appears.
--
-- ── AND IT PRINTS NO PII ────────────────────────────────────────────────────
--
-- A workflow log is readable by everybody with repository access. Every column list here is
-- explicit; `staff.personal_mobile` sits beside the columns this wants and is never selected.
-- The one name printed is the one the person running the job typed in.
--
-- Parameters: -v staff_name='Travis Nelison' -v days=7

\set ON_ERROR_STOP on
\timing off
\pset pager off

BEGIN;
SET TRANSACTION READ ONLY;

-- Kept small and explicit so the job cannot sit on a lock or a seq scan of a huge table.
SET LOCAL statement_timeout = '30s';

\echo ''
\echo '=============================================================='
\echo ' 0. WHO, AND WHAT THE PLATFORM THINKS THEY ARE DOING'
\echo '=============================================================='
-- More than one row here would itself double every alert, so the count is part of the answer.
SELECT
  s.id,
  s.first_name || ' ' || s.last_name AS name,
  s.role,
  s.is_on_call,
  s.is_active
FROM public.staff s
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
ORDER BY s.id;

\echo ''
\echo '=============================================================='
\echo ' 1. shift_alert_log — ONE ROW PER (type, staff, date, shift)?'
\echo '=============================================================='
SELECT
  l.alert_type,
  l.shift_date,
  l.shift_type,
  count(*)                                      AS rows,
  count(*) FILTER (WHERE l.resolved_at IS NULL) AS still_open,
  min(l.created_at)                             AS first_seen,
  max(l.created_at)                             AS last_seen
FROM public.shift_alert_log l
JOIN public.staff s ON s.id = l.staff_id
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
  AND l.shift_date >= (CURRENT_DATE - (:'days' || ' days')::interval)
GROUP BY l.alert_type, l.shift_date, l.shift_type
ORDER BY l.shift_date DESC, l.shift_type;

\echo ''
\echo '-- CAUSE 1, decided: a dedupe key holding MORE THAN ONE OPEN ROW is what makes'
\echo '-- `.maybeSingle()` return an error instead of a row. No rows here means cause 1 is OUT,'
\echo '-- and that the unique index shipped in 20260303123455 is doing its job.'
SELECT
  l.alert_type,
  l.shift_date,
  l.shift_type,
  count(*) AS open_rows_on_this_key
FROM public.shift_alert_log l
JOIN public.staff s ON s.id = l.staff_id
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
  AND l.resolved_at IS NULL
GROUP BY l.alert_type, l.shift_date, l.shift_type
HAVING count(*) > 1;

\echo ''
\echo '=============================================================='
\echo ' 2. staff_shifts — IS HE SCHEDULED TWICE FOR ONE SHIFT?'
\echo '=============================================================='
SELECT
  ss.shift_date,
  ss.shift_type,
  ss.start_time,
  ss.end_time,
  count(*) AS rows
FROM public.staff_shifts ss
JOIN public.staff s ON s.id = ss.staff_id
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
  AND ss.shift_date >= (CURRENT_DATE - (:'days' || ' days')::interval)
GROUP BY ss.shift_date, ss.shift_type, ss.start_time, ss.end_time
ORDER BY ss.shift_date DESC;

\echo ''
\echo '-- CAUSE 2, decided: the runner loops over ROWS from the view, so a (date, type) pair with'
\echo '-- more than one row is one alert per row. No rows here means cause 2 is OUT.'
SELECT ss.shift_date, ss.shift_type, count(*) AS rows_for_one_shift
FROM public.staff_shifts ss
JOIN public.staff s ON s.id = ss.staff_id
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
  AND ss.shift_date >= (CURRENT_DATE - (:'days' || ' days')::interval)
GROUP BY ss.shift_date, ss.shift_type
HAVING count(*) > 1;

\echo ''
\echo '=============================================================='
\echo ' 3. staff_presence — WAS HE ACTUALLY THERE?'
\echo '=============================================================='
-- `is_online` with a heartbeat inside the 90s window, while `is_on_call` is false, is exactly
-- the case the brief calls PRESENT BUT NOT ON DUTY: working, and alerted as absent.
SELECT
  p.is_online,
  p.last_heartbeat_at,
  p.session_started_at,
  now() - p.last_heartbeat_at AS heartbeat_age
FROM public.staff_presence p
JOIN public.staff s ON s.id = p.staff_id
WHERE lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name');

\echo ''
\echo '=============================================================='
\echo ' 4. notification_log — WHAT THE BELL IS ACTUALLY HOLDING'
\echo '=============================================================='
-- THE ARITHMETIC NOBODY HAS DONE. `notify-admin` dispatches to every admin and super_admin, so
-- ONE event writes one row PER RECIPIENT. 65 rows across 5 recipients is 13 events, and 13
-- events is a different bug from 65.
SELECT
  count(*)                            AS rows_total,
  count(DISTINCT n.admin_user_id)     AS distinct_recipients,
  count(DISTINCT n.created_at)        AS distinct_instants,
  min(n.created_at)                   AS first_seen,
  max(n.created_at)                   AS last_seen
FROM public.notification_log n
WHERE n.event_type = 'shift.no_show'
  AND n.created_at >= now() - (:'days' || ' days')::interval;

\echo ''
\echo '-- per day, and per channel where the column exists'
SELECT
  date_trunc('day', n.created_at)::date AS day,
  count(*)                              AS rows
FROM public.notification_log n
WHERE n.event_type = 'shift.no_show'
  AND n.created_at >= now() - (:'days' || ' days')::interval
GROUP BY 1
ORDER BY 1 DESC;

\echo ''
\echo '-- how many name HIM as the entity'
SELECT count(*) AS rows_about_this_person
FROM public.notification_log n
JOIN public.staff s ON s.id::text = n.entity_id::text
WHERE n.event_type = 'shift.no_show'
  AND lower(s.first_name || ' ' || s.last_name) = lower(:'staff_name')
  AND n.created_at >= now() - (:'days' || ' days')::interval;

\echo ''
\echo '=============================================================='
\echo ' 5. THE TWO CLOCKS — DOES THE VIEW AGREE WITH THE RUNNER?'
\echo '=============================================================='
-- CAUSE 3, decided. If TimeZone is UTC then CURRENT_DATE and CURRENT_TIME below are UTC, while
-- the runner reads Europe/Madrid. Compare `db_shift_guess` with `madrid_shift`: when they differ,
-- the view and the runner disagree about which shift it is, and the runner writes ITS key.
SELECT
  current_setting('TimeZone')                                  AS db_timezone,
  now()                                                        AS now_utc,
  now() AT TIME ZONE 'Europe/Madrid'                           AS now_madrid,
  CURRENT_DATE                                                 AS db_current_date,
  (now() AT TIME ZONE 'Europe/Madrid')::date                   AS madrid_date,
  CASE
    WHEN extract(hour FROM CURRENT_TIME) >= 7 AND extract(hour FROM CURRENT_TIME) < 15 THEN 'morning'
    WHEN extract(hour FROM CURRENT_TIME) >= 15 AND extract(hour FROM CURRENT_TIME) < 23 THEN 'afternoon'
    ELSE 'night'
  END                                                          AS db_shift_guess,
  CASE
    WHEN extract(hour FROM now() AT TIME ZONE 'Europe/Madrid') >= 7
     AND extract(hour FROM now() AT TIME ZONE 'Europe/Madrid') < 15 THEN 'morning'
    WHEN extract(hour FROM now() AT TIME ZONE 'Europe/Madrid') >= 15
     AND extract(hour FROM now() AT TIME ZONE 'Europe/Madrid') < 23 THEN 'afternoon'
    ELSE 'night'
  END                                                          AS madrid_shift;

\echo ''
\echo '-- what the view returns RIGHT NOW, with the shift_date it carries. The runner ignores this'
\echo '-- date and writes its own, which is the mismatch cause 3 is about.'
SELECT
  v.shift_date       AS view_shift_date,
  v.shift_type       AS view_shift_type,
  v.start_time,
  v.end_time,
  (lower(v.first_name || ' ' || v.last_name) = lower(:'staff_name')) AS is_the_person_asked_about
FROM public.staff_on_shift_now v
ORDER BY v.shift_type;

COMMIT;
