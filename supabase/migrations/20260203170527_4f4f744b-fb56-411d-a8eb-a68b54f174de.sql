-- Add Gmail SMTP fields to email_settings table
ALTER TABLE public.email_settings
ADD COLUMN IF NOT EXISTS gmail_mode text DEFAULT 'smtp',
ADD COLUMN IF NOT EXISTS gmail_smtp_host text DEFAULT 'smtp.gmail.com',
ADD COLUMN IF NOT EXISTS gmail_smtp_port integer DEFAULT 587,
ADD COLUMN IF NOT EXISTS gmail_smtp_user text,
ADD COLUMN IF NOT EXISTS gmail_smtp_password_secret_name text;

-- Add comments for documentation
COMMENT ON COLUMN email_settings.gmail_mode IS 'Gmail mode: smtp or oauth';
COMMENT ON COLUMN email_settings.gmail_smtp_host IS 'SMTP server hostname';
COMMENT ON COLUMN email_settings.gmail_smtp_port IS 'SMTP port (587 for TLS, 465 for SSL)';
COMMENT ON COLUMN email_settings.gmail_smtp_user IS 'Gmail account email address';
COMMENT ON COLUMN email_settings.gmail_smtp_password_secret_name IS 'Name of the secret storing Gmail App Password';