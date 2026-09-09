-- Held schema bundle for Lee's dashboard notes (9 Sep), part 1: the Sales card said
-- "Failed to load" because its function could not run at all.
--
-- THE DEFECT. `get_sales_command_stats()` (20260123171850:111) counts pending follow-ups with
--
--     FROM internal_tickets WHERE status != 'resolved'
--       AND (title ILIKE '%follow%' OR category = 'sales')
--
-- `internal_tickets.category` is `public.ticket_category`, whose values are
-- pendant_help, technical_issue, member_query, billing_question, general, other
-- (20260121163927). There is no 'sales'. PostgreSQL coerces the literal to the enum, fails, and
-- raises 22P02 `invalid input value for enum ticket_category: "sales"` — which aborts the WHOLE
-- function, so every figure on the card is lost, not just the follow-up count. That is what the
-- dashboard has been reporting as "Failed to load" (Lee's notes, item 2).
--
-- THE CLAUSE IS DROPPED, NOT REPOINTED. Lee's instruction allows either. No category in that
-- enum means "sales": `member_query` is a member asking something, `billing_question` is an
-- invoice query, and counting either as a sales follow-up would inflate a number somebody makes
-- decisions from. So the count is what it can honestly be — open tickets whose TITLE says
-- follow-up — and the enum is left alone. Adding a 'sales' value is a product decision about
-- what tickets are for, not a fix for a broken dashboard card.
--
-- NO ::text CASTS, per the instruction. A cast would have made the comparison run
-- (`category::text = 'sales'` is valid and always false), which is worse than the error: the card
-- would have loaded, the follow-up count would have silently omitted every sales ticket forever,
-- and nobody would have known the clause did nothing.
--
-- NULL-SAFE COUNTS. `COUNT(*)` cannot return NULL, but `SELECT … INTO` leaves a variable
-- untouched when a query is skipped, and json_build_object of a NULL renders `null` on the card
-- rather than 0. Every variable is initialised to 0 at declaration and every aggregate is
-- wrapped, so the card can show a real zero instead of a blank.
--
-- ROLLBACK: re-create the function from 20260123171850 verbatim. That restores a function that
-- raises 22P02 on every call, so the only reason to do it is to reproduce the defect.

CREATE OR REPLACE FUNCTION public.get_sales_command_stats()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
  _today_start timestamp;
  _hour_ago timestamp;
  -- Initialised, so a skipped SELECT cannot leave a NULL to render as a blank tile.
  _paid_sales_today int := 0;
  _paid_amount_today numeric := 0;
  _paid_sales_60min int := 0;
  _paid_amount_60min numeric := 0;
  _new_subscriptions int := 0;
  _partner_signups int := 0;
  _ai_hot_items int := 0;
  _followups_pending int := 0;
BEGIN
  _today_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC');
  _hour_ago := NOW() - INTERVAL '60 minutes';

  -- Paid sales today
  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(amount), 0)
  INTO _paid_sales_today, _paid_amount_today
  FROM payments
  WHERE status = 'completed' AND paid_at >= _today_start;

  -- Paid sales last 60 min
  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(amount), 0)
  INTO _paid_sales_60min, _paid_amount_60min
  FROM payments
  WHERE status = 'completed' AND paid_at >= _hour_ago;

  -- New subscriptions today
  SELECT COALESCE(COUNT(*), 0) INTO _new_subscriptions
  FROM subscriptions WHERE created_at >= _today_start;

  -- Partner signups today
  SELECT COALESCE(COUNT(*), 0) INTO _partner_signups
  FROM partners WHERE created_at >= _today_start AND status = 'active';

  -- AI hot items (pending approval actions)
  SELECT COALESCE(COUNT(*), 0) INTO _ai_hot_items
  FROM ai_actions WHERE status = 'pending_approval';

  -- Follow-ups pending: open tickets whose TITLE says follow-up.
  -- The `OR category = 'sales'` that used to be here is the 22P02 above. `status <> 'resolved'`
  -- is kept as it was; 'resolved' is a real ticket_status value (20260121163927), and a ticket
  -- that is `closed` still counts as outstanding here exactly as before.
  SELECT COALESCE(COUNT(*), 0) INTO _followups_pending
  FROM internal_tickets
  WHERE status <> 'resolved' AND title ILIKE '%follow%';

  SELECT json_build_object(
    'paid_sales_today', _paid_sales_today,
    'paid_amount_today', _paid_amount_today,
    'paid_sales_60min', _paid_sales_60min,
    'paid_amount_60min', _paid_amount_60min,
    'new_subscriptions', _new_subscriptions,
    'partner_signups', _partner_signups,
    'ai_hot_items', _ai_hot_items,
    'followups_pending', _followups_pending
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_sales_command_stats() IS
  'Figures for the admin dashboard Sales card. Every count is COALESCEd and every variable '
  'initialised, so a quiet zero renders as 0 rather than a blank. The follow-up count is title-'
  'based: ticket_category has no ''sales'' value, and comparing against one raised 22P02 and '
  'took the whole card down with it.';
