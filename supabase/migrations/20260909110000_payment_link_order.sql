-- Item 4 — the rows behind a staff-sent payment link, and the one rule that makes them safe.
--
-- TWO THINGS, and they belong together because the second is what stops the first from being a
-- way to grant a free membership:
--
--   1. create_payment_link_order() — one transaction that records a PENDING order, its items, a
--      PENDING subscription and a PENDING payment for a member who already exists, so
--      `send-payment-link` can hand Stripe a set of ids to stamp into metadata. It activates
--      nothing.
--   2. guard_member_status_self_write() gains a clause: STAFF may no longer set a member to
--      `active` unless a subscription says somebody paid.
--
-- ── 1. WHY A SQL FUNCTION AND NOT THREE INSERTS IN THE EDGE FUNCTION ───────
--
-- Because a half-written billing record is worse than none. Three sequential inserts from Deno
-- fail in the middle sooner or later — a network blip after the order and before the payment
-- leaves an order nobody can pay and a member who looks half-billed — and the compensating
-- deletes are code that only runs on the day it is needed. One transaction has neither problem.
-- It is also testable: scripts/rls/isolation.sql calls this with a real payload against real
-- constraints, which is how five text→enum casts were found in submit_registration_atomic
-- (F-cast, 20260908120500) after a static read of the same function had missed them.
--
-- WHY NOT submit_registration_atomic ITSELF, which the brief offers as the alternative: it
-- CREATES the member, the medical row and the emergency contacts. Here the member already
-- exists — a staff member is looking at their CRM record — so calling it would either duplicate
-- the person or need a mode flag threading through 500 lines of registration logic. "Or its
-- equivalent" is this: the same rows, the same shapes, the same order number sequence, without
-- the half that makes a person.
--
-- THE AMOUNTS ARE THE SERVER'S, and this function re-checks them. Every figure arrives already
-- computed by `_shared/pricing-calc.ts` — the same module the public pages, submit-registration
-- and the Stripe price sync use, so there is no second pricing implementation — and the browser
-- sends none of them (REVIEW_JOIN_PATH.md F7/F9 was exactly that defect on the join path). This
-- function still asserts the parts sum to the total, because a payload assembled wrongly is a
-- customer charged wrongly, and the check costs one comparison.
--
-- ── 2. WHY STAFF CAN NO LONGER TYPE A MEMBER INTO `active` ─────────────────
--
-- 20260904180000 closed the member half of golden rule 4: a member cannot self-activate. It let
-- staff through, on the reasoning that suspending an account is a real operator action. That is
-- true of SUSPENDING. It is not true of the other direction: `MemberDetailPage.handleSuspend`
-- writes `status: member.status === "suspended" ? "active" : "suspended"` straight from the
-- browser, so one click on an UNPAID member's record grants them an active membership with no
-- payment anywhere — and src/test/webhookActivationContract.test.ts missed it for a year because
-- its guard looks for the literal `status: "active"` and this is a ternary.
--
-- So: staff may still set any status they like EXCEPT `active`, and they may set `active` only
-- when a subscription for that member says money is involved (`active` or `past_due` — P4 keeps
-- monitoring running through a failed payment, so a past_due member being un-suspended is
-- legitimate). Restoring a paid member after a suspension still works, which is the case the
-- original exception was written for. Granting a membership from a dropdown does not.
--
-- Golden rule 4 is not weakened anywhere: the subscription that unlocks this is written by the
-- payment webhook, so activation still ORIGINATES from a payment.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.create_payment_link_order(jsonb);
--   -- then re-create guard_member_status_self_write() from 20260904180000 verbatim, which
--   -- restores the staff exception in full.
--   Drops no data: the function only ever inserted rows, and those rows are ordinary orders.

