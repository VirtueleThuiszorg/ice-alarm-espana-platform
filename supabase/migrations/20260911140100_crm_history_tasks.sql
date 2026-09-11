-- karmaCRM history, part 2 of 2: give tasks the same dedupe key notes just got.
--
-- WHY
-- ---
-- The export's 3,121 "Todo" history records are not 3,121 tasks. Each todo emits
-- one record when it is created and a second when it is updated, so the real
-- count is 1,604 todos — 1,517 of which have both records, and the second record's
-- timestamp is when the call was actually made. Almost all of them say some
-- spelling of "Courtesy call": 2,324 "Courtesy call", 248 "courtesy call", 197
-- "COURTESY CALL", 19 "cc", and 77 one-offs like "organise him a key safe".
--
-- public.tasks already fits: member_id, title, description, status, completed_at,
-- plus task_type (20260126094603, free text, no CHECK) which CourtesyCallsCard
-- already reads as 'courtesy_call'. What it has never had is a source key, so an
-- import that ran twice would leave two of every call with nothing to join on.
--
-- Same shape as member_notes_source_uniq and crm_contacts_source_uniq. Partial,
-- so tasks created in the platform (source_id NULL) are untouched.
--
-- crm_contact_id matches what part 1 did to member_notes and for the same reason:
-- a courtesy call made to someone who has since cancelled is part of that file.
-- tasks.member_id has been nullable since the base migration, so no CHECK is
-- added here — an unassigned task with neither owner is already a legal row and
-- the admin task list relies on it.
--
-- Reverse:
--   DROP INDEX IF EXISTS public.tasks_source_uniq;
--   DROP INDEX IF EXISTS public.tasks_member_type_idx;
--   DROP INDEX IF EXISTS public.tasks_crm_contact_idx;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS crm_contact_id,
--                            DROP COLUMN IF EXISTS source_id,
--                            DROP COLUMN IF EXISTS source;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source         text,
  ADD COLUMN IF NOT EXISTS source_id      text,
  ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.tasks.source IS
  'Where this task came from: ''karmacrm'' for the 2026 migration, NULL for tasks created in the platform.';
COMMENT ON COLUMN public.tasks.source_id IS
  'Primary key in the source system - karmaCRM''s todo id, not its history id. Unique per source.';

CREATE UNIQUE INDEX IF NOT EXISTS tasks_source_uniq
  ON public.tasks(source, source_id)
  WHERE source_id IS NOT NULL;

-- idx_tasks_task_type (20260126094603) covers the type alone. The member card asks
-- for one member's calls newest-first, which is this.
CREATE INDEX IF NOT EXISTS tasks_member_type_idx
  ON public.tasks(member_id, task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_crm_contact_idx
  ON public.tasks(crm_contact_id, created_at DESC)
  WHERE crm_contact_id IS NOT NULL;
