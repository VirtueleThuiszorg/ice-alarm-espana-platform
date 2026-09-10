-- Legacy members: a state of their own, and ONE more way to become active.
--
-- WHY THIS EXISTS. The KarmaCRM import writes 431 people who wear pendants and pay outside
-- Stripe. Until now it wrote them `inactive`, because golden rule 4 says a member is activated
-- by the payment webhook and by nothing else, and this platform has never seen any of them pay
-- it. `inactive` was honest about the payment and wrong about the person: an inactive member is
-- one nobody is watching, and these people are wearing the pendant tonight.
--
-- Lee's ruling of 2026-09-10 (PENDING_FOR_LEE D-19 item 2): they are not inactive. They arrive
-- `pending_review` with `billing_source = 'legacy'`, and a human confirms them.
--
-- ── THE SHAPE OF THE RULE ──────────────────────────────────────────────────────
--
--   imported            status = 'pending_review'   billing_source = 'legacy'
--   confirmed by staff  status = 'active'            billing_source = 'legacy'
--   paid via Stripe     status = 'active'            billing_source = 'stripe'
--
-- `billing_source` is what keeps golden rule 4 intact while a second route to `active` exists.
-- An active member is monitored either way; only `stripe` means this platform holds a billing
-- relationship it can charge, dun or cancel. Renewal and payment-failed logic reads the source,
-- not the status, so it never fires at somebody who pays Mary in cash.
--
-- ── AND THERE ARE NOW EXACTLY TWO ROUTES TO 'active', ENFORCED ─────────────────
--
-- 20260904180000 stopped a MEMBER writing their own status and let any staff member write it.
-- That is no longer enough: "staff may set active" is a route to active with no payment and no
-- record of who decided. So the guard is tightened rather than loosened —
--
--   * service_role (the payment webhook)          -> allowed, unchanged
--   * confirm_legacy_member()                     -> allowed, and it says who and when
--   * any other authenticated write to 'active'   -> REFUSED, including staff
--   * staff -> 'suspended' / 'inactive' / 'pending_review'  -> allowed, unchanged
--
-- The function announces itself with a transaction-local GUC carrying THE MEMBER'S OWN ID, not a
-- boolean: a blanket "I am allowed" flag set once would unlock every row updated later in the
-- same transaction. A client cannot set it — PostgREST exposes no way to set an arbitrary GUC,
-- and the isolation harness asserts a plain UPDATE to 'active' by staff is refused.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.confirm_legacy_member(uuid);
--   DROP TRIGGER IF EXISTS bell_on_legacy_confirm ON public.members;
--   DROP FUNCTION IF EXISTS public.bell_on_legacy_confirm();
--   ALTER TABLE public.members DROP COLUMN IF EXISTS billing_source;
--   -- and re-add notification_routes_event_type_check without 'member.legacy_confirmed',
--   -- having deleted the four rows this migration inserted.
--   -- and restore the guard body from 20260909110000 verbatim (NOT 20260904180000 —
--   -- that one predates the paid-subscription rule and would re-open the dropdown).
--   -- `pending_review` cannot be removed from an enum; it can only be left unused. Any member
--   -- still holding it would have to be moved first, which is a decision and not a rollback.

-- ── 1. the enum value ─────────────────────────────────────────────────────────
--
-- ADD VALUE and nothing that USES it: Postgres refuses "unsafe use of new value of enum type"
-- when a new label is read in the same transaction that added it. So no CHECK, no backfill and
-- no DEFAULT mentioning 'pending_review' below — only function BODIES, which are text at
-- creation time and are never evaluated here.
ALTER TYPE public.member_status ADD VALUE IF NOT EXISTS 'pending_review';

