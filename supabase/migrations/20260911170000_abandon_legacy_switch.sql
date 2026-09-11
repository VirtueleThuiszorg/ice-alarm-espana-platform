-- A SWITCH THAT ENDS WITHOUT MONEY — one implementation, now that there are two ways in.
--
-- ── WHAT WAS MISSING ──────────────────────────────────────────────────────────
--
-- `switch_pending` takes a member OUT of the Santander export, which is what stops them being
-- collected from twice in the month they move. Exactly one thing put them back: the 14-day
-- lapse sweep, `expire_legacy_switches()`.
--
-- SEPA does not wait fourteen days to fail. A direct debit checkout completes `unpaid`, Stripe
-- presents the debit days later, and a bounce arrives as `checkout.session.async_payment_failed`
-- — which nothing handled. That member was out of the Santander run, had no Stripe subscription,
-- and stayed that way until the sweep found them up to a fortnight later. Lee's rule says the
-- opposite in as many words: "if not completed within 14 days, OR THE FIRST DEBIT BOUNCES, they
-- return to legacy with a staff bell so the missed payment is collected the old way."
--
-- ── WHY A FUNCTION AND NOT A SECOND COPY ──────────────────────────────────────
--
-- Returning somebody to legacy is five column writes, an activity_logs row and a targeted bell,
-- and every one of them has a reason recorded in 20260911130000. A second copy in the webhook —
-- in TypeScript, against the same columns — is how the two come to disagree about whether
-- `switch_session_expires_at` is cleared, and THAT disagreement re-creates the double
-- collection: a member who has paid, found later by the sweep, and put back into the Santander
-- run.
--
-- So the body moves here and `expire_legacy_switches()` becomes a loop that calls it. The
-- webhook calls the same function for a bounced debit. One implementation, two triggers.
--
-- NOTHING HERE ACTIVATES OR DEACTIVATES ANYBODY. The member is `active` throughout — they are a
-- confirmed legacy member whose monitoring never depended on this — and golden rule 4 is
-- untouched: `billing_source = 'stripe'` is still written only by the webhook's post-payment
-- path, and this function only ever writes `legacy`.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.abandon_legacy_switch(uuid, text);
--   and restore expire_legacy_switches() from 20260911130000 (its own body, inlined).

CREATE OR REPLACE FUNCTION public.abandon_legacy_switch(
  p_member_id uuid,
  p_reason    text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $abandon$
DECLARE
  r         record;
  v_message text;
BEGIN
  IF p_reason NOT IN ('lapsed', 'debit_bounced') THEN
    RAISE EXCEPTION 'abandon_legacy_switch: unknown reason %', p_reason;
  END IF;

  -- IDEMPOTENT BY SELECTION, not by a flag. A member already back on legacy is not selected, so
  -- a Stripe retry of the same event, or the sweep arriving after the bounce, writes nothing and
  -- rings nothing. Nobody gets told twice that the same person has lapsed.
  SELECT id, first_name, last_name
    INTO r
    FROM public.members
   WHERE id = p_member_id
     AND billing_source = 'switch_pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.members
     SET billing_source             = 'legacy',
         switch_started_at          = NULL,
         switch_expires_at          = NULL,
         switch_checkout_session_id = NULL,
         switch_checkout_url        = NULL,
         switch_session_expires_at  = NULL,
         updated_at                 = now()
   WHERE id = r.id;

  INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    NULL, 'member.switch_expired', 'member', r.id,
    jsonb_build_object('billing_source', 'switch_pending'),
    jsonb_build_object('billing_source', 'legacy', 'reason', p_reason)
  );

  -- THE TWO SENTENCES DIFFER BECAUSE THE TWO SITUATIONS DO. A lapse means nobody has been paid
  -- and nobody has been charged; a bounced debit means the member THINKS they have paid — they
  -- signed a mandate on a Stripe page — and the office has to ring them knowing that.
  v_message := CASE p_reason
    WHEN 'lapsed' THEN
      format('%s %s did not use their Stripe switch link — back on Santander billing. '
             'Ring them before the next collection.', r.first_name, r.last_name)
    ELSE
      format('%s %s set up their Stripe direct debit and the first payment BOUNCED. They are '
             'back on Santander billing, so this month is collected the old way — but they '
             'believe they have moved, so ring them and say what happened. Their alarm is '
             'unaffected.', r.first_name, r.last_name)
  END;

  -- In its own block, because getting the member back into the Santander export is the point. A
  -- bell that cannot be written must not roll back the return — that would leave them out of the
  -- collection AND unnoticed, strictly worse than the thing it was announcing. It must not be
  -- silent either, hence the warning.
  --
  -- Targeted rows, never a broadcast: a shared row is cleared for everybody the moment one
  -- person marks it read. Same rule as src/lib/staffNotify.ts and bell_on_legacy_confirm.
  BEGIN
    INSERT INTO public.notification_log
      (admin_user_id, event_type, entity_type, entity_id, message, status)
    SELECT DISTINCT s.user_id,
           'member.switch_expired', 'member', r.id, v_message, 'pending'
      FROM public.staff s
     WHERE s.user_id IS NOT NULL
       AND s.role IN ('super_admin', 'admin', 'call_centre_supervisor');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'switch for member % ended (%), but the bell could not be written: %',
      r.id, p_reason, SQLERRM;
  END;

  RETURN true;
END
$abandon$;

COMMENT ON FUNCTION public.abandon_legacy_switch(uuid, text) IS
  'Returns ONE member from switch_pending to legacy billing and rings the bell, for reason '
  'lapsed (the 14-day sweep) or debit_bounced (Stripe checkout.session.async_payment_failed). '
  'Returns false and writes nothing for a member who is not switch_pending, so a retried webhook '
  'event and the sweep cannot both announce the same lapse.';

-- SERVICE ROLE ONLY, like start_legacy_switch. A browser able to call this could take a member
-- out of switch_pending, which is a decision about who collects their money.
--
-- AND THE GRANT IS NOT OPTIONAL: PostgREST runs an edge function's request as `service_role`,
-- and EXECUTE is an ordinary privilege — 20260911130000 revoked its two functions from PUBLIC,
-- granted them to nobody, and the entire switch feature was inert until 20260911160000 noticed.
REVOKE ALL ON FUNCTION public.abandon_legacy_switch(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abandon_legacy_switch(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.abandon_legacy_switch(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.abandon_legacy_switch(uuid, text) TO service_role;

-- ── the sweep becomes a loop over the same function ────────────────────────────
--
-- Its behaviour is unchanged: same selection, same columns cleared, same message, same count
-- returned. What changed is that the body lives in one place.
CREATE OR REPLACE FUNCTION public.expire_legacy_switches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire$
DECLARE
  r       record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
      FROM public.members
     WHERE billing_source = 'switch_pending'
       AND switch_expires_at IS NOT NULL
       AND switch_expires_at <= now()
  LOOP
    IF public.abandon_legacy_switch(r.id, 'lapsed') THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END
$expire$;

COMMENT ON FUNCTION public.expire_legacy_switches() IS
  'Returns members whose unpaid Stripe switch link has lapsed to legacy billing and rings the '
  'bell, through abandon_legacy_switch(..., ''lapsed''). Called by the daily billing-migration '
  'runner. Idempotent: a member already back on legacy is not selected.';