-- ── the rows ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_payment_link_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id        uuid := (payload->>'memberId')::uuid;
  v_membership_type  text := payload->>'membershipType';
  v_billing          text := payload->>'billingFrequency';
  v_pendant_count    integer := COALESCE((payload->>'pendantCount')::integer, 0);
  v_payer_id         uuid := NULLIF(payload->>'payerId', '')::uuid;
  v_staff_id         uuid := NULLIF(payload->>'createdByStaffId', '')::uuid;
  v_method           text := COALESCE(payload->>'paymentMethod', 'stripe');

  a                  jsonb := payload->'amounts';
  v_sub_net          numeric := (a->>'subscriptionNet')::numeric;
  v_sub_tax          numeric := (a->>'subscriptionTax')::numeric;
  v_sub_final        numeric := (a->>'subscriptionFinal')::numeric;
  v_sub_tax_rate     numeric := COALESCE((a->>'subscriptionTaxRate')::numeric, 0);
  v_pendant_net      numeric := COALESCE((a->>'pendantNet')::numeric, 0);
  v_pendant_tax      numeric := COALESCE((a->>'pendantTax')::numeric, 0);
  v_pendant_final    numeric := COALESCE((a->>'pendantFinal')::numeric, 0);
  v_pendant_tax_rate numeric := COALESCE((a->>'pendantTaxRate')::numeric, 0);
  v_fee              numeric := COALESCE((a->>'registrationFee')::numeric, 0);
  v_shipping         numeric := COALESCE((a->>'shipping')::numeric, 0);
  v_total            numeric := (a->>'total')::numeric;

  v_member           public.members;
  v_today            date := CURRENT_DATE;
  v_renewal_date     date;
  v_order_number     text;
  v_order_id         uuid;
  v_payment_id       uuid;
  v_subscription_id  uuid;
