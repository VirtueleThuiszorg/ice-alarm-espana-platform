-- karmaCRM history, part 1 of 2: give member_notes a dedupe key, a real date and
-- enough note types to say what a record actually was.
--
-- WHY
-- ---
-- 6,228 notes are coming across from karmaCRM, the oldest written on 14 July 2020.
-- member_notes is the base-migration table (20260121153611) and has never been
-- altered, so today it has three problems that only appear at this volume:
--
--   1. No source key. Both its neighbours learned this on 3 September —
--      crm_contacts got (source, source_id) unique, members got crm_source_id
--      unique — after a re-run turned 431 rows into 862. Notes never got the
--      equivalent, so importing twice gives 12,456 notes with no way to tell
--      which half is which.
--
--   2. Dedupe by text. crmImportDb.noteExists compares `content` for equality
--      and there is no index on it: 6,228 sequential scans over a growing table,
--      and the longest note in the export is 19,340 characters. The unique index
--      below replaces that comparison with an id lookup.
--
--   3. Too few types. The CHECK allowed six values and none of them is a phone
--      call. 'call' is added because the export really does distinguish two —
--      karmaCRM's contact_type_id 2 — and 'courtesy_call' because that is what
--      the 1,604 todos in part 2 are, and a note written about one should be
--      able to say so. 'crm_import' is deliberately still refused: it describes
--      how a row arrived, not what it is, and inventing it is what broke the
--      September import (see crmImportNoteType.test.ts).
--
-- created_at is left exactly as it is: TIMESTAMPTZ DEFAULT now(), with no BEFORE
-- INSERT trigger on this table. Historical timestamps insert verbatim once the
-- writer is able to pass one.
--
-- AND ONE MORE THING: 305 OF THE 431 NEVER BECOME MEMBERS
-- -------------------------------------------------------
-- The contacts import creates a `members` row for the 121 live files and leaves
-- the other 305 — 200 cancelled, 54 deceased, 38 prospects, the rest staff and
-- third parties — as `crm_contacts`. That is the right call and is not being
-- changed here. But roughly 3,600 of the 9,628 history records belong to those
-- 305, and `member_notes.member_id` was NOT NULL, so there was nowhere to put
-- them: a cancelled member's call history is the record of why they cancelled,
-- and a deceased member's file is a record you can be asked for.
--
-- So member_id becomes nullable and crm_contact_id joins it, with a CHECK that
-- exactly one is set. A note always hangs off something. CRMContactDetailPage's
-- "convert to member" already moves a contact's free-text notes onto the new
-- member; it can now move these the same way, by setting member_id and clearing
-- crm_contact_id.
--
-- This widens no one's access. Both tables are staff-only (is_staff on
-- member_notes since the base migration, is_staff on crm_contacts since
-- 20260122132354) and there has never been a member-facing policy on
-- member_notes, so a note attached to a contact is readable by exactly the
-- people who could already read the contact.
--
-- Reverse (delete any note whose member_id is NULL first, or the NOT NULL will
-- refuse to come back):
--   DELETE FROM public.member_notes WHERE member_id IS NULL;
--   DROP INDEX IF EXISTS public.member_notes_source_uniq;
--   DROP INDEX IF EXISTS public.member_notes_member_created_idx;
--   DROP INDEX IF EXISTS public.member_notes_crm_contact_created_idx;
--   ALTER TABLE public.member_notes DROP CONSTRAINT IF EXISTS member_notes_one_owner;
--   ALTER TABLE public.member_notes ALTER COLUMN member_id SET NOT NULL;
--   ALTER TABLE public.member_notes DROP COLUMN IF EXISTS crm_contact_id,
--                                   DROP COLUMN IF EXISTS source_id,
--                                   DROP COLUMN IF EXISTS source;
--   then drop member_notes_note_type_check and re-add it over the original six
--   values only: general, medical, payment, support, followup, complaint.
--   (Written out rather than pasted as SQL because crmImportNoteType.test.ts reads
--   the live list straight out of this file, and a commented-out copy of the old
--   list would be the one it found.)

ALTER TABLE public.member_notes
  ADD COLUMN IF NOT EXISTS source          text,
  ADD COLUMN IF NOT EXISTS source_id       text,
  ADD COLUMN IF NOT EXISTS crm_contact_id  uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE;

ALTER TABLE public.member_notes ALTER COLUMN member_id DROP NOT NULL;

-- Exactly one owner, never both and never neither. Written as a CHECK rather
-- than left to the application because "neither" is the shape that loses a note
-- silently: it inserts, and then appears on nobody's screen.
ALTER TABLE public.member_notes DROP CONSTRAINT IF EXISTS member_notes_one_owner;
ALTER TABLE public.member_notes
  ADD CONSTRAINT member_notes_one_owner
  CHECK ((member_id IS NULL) <> (crm_contact_id IS NULL));

CREATE INDEX IF NOT EXISTS member_notes_crm_contact_created_idx
  ON public.member_notes(crm_contact_id, created_at DESC)
  WHERE crm_contact_id IS NOT NULL;

COMMENT ON COLUMN public.member_notes.source IS
  'Where this note came from: ''karmacrm'' for the 2026 migration, NULL for notes written in the platform.';
COMMENT ON COLUMN public.member_notes.source_id IS
  'Primary key in the source system. Unique per source - see member_notes_source_uniq.';

-- Partial, so the 0 notes written by staff (both columns NULL) are unaffected and
-- stay freely duplicable: two operators may legitimately write the same sentence.
CREATE UNIQUE INDEX IF NOT EXISTS member_notes_source_uniq
  ON public.member_notes(source, source_id)
  WHERE source_id IS NOT NULL;

-- The member record's notes tab reads newest-first for one member. At 773 notes
-- on the largest file that is a sort over the whole table without this.
CREATE INDEX IF NOT EXISTS member_notes_member_created_idx
  ON public.member_notes(member_id, created_at DESC);

-- Widen the type list. Dropped and recreated rather than added to, because the
-- original is an inline column CHECK from the base migration; the DO block finds
-- it by what it constrains rather than trusting the generated name.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.member_notes'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%note_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.member_notes DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.member_notes
  ADD CONSTRAINT member_notes_note_type_check
  CHECK (note_type IN ('general', 'medical', 'payment', 'support', 'followup', 'complaint', 'call', 'courtesy_call'));
