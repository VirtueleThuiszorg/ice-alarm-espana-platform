-- ═══════════════════════════════════════════════════════════════════════════
-- One Twilio number became two, because one number cannot do both jobs
--
-- settings_twilio_phone_number was the SMS `From` in emergency-contact-notify
-- and the voice `callerId` in voice-handler. ICE Alarm's published number,
-- 950 473 199, is a geographic landline in Almería, and Spanish landlines
-- cannot send SMS — Twilio rejects the request with error 21614.
--
-- So with one setting there were only bad answers. Put the landline in it and
-- every emergency-contact alert stops leaving the building, quietly, on the
-- path that tells a family their mother has fallen. Put an SMS-capable mobile
-- in it and every escalation call arrives showing a number nobody recognises,
-- at three in the morning.
--
--   settings_twilio_sms_number       SMS-capable mobile (+34 6xx / 7xx)
--   settings_twilio_voice_caller_id  what people SEE when we ring — 950 473 199
--
-- The caller ID does not have to be a Twilio number: a verified outgoing caller
-- ID is accepted in <Dial callerId>, so the published line can stay on its
-- existing SIP service while the platform borrows its identity.
--
-- Seeded from the existing row so nothing changes on deploy. The edge functions
-- also fall back to the old key at runtime, so a database where this migration
-- has not run yet behaves exactly as it did before.
-- ═══════════════════════════════════════════════════════════════════════════

DO $twilio$
DECLARE
  legacy text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    RAISE NOTICE 'twilio-split: no system_settings table, nothing to seed';
    RETURN;
  END IF;

  SELECT value INTO legacy
  FROM public.system_settings
  WHERE key = 'settings_twilio_phone_number';

  -- Seed both from the old value. Whoever configures Twilio then changes the
  -- SMS one to a mobile; until they do, behaviour is identical to before.
  INSERT INTO public.system_settings (key, value)
  VALUES
    ('settings_twilio_sms_number',      COALESCE(legacy, '')),
    ('settings_twilio_voice_caller_id', COALESCE(legacy, ''))
  ON CONFLICT (key) DO NOTHING;

  IF legacy IS NULL OR legacy = '' THEN
    RAISE NOTICE 'twilio-split: no existing number to seed from — set both rows in Admin → Settings → Phone & SMS';
  ELSIF legacy ~ '^(\+34|0034|34)?[89][0-9]{8}$' THEN
    RAISE WARNING 'twilio-split: the existing number (%) looks like a Spanish landline. It is correct as the voice caller ID, but it CANNOT send SMS — set settings_twilio_sms_number to a mobile before going live, or emergency-contact alerts will fail silently.', legacy;
  ELSE
    RAISE NOTICE 'twilio-split: seeded both rows from %', legacy;
  END IF;
END
$twilio$;
