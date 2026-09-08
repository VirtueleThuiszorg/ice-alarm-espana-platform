-- Join-path schema, part 6 of the held bundle: the registration function can actually run
-- (item 7 F17, plus a blocker nobody had reached).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE BLOCKER, FOUND BY RUNNING THE FUNCTION RATHER THAN READING IT
--
-- `submit_registration_atomic` has never been able to complete. FIVE columns are fed a TEXT
-- expression where the column is an ENUM, and PostgreSQL has no assignment cast from text to an
-- enum, so each one raises:
--
--     ERROR: column "preferred_language" is of type preferred_language
--            but expression is of type text
--
--   members.preferred_language      <- v_primary/v_partner->>'preferredLanguage'  (text)
--   subscriptions.plan_type         <- v_membership_type      TEXT
--   subscriptions.billing_frequency <- v_billing_frequency    TEXT
--   subscriptions.payment_method    <- v_active_gateway       TEXT
--   payments.payment_method         <- v_active_gateway       TEXT
--
-- Literals are fine — `'pending'`, `'order'`, `'subscription'` all coerce — which is why the
-- other enum columns in the same statements are untouched. It is only the variables.
--
-- The whole registration is one transaction, so nothing is written at all: no member, no
-- subscription, no order, no payment row, no attribution. REVIEW_JOIN_PATH.md traced this path
-- by reading it and missed all five; they surfaced one at a time the moment
-- scripts/rls/isolation.sql CALLED the function with a real payload. They sit behind F1 — the
-- request schema rejected every payload before the RPC was reached — which is why nothing in
-- production has hit them.
--
-- The language cast falls back to 'en' when absent or empty: the column's own DEFAULT, so a
-- missing value behaves as the schema already declares rather than as something new. (The
-- wizard always sends one, and its own initial value is 'es', so this only bites a caller that
-- omits the field.)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THE ORDER NUMBER (F17). It was
--
--     'ICE-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT))
--
-- which has ONE SECOND of resolution, against `orders.order_number text UNIQUE NOT NULL`
-- (20260121143325:132). Two people finishing the wizard in the same second produce the same
-- number, and because the whole function is a single transaction the second one does not get a
-- retry — the unique violation rolls back the member, the subscription, the order, the payment
-- row and the attribution, and the customer sees an error at the exact moment they were about to
-- pay. It is rare and it is total, which is the worst combination to leave in a checkout.
--
-- The fix is a sequence, which cannot collide by construction, plus the date — because an order
-- number is read out on the phone and 'ICE-20260908-00042' can be said, while 'ICE-68BE4A31'
-- cannot. Existing numbers are left exactly as they are; nothing parses the format (it is
-- displayed and searched with ILIKE, never split), so old and new coexist.
--
-- WHY THE WHOLE FUNCTION IS REPLACED. It is one statement: you cannot patch a line of a
-- PL/pgSQL body. This file is generated FROM 20260302120000 with seven edits and nothing else,
-- and src/test/registrationAtomicDiff.test.ts asserts exactly that — line by line, in order. A
-- hand-retyped 500-line function is a transcription error waiting to happen; a generated one
-- with a test on the diff is not.
--
-- THE LAST EDIT, while it is being replaced anyway: `SET search_path = public`. A
-- SECURITY DEFINER function without it resolves unqualified names against the CALLER's
-- search_path, so anyone who can create a schema and prepend it can shadow `members` or
-- `orders` with their own table and have this function write there instead. Every table name in
-- the body is unqualified, so the exposure is the whole function. It is the one-line hardening
-- that should have been there from the start, and it changes nothing about behaviour: every
-- object it touches lives in `public`.
--
-- ROLLBACK:
--   DROP SEQUENCE IF EXISTS public.order_number_seq;  -- after restoring the function below
--   -- then re-create submit_registration_atomic from 20260302120000 verbatim.
--   NOTE: that restores a function that cannot insert a member. The enum casts are not a
--   preference; they are the difference between registration working and not.
--   Order numbers already issued in the new format are left alone: they are unique, and
--   rewriting a number a customer has been quoted would be worse than a mixed format.

