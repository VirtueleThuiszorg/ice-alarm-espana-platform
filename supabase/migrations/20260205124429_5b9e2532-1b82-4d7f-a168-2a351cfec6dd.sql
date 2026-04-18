-- =============================================
-- B2B Partner System Upgrade - Phase 1 Migration
-- =============================================

-- 1. Add new columns to partners table
-- Partner type categorization
ALTER TABLE partners ADD COLUMN IF NOT EXISTS partner_type text NOT NULL DEFAULT 'referral';
ALTER TABLE partners ADD CONSTRAINT partners_partner_type_check 
  CHECK (partner_type IN ('referral', 'care', 'residential'));

-- Organization classification
ALTER TABLE partners ADD COLUMN IF NOT EXISTS organization_type text DEFAULT 'individual';
ALTER TABLE partners ADD CONSTRAINT partners_organization_type_check 
  CHECK (organization_type IN (
    'individual', 'charity', 'care_agency', 'home_care',
    'care_home', 'urbanization', 'retirement_community', 'other'
  ));

-- Organization details
ALTER TABLE partners ADD COLUMN IF NOT EXISTS organization_registration text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS organization_website text;

-- Care partner specific
ALTER TABLE partners ADD COLUMN IF NOT EXISTS estimated_monthly_referrals text;
ALTER TABLE partners ADD CONSTRAINT partners_estimated_monthly_referrals_check 
  CHECK (estimated_monthly_referrals IS NULL OR estimated_monthly_referrals IN ('1-5', '5-10', '10-20', '20+'));

-- Residential partner specific
ALTER TABLE partners ADD COLUMN IF NOT EXISTS facility_address text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS facility_resident_count integer;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS alert_visibility_enabled boolean DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS billing_model text DEFAULT 'commission';
ALTER TABLE partners ADD CONSTRAINT partners_billing_model_check 
  CHECK (billing_model IN ('commission', 'per_resident', 'custom'));
ALTER TABLE partners ADD COLUMN IF NOT EXISTS custom_rate_monthly numeric(10,2);

-- =============================================
-- 2. Create partner_members table
-- =============================================
CREATE TABLE IF NOT EXISTS partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'resident'
    CHECK (relationship_type IN ('resident', 'client', 'beneficiary')),
  added_at timestamptz DEFAULT now(),
  added_by uuid,
  removed_at timestamptz,
  notes text,
  UNIQUE(partner_id, member_id)
);

-- RLS for partner_members
ALTER TABLE partner_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own member relationships"
  ON partner_members FOR SELECT
  USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff manage partner members"
  ON partner_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- =============================================
-- 3. Create partner_pricing_tiers table
-- =============================================
CREATE TABLE IF NOT EXISTS partner_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  membership_type text NOT NULL CHECK (membership_type IN ('single', 'couple')),
  billing_frequency text NOT NULL CHECK (billing_frequency IN ('monthly', 'annual')),
  subscription_net_price numeric(10,2) NOT NULL,
  registration_fee numeric(10,2) DEFAULT 0,
  registration_fee_discount_percent integer DEFAULT 0,
  pendant_net_price numeric(10,2),
  commission_amount numeric(10,2) DEFAULT 50,
  effective_from timestamptz DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, membership_type, billing_frequency, effective_from)
);

-- RLS for partner_pricing_tiers
ALTER TABLE partner_pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own pricing"
  ON partner_pricing_tiers FOR SELECT
  USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff manage pricing tiers"
  ON partner_pricing_tiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- =============================================
-- 4. Create partner_alert_subscriptions table
-- =============================================
CREATE TABLE IF NOT EXISTS partner_alert_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  notify_email boolean DEFAULT true,
  notify_sms boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, member_id)
);

-- RLS for partner_alert_subscriptions
ALTER TABLE partner_alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners manage own alert subscriptions"
  ON partner_alert_subscriptions FOR ALL
  USING (partner_id IN (
    SELECT id FROM partners 
    WHERE user_id = auth.uid() AND alert_visibility_enabled = true
  ));

CREATE POLICY "Staff manage alert subscriptions"
  ON partner_alert_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- =============================================
-- 5. Create partner_alert_notifications table
-- =============================================
CREATE TABLE IF NOT EXISTS partner_alert_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  alert_id uuid NOT NULL REFERENCES alerts(id),
  member_id uuid NOT NULL REFERENCES members(id),
  notification_method text NOT NULL CHECK (notification_method IN ('email', 'sms', 'dashboard')),
  sent_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text
);

-- RLS for partner_alert_notifications
ALTER TABLE partner_alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own alert notifications"
  ON partner_alert_notifications FOR SELECT
  USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff view all alert notifications"
  ON partner_alert_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Staff insert alert notifications"
  ON partner_alert_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_partner_members_partner_id ON partner_members(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_members_member_id ON partner_members(member_id);
CREATE INDEX IF NOT EXISTS idx_partner_pricing_tiers_partner_id ON partner_pricing_tiers(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_alert_subscriptions_partner_id ON partner_alert_subscriptions(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_alert_subscriptions_member_id ON partner_alert_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_partner_alert_notifications_partner_id ON partner_alert_notifications(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_alert_notifications_alert_id ON partner_alert_notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_partners_partner_type ON partners(partner_type);