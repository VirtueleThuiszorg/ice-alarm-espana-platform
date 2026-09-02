-- WP-D: import ONE member from the ICE/KarmaCRM export, atomically, server-side.
--
-- Lee's decision (2026-09-02): members are added ONE AT A TIME, by hand, as he
-- works through the CRM. There is no bulk load. That makes this function the
-- whole write path, and it is deliberately small.
--
-- Why a Postgres function rather than a client loop or an Edge Function:
--
--  * ATOMICITY. The old importer did ~8 sequential inserts per row from the
--    browser with no transaction, so a failure part-way left a member row with
--    no emergency contacts — a member the operator card would render as having
--    nobody to call. A plpgsql function is one transaction: either the whole
--    member lands or nothing does.
--
--  * GOLDEN RULE 3 (no client-writable plan/status). The client cannot choose
--    the subscription status here; this function decides. See the note below.
--
--  * IDEMPOTENCY. Keyed on (crm_source, crm_source_id). Importing the same
--    person twice returns the existing member instead of creating a duplicate,
--    which is what happened to Daisy Wakeman on 2026-09-02.
--
-- SUBSCRIPTION STATUS — read this before changing it.
-- Golden rule 4 says a member is activated by the payment webhook, never by
-- client code or an onboarding form. A migrated legacy member has no payment
-- event: they are already paying in the old system. Rather than bulldoze the
-- rule, this function inserts the subscription with status 'pending' and keeps
-- the verbatim CRM membership string in legacy_membership_label. Nobody is
-- billed and nothing is activated by an import. Deciding how migrated members
-- become 'active' is a business decision, not something an import should assume.
--
-- SECURITY DEFINER + an explicit is_admin() check: the function must be able to
-- write tables the caller's own policies restrict (member_access holds key safe
-- codes), so it runs as owner and gates on the caller's admin role itself.
-- search_path is pinned so a caller cannot shadow the objects it resolves.
--
-- Reverse:
--   DROP FUNCTION IF EXISTS public.ice_import_member(jsonb);

