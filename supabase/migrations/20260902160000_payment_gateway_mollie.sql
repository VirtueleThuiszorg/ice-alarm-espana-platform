-- Point the active payment gateway at Mollie, and refuse to be quiet about it.
--
-- WHY. `20260228180000_add_mollie_payment_gateway.sql` seeded
-- `settings_active_payment_gateway` with the literal 'stripe' and nothing has
-- written it since. ICE Alarm España takes payment through **Mollie** — SEPA
-- direct debit and cards — so that row has been pointing at the wrong provider
-- for as long as it has existed.
--
-- The damage from getting this wrong is not a failed checkout, which would at
-- least be visible. It is a *successful* one: the customer pays through a
-- gateway whose webhook nobody is listening to, `submit_registration_atomic`
-- has already written the member as inactive awaiting that webhook, and the
-- webhook never comes. Money taken, nobody monitored, and no error anywhere.
--
-- The code side of this is fixed in the same branch: neither
-- `submit-registration` nor `usePricingSettings` defaults to a gateway any
-- more. A missing or unrecognised value now stops the registration instead of
-- guessing. This migration makes sure there is a value to find.
--
-- REVERSIBLE. To go back to Stripe:
--   UPDATE public.system_settings SET value = 'stripe'
--    WHERE key = 'settings_active_payment_gateway';

DO $$
DECLARE
  v_before text;
  v_mollie text;
  v_secret text;
BEGIN
  -- Read BEFORE inserting, so the notice can tell the truth about what was
  -- there: an absent row and a row already saying 'mollie' are different
  -- situations and should not report the same way.
  SELECT value INTO v_before
    FROM public.system_settings
   WHERE key = 'settings_active_payment_gateway';

  IF v_before IS NULL THEN
    INSERT INTO public.system_settings (key, value)
    VALUES ('settings_active_payment_gateway', 'mollie');
    RAISE NOTICE 'active payment gateway: row was missing, created as mollie';

  ELSIF btrim(v_before) IN ('', 'stripe') THEN
    -- Only move the untouched seed (or an empty value). If an admin has
    -- deliberately set something, a migration is the wrong place to overrule
    -- them.
    UPDATE public.system_settings
       SET value = 'mollie'
     WHERE key = 'settings_active_payment_gateway';
    RAISE NOTICE 'active payment gateway: % -> mollie',
      COALESCE(NULLIF(btrim(v_before), ''), '(empty)');

  ELSIF btrim(v_before) = 'mollie' THEN
    RAISE NOTICE 'active payment gateway already mollie, left alone';

  ELSE
    -- Neither 'stripe' nor 'mollie'. The application now refuses to register
    -- anyone rather than guess a provider, so this is a stopped checkout, not
    -- a curiosity.
    RAISE WARNING 'active payment gateway is "%", which is not stripe or mollie. Registration will be REFUSED with GATEWAY_NOT_CONFIGURED until this is corrected. Left as-is rather than overruled by a migration.', v_before;
  END IF;

  -- Pointing at Mollie with no credentials is a checkout that fails for every
  -- customer. `create-mollie-checkout` returns MOLLIE_NOT_CONFIGURED and the
  -- join flow shows "gateway not configured", so it fails visibly rather than
  -- silently — but it should never reach production, so say so loudly here.
  SELECT btrim(COALESCE(value, '')) INTO v_mollie
    FROM public.system_settings WHERE key = 'settings_mollie_api_key';
  SELECT btrim(COALESCE(value, '')) INTO v_secret
    FROM public.system_settings WHERE key = 'settings_mollie_webhook_secret';

  IF COALESCE(v_mollie, '') = '' THEN
    RAISE WARNING 'settings_mollie_api_key is empty. The gateway now points at Mollie and NO CUSTOMER CAN CHECK OUT until the key is set in Admin -> Settings -> Payments.';
  END IF;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE WARNING 'settings_mollie_webhook_secret is empty. Payments would complete at Mollie but the webhook could not be verified, so NO MEMBER WOULD ACTIVATE. Set it before taking a live payment.';
  END IF;
END $$;

COMMENT ON TABLE public.system_settings IS
  'Runtime settings read by the app and by edge functions. settings_active_payment_gateway is one of ''stripe'' | ''mollie'' and has NO default in code — an unrecognised value stops registration rather than guessing a provider.';
