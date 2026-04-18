-- Create consolidated admin dashboard stats function
-- This replaces 7 separate queries with a single RPC call

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
  _active_members int;
  _new_members_30d int;
  _active_alerts int;
  _devices_in_stock int;
  _devices_assigned int;
  _pending_orders int;
  _monthly_revenue numeric;
  _expiring_subscriptions int;
  _last_month timestamp;
  _month_start timestamp;
  _month_end timestamp;
  _thirty_days_ahead date;
BEGIN
  _last_month := NOW() - INTERVAL '30 days';
  _month_start := DATE_TRUNC('month', NOW());
  _month_end := DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day';
  _thirty_days_ahead := CURRENT_DATE + 30;

  -- Active members count
  SELECT COUNT(*) INTO _active_members
  FROM members WHERE status = 'active';

  -- New members in last 30 days
  SELECT COUNT(*) INTO _new_members_30d
  FROM members WHERE created_at >= _last_month;

  -- Active alerts (incoming or in_progress)
  SELECT COUNT(*) INTO _active_alerts
  FROM alerts WHERE status IN ('incoming', 'in_progress');

  -- Devices in stock
  SELECT COUNT(*) INTO _devices_in_stock
  FROM devices WHERE status = 'in_stock';

  -- Devices assigned/active
  SELECT COUNT(*) INTO _devices_assigned
  FROM devices WHERE status = 'active';

  -- Pending orders
  SELECT COUNT(*) INTO _pending_orders
  FROM orders WHERE status IN ('pending', 'processing');

  -- Monthly revenue
  SELECT COALESCE(SUM(amount), 0) INTO _monthly_revenue
  FROM payments 
  WHERE status = 'completed' 
    AND paid_at >= _month_start 
    AND paid_at <= _month_end;

  -- Expiring subscriptions (within 30 days)
  SELECT COUNT(*) INTO _expiring_subscriptions
  FROM subscriptions 
  WHERE status = 'active' 
    AND renewal_date <= _thirty_days_ahead;

  SELECT json_build_object(
    'active_members', _active_members,
    'new_members_30d', _new_members_30d,
    'active_alerts', _active_alerts,
    'devices_in_stock', _devices_in_stock,
    'devices_assigned', _devices_assigned,
    'pending_orders', _pending_orders,
    'monthly_revenue', _monthly_revenue,
    'expiring_subscriptions', _expiring_subscriptions
  ) INTO result;

  RETURN result;
END;
$$;