-- ── 2. where the money comes from ─────────────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'stripe';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_billing_source_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_billing_source_check
      CHECK (billing_source IN ('stripe', 'legacy', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN public.members.billing_source IS
  'Who bills this member: stripe (this platform, webhook-driven), legacy (paid outside Stripe, '
  'imported from KarmaCRM), none (no billing relationship). DEFAULT stripe, because every member '
  'created by checkout is a Stripe member and a default of legacy would quietly exempt new '
  'members from renewal. Read by renewal and payment-failed logic, which never fires for legacy.';

-- An index because the members list filters on it beside status, and "show me everyone waiting
-- to be confirmed" over 431 rows is the screen this feature exists for.
CREATE INDEX IF NOT EXISTS members_billing_source_status_idx
  ON public.members (billing_source, status);

-- ── 3. the one new route to active ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_legacy_member(_member_id uuid, _reason text DEFAULT NULL)
RETURNS TABLE (member_id uuid, status text, billing_source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $confirm$
DECLARE
  v_role   public.app_role;
  v_staff  uuid;
  v_old    public.member_status;
  v_source text;
BEGIN
  -- WHO. Admin or supervisor only. An operator can see a member is waiting; deciding that
  -- somebody pays us outside Stripe is a supervisor's call, and it is recorded as theirs.
  v_role := public.get_staff_role(auth.uid());
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'call_centre_supervisor') THEN
    RAISE EXCEPTION 'confirm_legacy_member: admin or supervisor only (role %)', COALESCE(v_role::text, 'none')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  SELECT m.status, m.billing_source INTO v_old, v_source
  FROM public.members m WHERE m.id = _member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirm_legacy_member: no member %', _member_id USING ERRCODE = 'no_data_found';
  END IF;

  -- WHAT IT WILL NOT DO. Only a member the import left waiting. Confirming an `inactive` member
  -- would be reactivating a cancelled client, and confirming a `stripe` member would tell the
  -- platform to stop chasing a payment it is owed — neither is what this button says.
  IF v_old <> 'pending_review' THEN
    RAISE EXCEPTION 'confirm_legacy_member: member % is %, not pending_review', _member_id, v_old
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The guard trigger's permission slip: this member, this transaction, and nothing else.
  PERFORM set_config('app.confirming_legacy_member', _member_id::text, true);

  UPDATE public.members
     SET status = 'active', billing_source = 'legacy', updated_at = now()
   WHERE id = _member_id;

  -- Cleared immediately, so nothing later in the same transaction inherits it.
  PERFORM set_config('app.confirming_legacy_member', '', true);

  INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, old_values, new_values, reason)
  VALUES (
    v_staff,
    'member.legacy_confirmed',
    'member',
    _member_id,
    jsonb_build_object('status', v_old, 'billing_source', v_source),
    jsonb_build_object('status', 'active', 'billing_source', 'legacy'),
    _reason
  );

  RETURN QUERY SELECT _member_id, 'active'::text, 'legacy'::text;
END
$confirm$;

COMMENT ON FUNCTION public.confirm_legacy_member(uuid, text) IS
  'The ONE route to members.status = active that is not the payment webhook. Admin or supervisor '
  'only, pending_review only, writes an activity_logs row naming who and when, and announces '
  'itself to the status guard with a transaction-local GUC carrying the member id.';

REVOKE ALL ON FUNCTION public.confirm_legacy_member(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_member(uuid, text) TO authenticated;

-- ── 4. the guard, extended ────────────────────────────────────────────────────
--
-- WHAT THE LIVE GUARD ALREADY SAYS, because this replaces it and must not lose it. The body in
-- 20260904180000 let any staff member write any status. 20260909110000 tightened that: staff may
-- set anything EXCEPT `active`, and `active` only when a subscription for that member says
-- `active` or `past_due` — so reinstating a suspended PAYING member still works (P4 keeps
-- monitoring running while Stripe retries) while granting a membership from a dropdown does not.
-- `scripts/rls/isolation.sql` asserts both halves.
--
-- WHAT THIS ADDS. One more way in, and only one: `confirm_legacy_member()` for the member it
-- names. So the routes to `active` are now:
--
--   1. no auth.uid() — the payment webhook. Unchanged.
--   2. staff, WITH an active/past_due subscription — a reinstatement, and the subscription that
--      unlocks it was written by the webhook, so the activation still originates from a payment.
--   3. confirm_legacy_member() — a supervisor's decision, recorded with their name on it.
--
-- Route 2 is kept deliberately. Lee's ruling reads "active is reachable only via stripe-webhook
-- OR this confirm action"; taken literally that would delete the reinstate path and break
-- un-suspending a member who pays us every month. Route 2 IS the Stripe route, one step removed
-- — it requires a Stripe subscription to point at — so it is left in place and named here rather
-- than removed quietly. If Lee means it should go, it is one clause.
CREATE OR REPLACE FUNCTION public.guard_member_status_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- service_role (the payment webhook, submit_registration_atomic, a migration) has no
  -- auth.uid(). That is the ONLY route by which an unpaid member becomes active without a
  -- human's name against it, which is golden rule 4 stated as a code path.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(auth.uid()) THEN
    -- Suspending, deactivating, returning somebody to review — all still an operator's call.
    IF NEW.status <> 'active' THEN
      RETURN NEW;
    END IF;

    -- confirm_legacy_member(), for THIS member, in THIS transaction. The GUC carries the id
    -- rather than a boolean because a blanket "I am allowed" flag set once would unlock every
    -- row updated later in the same transaction — asserted in the isolation harness.
    IF COALESCE(current_setting('app.confirming_legacy_member', true), '') = NEW.id::text THEN
      RETURN NEW;
    END IF;

    -- Moving a member INTO `active` is a claim that they are paid up, so a payment must exist
    -- to point at. `past_due` counts: P4 keeps monitoring running while Stripe retries, so a
    -- member whose card failed is still a paying member and can still be un-suspended.
    IF EXISTS (
      SELECT 1 FROM public.subscriptions s
       WHERE s.member_id = NEW.id AND s.status IN ('active', 'past_due')
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'members.status cannot be set to active without a paid subscription: activation is the '
      'payment webhook''s job (golden rule 4). Member % has no active or past_due subscription. '
      'Send them a payment link, or — for a member the CRM import left pending_review — use '
      'confirm_legacy_member().', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Anyone else changing status is the member changing their own, because RLS has already
  -- restricted them to their own row. Refuse loudly: a silent revert would leave the member
  -- believing they had activated themselves.
  RAISE EXCEPTION
    'members.status is not self-writable: activation is the payment webhook''s job (golden rule 4). Attempted % -> %',
    OLD.status, NEW.status
    USING ERRCODE = 'insufficient_privilege';
END $guard$;

COMMENT ON FUNCTION public.guard_member_status_self_write() IS
  'members.status may reach active three ways and no others: the payment webhook (no auth.uid()), '
  'staff reinstating a member who HAS an active/past_due subscription, or confirm_legacy_member() '
  'for the member it names. Staff may suspend, deactivate or return to review; a member may '
  'change nothing.';

-- ── 5. the bell ───────────────────────────────────────────────────────────────
--
-- Written by a trigger and not by the app, for the same reason as the shift-swap bell: it covers
-- every route into the column, including a supervisor confirming somebody from the SQL editor,
-- and it survives the browser tab closing mid-request.
CREATE OR REPLACE FUNCTION public.bell_on_legacy_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $bell$
DECLARE
  v_message text;
BEGIN
  IF NOT (NEW.status = 'active' AND NEW.billing_source = 'legacy'
          AND OLD.status IS DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  v_message := format('%s %s confirmed as a legacy member — monitored, billed outside Stripe',
                      NEW.first_name, NEW.last_name);

  -- Targeted rows only: a broadcast row is shared, so one person marking it read clears it for
  -- everybody. Same rule as src/lib/staffNotify.ts.
  INSERT INTO public.notification_log
    (admin_user_id, event_type, entity_type, entity_id, message, status)
  SELECT DISTINCT s.user_id, 'member.legacy_confirmed', 'member', NEW.id, v_message, 'pending'
  FROM public.staff s
  WHERE s.user_id IS NOT NULL
    AND s.role IN ('super_admin', 'admin', 'call_centre_supervisor');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The confirmation is the point. A bell that cannot be written must not undo it — but it must
  -- not be silent either, which is what the warning is for.
  RAISE WARNING 'member % confirmed, but the bell could not be written: %', NEW.id, SQLERRM;
  RETURN NEW;
END $bell$;

DROP TRIGGER IF EXISTS bell_on_legacy_confirm ON public.members;
CREATE TRIGGER bell_on_legacy_confirm
  AFTER UPDATE OF status ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.bell_on_legacy_confirm();

-- The route. `notification_routes.event_type` is CHECK-constrained to a named list, so a new
-- event has to JOIN THE LIST — an insert on its own is refused, which is the constraint working:
-- an event nothing routes is an event nobody hears. Re-added whole rather than patched, because
-- the constraint has no ALTER ... ADD VALUE.
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
    -- NEW: a legacy member confirmed. It changes who the platform considers monitored, and it
    -- is the one activation that did not come from a payment — so it is worth a supervisor
    -- seeing it happen.
    'member.legacy_confirmed',
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    'test'
  ));

-- Default OFF for every paid channel. A confirmation is not worth a per-message bill; the bell
-- is free and is where an operator works from.
INSERT INTO public.notification_routes (event_type, channel, enabled)
VALUES
  ('member.legacy_confirmed', 'push',     true),
  ('member.legacy_confirmed', 'sms',      false),
  ('member.legacy_confirmed', 'whatsapp', false),
  ('member.legacy_confirmed', 'email',    false)
ON CONFLICT (event_type, channel) DO NOTHING;
