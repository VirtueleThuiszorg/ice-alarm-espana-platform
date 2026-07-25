-- COPY FIX (AI-strip follow-up, 2026-07-25): the seeded pendant product's
-- public short description still said the SOS button "connects you to
-- Isabella instantly" — the AI-answers-your-emergency narrative that was
-- stripped from every public surface. The real flow is human-first: the
-- button connects to our call-centre team. This rewrites the row to match.
--
-- Guarded: only touches the row if it still contains the old Isabella copy,
-- so a description an admin has already corrected in prod is left alone.
-- (The original seed, 20260420090100, is applied history and stays as-is.)

UPDATE public.products
SET short_description_i18n = '{
  "en": "Wear it as a pendant or on your wrist. One press of the button connects you directly to our care team.",
  "es": "Llévelo como colgante o en la muñeca. Con solo pulsar el botón, conecta directamente con nuestro equipo de atención.",
  "nl": "Draag het als hanger of om uw pols. Eén druk op de knop verbindt u direct met ons zorgteam."
}'::jsonb
WHERE slug = 'pendant'
  AND short_description_i18n::text ILIKE '%isabella%';

-- Rollback: restore the previous seeded text (not recommended — it names the
-- AI as the emergency responder, which is not the real flow):
--   UPDATE public.products
--   SET short_description_i18n = '{"en": "Wear it as a pendant or on your wrist. One button connects you to Isabella instantly.", "es": "Llévelo como colgante o en la muñeca. Un botón le conecta con Isabella al instante.", "nl": "Draag het als hanger of om uw pols. Eén druk op de knop verbindt u direct met Isabella."}'::jsonb
--   WHERE slug = 'pendant';
