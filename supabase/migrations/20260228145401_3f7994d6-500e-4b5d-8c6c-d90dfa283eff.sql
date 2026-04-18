ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'suspended';