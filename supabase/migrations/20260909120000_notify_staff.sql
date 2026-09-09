-- ONE ROUTER NEEDS FOUR THINGS THE SCHEMA DOES NOT HAVE: per-staff preferences, a company-wide
-- switch per event × channel, somewhere to keep a phone's push token, and a notification_log
-- that can tell a bell entry apart from an SMS attempt.
--
-- WHAT EXISTS TODAY, and why none of it is enough:
--
--   `notification_settings`  keyed on ONE admin user with three boolean columns
--                            (whatsapp_paid_sales / _partner_signup / _hot_sales), a
--                            whatsapp_number, and — added later — whatsapp_shift_alerts. It is
--                            WhatsApp-only, admin-only, and event-specific: a new event type
--                            means a migration, and a new channel means another three columns.
--                            notify-admin already reads `settings.whatsapp_ev07b_alerts`, which
--                            no migration ever created — so `undefined` makes `shouldSend`
--                            false and the EV07B WhatsApp alert has never sent. That is the
--                            failure mode a column-per-event schema produces on its own.
--   `notification_log`       has no idea WHICH CHANNEL a row is about. The bell reads this table
--                            (src/hooks/useNotifications.ts), and notify-admin writes a row per
--                            WhatsApp ATTEMPT — so a WhatsApp send already appears in the bell
--                            as if it were a notification for the reader. With a `channel`
--                            column the bell reads its own rows and the rest is an audit trail.
--   push                      `src/hooks/usePushNotifications.ts` writes `push_token` and
--                            `push_enabled` onto `notification_settings`. NEITHER COLUMN
--                            EXISTS in any migration, and nothing imports the hook — so the
--                            client half of push is dead code writing to a table shape that has
--                            never been there. One token per USER would be wrong anyway: a
--                            person has a phone and a laptop, and a token belongs to a DEVICE.
--
-- THE SHAPE THIS TAKES INSTEAD: three tables of rows, no columns per event. Adding an event type
-- or a channel is a row, and a switch in the admin UI flips a row — never a redeploy, which is
-- the requirement that decides the whole design.
--
-- THREE GATES, EACH MEANING SOMETHING DIFFERENT, and the router reports which one stopped a send:
--
--   1. `system_settings.notify_channel_{sms,whatsapp,push,email}`  — is this TRANSPORT live at
--      all? Lee's switch (D7), seeded false, and it stays the outermost gate: a channel nobody
--      has proven delivers must not send, whatever anybody's preferences say.
--   2. `notification_routes` (event_type × channel)                — company POLICY: does a
--      `sale.paid` go out by SMS? Turned on once, for everyone, when the route is proven.
--   3. `staff_notification_prefs` (staff × event_type × channel)   — the PERSON's choice.
--
-- All three must be on. Any one off is a `skipped_*` outcome in `notification_log` naming the
-- gate, because "it didn't arrive" must never be a silence somebody has to guess at.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.staff_notification_prefs;
--   DROP TABLE IF EXISTS public.staff_push_tokens;
--   DROP TABLE IF EXISTS public.notification_routes;
--   DROP TRIGGER IF EXISTS seed_notification_prefs_for_new_staff ON public.staff;
--   DROP FUNCTION IF EXISTS public.seed_staff_notification_prefs(uuid);
--   DROP INDEX IF EXISTS notification_log_idempotent_send;
--   DROP INDEX IF EXISTS idx_notification_log_bell;
--   ALTER TABLE public.notification_log
--     DROP COLUMN IF EXISTS channel,
--     DROP COLUMN IF EXISTS recipient,
--     DROP COLUMN IF EXISTS idempotency_key;
--   DELETE FROM public.system_settings WHERE key = 'notify_channel_push';
--   Drops no pre-existing data: the three tables are new, the three columns are additive, and
--   every existing notification_log row keeps the 'bell' channel it is given below — which is
--   what those rows already are.