-- No CYCLE and no MAXVALUE fiddling: at bigint this outlasts the business by some margin, and a
-- cycling sequence would eventually reissue a number that is already on somebody's invoice.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq AS bigint START WITH 1 INCREMENT BY 1;

COMMENT ON SEQUENCE public.order_number_seq IS
  'Serial part of orders.order_number (ICE-YYYYMMDD-NNNNN). Replaces a one-second epoch hash '
  'that could collide against the UNIQUE constraint and roll back an entire registration.';

-- REVOKE FIRST, and it matters. Supabase's default privileges in `public` include
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES
--     TO anon, authenticated, service_role;
-- so a sequence is reachable from the browser the moment it is created. Nothing catastrophic —
-- but a client calling nextval() in a loop burns numbers and leaves gaps in the order ledger
-- that look like deleted orders to whoever reconciles them. The registration path runs this
-- inside a SECURITY DEFINER function as its owner, so no client role needs it at all.
--
-- Found by an assertion that claimed this was already true and was wrong: the harness mirrors
-- those default privileges, and said so.
REVOKE ALL ON SEQUENCE public.order_number_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.order_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.submit_registration_atomic(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- IDs we'll return
  v_primary_member_id UUID;
  v_partner_member_id UUID;
  v_primary_medical_id UUID;
  v_partner_medical_id UUID;
  v_subscription_id UUID;
  v_partner_subscription_id UUID;
  v_order_id UUID;
  v_payment_id UUID;
  v_attribution_id UUID;

  -- Extracted fields
  v_membership_type TEXT;
  v_primary JSONB;
  v_partner JSONB;
  v_address JSONB;
  v_medical JSONB;
  v_partner_medical JSONB;
  v_contacts JSONB;
  v_billing_frequency TEXT;
  v_include_pendant BOOLEAN;
  v_pendant_count INT;
  v_test_mode BOOLEAN;
  v_partner_ref TEXT;
  v_ref_post_id TEXT;
  v_utm_params JSONB;

  -- Pricing (passed pre-calculated from edge function)
  v_subscription_net NUMERIC;
  v_subscription_tax NUMERIC;
  v_subscription_final NUMERIC;
  v_pendant_net NUMERIC;
  v_pendant_tax NUMERIC;
  v_pendant_final NUMERIC;
  v_registration_fee NUMERIC;
  v_registration_fee_discount NUMERIC;
  v_registration_fee_enabled BOOLEAN;
  v_shipping NUMERIC;
  v_total NUMERIC;
  v_subscription_tax_rate NUMERIC;
  v_pendant_tax_rate NUMERIC;

  -- Computed
  v_order_number TEXT;
  v_renewal_date DATE;
  v_now TIMESTAMPTZ := now();
  v_today DATE := CURRENT_DATE;
  v_contact JSONB;
  v_i INT;

  v_active_gateway TEXT;

  -- Partner attribution
  v_partner_id UUID;
  v_existing_attribution_id UUID;
  v_link_id UUID;
  v_link_signups INT;
BEGIN
  -- ─── Extract payload fields ───────────────────────────────────────────
  v_membership_type     := payload->>'membershipType';
  v_primary             := payload->'primaryMember';
  v_partner             := payload->'partnerMember';
  v_address             := payload->'address';
  v_medical             := payload->'medicalInfo';
  v_partner_medical     := payload->'partnerMedicalInfo';
  v_contacts            := payload->'emergencyContacts';
  v_billing_frequency   := payload->>'billingFrequency';
  v_include_pendant     := COALESCE((payload->>'includePendant')::BOOLEAN, false);
  v_pendant_count       := COALESCE((payload->>'pendantCount')::INT, 0);
  v_test_mode           := COALESCE((payload->>'testMode')::BOOLEAN, false);
  v_active_gateway      := COALESCE(payload->>'activeGateway', 'stripe');
  v_partner_ref         := payload->>'partnerRef';
  v_ref_post_id         := payload->>'refPostId';
  v_utm_params          := payload->'utmParams';

  -- Pricing (pre-calculated by edge function)
  v_subscription_net       := (payload->>'subscriptionNet')::NUMERIC;
  v_subscription_tax       := (payload->>'subscriptionTax')::NUMERIC;
  v_subscription_final     := (payload->>'subscriptionFinal')::NUMERIC;
  v_pendant_net            := (payload->>'pendantNet')::NUMERIC;
  v_pendant_tax            := (payload->>'pendantTax')::NUMERIC;
  v_pendant_final          := (payload->>'pendantFinal')::NUMERIC;
  v_registration_fee       := (payload->>'registrationFee')::NUMERIC;
  v_registration_fee_discount := COALESCE((payload->>'registrationFeeDiscount')::NUMERIC, 0);
  v_registration_fee_enabled  := COALESCE((payload->>'registrationFeeEnabled')::BOOLEAN, true);
  v_shipping               := (payload->>'shipping')::NUMERIC;
  v_total                  := (payload->>'total')::NUMERIC;
  v_subscription_tax_rate  := (payload->>'subscriptionTaxRate')::NUMERIC;
  v_pendant_tax_rate       := (payload->>'pendantTaxRate')::NUMERIC;

  -- ─── 1. Create primary member ─────────────────────────────────────────
  INSERT INTO members (
    first_name, last_name, email, phone, date_of_birth, nie_dni,
    preferred_language, preferred_contact_method, preferred_contact_time,
    special_instructions,
    address_line_1, address_line_2, city, province, postal_code, country,
    status
  ) VALUES (
    v_primary->>'firstName', v_primary->>'lastName',
    v_primary->>'email', v_primary->>'phone',
    (v_primary->>'dateOfBirth')::DATE,
    NULLIF(v_primary->>'nieDni', ''),
    COALESCE(NULLIF(v_primary->>'preferredLanguage', ''), 'en')::public.preferred_language,
    NULLIF(v_primary->>'preferredContactMethod', ''),
    NULLIF(v_primary->>'preferredContactTime', ''),
    NULLIF(v_primary->>'specialInstructions', ''),
    v_address->>'addressLine1',
    NULLIF(v_address->>'addressLine2', ''),
    v_address->>'city', v_address->>'province',
    v_address->>'postalCode', v_address->>'country',
    'inactive'
  )
  RETURNING id INTO v_primary_member_id;

  -- ─── 2. Create partner member (if couple) ─────────────────────────────
  IF v_membership_type = 'couple' AND v_partner IS NOT NULL AND v_partner != 'null'::JSONB THEN
    INSERT INTO members (
      first_name, last_name, email, phone, date_of_birth, nie_dni,
      preferred_language, preferred_contact_method, preferred_contact_time,
      special_instructions,
      address_line_1, address_line_2, city, province, postal_code, country,
      status
    ) VALUES (
      v_partner->>'firstName', v_partner->>'lastName',
      v_partner->>'email', v_partner->>'phone',
      (v_partner->>'dateOfBirth')::DATE,
      NULLIF(v_partner->>'nieDni', ''),
      COALESCE(NULLIF(v_partner->>'preferredLanguage', ''), 'en')::public.preferred_language,
      NULLIF(v_partner->>'preferredContactMethod', ''),
      NULLIF(v_partner->>'preferredContactTime', ''),
      NULLIF(v_partner->>'specialInstructions', ''),
      v_address->>'addressLine1',
      NULLIF(v_address->>'addressLine2', ''),
      v_address->>'city', v_address->>'province',
      v_address->>'postalCode', v_address->>'country',
      'inactive'
    )
    RETURNING id INTO v_partner_member_id;
  END IF;

  -- ─── 3. Create medical info for primary member ────────────────────────
  IF v_medical IS NOT NULL AND v_medical != 'null'::JSONB THEN
    IF COALESCE(v_medical->>'bloodType', '') != ''
       OR jsonb_array_length(COALESCE(v_medical->'allergies', '[]'::JSONB)) > 0
       OR jsonb_array_length(COALESCE(v_medical->'medications', '[]'::JSONB)) > 0
       OR jsonb_array_length(COALESCE(v_medical->'medicalConditions', '[]'::JSONB)) > 0 THEN
      INSERT INTO medical_information (
        member_id, blood_type, allergies, medications, medical_conditions,
        doctor_name, doctor_phone, hospital_preference, additional_notes
      ) VALUES (
        v_primary_member_id,
        NULLIF(v_medical->>'bloodType', ''),
        COALESCE(v_medical->'allergies', '[]'::JSONB),
        COALESCE(v_medical->'medications', '[]'::JSONB),
        COALESCE(v_medical->'medicalConditions', '[]'::JSONB),
        NULLIF(v_medical->>'doctorName', ''),
        NULLIF(v_medical->>'doctorPhone', ''),
        NULLIF(v_medical->>'hospitalPreference', ''),
        NULLIF(v_medical->>'additionalNotes', '')
      )
      RETURNING id INTO v_primary_medical_id;
    END IF;
  END IF;

  -- ─── 4. Create medical info for partner ───────────────────────────────
  IF v_partner_member_id IS NOT NULL AND v_partner_medical IS NOT NULL AND v_partner_medical != 'null'::JSONB THEN
    INSERT INTO medical_information (
      member_id, blood_type, allergies, medications, medical_conditions,
      doctor_name, doctor_phone, hospital_preference, additional_notes
    ) VALUES (
      v_partner_member_id,
      NULLIF(v_partner_medical->>'bloodType', ''),
      COALESCE(v_partner_medical->'allergies', '[]'::JSONB),
      COALESCE(v_partner_medical->'medications', '[]'::JSONB),
      COALESCE(v_partner_medical->'medicalConditions', '[]'::JSONB),
      NULLIF(v_partner_medical->>'doctorName', ''),
      NULLIF(v_partner_medical->>'doctorPhone', ''),
      NULLIF(v_partner_medical->>'hospitalPreference', ''),
      NULLIF(v_partner_medical->>'additionalNotes', '')
    )
    RETURNING id INTO v_partner_medical_id;
  END IF;

  -- ─── 5. Create emergency contacts ────────────────────────────────────
  IF v_contacts IS NOT NULL AND jsonb_array_length(v_contacts) > 0 THEN
    FOR v_i IN 0..jsonb_array_length(v_contacts) - 1 LOOP
      v_contact := v_contacts->v_i;

      INSERT INTO emergency_contacts (
        member_id, contact_name, relationship, phone, email,
        speaks_spanish, notes, priority_order, is_primary
      ) VALUES (
        v_primary_member_id,
        v_contact->>'contactName', v_contact->>'relationship',
        v_contact->>'phone', NULLIF(v_contact->>'email', ''),
        COALESCE((v_contact->>'speaksSpanish')::BOOLEAN, false),
        NULLIF(v_contact->>'notes', ''),
        v_i + 1,
        v_i = 0
      );

      -- Also add to partner if couple
      IF v_partner_member_id IS NOT NULL THEN
        INSERT INTO emergency_contacts (
          member_id, contact_name, relationship, phone, email,
          speaks_spanish, notes, priority_order, is_primary
        ) VALUES (
          v_partner_member_id,
          v_contact->>'contactName', v_contact->>'relationship',
          v_contact->>'phone', NULLIF(v_contact->>'email', ''),
          COALESCE((v_contact->>'speaksSpanish')::BOOLEAN, false),
          NULLIF(v_contact->>'notes', ''),
          v_i + 1,
          v_i = 0
        );
      END IF;
    END LOOP;
  END IF;

  -- ─── 6. Create subscription ───────────────────────────────────────────
  IF v_billing_frequency = 'monthly' THEN
    v_renewal_date := v_today + INTERVAL '1 month';
  ELSE
    v_renewal_date := v_today + INTERVAL '1 year';
  END IF;

  INSERT INTO subscriptions (
    member_id, plan_type, billing_frequency, amount,
    start_date, renewal_date, has_pendant, registration_fee_paid,
    status, payment_method
  ) VALUES (
    v_primary_member_id,
    v_membership_type::public.plan_type,
    v_billing_frequency::public.billing_frequency,
    v_subscription_net, v_today, v_renewal_date,
    v_include_pendant, false, 'pending',
    v_active_gateway::public.payment_method
  )
  RETURNING id INTO v_subscription_id;

  -- ─── 6b. Create partner subscription (if couple) ─────────────────────
  IF v_partner_member_id IS NOT NULL THEN
    INSERT INTO subscriptions (
      member_id, plan_type, billing_frequency, amount,
      start_date, renewal_date, has_pendant, registration_fee_paid,
      status, payment_method
    ) VALUES (
      v_partner_member_id,
      v_membership_type::public.plan_type,
      v_billing_frequency::public.billing_frequency,
      v_subscription_net, v_today, v_renewal_date,
      v_include_pendant, false, 'pending',
      v_active_gateway::public.payment_method
    )
    RETURNING id INTO v_partner_subscription_id;
  END IF;

  -- ─── 7. Generate order number ─────────────────────────────────────────
  -- WAS: 'ICE-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT)) — one second of resolution
  -- against a UNIQUE constraint (REVIEW_JOIN_PATH.md F17). Two people finishing the wizard in
  -- the same second collided, and because this whole function is one transaction the second
  -- one's registration was rolled back entirely: no member, no order, an error on the screen at
  -- the exact moment they were about to pay. A sequence cannot collide, and the date makes the
  -- number readable to whoever has to say it out loud on the phone.
  v_order_number := 'ICE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-'
                    || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');

  -- ─── 8. Create order ──────────────────────────────────────────────────
  INSERT INTO orders (
    member_id, order_number, status, subtotal, tax_amount,
    total_amount, shipping_amount,
    shipping_address_line_1, shipping_address_line_2,
    shipping_city, shipping_province, shipping_postal_code, shipping_country
  ) VALUES (
    v_primary_member_id, v_order_number, 'pending',
    v_subscription_net + v_pendant_net + v_registration_fee,
    v_subscription_tax + v_pendant_tax,
    v_total, v_shipping,
    v_address->>'addressLine1',
    NULLIF(v_address->>'addressLine2', ''),
    v_address->>'city', v_address->>'province',
    v_address->>'postalCode', v_address->>'country'
  )
  RETURNING id INTO v_order_id;

  -- ─── 9. Create order items ────────────────────────────────────────────
  -- Subscription item
  INSERT INTO order_items (
    order_id, item_type, description, quantity,
    unit_price, tax_rate, tax_amount, total_price
  ) VALUES (
    v_order_id, 'subscription',
    CASE WHEN v_membership_type = 'couple' THEN 'Couple' ELSE 'Individual' END
      || ' Membership - '
      || CASE WHEN v_billing_frequency = 'annual' THEN 'Annual' ELSE 'Monthly' END,
    1, v_subscription_net, v_subscription_tax_rate,
    v_subscription_tax, v_subscription_final
  );

  -- Pendant item (if ordered)
  IF v_pendant_count > 0 THEN
    INSERT INTO order_items (
      order_id, item_type, description, quantity,
      unit_price, tax_rate, tax_amount, total_price
    ) VALUES (
      v_order_id, 'pendant', 'GPS Safety Pendant',
      v_pendant_count, v_pendant_net / v_pendant_count, v_pendant_tax_rate,
      v_pendant_tax, v_pendant_final
    );
  END IF;

  -- Registration fee (if enabled and > 0)
  IF v_registration_fee_enabled AND v_registration_fee > 0 THEN
    INSERT INTO order_items (
      order_id, item_type, description, quantity,
      unit_price, tax_rate, tax_amount, total_price
    ) VALUES (
      v_order_id, 'registration_fee',
      CASE WHEN v_registration_fee_discount > 0
        THEN 'One-time Registration Fee (' || v_registration_fee_discount || '% discount applied)'
        ELSE 'One-time Registration Fee'
      END,
      1, v_registration_fee, 0, 0, v_registration_fee
    );
  END IF;

  -- ─── 10. Create payment record ───────────────────────────────────────
  INSERT INTO payments (
    member_id, subscription_id, order_id, amount,
    payment_type, payment_method, status
  ) VALUES (
    v_primary_member_id, v_subscription_id, v_order_id,
    v_total, 'order', v_active_gateway::public.payment_method, 'pending'
  )
  RETURNING id INTO v_payment_id;

  -- ─── 11. Partner attribution (if referral code provided) ──────────────
  IF v_partner_ref IS NOT NULL AND v_partner_ref != '' THEN
    -- Find active partner by referral code
    SELECT id INTO v_partner_id
    FROM partners
    WHERE referral_code = v_partner_ref AND status = 'active'
    LIMIT 1;

    IF v_partner_id IS NOT NULL THEN
      -- Check for existing attribution (first-touch wins)
      SELECT id INTO v_existing_attribution_id
      FROM partner_attributions
      WHERE member_id = v_primary_member_id
      LIMIT 1;

      IF v_existing_attribution_id IS NULL THEN
        -- Create attribution
        INSERT INTO partner_attributions (
          partner_id, member_id, source, ref_param,
          first_touch_at, last_touch_at, metadata
        ) VALUES (
          v_partner_id, v_primary_member_id, 'ref_link', v_partner_ref,
          v_now, v_now,
          CASE WHEN v_utm_params IS NOT NULL AND v_utm_params != 'null'::JSONB
            THEN v_utm_params ELSE NULL END
        )
        RETURNING id INTO v_attribution_id;

        -- Update matching partner invites
        UPDATE partner_invites
        SET status = 'registered', converted_member_id = v_primary_member_id
        WHERE partner_id = v_partner_id
          AND (invitee_email = v_primary->>'email' OR invitee_phone = v_primary->>'phone')
          AND status IN ('sent', 'draft');

        -- Log audit event
        INSERT INTO activity_logs (action, entity_type, entity_id, new_values)
        VALUES (
          'attribution_created', 'partner_attribution', v_attribution_id,
          jsonb_build_object(
            'partner_id', v_partner_id,
            'member_id', v_primary_member_id,
            'referral_code', v_partner_ref
          )
        );

        -- CRM event
        INSERT INTO crm_events (event_type, payload)
        VALUES (
          'member_registered',
          jsonb_build_object(
            'member_id', v_primary_member_id,
            'partner_id', v_partner_id,
            'referral_code', v_partner_ref,
            'email', v_primary->>'email',
            'membership_type', v_membership_type,
            'has_pendant', v_include_pendant,
            'pendant_count', v_pendant_count,
            'utm_params', v_utm_params
          )
        );

        -- Post-specific referral tracking
        IF v_ref_post_id IS NOT NULL AND v_ref_post_id != '' THEN
          UPDATE members
          SET ref_partner_id = v_partner_id, ref_post_id = v_ref_post_id
          WHERE id = v_primary_member_id;

          -- Increment signups on partner_post_links
          SELECT id, COALESCE(signups, 0) INTO v_link_id, v_link_signups
          FROM partner_post_links
          WHERE post_id = v_ref_post_id::UUID AND partner_id = v_partner_id
          LIMIT 1;

          IF v_link_id IS NOT NULL THEN
            UPDATE partner_post_links
            SET signups = v_link_signups + 1
            WHERE id = v_link_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- ─── 12. CRM profiles ────────────────────────────────────────────────
  -- Primary member CRM profile
  INSERT INTO crm_profiles (member_id, stage, status, referral_source, tags, groups, updated_at)
  VALUES (
    v_primary_member_id,
    'New Member',
    'Website Signup',
    CASE WHEN v_partner_id IS NOT NULL THEN 'Partner' ELSE 'careconneqt.es' END,
    ARRAY[
      CASE WHEN v_membership_type = 'couple' THEN 'membership_couple' ELSE 'membership_single' END,
      CASE WHEN (v_primary->>'preferredLanguage') = 'en' THEN 'language_en' ELSE 'language_es' END,
      CASE WHEN v_include_pendant THEN 'pendant_yes' ELSE 'pendant_no' END
    ] || CASE WHEN v_include_pendant AND v_pendant_count > 0
           THEN ARRAY['pendant_qty_' || v_pendant_count]
           ELSE ARRAY[]::TEXT[] END
      || CASE WHEN v_partner_id IS NOT NULL
           THEN ARRAY['partner_referred']
           ELSE ARRAY[]::TEXT[] END,
    ARRAY[]::TEXT[],
    v_now
  )
  ON CONFLICT (member_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    status = EXCLUDED.status,
    referral_source = EXCLUDED.referral_source,
    tags = EXCLUDED.tags,
    updated_at = EXCLUDED.updated_at;

  -- Partner CRM profile
  IF v_partner_member_id IS NOT NULL THEN
    INSERT INTO crm_profiles (member_id, stage, status, referral_source, tags, groups, updated_at)
    VALUES (
      v_partner_member_id,
      'New Member',
      'Website Signup',
      CASE WHEN v_partner_id IS NOT NULL THEN 'Partner' ELSE 'careconneqt.es' END,
      ARRAY[
        CASE WHEN v_membership_type = 'couple' THEN 'membership_couple' ELSE 'membership_single' END,
        CASE WHEN COALESCE(v_partner->>'preferredLanguage', 'es') = 'en' THEN 'language_en' ELSE 'language_es' END,
        CASE WHEN v_include_pendant THEN 'pendant_yes' ELSE 'pendant_no' END
      ] || CASE WHEN v_include_pendant AND v_pendant_count > 0
             THEN ARRAY['pendant_qty_' || v_pendant_count]
             ELSE ARRAY[]::TEXT[] END
        || CASE WHEN v_partner_id IS NOT NULL
             THEN ARRAY['partner_referred']
             ELSE ARRAY[]::TEXT[] END,
      ARRAY[]::TEXT[],
      v_now
    )
    ON CONFLICT (member_id) DO UPDATE SET
      stage = EXCLUDED.stage,
      status = EXCLUDED.status,
      referral_source = EXCLUDED.referral_source,
      tags = EXCLUDED.tags,
      updated_at = EXCLUDED.updated_at;
  END IF;

  -- ─── 13. Test mode — auto-complete everything ────────────────────────
  IF v_test_mode THEN
    UPDATE payments SET status = 'completed', paid_at = v_now,
      notes = 'TEST MODE - No payment collected'
    WHERE id = v_payment_id;

    UPDATE orders SET status = 'completed' WHERE id = v_order_id;

    UPDATE subscriptions SET status = 'active', registration_fee_paid = true
    WHERE id = v_subscription_id;

    UPDATE members SET status = 'active' WHERE id = v_primary_member_id;

    IF v_partner_member_id IS NOT NULL THEN
      UPDATE members SET status = 'active' WHERE id = v_partner_member_id;
    END IF;

    INSERT INTO activity_logs (action, entity_type, entity_id, new_values)
    VALUES (
      'create', 'order', v_order_id,
      jsonb_build_object(
        'test_mode', true,
        'order_number', v_order_number,
        'member_id', v_primary_member_id,
        'total', v_total
      )
    );
  END IF;

  -- ─── Return all IDs ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'memberId', v_primary_member_id,
    'partnerMemberId', v_partner_member_id,
    'subscriptionId', v_subscription_id,
    'partnerSubscriptionId', v_partner_subscription_id,
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'paymentId', v_payment_id,
    'attributionId', v_attribution_id,
    'total', v_total,
    'testMode', v_test_mode
  );
END;
$$;
