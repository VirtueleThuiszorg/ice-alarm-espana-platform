-- MOVING A LEGACY MEMBER ONTO STRIPE, without anybody paying twice.
--
-- The 431 imported members pay Santander. Moving them is not a flag flip: between the moment we
-- ask and the moment Stripe takes the first payment, SOMEBODY IS STILL RUNNING THE SANTANDER
-- COLLECTION. If that run includes a member who has just paid Stripe, they are charged twice in
-- one month — by us, from two systems, for the same monitoring.
--
-- `switch_pending` is the state that prevents it, and it is the whole reason this migration
-- exists rather than a boolean "switched" column:
--
--   legacy          Santander collects. The export includes them.
--   switch_pending  a Stripe link is out and unpaid. The export EXCLUDES them, and renewal
--                   still never fires. Nobody collects twice; at worst they miss one month.
--   stripe          Stripe collects. Written ONLY by the payment webhook (golden rule 4).
--
-- The asymmetry is deliberate. Excluding somebody who then does not pay costs one month of one
-- subscription and is recoverable the next month. Including somebody who has paid takes money
-- out of an 80-year-old's account twice and is a phone call, a refund and a lost trust.
--
-- ── AND THE LINK EXPIRES BACK ─────────────────────────────────────────────────
--
-- A member who never presses the link would otherwise sit in `switch_pending` forever, excluded
-- from the Santander export they are still meant to be in — so a silent, permanent hole in the
-- collection. `expire_legacy_switches()` puts them back to `legacy` after 14 days and rings the
-- bell, so somebody rings them instead. Fourteen days because the notice goes out before the
-- renewal and the runner must not have moved on before a member who took a week to answer.
--
-- NOTHING HERE ACTIVATES ANYBODY. `switch_pending` is not `active` and never becomes it; the
-- member is already `active` (a confirmed legacy member) and stays so throughout. The only
-- write of `billing_source = 'stripe'` is in the webhook's post-payment path.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.expire_legacy_switches();
--   DROP FUNCTION IF EXISTS public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz);
--   DROP INDEX IF EXISTS public.members_switch_expiry_idx;
--   ALTER TABLE public.members
--     DROP COLUMN IF EXISTS switch_started_at,
--     DROP COLUMN IF EXISTS switch_expires_at,
--     DROP COLUMN IF EXISTS switch_checkout_session_id,
--     DROP COLUMN IF EXISTS switch_checkout_url,
--     DROP COLUMN IF EXISTS switch_session_expires_at;
--   -- restore members_billing_source_check without 'switch_pending' (having moved any row
--   -- still holding it back to 'legacy' first — that is a decision, not a rollback), and
--   -- restore guard_member_billing_self_write / its trigger from 20260911110000, and
--   -- re-add notification_routes_event_type_check without the two switch events, having
--   -- deleted the rows this migration inserted.

-- ── 1. the third billing source ───────────────────────────────────────────────
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_billing_source_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_billing_source_check
  CHECK (billing_source IN ('stripe', 'legacy', 'switch_pending', 'none'));

COMMENT ON COLUMN public.members.billing_source IS
  'Who bills this member: stripe (this platform, webhook-driven), legacy (paid outside Stripe, '
  'imported from KarmaCRM), switch_pending (a Stripe switch link is out and unpaid — excluded '
  'from the Santander export so nobody collects twice, and still exempt from renewal), none (no '
  'billing relationship). DEFAULT stripe. Read by renewal and payment-failed logic, which fires '
  'for stripe only.';

-- ── 2. what is outstanding, and until when ────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS switch_started_at          timestamptz,
  ADD COLUMN IF NOT EXISTS switch_expires_at          timestamptz,
  ADD COLUMN IF NOT EXISTS switch_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS switch_checkout_url        text,
  ADD COLUMN IF NOT EXISTS switch_session_expires_at  timestamptz;

COMMENT ON COLUMN public.members.switch_expires_at IS
  'When an unpaid Stripe switch link lapses and the member returns to legacy billing. A member '
  'left in switch_pending forever is a permanent hole in the Santander collection that nobody '
  'is looking at.';

COMMENT ON COLUMN public.members.switch_checkout_session_id IS
  'The Stripe Checkout Session the member was sent, so a support call about "the link you sent '
  'me" can be answered from the record rather than from a search in the Stripe dashboard.';

COMMENT ON COLUMN public.members.switch_checkout_url IS
  'The Stripe Checkout URL itself, so the member portal can show the member their own link '
  'rather than telling them to go and find the text message. Readable by the member under the '
  'existing self-select policy and by nobody else; a Checkout URL is not a credential — it pays '
  'one specific order and Stripe expires it.';

