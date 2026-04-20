-- ============================================================
-- Seed product catalog with 3 products
-- ============================================================
-- Uses ON CONFLICT (slug) DO UPDATE for idempotency.
-- ============================================================

-- 1. GPS Pendant (active)
INSERT INTO public.products (
  name, slug, status, category, display_order,
  selling_price_net, selling_tax_rate, cost_price, is_active,
  hero_image_url,
  name_i18n,
  short_description_i18n,
  long_description_i18n,
  features_i18n
) VALUES (
  'Care Conneqt GPS Pendant',
  'pendant',
  'active',
  'Emergency',
  1,
  125.00, 0.21, 65.00, true,
  '/assets/pendant-product.png',
  '{"en": "Care Conneqt GPS Pendant", "es": "Colgante GPS Care Conneqt", "nl": "Care Conneqt GPS Hanger"}'::jsonb,
  '{"en": "Wear it as a pendant or on your wrist. One button connects you to Isabella instantly.", "es": "Llévelo como colgante o en la muñeca. Un botón le conecta con Isabella al instante.", "nl": "Draag het als hanger of om uw pols. Eén druk op de knop verbindt u direct met Isabella."}'::jsonb,
  '{"en": "The Care Conneqt GPS Pendant is your personal safety companion. Worn around the neck or on the wrist, it provides instant SOS alerts, real-time GPS tracking, automatic fall detection, and two-way voice communication — all connected to our 24/7 nurse-led care centre. Waterproof, lightweight, and built for peace of mind.", "es": "El Colgante GPS Care Conneqt es su compañero de seguridad personal. Llevado al cuello o en la muñeca, proporciona alertas SOS instantáneas, seguimiento GPS en tiempo real, detección automática de caídas y comunicación de voz bidireccional — todo conectado a nuestro centro de atención 24/7 dirigido por enfermeras. Resistente al agua, ligero y diseñado para su tranquilidad.", "nl": "De Care Conneqt GPS Hanger is uw persoonlijke veiligheidspartner. Draag het om de nek of pols voor directe SOS-meldingen, real-time GPS-tracking, automatische valdetectie en tweerichtings spraakcommunicatie — allemaal verbonden met ons 24/7 zorgcentrum. Waterbestendig, lichtgewicht en gebouwd voor gemoedsrust."}'::jsonb,
  '{"en": ["SOS emergency button", "Real-time GPS tracking", "Automatic fall detection", "Two-way voice communication", "Geo-fencing alerts", "Long battery life", "Waterproof design"], "es": ["Botón de emergencia SOS", "Seguimiento GPS en tiempo real", "Detección automática de caídas", "Comunicación de voz bidireccional", "Alertas de geo-cercado", "Larga duración de batería", "Diseño resistente al agua"], "nl": ["SOS-noodknop", "Real-time GPS-tracking", "Automatische valdetectie", "Tweerichtings spraak", "Geo-fencing meldingen", "Lange batterijduur", "Waterdicht ontwerp"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  hero_image_url = EXCLUDED.hero_image_url,
  name_i18n = EXCLUDED.name_i18n,
  short_description_i18n = EXCLUDED.short_description_i18n,
  long_description_i18n = EXCLUDED.long_description_i18n,
  features_i18n = EXCLUDED.features_i18n;

-- 2. Smart Pill Dispenser (coming_soon)
INSERT INTO public.products (
  name, slug, status, category, display_order,
  selling_price_net, selling_tax_rate, cost_price, is_active,
  hero_image_url,
  name_i18n,
  short_description_i18n,
  long_description_i18n,
  features_i18n
) VALUES (
  'Smart Pill Dispenser',
  'pill-dispenser',
  'coming_soon',
  'Medication',
  2,
  0, 0.21, 0, false,
  'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
  '{"en": "Smart Pill Dispenser", "es": "Dispensador Inteligente de Medicación", "nl": "Slimme Pillendispenser"}'::jsonb,
  '{"en": "Automated medication management with smart reminders and caregiver alerts.", "es": "Gestión automatizada de medicación con recordatorios inteligentes y alertas para cuidadores.", "nl": "Geautomatiseerd medicatiebeheer met slimme herinneringen en meldingen voor mantelzorgers."}'::jsonb,
  '{"en": "A connected pill dispenser that sorts your medication into the right doses at the right times. Gentle reminders when it''s time to take a dose. If a dose is missed, your nominated family member or carer is notified automatically. Peace of mind for medication adherence — built into the Care Conneqt ecosystem.", "es": "Un dispensador de medicación conectado que organiza su medicación en las dosis correctas en el momento adecuado. Recordatorios suaves cuando es hora de tomar una dosis. Si se olvida una dosis, su familiar o cuidador designado es notificado automáticamente. Tranquilidad para el cumplimiento de la medicación — integrado en el ecosistema Care Conneqt.", "nl": "Een verbonden pillendispenser die uw medicatie sorteert in de juiste doses op de juiste tijden. Zachte herinneringen wanneer het tijd is voor een dosis. Bij een gemiste dosis wordt uw aangewezen familielid of verzorger automatisch op de hoogte gesteld. Gemoedsrust voor medicatietrouw — ingebouwd in het Care Conneqt ecosysteem."}'::jsonb,
  '{"en": ["Automated dose sorting", "Audible and visual reminders", "Missed-dose caregiver alerts", "Remote refill notifications", "Works with Care Conneqt app", "Optional lockable dispenser for security"], "es": ["Clasificación automática de dosis", "Recordatorios auditivos y visuales", "Alertas de dosis olvidadas para cuidadores", "Notificaciones remotas de recarga", "Compatible con la app Care Conneqt", "Dispensador con cerradura opcional"], "nl": ["Automatische dosissortering", "Hoorbare en visuele herinneringen", "Gemiste-dosis meldingen voor verzorgers", "Externe bijvulmeldingen", "Werkt met de Care Conneqt app", "Optioneel afsluitbare dispenser"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  hero_image_url = EXCLUDED.hero_image_url,
  name_i18n = EXCLUDED.name_i18n,
  short_description_i18n = EXCLUDED.short_description_i18n,
  long_description_i18n = EXCLUDED.long_description_i18n,
  features_i18n = EXCLUDED.features_i18n;

-- 3. Continuous Glucose Monitor (coming_soon)
INSERT INTO public.products (
  name, slug, status, category, display_order,
  selling_price_net, selling_tax_rate, cost_price, is_active,
  hero_image_url,
  name_i18n,
  short_description_i18n,
  long_description_i18n,
  features_i18n
) VALUES (
  'Continuous Glucose Monitor',
  'glucose-monitor',
  'coming_soon',
  'Health Monitoring',
  3,
  0, 0.21, 0, false,
  'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80',
  '{"en": "Continuous Glucose Monitor", "es": "Monitor Continuo de Glucosa", "nl": "Continue Glucosemonitor"}'::jsonb,
  '{"en": "24/7 glucose tracking with instant alerts and family visibility.", "es": "Seguimiento de glucosa 24/7 con alertas instantáneas y visibilidad familiar.", "nl": "24/7 glucose-tracking met directe meldingen en zichtbaarheid voor familie."}'::jsonb,
  '{"en": "A discreet wearable sensor that continuously monitors glucose levels and streams the readings to your Care Conneqt app. Set high/low thresholds with instant alerts to family members. Trends, patterns, and shareable reports for healthcare providers. Ideal for Type 2 diabetes management and peace of mind for families of loved ones with complex conditions.", "es": "Un sensor discreto que monitoriza continuamente los niveles de glucosa y transmite las lecturas a su app Care Conneqt. Configure umbrales altos/bajos con alertas instantáneas a familiares. Tendencias, patrones e informes compartibles para profesionales sanitarios. Ideal para el manejo de diabetes tipo 2 y la tranquilidad de las familias de personas con condiciones complejas.", "nl": "Een discrete draagbare sensor die continu glucosewaarden meet en de uitlezingen naar uw Care Conneqt app streamt. Stel hoge/lage drempels in met directe meldingen aan familieleden. Trends, patronen en deelbare rapporten voor zorgverleners. Ideaal voor Type 2 diabetes management en gemoedsrust voor families van dierbaren met complexe aandoeningen."}'::jsonb,
  '{"en": ["Continuous 24/7 glucose tracking", "Configurable high/low alerts", "Family dashboard access", "Trend analysis and reporting", "No finger-prick readings", "Up to 14 days per sensor"], "es": ["Seguimiento continuo de glucosa 24/7", "Alertas configurables de nivel alto/bajo", "Acceso al panel familiar", "Análisis de tendencias e informes", "Sin pinchazos en el dedo", "Hasta 14 días por sensor"], "nl": ["Continue 24/7 glucose-tracking", "Configureerbare hoge/lage meldingen", "Toegang tot familiedashboard", "Trendanalyse en rapportage", "Geen vingerprik nodig", "Tot 14 dagen per sensor"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  hero_image_url = EXCLUDED.hero_image_url,
  name_i18n = EXCLUDED.name_i18n,
  short_description_i18n = EXCLUDED.short_description_i18n,
  long_description_i18n = EXCLUDED.long_description_i18n,
  features_i18n = EXCLUDED.features_i18n;
