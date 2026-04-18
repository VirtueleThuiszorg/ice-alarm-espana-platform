-- Add partner distribution columns to social_posts
ALTER TABLE social_posts 
ADD COLUMN IF NOT EXISTS partner_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS partner_audience text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS partner_selected_partner_ids uuid[] NULL,
ADD COLUMN IF NOT EXISTS partner_published_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS content_channels text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS primary_url text NULL;

-- Add constraint for partner_audience values
ALTER TABLE social_posts 
ADD CONSTRAINT check_partner_audience 
CHECK (partner_audience IN ('none', 'all', 'selected'));

-- Create partner_post_links table for per-partner tracked links
CREATE TABLE partner_post_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  tracked_code text NOT NULL,
  tracked_path text NOT NULL,
  tracked_url text NOT NULL,
  clicks integer DEFAULT 0,
  signups integer DEFAULT 0,
  purchases integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  commission numeric DEFAULT 0,
  status text DEFAULT 'active',
  UNIQUE(post_id, partner_id)
);

-- Create partner_clicks table for detailed click tracking
CREATE TABLE partner_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  link_id uuid REFERENCES partner_post_links(id) ON DELETE SET NULL,
  session_id text NULL,
  ip_hash text NULL,
  ua_hash text NULL,
  referrer text NULL
);

-- Add ref_partner_id and ref_post_id to members for attribution
ALTER TABLE members
ADD COLUMN IF NOT EXISTS ref_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ref_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL;

-- Add ref_partner_id and ref_post_id to orders for purchase attribution  
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS ref_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ref_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL;

-- Add ref_partner_id and ref_post_id to leads for lead attribution
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ref_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ref_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL;

-- Enable RLS on new tables
ALTER TABLE partner_post_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_clicks ENABLE ROW LEVEL SECURITY;

-- RLS policies for partner_post_links
-- Staff can view and manage all links
CREATE POLICY "Staff can view all partner post links"
ON partner_post_links FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff WHERE staff.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage partner post links"
ON partner_post_links FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM staff WHERE staff.user_id = auth.uid()
  )
);

-- Partners can view their own links
CREATE POLICY "Partners can view their own post links"
ON partner_post_links FOR SELECT
USING (
  partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  )
  AND status = 'active'
);

-- RLS policies for partner_clicks
-- Staff can view all clicks
CREATE POLICY "Staff can view all partner clicks"
ON partner_clicks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff WHERE staff.user_id = auth.uid()
  )
);

-- Allow insert from edge functions (service role)
CREATE POLICY "Service role can insert clicks"
ON partner_clicks FOR INSERT
WITH CHECK (true);

-- Partners can view their own clicks
CREATE POLICY "Partners can view their own clicks"
ON partner_clicks FOR SELECT
USING (
  partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_partner_post_links_post_id ON partner_post_links(post_id);
CREATE INDEX idx_partner_post_links_partner_id ON partner_post_links(partner_id);
CREATE INDEX idx_partner_post_links_status ON partner_post_links(status);
CREATE INDEX idx_partner_clicks_link_id ON partner_clicks(link_id);
CREATE INDEX idx_partner_clicks_created_at ON partner_clicks(created_at);

-- Add index for members referral tracking
CREATE INDEX idx_members_ref_partner_id ON members(ref_partner_id) WHERE ref_partner_id IS NOT NULL;
CREATE INDEX idx_orders_ref_partner_id ON orders(ref_partner_id) WHERE ref_partner_id IS NOT NULL;