COMMENT ON COLUMN public.members.switch_session_expires_at IS
  'When the Stripe SESSION expires, which is NOT when the switch does. Stripe caps a Checkout '
  'Session at 24 hours; the switch window is 14 days. So the portal must be able to tell '
  '"here is your link" from "your link has expired, ring us" — showing a dead link to an '
  '82-year-old who then believes they have paid is worse than showing none.';

-- The runner asks "whose link has lapsed" once a day, over switch_pending members only.
CREATE INDEX IF NOT EXISTS members_switch_expiry_idx
  ON public.members (switch_expires_at)
  WHERE billing_source = 'switch_pending';

-- ── 3. the self-write guard, extended to the new columns ──────────────────────
--
-- 20260911110000 refused a member writing billing_source, legacy_billing_day and
-- legacy_next_renewal. The three columns added above belong in the same list for the same
-- reason: a member who could write their own `switch_expires_at` could keep themselves out of
-- the Santander export indefinitely without ever paying Stripe — monitored, billed by nobody.
CREATE OR REPLACE FUNCTION public.guard_member_billing_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  IF NEW.billing_source              IS NOT DISTINCT FROM OLD.billing_source
 AND NEW.legacy_billing_day          IS NOT DISTINCT FROM OLD.legacy_billing_day
 AND NEW.legacy_next_renewal         IS NOT DISTINCT FROM OLD.legacy_next_renewal
 AND NEW.switch_started_at           IS NOT DISTINCT FROM OLD.switch_started_at
 AND NEW.switch_expires_at           IS NOT DISTINCT FROM OLD.switch_expires_at
 AND NEW.switch_checkout_session_id  IS NOT DISTINCT FROM OLD.switch_checkout_session_id
 AND NEW.switch_checkout_url         IS NOT DISTINCT FROM OLD.switch_checkout_url
 AND NEW.switch_session_expires_at   IS NOT DISTINCT FROM OLD.switch_session_expires_at THEN
    RETURN NEW;
  END IF;

  -- service_role: the payment webhook, the import, the runner, a migration. No auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'members billing columns are not self-writable (member %)', NEW.id
    USING ERRCODE = 'insufficient_privilege';
END
$guard$;

DROP TRIGGER IF EXISTS guard_member_billing_self_write ON public.members;
CREATE TRIGGER guard_member_billing_self_write
  BEFORE UPDATE OF billing_source, legacy_billing_day, legacy_next_renewal,
                   switch_started_at, switch_expires_at, switch_checkout_session_id,
                   switch_checkout_url, switch_session_expires_at
  ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_member_billing_self_write();

-- ── 4. the two events ─────────────────────────────────────────────────────────
--
-- `notification_routes.event_type` is CHECK-constrained to a named list with no ALTER ... ADD
-- VALUE, so the constraint is re-added whole. An event that is not in the list cannot be routed
-- at all, which is the constraint working: an event nothing routes is an event nobody hears.
ALTER TABLE public.notification_routes
  DROP CONSTRAINT IF EXISTS notification_routes_event_type_check;

ALTER TABLE public.notification_routes
  ADD CONSTRAINT notification_routes_event_type_check CHECK (event_type IN (
    'sale.paid',
    'lead.new',
    'payment.failed',
    'subscription.cancelled',
    'sos.opened',
    'sos.unassigned',
    'device.offline',
    'isabella.down',
    'partner.joined',
    'hot.sales',
    'ev07b.alert',
    'shift.no_show',
    'shift.no_coverage',
    'shift.disconnected',
    'shift.swap_requested',
    'shift.swap_accepted',
    'shift.swap_approved',
    'member.legacy_confirmed',
    -- NEW. A link is out (so this member has left the Santander export) and a link has lapsed
    -- (so they are back in it, unmoved). The second is the one that must be heard: it is the
    -- only signal that somebody needs ringing.
    'member.switch_link_sent',
    'member.switch_expired',
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    'test'
  ));

-- Default OFF for every paid channel: the bell is free and is where an operator works from.
INSERT INTO public.notification_routes (event_type, channel, enabled)
VALUES
  ('member.switch_link_sent', 'push',     true),
  ('member.switch_link_sent', 'sms',      false),
  ('member.switch_link_sent', 'whatsapp', false),
  ('member.switch_link_sent', 'email',    false),
  ('member.switch_expired',   'push',     true),
  ('member.switch_expired',   'sms',      false),
  ('member.switch_expired',   'whatsapp', false),
  ('member.switch_expired',   'email',    false)
