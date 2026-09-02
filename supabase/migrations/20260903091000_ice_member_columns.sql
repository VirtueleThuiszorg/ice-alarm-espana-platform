-- ICE import: identity, provenance and location columns on members.
--
-- Source: the 431-row / 147-column KarmaCRM export. Every column below exists
-- because that export carries the data and the platform had nowhere to put it.
-- Counts are populated rows in the real export.
--   Title 139 · Nickname 46 · Gender 253 · Nationality 150 · Marital 135
--   Passport 100 · AN/SS 182 · Home County 96 · GPS 108 · Map link 90
--   Permission State 86 · Spouse 81
--
-- crm_source / crm_source_id make re-import safe: without them there is no way
-- to match a row back to KarmaCRM, and a second import run duplicates everyone.
--
-- deceased_at exists so R.I.P. records can never be dialled. The courtesy-call
-- generator already filters status='active'; deceased_at is the second belt.
--
-- Reverse:
--   DROP INDEX IF EXISTS public.members_crm_source_id_uniq;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS <each column below>;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS crm_source       text,
  ADD COLUMN IF NOT EXISTS crm_source_id    text,
  ADD COLUMN IF NOT EXISTS crm_created_at   timestamptz,
  ADD COLUMN IF NOT EXISTS title            text,
  ADD COLUMN IF NOT EXISTS nickname         text,
  ADD COLUMN IF NOT EXISTS gender           text,
  ADD COLUMN IF NOT EXISTS nationality      text,
  ADD COLUMN IF NOT EXISTS marital_status   text,
  ADD COLUMN IF NOT EXISTS passport_number  text,
  ADD COLUMN IF NOT EXISTS an_ss_number     text,
  ADD COLUMN IF NOT EXISTS county           text,
  ADD COLUMN IF NOT EXISTS gps_lat          numeric(9,6),
  ADD COLUMN IF NOT EXISTS gps_lng          numeric(9,6),
  ADD COLUMN IF NOT EXISTS map_link         text,
  ADD COLUMN IF NOT EXISTS language_notes   text,
  ADD COLUMN IF NOT EXISTS consent_state    text,
  ADD COLUMN IF NOT EXISTS deceased_at      date,
  ADD COLUMN IF NOT EXISTS linked_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.members.nickname IS 'What the member answers to on the phone. Operator-facing.';
COMMENT ON COLUMN public.members.crm_source_id IS 'Primary key in the source CRM (KarmaCRM contact id). Reconciliation only.';
COMMENT ON COLUMN public.members.deceased_at IS 'Set for R.I.P. records. Must exclude from courtesy calls and all outbound.';
COMMENT ON COLUMN public.members.consent_state IS 'Verbatim KarmaCRM "Permission State". NOT yet wired to suppression logic - pending legal review.';
COMMENT ON COLUMN public.members.linked_member_id IS 'Partner on a couple plan (KarmaCRM "Spouse", 81 rows).';

CREATE UNIQUE INDEX IF NOT EXISTS members_crm_source_id_uniq
  ON public.members(crm_source, crm_source_id)
  WHERE crm_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_deceased_at ON public.members(deceased_at)
  WHERE deceased_at IS NOT NULL;
