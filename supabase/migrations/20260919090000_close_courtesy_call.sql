-- Closing a courtesy call writes what happened, instead of only ticking the task off.
--
-- TODAY: the dashboard's "complete" button sets `tasks.status = 'completed'` and nothing else.
-- The conversation with a vulnerable person — whether they were well, whether the pendant was
-- worn, whether anyone answered at all — is not written anywhere. The next operator opens the
-- record and sees a completed task with a generated title and no content, so every month starts
-- from nothing, and a member who has not answered three months running looks exactly like one
-- who is fine.
--
-- This migration adds the columns that hold a call in progress, and one RPC that closes it.
--
-- WHY AN RPC AND NOT FOUR CLIENT WRITES: closing a call touches `member_notes`, `tasks` (this
-- one and the next one) and `members`. Done from the browser that is four round trips with no
-- transaction, so a dropped connection between them leaves the member's next-call date pointing
-- at a call that was never recorded, or a note with no task. One statement, one transaction,
-- one outcome.

-- ── the columns a call in progress needs ───────────────────────────────────────────────────
--
-- `draft_notes` is the operator's typing, autosaved while the call is live. It is deliberately
-- on `tasks` and not in the browser: a dropped browser during a call with a member is exactly
-- when losing the notes costs the most, and localStorage does not survive a different machine.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS draft_notes   text,
  ADD COLUMN IF NOT EXISTS outcome       text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tasks.draft_notes IS
  'Autosaved notes for a call in progress. Cleared when the task is closed — the finished text '
  'lives in member_notes, and a draft left behind would be a second, staler copy of it.';
COMMENT ON COLUMN public.tasks.outcome IS
  'How the call ended: spoke_member, spoke_carer, no_answer, voicemail, wrong_number, declined.';
COMMENT ON COLUMN public.tasks.attempt_count IS
  'How many times this call has been tried. Only rises on an outcome that reached nobody.';

-- `last_courtesy_call_at` did not exist: `next_courtesy_call_date` was the only courtesy column
-- on the member, so "when did we last actually speak to them?" could only be answered by
-- searching tasks, and only if the task had been completed rather than left open.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS last_courtesy_call_at timestamptz;

COMMENT ON COLUMN public.members.last_courtesy_call_at IS
  'When a courtesy call last REACHED this member. A no-answer does not set it — the point of the '
  'column is the last contact, not the last attempt.';

