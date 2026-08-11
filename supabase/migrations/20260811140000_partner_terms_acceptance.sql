-- ============================================================
-- Partner registration: persist terms acceptance as a legal record.
--
-- WHY: the /partner/join form has always had a required "I accept the terms and
-- conditions" checkbox, but acceptance existed only as React state. It was never
-- sent to the server, never validated there, and never written to the row. So the
-- platform had no record that any partner accepted anything at registration —
-- only a UI that refused to submit without a tick. That is not a legal record.
--
-- NOT the same thing as the existing `agreement_signed_at` / `agreement_version`
-- and the `partner_agreements` table (20260123181525). Those record the full
-- partner agreement signed later in the portal, with signer name, ID type, ID
-- number, IP and user-agent. This records the lighter, earlier act: accepting the
-- programme terms at the moment of registration. Both matter, and conflating them
-- would lose the earlier one.
--
-- The values are stamped SERVER-SIDE by `partner-register`:
--   terms_accepted_at = now() at insert time, never a client-supplied timestamp
--   terms_version     = the server's own PARTNER_TERMS_VERSION, not the client's
--                       claim, so a caller cannot record consent to a version it
--                       invented.
--
-- Nullable by design. Existing partners predate the field and there is no honest
-- value to backfill — a NOT NULL DEFAULT now() would fabricate a legal record for
-- every partner already in the table, which is precisely the dishonesty GOALS.md
-- G5 bans. NULL correctly means "we do not have a record of this".
--
-- Reversible. Down (rollback) — no data other than these two columns is affected:
--   ALTER TABLE public.partners DROP COLUMN IF EXISTS terms_accepted_at;
--   ALTER TABLE public.partners DROP COLUMN IF EXISTS terms_version;
--
-- Note this rollback DISCARDS acceptance records. If any partner has registered
-- since this migration applied, capture them first:
--   SELECT id, email, terms_accepted_at, terms_version
--     FROM public.partners WHERE terms_accepted_at IS NOT NULL;
-- ============================================================

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

COMMENT ON COLUMN public.partners.terms_accepted_at IS
  'When the partner accepted the programme terms at registration. Stamped server-side by partner-register. NULL = no record (partner predates the field). Distinct from agreement_signed_at, which is the later full-agreement signing.';

COMMENT ON COLUMN public.partners.terms_version IS
  'Which version of the programme terms was accepted at registration. Stamped from the server''s own PARTNER_TERMS_VERSION, never from the client.';

-- Lets an admin find partners with no acceptance record without a full scan.
CREATE INDEX IF NOT EXISTS idx_partners_terms_accepted_at
  ON public.partners (terms_accepted_at);