BEGIN
  -- ── refuse a payload that cannot be a real order ─────────────────────────
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'create_payment_link_order: memberId is required'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  SELECT * INTO v_member FROM public.members WHERE id = v_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_payment_link_order: no member %', v_member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_membership_type NOT IN ('single', 'couple') THEN
    RAISE EXCEPTION 'create_payment_link_order: membershipType must be single or couple (got %)',
      COALESCE(v_membership_type, 'null') USING ERRCODE = 'check_violation';
  END IF;

  IF v_billing NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'create_payment_link_order: billingFrequency must be monthly or annual (got %)',
      COALESCE(v_billing, 'null') USING ERRCODE = 'check_violation';
  END IF;

  -- Two people, two pendants; nobody needs three. A typo in a quantity is money.
  IF v_pendant_count < 0 OR v_pendant_count > 2 THEN
    RAISE EXCEPTION 'create_payment_link_order: pendantCount must be 0..2 (got %)', v_pendant_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'create_payment_link_order: total must be positive (got %)',
      COALESCE(v_total::text, 'null') USING ERRCODE = 'check_violation';
  END IF;

  -- The parts must make the whole. Half a cent of tolerance, because these are decimals that
  -- have been through a JSON round trip, not because the sum is allowed to be approximate.
  IF abs((v_sub_final + v_pendant_final + v_fee + v_shipping) - v_total) > 0.005 THEN
    RAISE EXCEPTION
      'create_payment_link_order: amounts do not sum to the total (% + % + % + % <> %)',
      v_sub_final, v_pendant_final, v_fee, v_shipping, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  -- An already-paying member must not be quietly signed up a second time. Re-sending a link to
  -- somebody whose previous link is still unpaid IS allowed: that is the normal chase.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.member_id = v_member_id AND s.status IN ('active', 'past_due')
  ) THEN
    RAISE EXCEPTION
      'create_payment_link_order: member % already has a live subscription — change the plan '
      'instead of creating a second one', v_member_id
      USING ERRCODE = 'unique_violation';
  END IF;

  v_renewal_date := CASE WHEN v_billing = 'annual'
                         THEN v_today + INTERVAL '1 year'
                         ELSE v_today + INTERVAL '1 month' END;

  -- ── the subscription: PENDING, and nothing else ──────────────────────────
  -- `amount` is the net figure submit_registration_atomic stores, so the two paths put the same
  -- kind of number in the same column. Activation, the Stripe ids and the customer id are all
  -- the webhook's to write.
  INSERT INTO public.subscriptions (
    member_id, plan_type, billing_frequency, amount,
    start_date, renewal_date, has_pendant, registration_fee_paid,
    status, payment_method, payer_id
  ) VALUES (
    v_member_id,
    v_membership_type::public.plan_type,
    v_billing::public.billing_frequency,
    v_sub_net, v_today, v_renewal_date,
    v_pendant_count > 0, false,
    'pending',
    v_method::public.payment_method,
    v_payer_id
  )
  RETURNING id INTO v_subscription_id;

  -- ── the order ────────────────────────────────────────────────────────────
  -- Same sequence-based number as the registration path (20260908120500), so an order number
  -- read out on the phone means the same thing whichever way the member arrived. Shipping goes
  -- to the member's own address: the payer may be somebody else, but the pendant is worn by the
  -- member and posting it to whoever is paying would be a life-safety defect, not a convenience.
  v_order_number := 'ICE-' || TO_CHAR(now(), 'YYYYMMDD') || '-'
                    || LPAD(nextval('public.order_number_seq')::text, 5, '0');

  INSERT INTO public.orders (
    member_id, order_number, status, subtotal, tax_amount,
    total_amount, shipping_amount,
    shipping_address_line_1, shipping_address_line_2,
    shipping_city, shipping_province, shipping_postal_code, shipping_country,
    notes
  ) VALUES (
    v_member_id, v_order_number, 'pending',
    v_sub_net + v_pendant_net + v_fee,
    v_sub_tax + v_pendant_tax,
    v_total, v_shipping,
    v_member.address_line_1, v_member.address_line_2,
    v_member.city, v_member.province, v_member.postal_code,
    COALESCE(v_member.country, 'Spain'),
    'Payment link sent by staff'
  )
  RETURNING id INTO v_order_id;

  -- fulfilment_state is left to its DEFAULT, which is `awaiting_payment` since 20260908120400.
  -- Setting it here would be the same value written twice, and the second writer is the one that
  -- goes stale when the default changes.

  INSERT INTO public.order_items (
    order_id, item_type, description, quantity, unit_price, tax_rate, tax_amount, total_price
  ) VALUES (
    v_order_id, 'subscription',
    CASE WHEN v_membership_type = 'couple' THEN 'Couple' ELSE 'Individual' END
      || ' Membership - '
      || CASE WHEN v_billing = 'annual' THEN 'Annual' ELSE 'Monthly' END,
    1, v_sub_net, v_sub_tax_rate, v_sub_tax, v_sub_final
  );

  IF v_pendant_count > 0 THEN
    INSERT INTO public.order_items (
      order_id, item_type, description, quantity, unit_price, tax_rate, tax_amount, total_price
    ) VALUES (
      v_order_id, 'pendant', 'GPS Safety Pendant',
      v_pendant_count, v_pendant_net / v_pendant_count, v_pendant_tax_rate,
      v_pendant_tax, v_pendant_final
    );
  END IF;

  IF v_fee > 0 THEN
    INSERT INTO public.order_items (
      order_id, item_type, description, quantity, unit_price, tax_rate, tax_amount, total_price
    ) VALUES (
      v_order_id, 'registration_fee', 'One-time Registration Fee', 1, v_fee, 0, 0, v_fee
    );
  END IF;

  -- ── the payment: PENDING, waiting for the webhook ────────────────────────
  INSERT INTO public.payments (
    member_id, subscription_id, order_id, amount, payment_type, payment_method, status
  ) VALUES (
    v_member_id, v_subscription_id, v_order_id, v_total, 'order',
    v_method::public.payment_method, 'pending'
  )
  RETURNING id INTO v_payment_id;

  -- ── the audit line ───────────────────────────────────────────────────────
  -- entity_type 'order' and member_action NULL, so the WP7 attribution guard
  -- (20260907100500) treats this as an ordinary log row: it is not one of the five subscription
  -- actions, and demanding a typed reason for "a link was sent" would be noise. staff_id is
  -- whoever pressed the button, and it is the whole point of the row — "who signed this member
  -- up, and when" must be answerable without reading Stripe.
  IF v_staff_id IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      staff_id, action, entity_type, entity_id, new_values, reason
    ) VALUES (
      v_staff_id, 'payment_link_order_created', 'order', v_order_id,
      jsonb_build_object(
        'member_id', v_member_id,
        'order_number', v_order_number,
        'plan_type', v_membership_type,
        'billing_frequency', v_billing,
        'pendant_count', v_pendant_count,
        'total', v_total,
        'payer_id', v_payer_id,
        'subscription_id', v_subscription_id,
        'payment_id', v_payment_id
      ),
      format('payment link prepared for %s (%s, %s)', v_member_id, v_membership_type, v_billing)
    );
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'paymentId', v_payment_id,
    'subscriptionId', v_subscription_id,
    'total', v_total
  );
