
-- Create isabella_settings table
CREATE TABLE public.isabella_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_key TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES public.staff(id),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.isabella_settings ENABLE ROW LEVEL SECURITY;

-- Staff can read all settings
CREATE POLICY "Staff can view isabella_settings"
  ON public.isabella_settings
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Only admins can update settings
CREATE POLICY "Admins can update isabella_settings"
  ON public.isabella_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_isabella_settings_updated_at
  BEFORE UPDATE ON public.isabella_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 19 function keys
INSERT INTO public.isabella_settings (function_key, enabled) VALUES
  ('abandoned_signup_recovery', false),
  ('b2b_outreach_campaigns', false),
  ('birthday_calls', false),
  ('chat_widget', true),
  ('courtesy_calls', false),
  ('device_offline_response', false),
  ('fall_detection_triage', false),
  ('followup_calls', false),
  ('inbound_email', false),
  ('inbound_phone_calls', false),
  ('inbound_sms', false),
  ('inbound_whatsapp', false),
  ('lead_followup_calls', false),
  ('low_battery_alerts', false),
  ('onboarding_checkins', false),
  ('partner_enquiry_handling', false),
  ('payment_reminders', false),
  ('sos_button_triage', false),
  ('welcome_calls', false);
