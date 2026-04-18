
-- Phase 1a: Extend outreach_raw_leads
ALTER TABLE public.outreach_raw_leads
  ADD COLUMN IF NOT EXISTS enrichment_data jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribe_token text DEFAULT gen_random_uuid()::text;

-- Phase 1b: Extend outreach_crm_leads
ALTER TABLE public.outreach_crm_leads
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribe_token text DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS lawful_basis text DEFAULT 'legitimate_interest',
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_count integer NOT NULL DEFAULT 0;

-- Phase 1c: Extend outreach_email_drafts
ALTER TABLE public.outreach_email_drafts
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_type text NOT NULL DEFAULT 'initial';

-- Phase 1d: Extend outreach_campaigns
ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS messaging_tone text DEFAULT 'professional';

-- Phase 1e: New table outreach_run_logs
CREATE TABLE IF NOT EXISTS public.outreach_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  steps jsonb,
  totals jsonb,
  errors jsonb,
  dry_run boolean NOT NULL DEFAULT false,
  triggered_by text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view run logs"
  ON public.outreach_run_logs FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert run logs"
  ON public.outreach_run_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Phase 1f: New table outreach_suppression
CREATE TABLE IF NOT EXISTS public.outreach_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  domain text,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view suppression list"
  ON public.outreach_suppression FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage suppression list"
  ON public.outreach_suppression FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Admins can delete from suppression list"
  ON public.outreach_suppression FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Create index on suppression email for fast lookups
CREATE INDEX IF NOT EXISTS idx_outreach_suppression_email ON public.outreach_suppression (email);
CREATE INDEX IF NOT EXISTS idx_outreach_suppression_domain ON public.outreach_suppression (domain);

-- Index for followup queries
CREATE INDEX IF NOT EXISTS idx_outreach_crm_leads_followup ON public.outreach_crm_leads (next_followup_at) WHERE next_followup_at IS NOT NULL AND do_not_contact = false;

-- Index for enrichment queries
CREATE INDEX IF NOT EXISTS idx_outreach_raw_leads_unenriched ON public.outreach_raw_leads (enriched_at) WHERE enriched_at IS NULL;
