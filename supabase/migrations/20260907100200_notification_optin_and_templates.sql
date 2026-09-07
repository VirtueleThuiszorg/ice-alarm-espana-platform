-- WP3 — per-member, per-channel notification consent, templates, and a delivery record.
--
-- WHAT ALREADY EXISTS, AND WHY IT IS NOT THIS. `notification_settings` and `notification_log`
-- (20260123171850) are keyed on `admin_user_id`: they are the ADMIN's own alert preferences
-- ("WhatsApp me when a sale lands"), not the member's. `email_templates` is email-only.
-- `member_contact_methods` holds addresses but says nothing about permission to use them.
-- So there is today no answer at all to "may we send this member a WhatsApp?" — which is the
-- question D7's per-channel rollout and D8's opt-in link both need answered before they send.
--
-- THE THREE CHANNEL FLAGS ARE NOT SCHEMA. `notify_channel_sms`, `notify_channel_email` and
-- `notify_channel_whatsapp` are `system_settings` rows — key/value data, no migration needed
-- (PENDING_FOR_LEE.md §3). They are seeded here as `false` rather than left absent so that a
-- channel is OFF because somebody wrote OFF, not because a lookup missed. Turning one on is a
-- table edit Lee makes, and stays his decision.
--
-- TWO GATES, DELIBERATELY. A message sends only if the CHANNEL is on globally (Lee's flag,
-- above) AND the MEMBER has opted in to that channel (this table). Either alone is wrong: a
-- global flag with no per-member consent sends to people who never agreed; per-member consent
-- with no global flag sends over a transport that has not been proven to deliver.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.member_notification_log;
--   DROP TABLE IF EXISTS public.member_notification_optin;
--   DROP TABLE IF EXISTS public.notification_templates;
--   DROP TYPE  IF EXISTS public.notification_channel;
--   DELETE FROM public.system_settings WHERE key LIKE 'notify_channel_%';
--   Drops no pre-existing data: every object is new here and the settings rows are seeded here.

CREATE TYPE public.notification_channel AS ENUM ('sms', 'email', 'whatsapp');

-- ── the member's permission, per channel ───────────────────────────────────
CREATE TABLE public.member_notification_optin (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  channel           public.notification_channel NOT NULL,
  opted_in          boolean NOT NULL DEFAULT false,

  -- The consent audit. Same shape and the same reasoning as care_access_grants: WHEN it was
  -- given and on WHAT FOOTING, so a later "we had permission" is checkable rather than
  -- asserted. `recorded_by_user_id` carries no FK on purpose — it is an audit field and must
  -- survive deletion of the account that performed the act.
  opted_in_at       timestamptz,
  recorded_by_user_id uuid,
  basis             public.consent_basis NOT NULL DEFAULT 'member_self',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT member_notification_optin_unique UNIQUE (member_id, channel),
  -- An opted-in row must say when. A row that claims consent with no timestamp is the kind of
  -- record that cannot be defended later, so the database refuses to hold one.
  CONSTRAINT member_notification_optin_timed
    CHECK (opted_in = false OR opted_in_at IS NOT NULL)
);

CREATE INDEX member_notification_optin_member_idx
  ON public.member_notification_optin(member_id);

ALTER TABLE public.member_notification_optin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their own notification opt-ins"
  ON public.member_notification_optin FOR SELECT TO authenticated
  USING (member_id = public.get_member_id(auth.uid()));

CREATE POLICY "Members set their own notification opt-ins"
  ON public.member_notification_optin FOR INSERT TO authenticated
  WITH CHECK (member_id = public.get_member_id(auth.uid()));

CREATE POLICY "Members change their own notification opt-ins"
  ON public.member_notification_optin FOR UPDATE TO authenticated
  USING (member_id = public.get_member_id(auth.uid()))
  WITH CHECK (member_id = public.get_member_id(auth.uid()));

CREATE POLICY "Staff view all notification opt-ins"
  ON public.member_notification_optin FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff record an opt-in given by the member"
  ON public.member_notification_optin FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

COMMENT ON TABLE public.member_notification_optin IS
  'Per-member, per-channel permission to send. One of the TWO gates on any send; the other is '
  'the global system_settings.notify_channel_* flag. Absent row means no permission.';

-- ── what we send ───────────────────────────────────────────────────────────
-- Templates are operational content, not member data: no member_id, and no member may read
-- them. Keyed by (event, channel, locale) because the same event says different things over
-- SMS and email, and this product ships EN + ES + NL (LAUNCH_SCOPE §6).
CREATE TABLE public.notification_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   text NOT NULL,
  channel     public.notification_channel NOT NULL,
  locale      text NOT NULL CHECK (locale IN ('en', 'es', 'nl')),
  subject     text,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_templates_unique UNIQUE (event_key, channel, locale)
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view notification templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins manage notification templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── what we actually sent ──────────────────────────────────────────────────
-- Deliberately NO insert/update/delete policy for `authenticated`. Sends are recorded by the
-- edge functions under the service role, which bypasses RLS. A client that could write this
-- table could fabricate a delivery record — and on a life-safety product the record of what
-- was sent to whom is evidence, not convenience. Same reasoning as partners having no INSERT
-- policy (PARTNER_JOURNEY.md §3.4).
CREATE TABLE public.member_notification_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid REFERENCES public.members(id) ON DELETE CASCADE,
  channel             public.notification_channel NOT NULL,
  event_key           text NOT NULL,
  -- 'sent' | 'failed' | 'skipped_channel_off' | 'skipped_no_optin'. A skip is RECORDED, never
  -- silent: GOALS.md G2 — a channel that is off is skipped and logged, never silently failed.
  status              text NOT NULL,
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX member_notification_log_member_idx
  ON public.member_notification_log(member_id, created_at DESC);

ALTER TABLE public.member_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their own notification history"
  ON public.member_notification_log FOR SELECT TO authenticated
  USING (member_id = public.get_member_id(auth.uid()));

CREATE POLICY "Staff view all notification history"
  ON public.member_notification_log FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

COMMENT ON TABLE public.member_notification_log IS
  'What was actually sent, or deliberately not sent, to a member. Written by edge functions '
  'under the service role only — there is no authenticated write path, by design.';

-- ── the three flags, present and OFF ───────────────────────────────────────
INSERT INTO public.system_settings (key, value) VALUES
  ('notify_channel_sms',      'false'),
  ('notify_channel_email',    'false'),
  ('notify_channel_whatsapp', 'false')
ON CONFLICT (key) DO NOTHING;
