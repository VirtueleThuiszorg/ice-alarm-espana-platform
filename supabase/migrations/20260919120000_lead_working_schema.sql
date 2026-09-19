-- WORKING A LEAD: the schema for adding one by hand and then introducing ICE Alarm to them.
--
-- `leads` has, until now, been a place enquiries ARRIVE. Nothing could be added to it by a staff
-- member who took a phone call or met somebody at an event, and nothing recorded what was said
-- to a lead afterwards — so the answer to "has anyone rung Rosa?" was whatever the last person
-- to open the record happened to have typed in the free-text notes box.
--
-- One migration for the whole feature on purpose. The drift gate applies migrations one at a
-- time (and is right to), so splitting this across the five PRs that use it would serialise them
-- behind each other for no benefit. Everything here is inert until code reads it.

-- ── 1. the status ladder ────────────────────────────────────────────────────
--
-- new → contacted → interested → join_link_sent → joined | not_interested | unreachable
--
-- THE THREE LEGACY VALUES ARE RENAMED, NOT KEPT ALONGSIDE. `qualified`, `lost` and `converted`
-- mean exactly what `interested`, `not_interested` and `joined` mean; keeping both would give
-- every list filter two names for one thing, and the day somebody filters on `not_interested`
-- and misses the `lost` rows is the day a person who asked not to be contacted gets contacted.
--
-- The UPDATEs run BEFORE the constraint, and count what they touched, because a migration that
-- silently rewrites rows is one nobody can check afterwards.
DO $$
DECLARE n_q int; n_l int; n_c int;
BEGIN
  UPDATE public.leads SET status = 'interested'     WHERE status = 'qualified';
  GET DIAGNOSTICS n_q = ROW_COUNT;
  UPDATE public.leads SET status = 'not_interested' WHERE status = 'lost';
  GET DIAGNOSTICS n_l = ROW_COUNT;
  UPDATE public.leads SET status = 'joined'         WHERE status = 'converted';
  GET DIAGNOSTICS n_c = ROW_COUNT;
  RAISE NOTICE 'lead status ladder: % qualified→interested, % lost→not_interested, % converted→joined',
               n_q, n_l, n_c;
END $$;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_ladder;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_ladder CHECK (
    status IN ('new', 'contacted', 'interested', 'join_link_sent',
               'joined', 'not_interested', 'unreachable')
  ) NOT VALID;

COMMENT ON CONSTRAINT leads_status_ladder ON public.leads IS
  'new → contacted → interested → join_link_sent → joined | not_interested | unreachable. '
  'NOT VALID: the three legacy values are renamed above, but a row carrying something else that '
  'nobody here can see must not fail the migration. Validate once the count is zero.';

-- ── 2. what a hand-added lead carries that an arriving one does not ─────────

ALTER TABLE public.leads
  -- Who typed it in. `assigned_to` is who is WORKING it and can be reassigned; this never moves.
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  -- CONSENT IS A TIMESTAMP, NOT A BOOLEAN. "Did they agree?" is worth less than "when, and how
  -- did we come to be talking to them" — which is the question asked a year later by somebody
  -- who is not in the room. A tick box that stores `true` cannot answer it.
  ADD COLUMN IF NOT EXISTS contact_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_source text,
  -- walk_in | phone_call | event | member_referral | partner_code | other
  ADD COLUMN IF NOT EXISTS heard_about text,
  -- THE ONE FLAG EVERY SEND PATH MUST CHECK. Set when a lead says no. It is deliberately a
  -- separate column from `status = 'not_interested'`: a status is a stage somebody can move a
  -- record back out of with a dropdown, and "do not write to this person again" must not be
  -- undone by a mis-click on a status button.
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  -- The personal join link's token. UNIQUE because it is looked up by itself.
  ADD COLUMN IF NOT EXISTS join_token text,
  ADD COLUMN IF NOT EXISTS join_token_expires_at timestamptz,
  -- Denormalised from lead_communications so the LIST can show "last contact" without a
  -- per-row subquery. Written by the trigger below, never by hand.
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_channel text,
  -- Who moved it, and when. The brief's "Status buttons record who/when".
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  -- Set the first time the follow-up bell rings for a lead, so it rings ONCE and not every day
  -- the lead sits there. Cleared by the trigger below whenever anybody contacts them again.
  ADD COLUMN IF NOT EXISTS followup_bell_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_join_token
  ON public.leads (join_token) WHERE join_token IS NOT NULL;

