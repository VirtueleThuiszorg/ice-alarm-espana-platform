-- One query for a conversation list, instead of two per row plus one more.
--
-- WHAT WAS HAPPENING. Three screens render a list of conversations, and all three
-- built it the same way: fetch the conversations, then FOR EVERY ROW fetch its
-- last message, count its unread staff replies, and — when the thread has no
-- ordinary message at all — fetch Isabella's last turn as a fallback.
--
--   src/pages/client/MessagesPage.tsx
--   src/pages/client/SupportPage.tsx
--   src/components/call-centre/MessagesPanel.tsx
--
-- `src/lib/lastIsabellaTurn.ts` even says so out loud: *"Every conversation list
-- here is already one query per row; this must not become two."* It was already
-- two, and for an Isabella-only thread, three.
--
-- Measured (docs/perf/BASELINE.md): the member's Messages page issued **66**
-- Supabase requests on one load and Support **67**, against a budget of six.
--
-- WHY A VIEW AND NOT A BATCHED CLIENT QUERY. Fetching every message for every
-- listed conversation and grouping in JavaScript is three queries instead of 66,
-- and it is the wrong three: the call centre lists twenty conversations that may
-- hold thousands of messages between them, and it needs exactly twenty rows. A
-- LATERAL with LIMIT 1 asks the database for what the screen actually shows —
-- one row per conversation, whatever the message volume behind it.
--
-- security_invoker = on is LOAD-BEARING, not decoration, exactly as it is for
-- `member_monitoring_readiness` (20260904120000). It makes this view evaluate the
-- EXISTING policies on `conversations`, `messages` and `conversation_messages` as
-- the querying user, so a member sees their own threads and nothing else because
-- they cannot see the rows that produce anyone else's. No second policy to keep in
-- sync, and no new way to read a conversation that was not already readable.
-- Requires PostgreSQL 15+; prod is 16.
--
-- A view is not a table and cannot carry RLS, so golden rule 2 is satisfied here
-- the way it was for the readiness view: by ASSERTIONS PROVING THE DELEGATION
-- HOLDS — including one that reads `pg_class.reloptions` to prove
-- security_invoker is actually on, so the negative reads cannot pass for the
-- wrong reason. See scripts/rls/isolation.sql.
--
-- REVERSIBLE:
--   DROP VIEW IF EXISTS public.conversation_summaries;
--   DROP INDEX IF EXISTS public.idx_messages_conversation_created;
--   DROP INDEX IF EXISTS public.idx_messages_unread_by_sender;
--   DROP INDEX IF EXISTS public.idx_conversation_messages_conversation_created;
-- Drops no data and no policy.

-- ── indexes the LATERALs need ──────────────────────────────────────────────
--
-- `idx_messages_conversation_id` alone makes each LATERAL fetch every message of
-- the conversation and then sort it to find the newest. The composite carries the
-- order, so the lookup stops at the first row.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- PARTIAL, because the unread count only ever asks about UNREAD messages, which
-- are a small minority of the table. `sender_type` is carried as a column rather
-- than baked into the predicate so one index answers both directions — a member's
-- "staff replied" and the call centre's "a member is waiting".
CREATE INDEX IF NOT EXISTS idx_messages_unread_by_sender
  ON public.messages (conversation_id, sender_type)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
  ON public.conversation_messages (conversation_id, created_at DESC);

-- ── the view ───────────────────────────────────────────────────────────────
--
-- Columns are listed rather than `c.*`: a view built on `*` silently changes
-- shape when the table does, and this one is consumed by typed client code.
CREATE OR REPLACE VIEW public.conversation_summaries
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.member_id,
  c.subject,
  c.status,
  c.priority,
  c.assigned_to,
  c.last_message_at,
  c.created_at,
  c.updated_at,
  c.conversation_type,
  -- The staff-to-staff thread participants. Needed by the admin and call-centre
  -- lists to name who is in an internal thread.
  c.staff_participants,
  c.language,
  c.lead_id,
  c.source,
  c.last_channel,

  -- The newest ordinary message, or NULLs when the thread has none.
  lm.content     AS last_message_content,
  lm.created_at  AS last_message_created_at,
  lm.sender_type AS last_message_sender_type,
  lm.is_read     AS last_message_is_read,

  -- Isabella's newest turn. Read for EVERY row rather than only for threads with
  -- no message, because `conversationPreview` takes the NEWER of the two and a
  -- conditional second round trip is the per-row query this view exists to
  -- remove. One indexed LIMIT 1 lookup costs less than deciding whether to make
  -- it.
  it.content     AS last_isabella_content,
  it.created_at  AS last_isabella_created_at,

  -- BOTH DIRECTIONS, because the two surfaces ask opposite questions. A member's
  -- list highlights threads where STAFF have replied and they have not read it;
  -- the call centre's list highlights threads where a MEMBER is waiting. One
  -- column would have served one screen and quietly mis-highlighted the other.
  COALESCE(u.unread_from_staff, 0)::integer     AS unread_from_staff,
  COALESCE(u.unread_from_member, 0)::integer    AS unread_from_member,
  -- THREE counts, not two, because the five lists ask three different questions
  -- and collapsing them would silently change a number on screen. The member
  -- portal asks "has staff replied to me"; MessagesPanel asks "is a member
  -- waiting"; the admin and call-centre Messages pages ask "is anyone OTHER THAN
  -- staff waiting" — `sender_type <> 'staff'`, which also catches `system`. The
  -- third is a superset of the second and is kept separate rather than assumed
  -- equal to it.
  COALESCE(u.unread_not_from_staff, 0)::integer AS unread_not_from_staff,

  -- The call-centre list shows who the thread is with. Reached through the same
  -- policies as everything else here: staff may read `members`, a member may read
  -- their own row, and neither gains anything they did not already have.
  mem.first_name         AS member_first_name,
  mem.last_name          AS member_last_name,
  mem.email              AS member_email,
  mem.phone              AS member_phone,
  mem.preferred_language AS member_preferred_language
FROM public.conversations c
LEFT JOIN LATERAL (
  SELECT m.content, m.created_at, m.sender_type, m.is_read
  FROM public.messages m
  WHERE m.conversation_id = c.id
  ORDER BY m.created_at DESC
  LIMIT 1
) lm ON true
LEFT JOIN LATERAL (
  SELECT cm.content, cm.created_at
  FROM public.conversation_messages cm
  WHERE cm.conversation_id = c.id
  ORDER BY cm.created_at DESC
  LIMIT 1
) it ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE m.sender_type = 'staff')   AS unread_from_staff,
    count(*) FILTER (WHERE m.sender_type = 'member')  AS unread_from_member,
    count(*) FILTER (WHERE m.sender_type <> 'staff')  AS unread_not_from_staff
  FROM public.messages m
  WHERE m.conversation_id = c.id
    AND m.is_read = false
) u ON true
LEFT JOIN public.members mem ON mem.id = c.member_id;

COMMENT ON VIEW public.conversation_summaries IS
  'A conversation list row, complete: the thread plus its newest message, Isabella''s newest '
  'turn and the number of unread staff replies. Replaces the two-to-three queries PER ROW that '
  'MessagesPage, SupportPage and MessagesPanel each issued. security_invoker = on, so access is '
  'whatever the policies on conversations / messages / conversation_messages already allow — '
  'this view grants nothing new. Proven by assertions in scripts/rls/isolation.sql.';
