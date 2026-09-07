-- THE HELD SEED BUNDLE — WP3 N7, WP6 G5, WP7 W7. Rows and one enum value; no new tables.
--
-- WHY ONE MIGRATION FOR THREE WORK PACKAGES, when every other rule here says one concern per
-- change: `PENDING_FOR_LEE.md` D-3. The drift gate (#164) fails EVERY pull request while any
-- migration is unapplied, not just the next one that adds a schema change. So a migration merged
-- before Lee can push it turns `main` red for everything behind it. The method that came out of
-- that is one bundled schema PR per run, held open until production can be pushed. This is that
-- PR for this run, and it is the only migration in it.
--
-- ROLLBACK, in this order:
--   DELETE FROM public.notification_templates WHERE event_key LIKE 'fulfilment.%';
--   DELETE FROM public.canned_replies WHERE shortcut IN
--     ('/greeting', '/pendant-test', '/order-status', '/no-medical', '/emergency', '/closing');
--   The `member_action` enum value CANNOT be dropped (Postgres has no DROP VALUE). Reversing it
--   means recreating the type, which is why it is the one non-reversible line here and why it is
--   called out rather than buried: adding it is safe, removing it is a table rewrite.
--
-- Nothing here overwrites anything: every insert is ON CONFLICT DO NOTHING, so a row Lee has
-- already edited by hand wins. A seed that overwrites live operational content is how a
-- corrected message gets un-corrected on the next deploy (the argument in 20260907110200).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. WP7 W7 — `resume` as a member action
-- ═══════════════════════════════════════════════════════════════════════════
-- The enum was written from the brief's six verbs and the brief does not name resume. But
-- `SubscriptionTab` offers it, `admin-subscription-action` performs it, and it is currently
-- logged as an ordinary attributed `activity_logs` row rather than a `member_action` one — so
-- resumes are the one staff action missing from the `member_action` index and from any report
-- built on it. One value closes that.
ALTER TYPE public.member_action ADD VALUE IF NOT EXISTS 'resume';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WP6 G5 — canned replies, per language
-- ═══════════════════════════════════════════════════════════════════════════
-- The picker shipped in #214 and renders an empty state until these exist. Six shortcuts in
-- three languages.
--
-- WHAT AN OPERATOR SCRIPT MAY NOT DO, and each of these is a CLAUDE.md red line rather than a
-- style preference:
--
--   * no medical advice and no diagnosis — `/no-medical` exists to REFUSE that gracefully;
--   * nothing that triages, dismisses or resolves an emergency. `/emergency` sends the member to
--     112 and does not ask them to describe symptoms first;
--   * no promise that a pendant test can be done by the member. Q1 is operator-confirmed: the
--     script says WE will call, because a member waiting for a button to press waits forever;
--   * no phone number. The 24-hour number lives in `system_settings.settings_emergency_phone`
--     and a number typed into a seed row is a number that goes stale silently.
--
-- The Spanish is `usted` throughout — same rule the locale files are held to. The Dutch is `u`.

INSERT INTO public.canned_replies (shortcut, locale, title, body, category) VALUES
  ('/greeting', 'en', 'Opening a reply',
   'Hello, this is the ICE Alarm España team. Thank you for your message — I am looking at it now.',
   'general'),
  ('/greeting', 'es', 'Apertura de respuesta',
   'Hola, le escribe el equipo de ICE Alarm España. Gracias por su mensaje: lo estoy revisando ahora mismo.',
   'general'),
  ('/greeting', 'nl', 'Opening van een antwoord',
   'Hallo, u spreekt met het team van ICE Alarm España. Dank u voor uw bericht — ik kijk er nu naar.',
   'general'),

  ('/pendant-test', 'en', 'We will call to test the pendant',
   'Your pendant is not counted as monitored until we have tested it with you. We will call you to do that — it takes about five minutes and you only need to press the button once while we are on the line.',
   'readiness'),
  ('/pendant-test', 'es', 'Le llamaremos para probar el colgante',
   'Su colgante no cuenta como monitorizado hasta que lo hayamos probado con usted. Le llamaremos para hacerlo: son unos cinco minutos y solo tiene que pulsar el botón una vez mientras estamos al teléfono.',
   'readiness'),
  ('/pendant-test', 'nl', 'Wij bellen u om de alarmknop te testen',
   'Uw alarmknop telt pas als bewaakt wanneer wij hem samen met u hebben getest. Wij bellen u daarvoor: het duurt ongeveer vijf minuten en u hoeft de knop één keer in te drukken terwijl wij aan de lijn zijn.',
   'readiness'),

  ('/order-status', 'en', 'Where the order is',
   'I have checked your order and I can see where it is. I will confirm the next step here as soon as it moves, so you do not have to keep asking.',
   'orders'),
  ('/order-status', 'es', 'Dónde está el pedido',
   'He consultado su pedido y veo en qué punto está. Le confirmaré el siguiente paso por aquí en cuanto avance, para que no tenga que volver a preguntar.',
   'orders'),
  ('/order-status', 'nl', 'Waar de bestelling is',
   'Ik heb uw bestelling bekeken en zie waar deze is. Ik bevestig de volgende stap hier zodra er iets verandert, zodat u er niet naar hoeft te vragen.',
   'orders'),

  ('/no-medical', 'en', 'We cannot give medical advice',
   'I am not able to give medical advice — we are a monitoring service, not a clinical one. Please speak to your doctor about this. If you feel unwell right now, call 112.',
   'safety'),
  ('/no-medical', 'es', 'No podemos dar consejo médico',
   'No puedo darle consejo médico: somos un servicio de monitorización, no clínico. Consúltelo con su médico, por favor. Si se encuentra mal en este momento, llame al 112.',
   'safety'),
  ('/no-medical', 'nl', 'Wij mogen geen medisch advies geven',
   'Ik mag u geen medisch advies geven — wij zijn een meldkamerdienst, geen medische dienst. Bespreek dit alstublieft met uw huisarts. Voelt u zich nu onwel, bel dan 112.',
   'safety'),

  ('/emergency', 'en', 'If this is an emergency',
   'If this is an emergency, please call 112 now, or press your pendant. Messages here are not watched every minute and I do not want you waiting on one.',
   'safety'),
  ('/emergency', 'es', 'Si se trata de una emergencia',
   'Si se trata de una emergencia, llame al 112 ahora mismo o pulse su colgante. Los mensajes de aquí no se vigilan minuto a minuto y no quiero que espere por uno.',
   'safety'),
  ('/emergency', 'nl', 'Als dit een noodgeval is',
   'Is dit een noodgeval, bel dan nu 112 of druk op uw alarmknop. Berichten hier worden niet elke minuut bekeken en ik wil niet dat u daarop wacht.',
   'safety'),

  ('/closing', 'en', 'Closing a reply',
   'Is there anything else I can help with? If not, I will leave this here — you can reply at any time and it comes straight back to us.',
   'general'),
  ('/closing', 'es', 'Cierre de respuesta',
   '¿Hay algo más en lo que pueda ayudarle? Si no, lo dejo aquí: puede responder cuando quiera y nos llega directamente.',
   'general'),
  ('/closing', 'nl', 'Afsluiting van een antwoord',
   'Kan ik u nog ergens mee helpen? Zo niet, dan laat ik het hierbij — u kunt altijd antwoorden en het komt direct bij ons binnen.',
   'general')
ON CONFLICT (shortcut, locale) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. WP3 N7 — notification templates
-- ═══════════════════════════════════════════════════════════════════════════
-- `notify-fulfilment` reads `notification_templates` and has NO inline fallback text by design:
-- with no row it records `skipped_no_template` and sends nothing. That is why this is a seed and
-- not a code change — and why the dispatcher is safe to leave running in the meantime.
--
-- FOUR TRANSITIONS, NOT SIX. `allocated` and `programmed` are internal steps: nothing has
-- happened that the member can see or act on, and a message per internal state change is how a
-- service teaches people to ignore it. No row means no message, so leaving them out IS the
-- decision, recorded here rather than as an inactive row.
--
-- MEMBER TEMPLATES ONLY. Every payer send is refused today with `skipped_no_payer_consent`
-- (N6 / D-8: there is nowhere to record a payer's consent). Seeding `fulfilment.*.payer` rows
-- would be writing copy for a decision Lee has not made, and the copy should be written after
-- it — "your father's pendant has been dispatched" is not a translation of the member's message.
--
-- THE `tested` MESSAGE DOES NOT SAY "YOU ARE PROTECTED", and this is the one to read carefully.
-- Monitoring readiness is TWO conditions (D4): a tested pendant AND at least one emergency
-- contact. A message saying "you are now monitored" after a test call would be a FALSE ALL-CLEAR
-- for every member who has no contacts — the exact failure READINESS_MODEL.md §1-A exists to
-- prevent, delivered by SMS. It says the test passed, which is the thing that actually happened.
--
-- Placeholders are `{{name}}`, `{{order_number}}` and `{{member_name}}` — the three
-- `renderTemplate` is given. An unknown one is left visible rather than blanked, so a typo here
-- shows up as `{{nombre}}` in a test send instead of a silent gap.

INSERT INTO public.notification_templates (event_key, channel, locale, subject, body) VALUES
  -- ── dispatched ───────────────────────────────────────────────────────────
  ('fulfilment.dispatched.member', 'sms', 'en', NULL,
   'ICE Alarm España: your pendant is on its way, {{name}}. Order {{order_number}}.'),
  ('fulfilment.dispatched.member', 'sms', 'es', NULL,
   'ICE Alarm España: su colgante ya está en camino, {{name}}. Pedido {{order_number}}.'),
  ('fulfilment.dispatched.member', 'sms', 'nl', NULL,
   'ICE Alarm España: uw alarmknop is onderweg, {{name}}. Bestelling {{order_number}}.'),
  ('fulfilment.dispatched.member', 'whatsapp', 'en', NULL,
   'ICE Alarm España: your pendant is on its way, {{name}}. Order {{order_number}}.'),
  ('fulfilment.dispatched.member', 'whatsapp', 'es', NULL,
   'ICE Alarm España: su colgante ya está en camino, {{name}}. Pedido {{order_number}}.'),
  ('fulfilment.dispatched.member', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: uw alarmknop is onderweg, {{name}}. Bestelling {{order_number}}.'),
  ('fulfilment.dispatched.member', 'email', 'en', 'Your pendant is on its way',
   'Hello {{name}},

Your pendant has left us and is on its way to you. The order number is {{order_number}}.

When it arrives, do not worry about setting it up — we will call you to test it together, and it is not counted as monitored until we have.

The ICE Alarm España team'),
  ('fulfilment.dispatched.member', 'email', 'es', 'Su colgante está en camino',
   'Hola {{name}}:

Su colgante ha salido de nuestras instalaciones y está en camino. El número de pedido es {{order_number}}.

Cuando llegue, no se preocupe por configurarlo: le llamaremos para probarlo juntos, y no cuenta como monitorizado hasta que lo hayamos hecho.

El equipo de ICE Alarm España'),
  ('fulfilment.dispatched.member', 'email', 'nl', 'Uw alarmknop is onderweg',
   'Hallo {{name}},

Uw alarmknop is bij ons vertrokken en is naar u onderweg. Het bestelnummer is {{order_number}}.

Maakt u zich bij aankomst geen zorgen over het instellen: wij bellen u om hem samen te testen, en hij telt pas als bewaakt wanneer dat gebeurd is.

Het team van ICE Alarm España'),

  -- ── delivered ────────────────────────────────────────────────────────────
  ('fulfilment.delivered.member', 'sms', 'en', NULL,
   'ICE Alarm España: your pendant should have arrived, {{name}}. We will call you to test it — no need to do anything yet.'),
  ('fulfilment.delivered.member', 'sms', 'es', NULL,
   'ICE Alarm España: su colgante ya debería haber llegado, {{name}}. Le llamaremos para probarlo; de momento no tiene que hacer nada.'),
  ('fulfilment.delivered.member', 'sms', 'nl', NULL,
   'ICE Alarm España: uw alarmknop zou aangekomen moeten zijn, {{name}}. Wij bellen u om hem te testen; u hoeft nu niets te doen.'),
  ('fulfilment.delivered.member', 'whatsapp', 'en', NULL,
   'ICE Alarm España: your pendant should have arrived, {{name}}. We will call you to test it — no need to do anything yet.'),
  ('fulfilment.delivered.member', 'whatsapp', 'es', NULL,
   'ICE Alarm España: su colgante ya debería haber llegado, {{name}}. Le llamaremos para probarlo; de momento no tiene que hacer nada.'),
  ('fulfilment.delivered.member', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: uw alarmknop zou aangekomen moeten zijn, {{name}}. Wij bellen u om hem te testen; u hoeft nu niets te doen.'),
  ('fulfilment.delivered.member', 'email', 'en', 'Your pendant has been delivered',
   'Hello {{name}},

Your pendant has been delivered. Order {{order_number}}.

There is nothing for you to set up. We will call you to test it together — it takes about five minutes and you only need to press the button once while we are on the line.

The ICE Alarm España team'),
  ('fulfilment.delivered.member', 'email', 'es', 'Su colgante ha sido entregado',
   'Hola {{name}}:

Su colgante ha sido entregado. Pedido {{order_number}}.

No tiene que configurar nada. Le llamaremos para probarlo juntos: son unos cinco minutos y solo tiene que pulsar el botón una vez mientras estamos al teléfono.

El equipo de ICE Alarm España'),
  ('fulfilment.delivered.member', 'email', 'nl', 'Uw alarmknop is bezorgd',
   'Hallo {{name}},

Uw alarmknop is bezorgd. Bestelling {{order_number}}.

U hoeft niets in te stellen. Wij bellen u om hem samen te testen: dat duurt ongeveer vijf minuten en u hoeft de knop één keer in te drukken terwijl wij aan de lijn zijn.

Het team van ICE Alarm España'),

  -- ── tested ───────────────────────────────────────────────────────────────
  -- Says the TEST PASSED. Not "you are protected": readiness also needs an emergency contact.
  ('fulfilment.tested.member', 'sms', 'en', NULL,
   'ICE Alarm España: the test call worked, {{name}} — your pendant reached an operator. Thank you.'),
  ('fulfilment.tested.member', 'sms', 'es', NULL,
   'ICE Alarm España: la llamada de prueba ha funcionado, {{name}}: su colgante ha llegado a un operador. Gracias.'),
  ('fulfilment.tested.member', 'sms', 'nl', NULL,
   'ICE Alarm España: de testoproep is gelukt, {{name}} — uw alarmknop bereikte een medewerker. Dank u.'),
  ('fulfilment.tested.member', 'whatsapp', 'en', NULL,
   'ICE Alarm España: the test call worked, {{name}} — your pendant reached an operator. Thank you.'),
  ('fulfilment.tested.member', 'whatsapp', 'es', NULL,
   'ICE Alarm España: la llamada de prueba ha funcionado, {{name}}: su colgante ha llegado a un operador. Gracias.'),
  ('fulfilment.tested.member', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: de testoproep is gelukt, {{name}} — uw alarmknop bereikte een medewerker. Dank u.'),
  ('fulfilment.tested.member', 'email', 'en', 'Your pendant test worked',
   'Hello {{name}},

We tested your pendant with you and it reached one of our operators. That is the part that matters, and it is done.

You can see everything we hold for you — including who we would call on your behalf — in your account.

The ICE Alarm España team'),
  ('fulfilment.tested.member', 'email', 'es', 'La prueba de su colgante ha funcionado',
   'Hola {{name}}:

Hemos probado su colgante con usted y ha llegado a uno de nuestros operadores. Esa es la parte importante, y ya está hecha.

En su cuenta puede ver todo lo que tenemos registrado, incluidas las personas a las que llamaríamos por usted.

El equipo de ICE Alarm España'),
  ('fulfilment.tested.member', 'email', 'nl', 'De test van uw alarmknop is gelukt',
   'Hallo {{name}},

Wij hebben uw alarmknop samen met u getest en hij bereikte een van onze medewerkers. Dat is het belangrijkste, en dat is nu gedaan.

In uw account ziet u alles wat wij van u hebben vastgelegd, ook wie wij namens u zouden bellen.

Het team van ICE Alarm España'),

  -- ── cancelled ────────────────────────────────────────────────────────────
  ('fulfilment.cancelled.member', 'sms', 'en', NULL,
   'ICE Alarm España: order {{order_number}} has been cancelled. If that is not what you expected, reply and we will look into it.'),
  ('fulfilment.cancelled.member', 'sms', 'es', NULL,
   'ICE Alarm España: el pedido {{order_number}} ha sido cancelado. Si no esperaba esto, responda y lo revisamos.'),
  ('fulfilment.cancelled.member', 'sms', 'nl', NULL,
   'ICE Alarm España: bestelling {{order_number}} is geannuleerd. Klopt dit niet, antwoord dan even, dan zoeken wij het uit.'),
  ('fulfilment.cancelled.member', 'whatsapp', 'en', NULL,
   'ICE Alarm España: order {{order_number}} has been cancelled. If that is not what you expected, reply and we will look into it.'),
  ('fulfilment.cancelled.member', 'whatsapp', 'es', NULL,
   'ICE Alarm España: el pedido {{order_number}} ha sido cancelado. Si no esperaba esto, responda y lo revisamos.'),
  ('fulfilment.cancelled.member', 'whatsapp', 'nl', NULL,
   'ICE Alarm España: bestelling {{order_number}} is geannuleerd. Klopt dit niet, antwoord dan even, dan zoeken wij het uit.'),
  ('fulfilment.cancelled.member', 'email', 'en', 'Your order has been cancelled',
   'Hello {{name}},

Order {{order_number}} has been cancelled.

If that is not what you were expecting, reply to this message and we will look into it with you.

The ICE Alarm España team'),
  ('fulfilment.cancelled.member', 'email', 'es', 'Su pedido ha sido cancelado',
   'Hola {{name}}:

El pedido {{order_number}} ha sido cancelado.

Si no era lo que esperaba, responda a este mensaje y lo revisamos con usted.

El equipo de ICE Alarm España'),
  ('fulfilment.cancelled.member', 'email', 'nl', 'Uw bestelling is geannuleerd',
   'Hallo {{name}},

Bestelling {{order_number}} is geannuleerd.

Klopt dit niet met wat u verwachtte, antwoord dan op dit bericht, dan zoeken wij het samen met u uit.

Het team van ICE Alarm España')
ON CONFLICT (event_key, channel, locale) DO NOTHING;