-- ── the schedule rule, third copy, agreeing by construction ────────────────────────────────
--
-- `supabase/functions/_shared/courtesy-schedule.ts` holds the one rule for the app and the edge
-- functions, and it CLAMPS: 31 Jan + 1 month is 28 Feb, not 3 March. This function has to answer
-- the same question inside a transaction, in SQL, so it cannot call that file.
--
-- It does not need to. PostgreSQL's interval arithmetic already clamps — `date '2026-01-31' +
-- interval '1 month'` is 2026-02-28 — so the two agree because of what Postgres does, not
-- because somebody kept them in step. `scripts/rls/isolation.sql` asserts that agreement on the
-- month-end cases, so if a future Postgres or a rewrite here ever diverged from the TypeScript,
-- CI says so rather than a member being rung on the wrong day.
CREATE OR REPLACE FUNCTION public.courtesy_next_call_date(p_frequency text, p_from date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_frequency
           WHEN 'daily'     THEN p_from + interval '1 day'
           WHEN 'weekly'    THEN p_from + interval '7 days'
           WHEN 'bi-weekly' THEN p_from + interval '14 days'
           WHEN 'quarterly' THEN p_from + interval '3 months'
           ELSE                  p_from + interval '1 month'  -- monthly, and anything unknown
         END::date
$$;

COMMENT ON FUNCTION public.courtesy_next_call_date(text, date) IS
  'When the next courtesy call falls due. Mirrors _shared/courtesy-schedule.ts; agreement is '
  'asserted by the isolation suite rather than assumed.';

-- ── closing a call ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_courtesy_call(
  p_task_id      uuid,
  p_outcome      text,
  p_notes        text,
  p_checklist    jsonb DEFAULT '{}'::jsonb,
  p_follow_up_at date  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $close$
DECLARE
  v_staff_id     uuid;
  v_task         record;
  v_member       record;
  v_reached      boolean;
  v_next_date    date;
  v_next_task_id uuid;
  v_note_id      uuid;
  v_content      text;
  v_checklist_md text;
  v_attempts     integer;
  v_note_source  text;
  v_note_src_id  uuid;
BEGIN
  -- STAFF ONLY, AND CHECKED HERE RATHER THAN LEFT TO RLS. This function is SECURITY DEFINER, so
  -- it runs with the owner's rights and RLS on the tables it writes does not apply. The role
  -- check IS the access control; without it any authenticated user could close any member's call.
  SELECT id INTO v_staff_id
    FROM public.staff
   WHERE user_id = auth.uid()
     AND is_active = true;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'close_courtesy_call: caller is not active staff'
      USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('spoke_member', 'spoke_carer', 'no_answer',
                       'voicemail', 'wrong_number', 'declined') THEN
    RAISE EXCEPTION 'close_courtesy_call: unknown outcome %', p_outcome
      USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE so two operators who opened the same call cannot both close it. The second one
  -- waits, then finds it already completed and is told so, rather than writing a second note and
  -- a second next-month task.
  SELECT t.id, t.member_id, t.status, t.attempt_count
    INTO v_task
    FROM public.tasks t
   WHERE t.id = p_task_id
     AND t.task_type = 'courtesy_call'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'close_courtesy_call: no courtesy call task %', p_task_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_task.status = 'completed' THEN
    RAISE EXCEPTION 'close_courtesy_call: task % is already closed', p_task_id
      USING ERRCODE = '55000';
  END IF;

  SELECT m.id, m.first_name, m.last_name,
         COALESCE(m.courtesy_call_frequency, 'monthly') AS frequency
    INTO v_member
    FROM public.members m
   WHERE m.id = v_task.member_id;

  -- REACHED means a person was spoken to. Voicemail is not reaching someone: nobody answered,
  -- nothing was confirmed, and treating it as a completed check-in would mark a member as
  -- checked on when all that happened was a message into an empty room.
  v_reached := p_outcome IN ('spoke_member', 'spoke_carer', 'declined', 'wrong_number');

  -- The checklist is rendered into the note rather than stored as JSON alongside it, because the
  -- note is what a human reads next month. A jsonb blob in a column nobody renders is not history.
  SELECT string_agg(format('- %s: %s', key,
                           CASE WHEN value::text = 'true' THEN 'yes'
                                WHEN value::text = 'false' THEN 'no'
                                ELSE btrim(value::text, '"') END),
                    E'\n' ORDER BY key)
    INTO v_checklist_md
    FROM jsonb_each(COALESCE(p_checklist, '{}'::jsonb));

  v_content := btrim(
    COALESCE(NULLIF(btrim(p_notes), ''), '(no notes written)')
    || CASE WHEN v_checklist_md IS NULL THEN '' ELSE E'\n\n' || v_checklist_md END);

  /*
    THE NOTE IS WRITTEN AFTER THE BRANCH, because `member_notes_source_uniq` makes
    (source, source_id) an idempotency key — it exists so a re-run of the KarmaCRM import cannot
    duplicate a member's history. A courtesy call that nobody answers is tried again, so keying
    every attempt to the same task id collides on the second try and the whole close fails.

    So the key is the ATTEMPT, not the task:
      reached   -> ('courtesy_call',         this task)      — a task is closed exactly once
      unreached -> ('courtesy_call_attempt', the retry task) — each attempt raises exactly one
  */
  IF v_reached THEN
    UPDATE public.tasks
       SET status       = 'completed',
           outcome      = p_outcome,
           completed_at = now(),
           draft_notes  = NULL,
           updated_at   = now()
     WHERE id = p_task_id;

    v_next_date := public.courtesy_next_call_date(v_member.frequency, CURRENT_DATE);

    UPDATE public.members
       SET last_courtesy_call_at   = now(),
           next_courtesy_call_date = v_next_date,
           updated_at              = now()
     WHERE id = v_task.member_id;

    -- THE NEXT CALL IS CREATED NOW, not left to tonight's generator. The operator who just rang
    -- somebody should see "next: 19 Oct" before they close the dialog; being told the next call
    -- exists only after a nightly job has run is how a month gets skipped when the job fails.
    -- `generate-courtesy-calls` skips members that already have a pending courtesy task, so this
    -- does not double up.
    INSERT INTO public.tasks (title, description, member_id, task_type, priority, status,
                              due_date, created_by)
    VALUES (
      format('Courtesy Call - %s %s', v_member.first_name, v_member.last_name),
      format('Scheduled when the call on %s was closed.', to_char(CURRENT_DATE, 'DD Mon YYYY')),
      v_task.member_id, 'courtesy_call', 'normal', 'pending',
      (v_next_date + time '17:00')::timestamptz, v_staff_id)
    RETURNING id INTO v_next_task_id;

    v_attempts    := v_task.attempt_count;
    v_note_source := 'courtesy_call';
    v_note_src_id := p_task_id;
  ELSE
    -- NOBODY ANSWERED. The task stays open, because the call has not happened — closing it would
    -- put the member back in the queue a month from now having never been spoken to.
    v_attempts := COALESCE(v_task.attempt_count, 0) + 1;

    UPDATE public.tasks
       SET attempt_count = v_attempts,
           outcome       = p_outcome,
           draft_notes   = NULL,
           updated_at    = now()
     WHERE id = p_task_id;

    /*
      ONE OPEN RETRY PER CALL, IDEMPOTENT BY SELECTION — the idiom `abandon_legacy_switch` uses.
      Three tries in one afternoon are three attempts but one thing to do tomorrow; inserting a
      retry per attempt would put the same member in tomorrow's queue three times, and
      `tasks_source_uniq` refuses the second one anyway.
    */
    SELECT t.id INTO v_next_task_id
      FROM public.tasks t
     WHERE t.source = 'courtesy_call'
       AND t.source_id = p_task_id::text
       AND t.task_type = 'courtesy_call_retry'
       AND t.status <> 'completed'
     LIMIT 1;

    IF v_next_task_id IS NULL THEN
      INSERT INTO public.tasks (title, description, member_id, task_type, priority, status,
                                due_date, created_by, source, source_id)
      VALUES (
        format('Retry courtesy call - %s %s', v_member.first_name, v_member.last_name),
        format('Attempt %s reached nobody (%s).', v_attempts, p_outcome),
        v_task.member_id, 'courtesy_call_retry', 'normal', 'pending',
        ((CURRENT_DATE + 1) + time '10:00')::timestamptz, v_staff_id,
        'courtesy_call', p_task_id)
      RETURNING id INTO v_next_task_id;
    ELSE
      UPDATE public.tasks
         SET description = format('Attempt %s reached nobody (%s).', v_attempts, p_outcome),
             due_date    = ((CURRENT_DATE + 1) + time '10:00')::timestamptz,
             updated_at  = now()
       WHERE id = v_next_task_id;
    END IF;

    /*
      AN ATTEMPT NOTE CARRIES NO source_id, deliberately. `member_notes_source_uniq` is an
      import idempotency key — it stops a re-run of the KarmaCRM migration duplicating history —
      and it exempts NULL source_id precisely so that genuinely repeated events stay writable:
      "two operators may legitimately write the same sentence". Three unanswered calls are three
      events and belong in the history three times. The CLOSING note, which happens exactly once
      per task, does carry the task id.
    */
    v_note_source := 'courtesy_call_attempt';
    v_note_src_id := NULL;

    -- Three misses is no longer a bad day, it is a member nobody has spoken to. A supervisor is
    -- told once, at the third, rather than a bell on every attempt that trains people to ignore it.
    IF v_attempts = 3 THEN
      INSERT INTO public.notification_log (admin_user_id, event_type, entity_type, entity_id,
                                           channel, status, message)
      -- 'bell' is the channel the in-app bell reads (20260909121500); a router channel here
      -- would be an SMS nobody asked for. 'pending' is the table's own unread state — the bell
      -- treats only status = 'read' as read.
      SELECT s.user_id, 'task', 'member', v_task.member_id, 'bell', 'pending',
             format('%s %s has not answered three courtesy calls.',
                    v_member.first_name, v_member.last_name)
        FROM public.staff s
       WHERE s.is_active = true
         AND s.role IN ('admin', 'super_admin');
    END IF;
  END IF;

  INSERT INTO public.member_notes (member_id, note_type, source, source_id, staff_id, content,
                                   followup_date)
  VALUES (v_task.member_id, 'courtesy_call', v_note_source, v_note_src_id, v_staff_id,
          format('[%s] %s', p_outcome, v_content), p_follow_up_at)
  RETURNING id INTO v_note_id;

  -- A follow-up is its own task so it shows in the operator's list on the day, linked back to the
  -- note that explains why it exists.
  IF p_follow_up_at IS NOT NULL THEN
    INSERT INTO public.tasks (title, description, member_id, task_type, priority, status,
                              due_date, created_by, source, source_id)
    VALUES (
      format('Follow up - %s %s', v_member.first_name, v_member.last_name),
      'Raised from a courtesy call.',
      v_task.member_id, 'follow_up', 'normal', 'pending',
      (p_follow_up_at + time '10:00')::timestamptz, v_staff_id,
      'member_note', v_note_id);
  END IF;

  RETURN jsonb_build_object(
    'reached',       v_reached,
    'note_id',       v_note_id,
    'next_task_id',  v_next_task_id,
    'next_call_date', v_next_date,
    'attempt_count', v_attempts);
END;
$close$;

COMMENT ON FUNCTION public.close_courtesy_call(uuid, text, text, jsonb, date) IS
  'Closes a courtesy call in one transaction: writes the note, settles the task, moves the '
  'member''s next-call date and raises the next task. Staff only.';

REVOKE ALL ON FUNCTION public.close_courtesy_call(uuid, text, text, jsonb, date) FROM public;
GRANT EXECUTE ON FUNCTION public.close_courtesy_call(uuid, text, text, jsonb, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.courtesy_next_call_date(text, date) TO authenticated;
