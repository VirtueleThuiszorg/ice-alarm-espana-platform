-- WP6 — messaging: internal staff notes that members must never see, canned replies per
-- language, and one vocabulary for "which channel did this arrive on".
--
-- TWO THINGS THE BRIEF ASKS FOR ALREADY EXIST, and are therefore NOT done again here:
--
--   `messages.read_at`  — already present (20260121153611, alongside `is_read`). Nothing to add.
--   the conversation_messages → conversations join — already a NOT NULL FK with ON DELETE
--   CASCADE (20260204172318:16). Isabella's transcript is already anchored to the conversation.
--
-- Saying so rather than adding a duplicate column or a second FK is the point: a migration
-- that re-adds what is there is how a schema grows two of everything.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.canned_replies;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS channel;
--   DROP POLICY IF EXISTS "Members never read internal staff notes" ON public.messages;
--   ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
--   ALTER TABLE public.messages ADD CONSTRAINT messages_sender_type_check
--     CHECK (sender_type IN ('member','staff','system'));
--   Narrowing back fails if any staff_internal row exists — the correct failure, since those
--   rows would otherwise become invalid silently.

-- ── 1. internal staff notes ────────────────────────────────────────────────
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('member', 'staff', 'system', 'staff_internal'));

-- ── 2. the channel vocabulary ──────────────────────────────────────────────
-- A NEW column, not a widening of `message_type`. `message_type` mixes transport with kind
-- ('text','call_log','system' are not channels), and it is read by existing code. Overloading
-- it is the mistake FULFILMENT_MODEL.md §3 refused to make with orders.status: every existing
-- reader would silently acquire cases it has never seen.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel text
  CHECK (channel IS NULL OR channel IN ('chat', 'voice', 'whatsapp', 'sms', 'email'));

COMMENT ON COLUMN public.messages.channel IS
  'How this message travelled. Separate from message_type, which mixes transport with kind. '
  'NULL on historical rows — backfilling a guess would invent a delivery record.';

-- THE ASSERTION THIS TABLE EXISTS TO SUPPORT: a member must never SELECT an internal note.
--
-- The existing member policy is "Members can view messages in own conversations", which is
-- scoped by conversation and says nothing about sender_type — so the moment `staff_internal`
-- becomes a legal value, an internal note written in a member's own conversation would be
-- visible to them. Adding the value without this policy would be the bug.
--
-- RESTRICTIVE, not permissive. A permissive policy is OR-ed with the others and would grant
-- nothing extra while blocking nothing; RESTRICTIVE is AND-ed with every other policy, so this
-- condition holds no matter what else is or is later added.
CREATE POLICY "Members never read internal staff notes"
  ON public.messages
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    sender_type <> 'staff_internal'
    OR public.is_staff(auth.uid())
  );

-- ── 3. canned replies, per language ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.canned_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut    text NOT NULL,
  locale      text NOT NULL CHECK (locale IN ('en', 'es', 'nl')),
  title       text NOT NULL,
  body        text NOT NULL,
  category    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One shortcut per language: an operator typing /wait must get exactly one answer, and the
  -- language is chosen from the member's preference rather than from the operator's.
  CONSTRAINT canned_replies_shortcut_locale UNIQUE (shortcut, locale)
);

COMMENT ON TABLE public.canned_replies IS
  'Operator quick replies, one row per (shortcut, locale). Staff-only: these are internal '
  'tooling, and a member reading the script the operator is following is not the product.';

DROP TRIGGER IF EXISTS update_canned_replies_updated_at ON public.canned_replies;
CREATE TRIGGER update_canned_replies_updated_at
  BEFORE UPDATE ON public.canned_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.canned_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view canned replies"
  ON public.canned_replies FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins manage canned replies"
  ON public.canned_replies FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
