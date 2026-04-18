-- Create notification_settings table for admin preferences
CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_paid_sales boolean DEFAULT true,
  whatsapp_partner_signup boolean DEFAULT true,
  whatsapp_hot_sales boolean DEFAULT true,
  whatsapp_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own settings
CREATE POLICY "Admins manage own notification settings" ON public.notification_settings
  FOR ALL USING (
    admin_user_id = auth.uid() AND 
    public.is_admin(auth.uid())
  );

-- Super admins can view all settings
CREATE POLICY "Super admins view all notification settings" ON public.notification_settings
  FOR SELECT USING (
    public.get_staff_role(auth.uid()) = 'super_admin'::app_role
  );

-- Create notification_log table for audit
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  message text,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Admins can view notification logs
CREATE POLICY "Admins view notification logs" ON public.notification_log
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Staff can insert notification logs (for edge functions via service role)
CREATE POLICY "Service can insert notification logs" ON public.notification_log
  FOR INSERT WITH CHECK (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_log;

-- Trigger for updated_at on notification_settings
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create RPC function for sales command stats
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
  _paid_sales_today int;
  _paid_amount_today numeric;
  _paid_sales_60min int;
  _paid_amount_60min numeric;
  _new_subscriptions int;
  _partner_signups int;
  _ai_hot_items int;
  _followups_pending int;
BEGIN
  _today_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC');
  _hour_ago := NOW() - INTERVAL '60 minutes';

  -- Paid sales today
  SELECT COUNT(*), COALESCE(SUM(amount), 0) 
  INTO _paid_sales_today, _paid_amount_today
  FROM payments 
  WHERE status = 'completed' AND paid_at >= _today_start;

  -- Paid sales last 60 min
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO _paid_sales_60min, _paid_amount_60min
  FROM payments
  WHERE status = 'completed' AND paid_at >= _hour_ago;

  -- New subscriptions today
  SELECT COUNT(*) INTO _new_subscriptions
  FROM subscriptions WHERE created_at >= _today_start;

  -- Partner signups today
  SELECT COUNT(*) INTO _partner_signups
  FROM partners WHERE created_at >= _today_start AND status = 'active';

  -- AI hot items (pending approval actions)
  SELECT COUNT(*) INTO _ai_hot_items
  FROM ai_actions WHERE status = 'pending_approval';

  -- Follow-ups pending (sales-related tasks from internal_tickets)
  SELECT COUNT(*) INTO _followups_pending
  FROM internal_tickets WHERE status != 'resolved' AND (title ILIKE '%follow%' OR category = 'sales');

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