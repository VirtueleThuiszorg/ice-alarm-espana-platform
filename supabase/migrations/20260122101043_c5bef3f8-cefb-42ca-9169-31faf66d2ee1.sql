-- Create enums for partner module
CREATE TYPE public.partner_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE public.invite_channel AS ENUM ('email', 'sms', 'whatsapp', 'link');
CREATE TYPE public.invite_status AS ENUM ('draft', 'sent', 'registered', 'converted', 'expired');
CREATE TYPE public.commission_status AS ENUM ('pending_release', 'approved', 'paid', 'cancelled');

-- Create partners table
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.partner_status NOT NULL DEFAULT 'pending',
  referral_code TEXT NOT NULL UNIQUE,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
  payout_method TEXT NOT NULL DEFAULT 'bank',
  payout_iban TEXT,
  payout_beneficiary_name TEXT,
  notes_internal TEXT
);

-- Create partner_invites table
CREATE TABLE public.partner_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  invitee_name TEXT NOT NULL,
  invitee_email TEXT,
  invitee_phone TEXT,
  channel public.invite_channel NOT NULL,
  status public.invite_status NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMP WITH TIME ZONE,
  converted_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  metadata JSONB
);

-- Create partner_attributions table
CREATE TABLE public.partner_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('ref_link', 'manual_invite')),
  first_touch_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_touch_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ref_param TEXT,
  UNIQUE(partner_id, member_id)
);

-- Create partner_commissions table
CREATE TABLE public.partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  amount_eur NUMERIC NOT NULL DEFAULT 50.00,
  status public.commission_status NOT NULL DEFAULT 'pending_release',
  trigger_event TEXT NOT NULL DEFAULT 'device_delivered',
  trigger_at TIMESTAMP WITH TIME ZONE,
  release_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT
);

-- Enable RLS on all partner tables
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

-- Create helper function to get partner_id from user_id
CREATE OR REPLACE FUNCTION public.get_partner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.partners WHERE user_id = _user_id LIMIT 1
$$;

-- Create helper function to check if user is a partner
CREATE OR REPLACE FUNCTION public.is_partner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners 
    WHERE user_id = _user_id 
    AND status = 'active'
  )
$$;

-- RLS Policies for partners table
CREATE POLICY "Staff can view all partners"
ON public.partners FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage partners"
ON public.partners FOR ALL
USING (is_staff(auth.uid()));

CREATE POLICY "Partners can view own record"
ON public.partners FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Partners can update own record"
ON public.partners FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS Policies for partner_invites table
CREATE POLICY "Staff can view all invites"
ON public.partner_invites FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage invites"
ON public.partner_invites FOR ALL
USING (is_staff(auth.uid()));

CREATE POLICY "Partners can view own invites"
ON public.partner_invites FOR SELECT
USING (partner_id = get_partner_id(auth.uid()));

CREATE POLICY "Partners can manage own invites"
ON public.partner_invites FOR ALL
USING (partner_id = get_partner_id(auth.uid()));

-- RLS Policies for partner_attributions table
CREATE POLICY "Staff can view all attributions"
ON public.partner_attributions FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage attributions"
ON public.partner_attributions FOR ALL
USING (is_staff(auth.uid()));

CREATE POLICY "Partners can view own attributions"
ON public.partner_attributions FOR SELECT
USING (partner_id = get_partner_id(auth.uid()));

-- RLS Policies for partner_commissions table
CREATE POLICY "Staff can view all commissions"
ON public.partner_commissions FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage commissions"
ON public.partner_commissions FOR ALL
USING (is_staff(auth.uid()));

CREATE POLICY "Partners can view own commissions"
ON public.partner_commissions FOR SELECT
USING (partner_id = get_partner_id(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_partners_user_id ON public.partners(user_id);
CREATE INDEX idx_partners_referral_code ON public.partners(referral_code);
CREATE INDEX idx_partners_status ON public.partners(status);
CREATE INDEX idx_partner_invites_partner_id ON public.partner_invites(partner_id);
CREATE INDEX idx_partner_invites_status ON public.partner_invites(status);
CREATE INDEX idx_partner_attributions_partner_id ON public.partner_attributions(partner_id);
CREATE INDEX idx_partner_attributions_member_id ON public.partner_attributions(member_id);
CREATE INDEX idx_partner_commissions_partner_id ON public.partner_commissions(partner_id);
CREATE INDEX idx_partner_commissions_status ON public.partner_commissions(status);