-- CONTENT FIX (Lee, 2026-07-26): the member-visible Billing & Subscription FAQ
-- still teaches two things we have since ruled otherwise on, and members can
-- read it in the portal (visibility includes 'member'):
--
--   1. "30-day notice required" to cancel. Ruled 2026-07-25: cancel any time,
--      no minimum term, no notice period, effective at the end of the paid
--      billing period. Already corrected in support.faq and Terms §9.1 (#82).
--   2. "Pendant must be returned" on cancellation, and "must return one
--      pendant" when downgrading. Ruled 2026-07-25: the pendant is SOLD
--      outright (€125 net + IVA) — customers own it. Already corrected in
--      Terms §7.1/§9.4 (#87).
--
-- It also omitted the 14-day right of withdrawal entirely, which is the one
-- case where the pendant DOES go back — so the cancellation section was both
-- wrong about the normal case and silent about the statutory one.
--
-- Applied as targeted replacements rather than a whole-row overwrite, so any
-- other edits an admin has made to this document survive. Each statement is
-- guarded: it only fires while the old wording is still present, so re-running
-- is a no-op and a doc already corrected in prod is left alone.
--
-- en and es are the only rows that exist: documentation.language is
-- CHECK-constrained to ('en','es'), so there is no Dutch copy to fix.

-- ── English ──────────────────────────────────────────────────────────────
UPDATE public.documentation
SET content = replace(
      content,
      E'#### How do I cancel my service?\n- Call our customer service\n- Or email your cancellation request\n- 30-day notice required',
      E'#### How do I cancel my service?\n- Cancel from your member dashboard\n- Or call us, or send us a message from the dashboard\n- You can cancel at any time. There is no minimum term and no notice period.\n- Your monitoring stays active until the end of the billing period you have already paid for.'
    )
WHERE slug = 'billing-subscription-faq-en'
  AND content LIKE '%30-day notice required%';

UPDATE public.documentation
SET content = replace(
      content,
      E'#### What happens to my pendant?\n- Pendant must be returned\n- We will provide return instructions\n- Device will be deactivated',
      E'#### What happens to my pendant?\n- You keep it. The pendant was sold to you and it is your property.\n- There is nothing to return and no collection to arrange.\n- Monitoring ends, so the SOS button will no longer reach our team.'
    )
WHERE slug = 'billing-subscription-faq-en'
  AND content LIKE '%Pendant must be returned%';

UPDATE public.documentation
SET content = replace(
      content,
      E'Yes. Contact us to arrange. You must return one pendant.',
      E'Yes. Contact us to arrange. You keep both pendants — they are yours. Only your monthly subscription changes.'
    )
WHERE slug = 'billing-subscription-faq-en'
  AND content LIKE '%You must return one pendant.%';

-- The statutory right, which the FAQ never mentioned. Appended to the
-- cancellation section so the "no notice" answer above cannot be read as the
-- whole story during the first 14 days.
UPDATE public.documentation
SET content = replace(
      content,
      E'#### Is there a cancellation fee?\nNo. We do not charge cancellation fees.',
      E'#### Is there a cancellation fee?\nNo. We do not charge cancellation fees.\n\n#### What if I joined less than 14 days ago?\nYour statutory right of withdrawal applies instead. Within 14 days of receiving your pendant you can withdraw from the contract for any reason, and we refund everything you paid — including the registration fee and standard delivery. This is the one case where the pendant does go back, and you pay the return postage. Full details and the model withdrawal form are in section 9.2 of our Terms.'
    )
WHERE slug = 'billing-subscription-faq-en'
  AND content NOT LIKE '%right of withdrawal%';

-- ── Spanish ──────────────────────────────────────────────────────────────
UPDATE public.documentation
SET content = replace(
      content,
      E'#### ¿Cómo cancelo mi servicio?\n- Llame a nuestro servicio al cliente\n- O envíe su solicitud de cancelación por email\n- Se requiere aviso de 30 días',
      E'#### ¿Cómo cancelo mi servicio?\n- Cancele desde su panel de miembro\n- O llámenos, o escríbanos un mensaje desde el panel\n- Puede cancelar en cualquier momento. No hay plazo mínimo ni preaviso.\n- Su monitorización sigue activa hasta el final del periodo de facturación que ya ha pagado.'
    )
WHERE slug = 'billing-subscription-faq-es'
  AND content LIKE '%Se requiere aviso de 30 días%';

UPDATE public.documentation
SET content = replace(
      content,
      E'#### ¿Qué pasa con mi colgante?\n- El colgante debe devolverse\n- Proporcionaremos instrucciones de devolución\n- El dispositivo será desactivado',
      E'#### ¿Qué pasa con mi colgante?\n- Lo conserva. El colgante se le vendió y es de su propiedad.\n- No hay nada que devolver ni recogida que organizar.\n- La monitorización finaliza, por lo que el botón SOS ya no contactará con nuestro equipo.'
    )
WHERE slug = 'billing-subscription-faq-es'
  AND content LIKE '%El colgante debe devolverse%';

UPDATE public.documentation
SET content = replace(
      content,
      E'Sí. Contáctenos para organizarlo. Debe devolver un colgante.',
      E'Sí. Contáctenos para organizarlo. Conserva ambos colgantes: son suyos. Solo cambia su cuota mensual.'
    )
WHERE slug = 'billing-subscription-faq-es'
  AND content LIKE '%Debe devolver un colgante.%';

UPDATE public.documentation
SET content = replace(
      content,
      E'#### ¿Hay cuota de cancelación?\nNo. No cobramos cuotas de cancelación.',
      E'#### ¿Hay cuota de cancelación?\nNo. No cobramos cuotas de cancelación.\n\n#### ¿Y si me di de alta hace menos de 14 días?\nEn ese caso se aplica su derecho legal de desistimiento. Dentro de los 14 días siguientes a la recepción de su colgante puede desistir del contrato sin necesidad de justificación, y le reembolsamos todo lo pagado, incluidas la cuota de registro y el envío estándar. Este es el único supuesto en el que el colgante sí debe devolverse, y los gastos de devolución corren por su cuenta. Encontrará el detalle completo y el modelo de formulario en la sección 9.2 de nuestros Términos.'
    )
WHERE slug = 'billing-subscription-faq-es'
  AND content NOT LIKE '%derecho legal de desistimiento%';

-- Rollback: restore the pre-fix wording by reversing each replace() above.
-- Not recommended — it reinstates a 30-day cancellation notice we do not
-- require and a device return we do not ask for.