-- The follow-up filter's query: an open lead, not silenced, ordered by how long it has waited.
CREATE INDEX IF NOT EXISTS idx_leads_followup
  ON public.leads (status, last_contacted_at)
  WHERE status IN ('contacted', 'interested', 'join_link_sent') AND NOT do_not_contact;

COMMENT ON COLUMN public.leads.do_not_contact IS
  'The person asked not to be contacted. Every send path refuses on it, including a staff '
  'member pressing Email. Separate from status on purpose: a status is a stage a dropdown can '
  'move a record out of, and this must not be undone by a mis-click.';

COMMENT ON COLUMN public.leads.contact_consent_at IS
  'When the person agreed to be contacted, with consent_source saying how we came to be talking '
  'to them. A timestamp rather than a boolean because the question asked a year later is "when, '
  'and on what basis", which `true` cannot answer.';

-- ── 3. what was actually said to them ──────────────────────────────────────
--
-- The same reasoning as `member_notification_log` (20260907100200): sends are recorded by the
-- edge functions under the service role, and there is NO insert policy for `authenticated`. A
-- client that could write this table could fabricate a record of having contacted somebody.
--
-- A SKIP IS A ROW. "The SMS channel is off" and "we never tried" are different facts, and the
-- one that gets a product into trouble is the second one wearing the first one's clothes.

CREATE TABLE IF NOT EXISTS public.lead_communications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel     public.notification_channel NOT NULL,
  -- The notification_templates.event_key used, e.g. 'lead.intro_sms'. Null for a logged call,
  -- which has no template.
  template    text,
  staff_id    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  -- The delivery.ts vocabulary, unchanged: sent | failed | skipped_channel_off |
  -- skipped_not_configured | skipped_no_address | skipped_do_not_contact.
  outcome     text NOT NULL,
  -- Twilio SID, Resend id — whatever the transport gave back. Null on a skip.
  provider_id text,
  -- Why it was skipped or how it failed, for the person reading the timeline.
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_communications_lead
  ON public.lead_communications (lead_id, created_at DESC);

ALTER TABLE public.lead_communications ENABLE ROW LEVEL SECURITY;

-- Wrapped in a SELECT so the planner resolves the reader once per query rather than once per
-- row — the same rule migration 20260911180000 put on every other policy.
CREATE POLICY "Staff read lead communications"
  ON public.lead_communications FOR SELECT
  TO authenticated
  USING ((SELECT public.is_staff((SELECT auth.uid()))));

CREATE POLICY "Service role manages lead communications"
  ON public.lead_communications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.lead_communications IS
  'Every attempt to contact a lead, including the ones that were skipped. Written by the edge '
  'functions under the service role; no authenticated INSERT policy, because a record of what '
  'was said to whom is evidence rather than convenience.';

-- ── 4. the list column, kept true by a trigger rather than by callers ──────
--
-- `last_contacted_at` could be written by whichever function did the sending. It is done here
-- instead because there will be more than one such caller — intro, follow-up, a logged call —
-- and the first one to forget would make the follow-up filter show a lead that was contacted
-- yesterday.
--
-- ONLY A REAL SEND COUNTS. A row recording "the SMS channel is off" must not reset the clock:
-- the person has still not heard from us, which is the entire question the filter asks.

CREATE OR REPLACE FUNCTION public.touch_lead_last_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.outcome = 'sent' THEN
    UPDATE public.leads
       SET last_contacted_at     = NEW.created_at,
           last_contact_channel  = NEW.channel::text,
           -- A fresh contact re-arms the follow-up bell for the next quiet spell.
           followup_bell_sent_at = NULL
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touch_lead_last_contact ON public.lead_communications;
CREATE TRIGGER touch_lead_last_contact
  AFTER INSERT ON public.lead_communications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_lead_last_contact();

-- ── 4b. an operator can pick up a lead nobody has picked up ────────────────
--
-- FOUND BY THE ISOLATION SUITE while adding the assertions for this feature, and it is a live
-- defect rather than a gap in the new work.
--
-- "Staff can update assigned leads" (January) reads:
--
--     USING (is_staff(auth.uid()) AND assigned_to IN (SELECT id FROM staff WHERE user_id = auth.uid()))
--
-- Every lead that arrives from the contact form has `assigned_to = NULL`. So a call-centre
-- operator could not move ANY of them: not to `contacted`, not to `not_interested`, not at all.
-- RLS turns a forbidden UPDATE into zero rows rather than an error, and both Leads pages show a
-- success toast on `error === null` — so the button appeared to work, the list refreshed
-- unchanged, and the only symptom was a status that would not stick. Admins never saw it,
-- because "Admins can manage leads" covers them.
--
-- THE REPLACEMENT IS DELIBERATELY NARROW. Unassigned OR mine — an operator may pick up work
-- nobody has taken, and may hand a lead to a colleague, but may NOT take one off a colleague
-- who is already working it. That last part is why this is not simply `is_staff`.
--
-- Wrapped in SELECTs so the reader is resolved once per query rather than once per row.