-- ── the event types, named once ────────────────────────────────────────────
-- NINETEEN of them: the eight this router was built for, the eleven `notify-admin` already
-- sends (so its WhatsApp path moves onto the router whole), and `test`. The list is mirrored
-- in `NOTIFY_EVENTS` in supabase/functions/_shared/notify-staff.ts, and
-- src/test/notifyStaffRouter.test.ts asserts the two agree — a router that can emit an event
-- type this CHECK refuses would fail at the log write, after the SMS had gone out.
-- A CHECK rather than an enum, deliberately: `ALTER TYPE … ADD VALUE` cannot run in the same
-- transaction as anything that uses the new value, which has already cost this repo a migration
-- split (20260908120300/120400). A CHECK constraint is replaceable in one statement, and the set
-- is small and stable enough that the constraint IS the documentation.
CREATE TABLE public.notification_routes (
  event_type text NOT NULL CHECK (event_type IN (
    -- the eight the router was built for
    'sale.paid',              -- a member paid; the number the business runs on
    'lead.new',               -- an enquiry arrived and somebody must answer it
    'payment.failed',         -- a card was declined; P4 says monitoring continues AND staff are told
    'subscription.cancelled', -- somebody stopped paying
    'sos.opened',             -- an alert was raised
    'sos.unassigned',         -- an alert nobody has picked up
    'device.offline',         -- a pendant stopped checking in
    'isabella.down',          -- the assistant cannot complete a run
    -- the eleven `notify-admin` already sends, so its WhatsApp path can move onto the router
    -- whole rather than living beside it. Its own switch was a boolean column per event, which
    -- is how `whatsapp_ev07b_alerts` came to be read without ever existing.
    'partner.joined',
    'hot.sales',
    'ev07b.alert',
    'shift.no_show',
    'shift.no_coverage',
    'shift.disconnected',
    -- THE FOUR NO SWITCH MAY SILENCE. Each says the safety machinery itself has failed, and
    -- `notify-admin` sends all four with `shouldSend = true` today, deliberately ungated. The
    -- router honours that: `ALWAYS_LOUD` in _shared/notify-staff.ts bypasses this table and the
    -- preferences table for these four. The rows still exist so the matrix can SHOW them (as
    -- always-on, not as a switch that does nothing) and so the preferences FK has a parent.
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    -- the admin "send me a test notification" button
    'test'
  )),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'push', 'email')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  PRIMARY KEY (event_type, channel)
);

COMMENT ON TABLE public.notification_routes IS
  'Company policy: does this event type go out on this channel at all. Gate 2 of 3 — the '
  'transport must also be live (system_settings.notify_channel_*) and the recipient must want '
  'it (staff_notification_prefs). Admin -> Settings -> Notifications flips these rows; nothing '
  'is redeployed to change a route.';

ALTER TABLE public.notification_routes ENABLE ROW LEVEL SECURITY;

-- Every staff member may SEE the routes — an operator wondering why they were not texted is
-- entitled to know the company has that route switched off. Only admins change them.
CREATE POLICY "Staff view notification routes"
ON public.notification_routes FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins manage notification routes"
ON public.notification_routes FOR ALL TO authenticated
USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'))
WITH CHECK (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- ── the person's own preferences ───────────────────────────────────────────
CREATE TABLE public.staff_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'push', 'email')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,

  -- One row per person per event per channel. The UNIQUE is what lets the admin matrix upsert a
  -- toggle without reading first, and what stops two rows disagreeing about the same switch.
  UNIQUE (staff_id, event_type, channel),

  -- The same event list as the routes table, kept as a FOREIGN KEY rather than a duplicated
  -- CHECK: two copies of a list drift, and this one is load-bearing for money notifications.
  FOREIGN KEY (event_type, channel) REFERENCES public.notification_routes (event_type, channel)
    ON DELETE CASCADE
);

CREATE INDEX idx_staff_notification_prefs_lookup
  ON public.staff_notification_prefs (event_type, channel, enabled)
  WHERE enabled;

COMMENT ON TABLE public.staff_notification_prefs IS
  'Per-person notification preferences: one row per staff member x event type x channel. Gate 3 '
  'of 3. EVERY DEFAULT IS A ROW HERE, not a branch in code — seeded by '
  'seed_staff_notification_prefs() for existing staff and by a trigger for new ones, so an '
  'admin can switch any of it off without a deploy.';

ALTER TABLE public.staff_notification_prefs ENABLE ROW LEVEL SECURITY;

