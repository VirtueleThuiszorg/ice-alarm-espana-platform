-- Create email_settings table for centralized email configuration
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'gmail',
  from_name text,
  from_email text,
  reply_to_email text,
  signature_html text,
  daily_send_limit integer NOT NULL DEFAULT 300,
  hourly_send_limit integer NOT NULL DEFAULT 50,
  enable_member_emails boolean NOT NULL DEFAULT true,
  enable_outreach_emails boolean NOT NULL DEFAULT true,
  enable_system_emails boolean NOT NULL DEFAULT true,
  gmail_connected boolean NOT NULL DEFAULT false,
  gmail_access_token text,
  gmail_refresh_token text,
  gmail_token_expires_at timestamptz,
  gmail_connected_email text,
  gmail_last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert singleton row
INSERT INTO public.email_settings (id) VALUES ('00000000-0000-0000-0000-000000000001');

-- Enable RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- Only staff can read email settings
CREATE POLICY "Staff can view email settings"
ON public.email_settings
FOR SELECT
USING (public.is_staff(auth.uid()));

-- Only admins can update email settings
CREATE POLICY "Admins can update email settings"
ON public.email_settings
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_email_settings_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for quick lookups
CREATE INDEX idx_email_settings_provider ON public.email_settings(provider);