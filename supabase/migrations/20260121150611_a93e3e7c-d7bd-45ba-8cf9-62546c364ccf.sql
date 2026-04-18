-- Create system_settings table for storing API keys and configuration
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can view settings
CREATE POLICY "Super admins can view settings"
ON public.system_settings
FOR SELECT
USING (get_staff_role(auth.uid()) = 'super_admin');

-- Only super admins can manage settings
CREATE POLICY "Super admins can manage settings"
ON public.system_settings
FOR ALL
USING (get_staff_role(auth.uid()) = 'super_admin');

-- Add comment
COMMENT ON TABLE public.system_settings IS 'Stores system configuration including API keys for Stripe, Twilio, etc.';