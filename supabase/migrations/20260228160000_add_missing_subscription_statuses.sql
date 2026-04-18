-- Add missing values to subscription_status enum
-- Required by submit-registration (pending) and stripe-webhook (past_due, suspended)
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'suspended';
