-- ICE import: make crm_contacts re-importable.
--
-- crm_import_rows already stores a dedupe_key but the importer never checks it,
-- and crm_contacts has no unique constraint. Re-running an import therefore
-- duplicates every row (431 -> 862). source_id plus the unique index below is
-- what lets an import be repeated safely after a mapping fix.
--
-- deceased carries the 54 R.I.P. records so they are archived, never dialled.
--
-- Reverse:
--   DROP INDEX IF EXISTS public.crm_contacts_source_uniq;
--   ALTER TABLE public.crm_contacts DROP COLUMN IF EXISTS source_id, DROP COLUMN IF EXISTS deceased;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS deceased  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_contacts.source_id IS 'Primary key in the source CRM. Unique per source - see crm_contacts_source_uniq.';

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_source_uniq
  ON public.crm_contacts(source, source_id)
  WHERE source_id IS NOT NULL;