-- A staff member reads THEIR OWN rows. Not everybody's: who else has agreed to be texted at
-- 3am is not an operator's business, and the admin matrix is an admin screen.
CREATE POLICY "Staff view their own notification prefs"
ON public.staff_notification_prefs FOR SELECT TO authenticated
USING (staff_id = public.get_staff_id(auth.uid()));

CREATE POLICY "Admins view all notification prefs"
ON public.staff_notification_prefs FOR SELECT TO authenticated
USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- WRITES ARE ADMIN-ONLY, and that is a decision worth stating. The brief asks for a matrix that
-- admins edit and staff see read-only: an operator who could turn off `sos.opened` push for
-- themselves could remove themselves from the escalation path silently, and this is a
-- life-safety product. When per-person self-service is wanted it should be scoped to the
-- non-safety event types, which is a policy decision and not this migration's to take.
CREATE POLICY "Admins manage notification prefs"
ON public.staff_notification_prefs FOR ALL TO authenticated
USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'))
WITH CHECK (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- ── one row per DEVICE, not per person ─────────────────────────────────────
CREATE TABLE public.staff_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- FCM registration tokens are per app instance. UNIQUE because the same token must never be
  -- attached to two staff rows: on a shared tablet the second person to enable notifications
  -- would otherwise receive the first person's alerts.
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'ios', 'android')),

  -- Refreshed on every registration, so a device that has not opened the app for months can be
  -- pruned deliberately rather than guessed at.
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- What the operator would recognise as "my phone" in a list of devices.
  label text
);

CREATE INDEX idx_staff_push_tokens_staff ON public.staff_push_tokens (staff_id);

COMMENT ON TABLE public.staff_push_tokens IS
  'FCM registration tokens, one row per DEVICE. Replaces the push_token column '
  'src/hooks/usePushNotifications.ts writes to notification_settings — a column that no '
  'migration ever created, on a table keyed one-row-per-user, for a value that belongs to a '
  'phone. Invalid tokens are pruned by notify-staff when FCM rejects them.';

ALTER TABLE public.staff_push_tokens ENABLE ROW LEVEL SECURITY;

-- A staff member registers and removes their OWN devices; that is the whole client flow.
CREATE POLICY "Staff manage their own push tokens"
ON public.staff_push_tokens FOR ALL TO authenticated
USING (staff_id = public.get_staff_id(auth.uid()))
WITH CHECK (staff_id = public.get_staff_id(auth.uid()));

-- Admins SEE devices (the notifications screen shows who can be reached on a phone) but do not
-- write them: a token an admin typed in is a token nobody can prove belongs to that device.
CREATE POLICY "Admins view all push tokens"
ON public.staff_push_tokens FOR SELECT TO authenticated
USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- ── notification_log learns which channel a row is about ───────────────────
ALTER TABLE public.notification_log
  -- 'bell' for everything that came before, because that is what those rows are: the lead
  -- trigger's per-staff rows and notify-admin's WhatsApp attempts both render in the bell
  -- today. New router rows name their real channel and stay out of the bell.
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'bell'
    CHECK (channel IN ('bell', 'sms', 'whatsapp', 'push', 'email')),
  -- The number, address or token this attempt went to. Not a phone book: it is what makes
  -- "sent, but where?" answerable when somebody says they got nothing.
  ADD COLUMN IF NOT EXISTS recipient text,
  -- Retries must not double-send. The router computes one key per (event, entity) and the
  -- partial unique index below refuses the second attempt on the same channel to the same place.
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_idempotent_send
  ON public.notification_log (idempotency_key, channel, recipient)
  WHERE idempotency_key IS NOT NULL AND status = 'sent';

COMMENT ON INDEX public.notification_log_idempotent_send IS
  'One SENT row per event per channel per recipient. Partial on status = ''sent'' so a failed '
  'attempt can legitimately be retried, and partial on idempotency_key so every pre-existing '
  'row (and every bell row) is unaffected.';

-- The bell's own query: recipient + unread, newest first.
CREATE INDEX IF NOT EXISTS idx_notification_log_bell
  ON public.notification_log (admin_user_id, created_at DESC)
  WHERE channel = 'bell';

