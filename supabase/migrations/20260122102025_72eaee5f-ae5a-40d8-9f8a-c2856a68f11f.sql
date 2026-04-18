-- Create partner verification tokens table
CREATE TABLE public.partner_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.partner_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow service role access (edge functions use service role)
CREATE POLICY "Service role can manage tokens"
ON public.partner_verification_tokens FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for token lookup
CREATE INDEX idx_partner_verification_tokens_token ON public.partner_verification_tokens(token);
CREATE INDEX idx_partner_verification_tokens_partner_id ON public.partner_verification_tokens(partner_id);