END $$;

COMMENT ON FUNCTION public.create_payment_link_order(jsonb) IS
  'Records the PENDING order + items + subscription + payment behind a staff-sent Stripe '
  'payment link, in one transaction, for a member who already exists. Activates nothing: '
  'members.status, subscriptions.status=active and every Stripe id are the payment webhook''s '
  'to write (golden rule 4). service_role only — the amounts it is given must come from '
  '_shared/pricing-calc.ts on the server, never from a browser.';

-- service_role only. This function creates billing records; a signed-in staff account calling
-- it directly from the browser would be a way to create an order with amounts of its choosing,
-- which is the F7 defect rebuilt one layer down. `send-payment-link` verifies the caller is
-- staff and then calls this with the server's own figures.
REVOKE ALL ON FUNCTION public.create_payment_link_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_link_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_link_order(jsonb) TO service_role;

-- ── the rule: staff cannot type a member into `active` ─────────────────────
-- Whole-function replace (a PL/pgSQL body cannot be patched). The only change from
-- 20260904180000 is the staff branch, which was `RETURN NEW` unconditionally.
CREATE OR REPLACE FUNCTION public.guard_member_status_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- service_role (the payment webhook, submit_registration_atomic, a migration) has no
  -- auth.uid(). That is the ONLY route by which an unpaid member becomes active, which is
  -- golden rule 4 stated as a code path.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(auth.uid()) THEN
    -- Suspending, deactivating, reinstating to `inactive` — all still an operator's call.
    IF NEW.status <> 'active' THEN
      RETURN NEW;
    END IF;

    -- Moving a member INTO `active` is a claim that they are paid up, so a payment must exist
    -- to point at. `past_due` counts: P4 keeps monitoring running while Stripe retries, so a
    -- member whose card failed is still a paying member and can still be un-suspended.
    IF EXISTS (
      SELECT 1 FROM public.subscriptions s
       WHERE s.member_id = NEW.id AND s.status IN ('active', 'past_due')
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'members.status cannot be set to active without a paid subscription: activation is the '
      'payment webhook''s job (golden rule 4). Member % has no active or past_due subscription. '
      'Send them a payment link instead.', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Anyone else changing status is the member changing their own, because RLS has already
  -- restricted them to their own row. Refuse loudly: a silent revert would leave the member
  -- believing they had activated themselves.
  RAISE EXCEPTION
    'members.status is not self-writable: activation is the payment webhook''s job (golden rule 4). Attempted % -> %',
    OLD.status, NEW.status
    USING ERRCODE = 'insufficient_privilege';
END $$;

COMMENT ON FUNCTION public.guard_member_status_self_write() IS
  'members.status: a member can never change their own; staff can change it to anything EXCEPT '
  'active, and to active only when a subscription for that member is active or past_due; the '
  'service role (the payment webhook) is unrestricted. Golden rule 4 as a code path.';