COMMENT ON COLUMN public.notification_log.channel IS
  'Which transport this row is about. ''bell'' is an in-app notification a human reads; the '
  'other four are delivery attempts and are deliberately NOT shown in the bell — before this '
  'column, notify-admin''s WhatsApp attempts appeared there as if they were messages for the '
  'reader.';

-- ── the transport switch push has been missing ─────────────────────────────
-- The other three were seeded false by 20260907100200 for the reason its comment gives: a
-- channel is off because somebody wrote off, not because a lookup missed. Push joins them.
INSERT INTO public.system_settings (key, value) VALUES ('notify_channel_push', 'false')
ON CONFLICT (key) DO NOTHING;

-- ── the default policy, as ROWS ────────────────────────────────────────────
-- Lee's policy, verbatim: `sale.paid` and `lead.new` ALWAYS reach admins on every live channel;
-- ALL staff get an email for every `sale.paid`; `payment.failed` and `isabella.down` go to
-- admins; `sos.*` push to all staff. Everything else exists as an OFF row, so the admin matrix
-- has something to toggle and nothing is decided in code.
INSERT INTO public.notification_routes (event_type, channel, enabled) VALUES
  -- Lee's policy: a paid sale and a new enquiry reach admins on EVERY channel.
  ('sale.paid', 'sms', true), ('sale.paid', 'whatsapp', true), ('sale.paid', 'push', true), ('sale.paid', 'email', true),
  ('lead.new', 'sms', true), ('lead.new', 'whatsapp', true), ('lead.new', 'push', true), ('lead.new', 'email', true),
  ('payment.failed', 'sms', true), ('payment.failed', 'whatsapp', true), ('payment.failed', 'push', true), ('payment.failed', 'email', true),
  ('isabella.down', 'sms', false), ('isabella.down', 'whatsapp', false), ('isabella.down', 'push', true), ('isabella.down', 'email', true),
  ('subscription.cancelled', 'sms', false), ('subscription.cancelled', 'whatsapp', true), ('subscription.cancelled', 'push', true), ('subscription.cancelled', 'email', true),
  -- An alert is push. SMS on every SOS would be a per-message bill on the busiest event we have.
  ('sos.opened', 'sms', false), ('sos.opened', 'whatsapp', false), ('sos.opened', 'push', true), ('sos.opened', 'email', false),
  ('sos.unassigned', 'sms', false), ('sos.unassigned', 'whatsapp', false), ('sos.unassigned', 'push', true), ('sos.unassigned', 'email', false),
  ('device.offline', 'sms', false), ('device.offline', 'whatsapp', false), ('device.offline', 'push', true), ('device.offline', 'email', true),
  -- The eleven from notify-admin, seeded to the channel it already used (WhatsApp) plus push,
  -- so migrating its path onto the router changes nothing about who hears what today.
  ('partner.joined', 'sms', false), ('partner.joined', 'whatsapp', true), ('partner.joined', 'push', true), ('partner.joined', 'email', true),
  ('hot.sales', 'sms', false), ('hot.sales', 'whatsapp', true), ('hot.sales', 'push', true), ('hot.sales', 'email', false),
  ('ev07b.alert', 'sms', false), ('ev07b.alert', 'whatsapp', true), ('ev07b.alert', 'push', true), ('ev07b.alert', 'email', true),
  ('shift.no_show', 'sms', false), ('shift.no_show', 'whatsapp', true), ('shift.no_show', 'push', true), ('shift.no_show', 'email', false),
  ('shift.no_coverage', 'sms', false), ('shift.no_coverage', 'whatsapp', true), ('shift.no_coverage', 'push', true), ('shift.no_coverage', 'email', false),
  ('shift.disconnected', 'sms', false), ('shift.disconnected', 'whatsapp', true), ('shift.disconnected', 'push', true), ('shift.disconnected', 'email', false),
  -- THE FOUR THE ROUTER SENDS REGARDLESS. These rows are true so the data agrees with the
  -- behaviour — a switch an admin can flip that changes nothing is a false affordance, and the
  -- notifications screen renders these as always-on rather than as switches.
  ('system.runner_failure', 'sms', true), ('system.runner_failure', 'whatsapp', true), ('system.runner_failure', 'push', true), ('system.runner_failure', 'email', true),
  ('escalation.call_failed', 'sms', true), ('escalation.call_failed', 'whatsapp', true), ('escalation.call_failed', 'push', true), ('escalation.call_failed', 'email', true),
  ('escalation.no_emergency_contacts', 'sms', true), ('escalation.no_emergency_contacts', 'whatsapp', true), ('escalation.no_emergency_contacts', 'push', true), ('escalation.no_emergency_contacts', 'email', true),
  ('escalation.contacts_not_notified', 'sms', true), ('escalation.contacts_not_notified', 'whatsapp', true), ('escalation.contacts_not_notified', 'push', true), ('escalation.contacts_not_notified', 'email', true),
  -- The test button must be able to exercise any channel, or it proves nothing about the one
  -- somebody is trying to debug.
  ('test', 'sms', true), ('test', 'whatsapp', true), ('test', 'push', true), ('test', 'email', true)