DROP POLICY IF EXISTS "Staff can update assigned leads" ON public.leads;

CREATE POLICY "Staff work leads that are theirs or nobody's"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_staff((SELECT auth.uid())))
    AND (
      assigned_to IS NULL
      OR assigned_to IN (SELECT id FROM public.staff WHERE user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK ((SELECT public.is_staff((SELECT auth.uid()))));

COMMENT ON POLICY "Staff work leads that are theirs or nobody's" ON public.leads IS
  'Unassigned or mine. Replaces "Staff can update assigned leads", under which a call-centre '
  'operator could not move ANY contact-form lead, because those arrive unassigned — the button '
  'matched zero rows and the page said it had worked. Taking a lead off a colleague who is '
  'already working it is still refused.';

-- ── 5. how long is too long ────────────────────────────────────────────────
--
-- ON CONFLICT DO NOTHING: re-applying a migration must not reset a number somebody has changed.
INSERT INTO public.system_settings (key, value)
VALUES ('lead_followup_days', '3')
ON CONFLICT (key) DO NOTHING;

-- ── rollback ────────────────────────────────────────────────────────────────
-- The status rename is the only part that is not a clean drop; it is reversed first.
--
-- UPDATE public.leads SET status = 'qualified' WHERE status = 'interested';
-- UPDATE public.leads SET status = 'lost'      WHERE status = 'not_interested';
-- UPDATE public.leads SET status = 'converted' WHERE status = 'joined';
-- ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_ladder;
-- DROP POLICY IF EXISTS "Staff work leads that are theirs or nobody's" ON public.leads;
-- CREATE POLICY "Staff can update assigned leads" ON public.leads FOR UPDATE
--   USING (is_staff(auth.uid()) AND (assigned_to IN (SELECT id FROM staff WHERE user_id = auth.uid())));
-- DROP TRIGGER IF EXISTS touch_lead_last_contact ON public.lead_communications;
-- DROP FUNCTION IF EXISTS public.touch_lead_last_contact();
-- DROP TABLE IF EXISTS public.lead_communications;
-- ALTER TABLE public.leads
--   DROP COLUMN IF EXISTS created_by,
--   DROP COLUMN IF EXISTS contact_consent_at,
--   DROP COLUMN IF EXISTS consent_source,
--   DROP COLUMN IF EXISTS heard_about,
--   DROP COLUMN IF EXISTS do_not_contact,
--   DROP COLUMN IF EXISTS join_token,
--   DROP COLUMN IF EXISTS join_token_expires_at,
--   DROP COLUMN IF EXISTS last_contacted_at,
--   DROP COLUMN IF EXISTS last_contact_channel,
--   DROP COLUMN IF EXISTS status_changed_by,
--   DROP COLUMN IF EXISTS status_changed_at,
--   DROP COLUMN IF EXISTS followup_bell_sent_at;
-- DELETE FROM public.system_settings WHERE key = 'lead_followup_days';

-- ── 6. what we say to a lead ───────────────────────────────────────────────
--
-- (Appended after the rollback block on purpose: it is the one part of this migration a person
-- will come back to edit, and burying it above the rollback would hide it.)
--
-- EDITABLE WITHOUT A DEPLOY. These rows are the text; Admin → Settings → Notifications edits
-- them. Seeded ON CONFLICT DO NOTHING so re-applying never overwrites wording somebody has
-- since improved — the same rule the fulfilment templates follow (20260907120000).
--
-- PLACEHOLDERS: {{first_name}}, {{staff_name}}, {{join_link}}, {{phone_24h}}. An unknown one is
-- left visible by `renderTemplate` rather than blanked, so a typo shows up as `{{nombre}}` in a
-- preview instead of a silent gap.
--
-- WHY THE STAFF MEMBER'S NAME IS IN EVERY ONE. This message arrives on the phone of somebody in
-- their seventies or eighties, often a day or two after a conversation at a market stall or on
-- the telephone. "ICE Alarm España" alone is a company they have heard of once; "this is Ana,
-- we spoke on Tuesday" is a person they remember. It is also what makes the message not look
-- like a scam, which is the single biggest reason a text about signing up for something goes
-- unanswered by this readership.
--
-- WHY THE 24-HOUR NUMBER IS IN EVERY ONE. Half of these people will not click a link at all.
-- The number is the alternative route, and it is the company's own advertised number, so it is
-- also the thing they can check independently before trusting the link.
--
-- SMS AND WHATSAPP CARRY THE SAME TEXT. They are different transports for one message, and two
-- wordings would drift. Kept inside two GSM segments (320 characters) including the URL — a
-- third segment costs money for nothing — and asserted in the tests rather than trusted.

INSERT INTO public.notification_templates (event_key, channel, locale, subject, body) VALUES

  -- ── the introduction ─────────────────────────────────────────────────────
  ('lead.intro_sms', 'sms', 'en', NULL,
   'ICE Alarm España: hello {{first_name}}, this is {{staff_name}}. Here is how to join us: {{join_link}} — or call {{phone_24h}} any time and we will do it with you.'),
  ('lead.intro_sms', 'sms', 'es', NULL,
   'ICE Alarm España: hola {{first_name}}, soy {{staff_name}}. Aquí puede darse de alta: {{join_link}} — o llame al {{phone_24h}} a cualquier hora y lo hacemos juntos.'),
  ('lead.intro_sms', 'sms', 'nl', NULL,
   'ICE Alarm España: hallo {{first_name}}, met {{staff_name}}. Hier kunt u zich aanmelden: {{join_link}} — of bel {{phone_24h}}, dag en nacht, dan doen we het samen.'),

  ('lead.intro_whatsapp', 'whatsapp', 'en', NULL,
   'ICE Alarm España: hello {{first_name}}, this is {{staff_name}}. Here is how to join us: {{join_link}} — or call {{phone_24h}} any time and we will do it with you.'),
  ('lead.intro_whatsapp', 'whatsapp', 'es', NULL,
   'ICE Alarm España: hola {{first_name}}, soy {{staff_name}}. Aquí puede darse de alta: {{join_link}} — o llame al {{phone_24h}} a cualquier hora y lo hacemos juntos.'),
  ('lead.intro_whatsapp', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: hallo {{first_name}}, met {{staff_name}}. Hier kunt u zich aanmelden: {{join_link}} — of bel {{phone_24h}}, dag en nacht, dan doen we het samen.'),

  ('lead.intro_email', 'email', 'en', 'Joining ICE Alarm España',
   'Hello {{first_name}},

Thank you for your interest in ICE Alarm España. I am {{staff_name}}, and I will be looking after you.

What we do, briefly: you wear a small pendant or watch. If you press it — a fall, a turn, anything at all — it reaches a real person here who speaks your language, day or night. We stay with you, call whoever you want us to call, and speak to 112 for you if that is what is needed.

You can join here:

{{join_link}}

It takes about ten minutes, and you do not have to finish it in one go.

If you would rather do it over the telephone, or you simply want to ask something first, call us on {{phone_24h}}. That number is answered 24 hours a day, and asking a question costs nothing.

{{staff_name}}
ICE Alarm España'),

  ('lead.intro_email', 'email', 'es', 'Darse de alta en ICE Alarm España',
   'Hola {{first_name}}:

Gracias por su interés en ICE Alarm España. Soy {{staff_name}} y me ocuparé de usted personalmente.

En pocas palabras: usted lleva un pequeño colgante o un reloj. Si lo pulsa — una caída, un mareo, lo que sea — le responde una persona real de aquí, que habla su idioma, de día y de noche. Nos quedamos con usted, avisamos a quien usted nos diga y hablamos con el 112 por usted si hace falta.

Puede darse de alta aquí:

{{join_link}}

Son unos diez minutos, y no hace falta terminarlo de una sola vez.

Si prefiere hacerlo por teléfono, o simplemente quiere preguntar algo antes, llámenos al {{phone_24h}}. Ese número se atiende las 24 horas, y preguntar no cuesta nada.

Un saludo,
{{staff_name}}
ICE Alarm España'),

  ('lead.intro_email', 'email', 'nl', 'Aanmelden bij ICE Alarm España',
   'Hallo {{first_name}},

Dank u voor uw belangstelling voor ICE Alarm España. Ik ben {{staff_name}} en ik ben uw vaste contactpersoon.

Kort gezegd: u draagt een kleine alarmknop of een horloge. Drukt u erop — een val, een duizeling, wat dan ook — dan krijgt u een echt mens hier aan de lijn, die uw taal spreekt, dag en nacht. Wij blijven bij u, bellen wie u wilt dat we bellen, en praten zo nodig met 112 voor u.

U kunt zich hier aanmelden:

{{join_link}}

Het duurt ongeveer tien minuten en u hoeft het niet in één keer af te maken.

Wilt u het liever telefonisch doen, of eerst iets vragen? Bel ons op {{phone_24h}}. Dat nummer wordt 24 uur per dag beantwoord, en vragen kost niets.

Met vriendelijke groet,
{{staff_name}}
ICE Alarm España'),

  -- ── the follow-up ────────────────────────────────────────────────────────
  --
  -- ONE NUDGE, AND IT APOLOGISES FOR ITSELF. "No rush" is in all three because the alternative
  -- reading of a second message about money is pressure, and pressure is what makes somebody
  -- this age stop answering the phone to a number they half-recognise.
  ('lead.followup_sms', 'sms', 'en', NULL,
   'ICE Alarm España: hello {{first_name}}, {{staff_name}} here. Just checking the link reached you: {{join_link}}. No rush at all — call {{phone_24h}} if you would like to talk it through.'),
  ('lead.followup_sms', 'sms', 'es', NULL,
   'ICE Alarm España: hola {{first_name}}, soy {{staff_name}}. Solo por si no le llegó el enlace: {{join_link}}. Sin ninguna prisa — llame al {{phone_24h}} si quiere comentarlo.'),
  ('lead.followup_sms', 'sms', 'nl', NULL,
   'ICE Alarm España: hallo {{first_name}}, {{staff_name}} hier. Even checken of de link is aangekomen: {{join_link}}. Geen haast — bel {{phone_24h}} als u het wilt bespreken.'),

  ('lead.followup_whatsapp', 'whatsapp', 'en', NULL,
   'ICE Alarm España: hello {{first_name}}, {{staff_name}} here. Just checking the link reached you: {{join_link}}. No rush at all — call {{phone_24h}} if you would like to talk it through.'),
  ('lead.followup_whatsapp', 'whatsapp', 'es', NULL,
   'ICE Alarm España: hola {{first_name}}, soy {{staff_name}}. Solo por si no le llegó el enlace: {{join_link}}. Sin ninguna prisa — llame al {{phone_24h}} si quiere comentarlo.'),
  ('lead.followup_whatsapp', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: hallo {{first_name}}, {{staff_name}} hier. Even checken of de link is aangekomen: {{join_link}}. Geen haast — bel {{phone_24h}} als u het wilt bespreken.'),

  ('lead.followup_email', 'email', 'en', 'Did our link reach you?',
   'Hello {{first_name}},

{{staff_name}} here, from ICE Alarm España. I sent you a link to join us a few days ago and wanted to check it arrived — links do sometimes end up in a junk folder.

Here it is again:

{{join_link}}

There is genuinely no hurry, and no obligation. If you have decided it is not for you, just say so and I will not write again. If you would like to go through it together on the telephone, call {{phone_24h}} at any hour and ask for me.

{{staff_name}}
ICE Alarm España'),

  ('lead.followup_email', 'email', 'es', '¿Le llegó nuestro enlace?',
   'Hola {{first_name}}:

Soy {{staff_name}}, de ICE Alarm España. Hace unos días le envié un enlace para darse de alta y quería comprobar que le llegó — a veces acaban en la carpeta de correo no deseado.

Aquí lo tiene de nuevo:

{{join_link}}

No hay ninguna prisa ni ningún compromiso. Si ha decidido que no le interesa, dígamelo y no volveré a escribirle. Y si prefiere que lo veamos juntos por teléfono, llame al {{phone_24h}} a cualquier hora y pregunte por mí.

Un saludo,
{{staff_name}}
ICE Alarm España'),

  ('lead.followup_email', 'email', 'nl', 'Is onze link aangekomen?',
   'Hallo {{first_name}},

{{staff_name}} hier, van ICE Alarm España. Een paar dagen geleden stuurde ik u een link om u aan te melden, en ik wilde even checken of die is aangekomen — links belanden soms in de map ongewenste post.

Hier is hij nog een keer:

{{join_link}}

Er is echt geen haast en geen enkele verplichting. Als u besloten heeft dat het niets voor u is, laat het weten en dan schrijf ik u niet meer. Wilt u het liever samen telefonisch doorlopen, bel dan {{phone_24h}} — op elk uur — en vraag naar mij.

Met vriendelijke groet,
{{staff_name}}
ICE Alarm España')

ON CONFLICT (event_key, channel, locale) DO NOTHING;

-- rollback for §6:
-- DELETE FROM public.notification_templates WHERE event_key LIKE 'lead.%';
