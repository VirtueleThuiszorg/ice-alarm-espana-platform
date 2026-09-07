-- WP2 increment 4 — D4: monitoring readiness becomes TWO conditions, not one.
--
--   1. at least one emergency contact  (unchanged, from 20260904120000)
--   2. the pendant has been TESTED in the member's home with an operator answering (new)
--
-- Design: FULFILMENT_MODEL.md §5. Readiness model and why it is derived: READINESS_MODEL.md §2.
--
-- THE COUNT OF READY MEMBERS DROPS TO ZERO ON THE DAY THIS SHIPS, because no order has ever
-- been in `tested`. That is not a regression — it is the first honest number this system has
-- produced. It must not be "fixed" by backfilling `tested` onto historical orders, which would
-- be inventing evidence that somebody pressed a button and somebody else answered.
--
-- Q2 (Lee, 2026-09-07) — YES, A REPLACED OR FAULTY PENDANT DROPS READINESS UNTIL RE-TESTED.
-- So the tested order only counts while the device it was tested on is still this member's and
-- still in good standing. `faulty`, `returned` and `inactive` all revoke the evidence: the test
-- proved THAT device worked in THAT home, and a replacement has proved nothing yet. This is
-- correct and unpopular, exactly as the design said.
--
-- WHY THE JOIN IS SAFE UNDER security_invoker (the one place this change could open a hole).
-- The view now reads orders, order_items and devices as the querying user, so it delegates to
-- their existing policies as well as emergency_contacts':
--     orders       "Members can view own orders"       member_id = get_member_id(auth.uid())
--     order_items  "Members can view own order items"  via their order
--     devices      "Members can view own device"       member_id = get_member_id(auth.uid())
-- A member therefore cannot see another member's readiness THROUGH the new join, and a member
-- can still see their own — both are asserted in scripts/rls/isolation.sql, along with a read
-- of pg_class.reloptions proving security_invoker is still on, so the negatives cannot pass
-- for the wrong reason.
--
-- THE TWO CONDITIONS STAY SEPARATELY VISIBLE. `emergency_contact_count` survives and
-- `device_tested_at` is added, so the readiness queue and the member-header notice can name
-- WHICH condition is missing. "Not ready" without a reason is not actionable.
--
-- ROLLBACK: re-run 20260904120000_member_monitoring_readiness.sql verbatim — it is a single
-- CREATE OR REPLACE VIEW with no dependants beyond SELECT grants, which are preserved.

CREATE OR REPLACE VIEW public.member_monitoring_readiness
WITH (security_invoker = on) AS
SELECT
  -- COLUMN ORDER IS FIXED BY CREATE OR REPLACE VIEW: it may append columns but cannot
  -- reorder or insert them, so the five from 20260904120000 keep their positions and
  -- device_tested_at goes last. Replacing rather than DROP/CREATE keeps the SELECT grants
  -- and means there is no window in which the view does not exist.
  m.id                                       AS member_id,
  count(ec.id)                               AS emergency_contact_count,
  (count(ec.id) > 0 AND t.tested_at IS NOT NULL) AS monitoring_ready,
  m.created_at                               AS member_since,
  -- The subscription row is CREATED by the payment webhook and by nothing else (golden
  -- rule 4), so created_at IS the activation instant. NULL until the webhook fires.
  min(s.created_at)                          AS paid_since,
  t.tested_at                                AS device_tested_at
FROM public.members m
LEFT JOIN public.emergency_contacts ec ON ec.member_id = m.id
LEFT JOIN public.subscriptions s ON s.member_id = m.id AND s.status = 'active'
-- LATERAL rather than another LEFT JOIN into the GROUP BY: the tested evidence is one value
-- per member, and joining orders directly would multiply the emergency_contacts rows and
-- silently inflate emergency_contact_count.
LEFT JOIN LATERAL (
  SELECT max(o.tested_at) AS tested_at
  FROM public.orders o
  WHERE o.member_id = m.id
    AND o.fulfilment_state = 'tested'
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.devices d ON d.id = oi.device_id
      WHERE oi.order_id = o.id
        AND d.member_id = m.id
        AND d.status NOT IN ('faulty', 'returned', 'inactive')   -- Q2
    )
) t ON true
GROUP BY m.id, m.created_at, t.tested_at;

COMMENT ON VIEW public.member_monitoring_readiness IS
  'Derived monitoring readiness, D4: ready iff (>=1 emergency_contacts row) AND (an order in '
  'fulfilment_state=tested whose device is still this member''s and not faulty/returned/'
  'inactive). Independent of payment. security_invoker=on, so access follows the underlying '
  'tables'' policies. See FULFILMENT_MODEL.md §5 and READINESS_MODEL.md.';

GRANT SELECT ON public.member_monitoring_readiness TO authenticated;
