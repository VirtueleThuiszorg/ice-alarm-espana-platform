-- ACCURACY (public-claims sweep, 2026-07-25): the seeded pendant product's
-- public long description claimed the device is connected to our "24/7
-- nurse-led care centre" (en) / "centro de atención 24/7 dirigido por
-- enfermeras" (es). We employ no nurses: app_role is
-- super_admin | admin | call_centre | call_centre_supervisor, and Terms §3.2
-- explicitly states we do NOT provide medical care or medical advice.
-- "Nurse-led" is a clinical claim with regulatory weight in Spain, so it is
-- replaced with what is true — a trained response team. The nl value never
-- carried the claim; it is aligned to the same wording for consistency.
--
-- Guarded: the row is only rewritten while it still carries the clinical
-- claim, so a description already corrected in the admin catalog wins.
-- (The original seed, 20260420090100, is applied history and stays as-is.)

UPDATE public.products
SET long_description_i18n = '{
  "en": "The Care Conneqt GPS Pendant is your personal safety companion. Worn around the neck or on the wrist, it provides instant SOS alerts, real-time GPS tracking, automatic fall detection, and two-way voice communication — all connected to our trained response team, 24 hours a day. Waterproof, lightweight, and built for peace of mind.",
  "es": "El Colgante GPS Care Conneqt es su compañero de seguridad personal. Llevado al cuello o en la muñeca, proporciona alertas SOS instantáneas, seguimiento GPS en tiempo real, detección automática de caídas y comunicación de voz bidireccional — todo conectado a nuestro equipo de respuesta capacitado, 24 horas al día. Resistente al agua, ligero y diseñado para su tranquilidad.",
  "nl": "De Care Conneqt GPS Hanger is uw persoonlijke veiligheidspartner. Draag het om de nek of pols voor directe SOS-meldingen, real-time GPS-tracking, automatische valdetectie en tweerichtings spraakcommunicatie — allemaal verbonden met ons getrainde meldkamerteam, 24 uur per dag. Waterbestendig, lichtgewicht en gebouwd voor gemoedsrust."
}'::jsonb
WHERE slug = 'pendant'
  AND (
    long_description_i18n::text ILIKE '%nurse%'
    OR long_description_i18n::text ILIKE '%enfermera%'
  );

-- Rollback: re-apply the original seed's long_description_i18n from
-- 20260420090100_seed_product_catalog.sql. Not recommended — that text makes
-- a nurse-led clinical claim we cannot support.