CREATE OR REPLACE FUNCTION public.ice_import_member(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source        text := payload #>> '{member,crm_source}';
  v_source_id     text := payload #>> '{member,crm_source_id}';
  v_member_id     uuid;
  v_existing      uuid;
  v_warnings      text[] := ARRAY[]::text[];
  v_contact       jsonb;
  v_email         text;
  v_phone         text;
  v_device_exists uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'ice_import_member: admin role required';
  END IF;

  IF v_source_id IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'ice_import_member: crm_source and crm_source_id are required';
  END IF;

  -- Idempotency: same CRM row imported twice is not a new member.
  SELECT id INTO v_existing
  FROM members
  WHERE crm_source = v_source AND crm_source_id = v_source_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'member_id', v_existing,
      'created', false,
      'reason', 'already imported from this CRM row'
    );
  END IF;

  INSERT INTO members (
    first_name, last_name, email, phone, date_of_birth, status,
    address_line_1, address_line_2, city, province, county, postal_code, country,
    gps_lat, gps_lng, map_link,
    title, nickname, gender, nationality, marital_status,
    passport_number, an_ss_number, nie_dni,
    consent_state, deceased_at, language_notes, special_instructions,
    crm_source, crm_source_id, crm_created_at
  )
  SELECT
    m->>'first_name', m->>'last_name', m->>'email', m->>'phone',
    (m->>'date_of_birth')::date,
    COALESCE((m->>'status')::member_status, 'inactive'),
    m->>'address_line_1', m->>'address_line_2', m->>'city', m->>'province',
    m->>'county', m->>'postal_code', COALESCE(m->>'country', 'Spain'),
    (m->>'gps_lat')::numeric, (m->>'gps_lng')::numeric, m->>'map_link',
    m->>'title', m->>'nickname', m->>'gender', m->>'nationality', m->>'marital_status',
    m->>'passport_number', m->>'an_ss_number', m->>'nie_dni',
    m->>'consent_state', (m->>'deceased_at')::date, m->>'language_notes',
    m->>'special_instructions',
    m->>'crm_source', m->>'crm_source_id', (m->>'crm_created_at')::timestamptz
  FROM jsonb_extract_path(payload, 'member') AS m
  RETURNING id INTO v_member_id;

  -- CRM profile (stage / status / referral source / tags)
  IF payload ? 'crmProfile' AND payload->'crmProfile' <> 'null'::jsonb THEN
    INSERT INTO crm_profiles (member_id, stage, status, referral_source, tags, groups)
    SELECT v_member_id, p->>'stage', p->>'status', p->>'referral_source',
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'tags')), '{}'),
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'groups')), '{}')
    FROM jsonb_extract_path(payload, 'crmProfile') AS p;
  END IF;

  -- Medical
  IF payload ? 'medical' AND payload->'medical' <> 'null'::jsonb THEN
    INSERT INTO medical_information (
      member_id, medical_conditions, medications, allergies, blood_type,
      doctor_name, doctor_phone, doctor_location, hospital_preference,
      mobility, hearing_notes, vision_notes, meds_location, meds_notes,
      private_insurer, private_policy_number, additional_notes
    )
    SELECT v_member_id,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(x->'medical_conditions')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(x->'medications')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(x->'allergies')), '{}'),
      x->>'blood_type', x->>'doctor_name', x->>'doctor_phone', x->>'doctor_location',
      x->>'hospital_preference', x->>'mobility', x->>'hearing_notes', x->>'vision_notes',
      x->>'meds_location', x->>'meds_notes', x->>'private_insurer',
      x->>'private_policy_number', x->>'additional_notes'
    FROM jsonb_extract_path(payload, 'medical') AS x;
  END IF;

  -- Emergency contacts and key holders, in the order the mapper produced.
  FOR v_contact IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'contacts', '[]'::jsonb))
  LOOP
    INSERT INTO emergency_contacts (
      member_id, contact_name, phone, relationship, priority_order, is_primary, contact_type
    )
    VALUES (
      v_member_id,
      v_contact->>'contactName',
      COALESCE(v_contact->>'phone', 'N/A'),
      COALESCE(v_contact->>'relationship', 'Unknown'),
      COALESCE((v_contact->>'priorityOrder')::int, 99),
      COALESCE((v_contact->>'priorityOrder')::int, 99) = 1,
      COALESCE(v_contact->>'contactType', 'emergency')
    );
  END LOOP;

  FOR v_email IN SELECT jsonb_array_elements_text(COALESCE(payload->'extraEmails', '[]'::jsonb))
  LOOP
    INSERT INTO member_contact_methods (member_id, type, label, value, is_primary)
    VALUES (v_member_id, 'email', 'crm', v_email, false);
  END LOOP;

  FOR v_phone IN SELECT jsonb_array_elements_text(COALESCE(payload->'extraPhones', '[]'::jsonb))
  LOOP
    INSERT INTO member_contact_methods (member_id, type, label, value, is_primary)
    VALUES (v_member_id, 'phone', 'crm', v_phone, false);
  END LOOP;

  -- Postal address, only when it differs from the home address on members.
  IF payload ? 'postalAddress' AND payload->'postalAddress' <> 'null'::jsonb THEN
    INSERT INTO member_addresses (member_id, address_type, address_line_1, city, province, postal_code)
    SELECT v_member_id, 'postal', a->>'address_line_1', a->>'city', a->>'province', a->>'postal_code'
    FROM jsonb_extract_path(payload, 'postalAddress') AS a;
  END IF;

  IF payload ? 'access' AND payload->'access' <> 'null'::jsonb THEN
    INSERT INTO member_access (member_id, key_safe_location, key_safe_code)
    SELECT v_member_id, a->>'key_safe_location', a->>'key_safe_code'
    FROM jsonb_extract_path(payload, 'access') AS a;
  END IF;

  IF payload ? 'endOfLife' AND payload->'endOfLife' <> 'null'::jsonb THEN
    INSERT INTO member_end_of_life (member_id, funeral_plan, policy_number, wishes)
    SELECT v_member_id, e->>'funeral_plan', e->>'policy_number', e->>'wishes'
    FROM jsonb_extract_path(payload, 'endOfLife') AS e;
  END IF;

  -- Device. idx_devices_one_member allows a device to belong to at most one
  -- member, and imei is effectively an identity: if the pendant is already on
  -- record we warn rather than abort the whole import.
  IF payload ? 'device' AND payload->'device' <> 'null'::jsonb THEN
    SELECT id INTO v_device_exists FROM devices WHERE imei = payload #>> '{device,imei}';

    IF v_device_exists IS NOT NULL THEN
      v_warnings := v_warnings || format('device %s already on record, not reassigned', payload #>> '{device,imei}');
    ELSE
      INSERT INTO devices (
        imei, docking_station_mac, sim_phone_number, device_type, manufacturer,
        unit_type, notes, member_id, status
      )
      SELECT d->>'imei', d->>'docking_station_mac',
             COALESCE(d->>'sim_phone_number', 'TBD'),
             d->>'device_type', d->>'manufacturer', d->>'unit_type', d->>'notes',
             v_member_id, 'active'
      FROM jsonb_extract_path(payload, 'device') AS d;
    END IF;
  END IF;

  -- Subscription. status 'pending' on purpose — see the header.
  IF payload ? 'subscription' AND payload->'subscription' <> 'null'::jsonb THEN
    INSERT INTO subscriptions (
      member_id, plan_type, billing_frequency, status, start_date, renewal_date,
      has_pendant, amount, legacy_membership_label, payment_arrangement,
      monthly_payment_date, arrears_note, is_free_of_charge
    )
    SELECT v_member_id,
      COALESCE((s->>'plan_type')::plan_type, 'single'),
      COALESCE((s->>'billing_frequency')::billing_frequency, 'annual'),
      'pending',
      COALESCE((s->>'start_date')::date, CURRENT_DATE),
      COALESCE((s->>'start_date')::date, CURRENT_DATE) + INTERVAL '1 year',
      COALESCE((s->>'has_pendant')::boolean, false),
      COALESCE((s->>'amount')::numeric, 0),
      s->>'legacy_membership_label', s->>'payment_arrangement',
      s->>'monthly_payment_date', s->>'arrears_note',
      COALESCE((s->>'is_free_of_charge')::boolean, false)
    FROM jsonb_extract_path(payload, 'subscription') AS s;
  END IF;

  -- The CRM note text, kept as a note as well as in special_instructions.
  IF NULLIF(payload->>'notes', '') IS NOT NULL THEN
    INSERT INTO member_notes (member_id, content, note_type)
    VALUES (v_member_id, payload->>'notes', 'general');
  END IF;

  RETURN jsonb_build_object(
    'member_id', v_member_id,
    'created', true,
    'warnings', to_jsonb(v_warnings)
  );
END;
$$;

COMMENT ON FUNCTION public.ice_import_member(jsonb) IS
  'Imports one member from the ICE/KarmaCRM export in a single transaction. Admin only. Idempotent on (crm_source, crm_source_id). Subscriptions are created pending, never active.';

REVOKE ALL ON FUNCTION public.ice_import_member(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.ice_import_member(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ice_import_member(jsonb) TO authenticated;
