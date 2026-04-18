-- Create partner_agreements table for storing signed agreements
CREATE TABLE public.partner_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT '1.0',
  
  -- Signature details
  signer_name TEXT NOT NULL,
  signer_id_type TEXT NOT NULL CHECK (signer_id_type IN ('NIE', 'NIF', 'CIF')),
  signer_id_number TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  
  -- Agreement content snapshot (stored for legal proof)
  agreement_html TEXT NOT NULL,
  
  -- Confirmation flags (Spanish law requires explicit confirmations)
  confirmed_read BOOLEAN NOT NULL DEFAULT false,
  confirmed_understand BOOLEAN NOT NULL DEFAULT false,
  confirmed_accept BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(partner_id, version)
);

-- Add agreement tracking columns to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS agreement_version TEXT;

-- Add comments for documentation
COMMENT ON TABLE public.partner_agreements IS 'Stores signed partner agreements with full legal audit trail under Spanish law';
COMMENT ON COLUMN public.partner_agreements.agreement_html IS 'Snapshot of agreement text at time of signing for legal proof';
COMMENT ON COLUMN public.partner_agreements.signer_id_type IS 'Spanish ID type: NIE (foreigner), NIF (citizen), CIF (company)';

-- Enable Row Level Security
ALTER TABLE public.partner_agreements ENABLE ROW LEVEL SECURITY;

-- Partners can view their own agreements
CREATE POLICY "Partners can view own agreements" ON public.partner_agreements
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

-- Partners can insert their own agreements (sign)
CREATE POLICY "Partners can sign agreements" ON public.partner_agreements
  FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

-- Staff can view all agreements (for CRM)
CREATE POLICY "Staff can view all agreements" ON public.partner_agreements
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));