ON CONFLICT (event_type, channel) DO NOTHING;

/*
  Seed one staff member's 32 rows to the policy above.

  A FUNCTION, so the same rule serves the backfill below and the trigger for staff hired
  tomorrow. Without the trigger, "every default is a row" quietly becomes "every default is a
  row for the people who happened to exist on 9 September" — and the next operator hired would
  receive nothing at all, which looks exactly like a broken router.

  ON CONFLICT DO NOTHING, never DO UPDATE: re-running this must not undo a switch an admin has
  turned off. A default is what somebody gets before they decide, not a decision that keeps
  reasserting itself.
*/
CREATE OR REPLACE FUNCTION public.seed_staff_notification_prefs(p_staff_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_is_admin boolean;
  v_inserted integer;
BEGIN
  SELECT role INTO v_role FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seed_staff_notification_prefs: no staff %', p_staff_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_is_admin := v_role IN ('admin', 'super_admin');

  INSERT INTO public.staff_notification_prefs (staff_id, event_type, channel, enabled)
  SELECT
    p_staff_id,
    r.event_type,
    r.channel,
    CASE
      -- An admin gets everything the company has switched on. Lee and Martijn are admins, so
      -- this is the "seeded on for everything" line in the brief — by role, because seeding by
      -- name would need two email literals in a migration and would miss the third admin.
      WHEN v_is_admin THEN r.enabled
      -- Every staff member gets an EMAIL for every paid sale: Lee's instruction, and the one
      -- channel where a whole team receiving it costs nothing.
      WHEN r.event_type = 'sale.paid' AND r.channel = 'email' THEN true
      -- An alert is everybody's business, and push is the only channel fast enough to matter.
      WHEN r.event_type LIKE 'sos.%' AND r.channel = 'push' THEN true
      -- The four that say the safety machinery has failed. The router ignores this table for
      -- them (ALWAYS_LOUD), and the rows are seeded ON so the matrix does not display an
      -- operator as opted out of something they will be sent regardless.
      WHEN r.event_type = 'system.runner_failure' OR r.event_type LIKE 'escalation.%' THEN r.enabled
      ELSE false
    END
  FROM public.notification_routes r
  ON CONFLICT (staff_id, event_type, channel) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

COMMENT ON FUNCTION public.seed_staff_notification_prefs(uuid) IS
  'Writes one staff member''s default notification preference rows from notification_routes + '
  'Lee''s policy. Idempotent and never overwrites an existing row: a default is what somebody '
  'gets before they decide, not a decision that keeps reasserting itself.';

REVOKE ALL ON FUNCTION public.seed_staff_notification_prefs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_staff_notification_prefs(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_staff_notification_prefs(uuid) TO service_role;

-- New staff arrive with the same defaults as everybody else.
CREATE OR REPLACE FUNCTION public.seed_notification_prefs_for_new_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_staff_notification_prefs(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS seed_notification_prefs_for_new_staff ON public.staff;
CREATE TRIGGER seed_notification_prefs_for_new_staff
  AFTER INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_notification_prefs_for_new_staff();

-- ── backfill: everybody who already works here ─────────────────────────────
DO $$
DECLARE s record; n integer := 0;
BEGIN
  FOR s IN SELECT id FROM public.staff LOOP
    n := n + public.seed_staff_notification_prefs(s.id);
  END LOOP;
  RAISE NOTICE 'seeded % notification preference rows across existing staff', n;
END $$;