ON CONFLICT (event_type, channel) DO NOTHING;

-- ── 5. starting a switch ──────────────────────────────────────────────────────
--
-- SERVICE ROLE ONLY, and that is the point. A staff member presses "Move to Stripe billing";
-- the edge function checks who they are, asks Stripe for a session, and only then calls this.
-- Exposing it to `authenticated` would let a browser put a member into switch_pending — out of
-- the Santander export — with no Stripe session behind it at all, which is the exact hole the
-- state exists to close.
CREATE OR REPLACE FUNCTION public.start_legacy_switch(
  _member_id          uuid,
  _session_id         text,
  _expires_at         timestamptz,
  _staff_id           uuid    DEFAULT NULL,
  _checkout_url       text    DEFAULT NULL,
  _session_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (member_id uuid, billing_source text, switch_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $start$
DECLARE
  v_source text;
  v_status public.member_status;
BEGIN
  SELECT m.billing_source, m.status INTO v_source, v_status
    FROM public.members m WHERE m.id = _member_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'start_legacy_switch: no member %', _member_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Only a member Santander is actually collecting from. A `stripe` member is already here; a
  -- `switch_pending` one already has a link out, and a second link is a second charge waiting
  -- to happen.
  IF v_source <> 'legacy' THEN
    RAISE EXCEPTION 'start_legacy_switch: member % is billing_source %, not legacy', _member_id, v_source
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.members
     SET billing_source              = 'switch_pending',
         switch_started_at           = now(),
         switch_expires_at           = _expires_at,
         switch_checkout_session_id  = _session_id,
         switch_checkout_url         = _checkout_url,
         switch_session_expires_at   = _session_expires_at,
         updated_at                  = now()
   WHERE id = _member_id;

  INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    _staff_id, 'member.switch_link_sent', 'member', _member_id,
    jsonb_build_object('billing_source', v_source),
    jsonb_build_object(
      'billing_source', 'switch_pending',
      'checkout_session_id', _session_id,
      'expires_at', _expires_at
    )
  );

  RETURN QUERY SELECT _member_id, 'switch_pending'::text, _expires_at;
END
$start$;

COMMENT ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz) IS
  'Puts a legacy member into switch_pending once a Stripe Checkout Session exists for them, so '
  'the Santander export stops including them. Service role only: a browser able to call it '
  'could take a member out of the collection with no Stripe session behind it.';

REVOKE ALL ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz) FROM authenticated;

-- ── 6. and putting them back when the link lapses ─────────────────────────────
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
    SELECT id, first_name, last_name
      FROM public.members
     WHERE billing_source = 'switch_pending'
       AND switch_expires_at IS NOT NULL
       AND switch_expires_at <= now()
     FOR UPDATE
  LOOP
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
      jsonb_build_object('billing_source', 'legacy')
    );

    -- The bell, because the member is back in the Santander run and nobody has moved them. A
    -- lapse that only appears in a log is a lapse nobody acts on.
    -- Targeted rows, never a broadcast: a shared row is cleared for everybody the moment one
    -- person marks it read. Same rule as src/lib/staffNotify.ts and bell_on_legacy_confirm.
    --
    -- In its own block, because getting the member back into the Santander export is the point.
    -- A bell that cannot be written must not roll back the expiry — that would leave them out
    -- of the collection AND unnoticed, which is strictly worse than the thing it was trying to
    -- announce. It must not be silent either, hence the warning.
    BEGIN
      INSERT INTO public.notification_log
        (admin_user_id, event_type, entity_type, entity_id, message, status)
      SELECT DISTINCT s.user_id,
             'member.switch_expired', 'member', r.id,
             format('%s %s did not use their Stripe switch link — back on Santander billing. '
                    'Ring them before the next collection.', r.first_name, r.last_name),
             'pending'
        FROM public.staff s
       WHERE s.user_id IS NOT NULL
         AND s.role IN ('super_admin', 'admin', 'call_centre_supervisor');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'switch for member % expired, but the bell could not be written: %', r.id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END
$expire$;

COMMENT ON FUNCTION public.expire_legacy_switches() IS
  'Returns members whose unpaid Stripe switch link has lapsed to legacy billing and rings the '
  'bell. Called by the daily billing-migration runner. Idempotent: a member already back on '
  'legacy is not selected.';

REVOKE ALL ON FUNCTION public.expire_legacy_switches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_legacy_switches() FROM authenticated;
