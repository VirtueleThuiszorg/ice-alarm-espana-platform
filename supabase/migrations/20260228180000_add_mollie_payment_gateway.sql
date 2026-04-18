-- Add 'mollie' to payment_method enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'mollie';

-- Add mollie_payment_id column to payments table (nullable, like stripe_payment_id)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mollie_payment_id TEXT;

-- Add index for mollie payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_mollie_payment_id ON payments(mollie_payment_id) WHERE mollie_payment_id IS NOT NULL;

-- Add Mollie columns to subscriptions table (matching existing stripe_customer_id / stripe_subscription_id pattern)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mollie_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mollie_subscription_id TEXT;

-- Add indexes for Mollie subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_mollie_customer_id ON subscriptions(mollie_customer_id) WHERE mollie_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_mollie_subscription_id ON subscriptions(mollie_subscription_id) WHERE mollie_subscription_id IS NOT NULL;

-- Insert default payment gateway setting (defaults to stripe)
INSERT INTO system_settings (key, value)
VALUES ('settings_active_payment_gateway', 'stripe')
ON CONFLICT (key) DO NOTHING;

-- Insert placeholder Mollie settings
INSERT INTO system_settings (key, value) VALUES ('settings_mollie_api_key', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('settings_mollie_webhook_secret', '') ON CONFLICT (key) DO NOTHING;
