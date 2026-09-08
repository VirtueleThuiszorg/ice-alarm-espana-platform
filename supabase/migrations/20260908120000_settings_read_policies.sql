-- Join-path schema, part 1 of the held bundle: who may READ system_settings.
--
-- Three defects from REVIEW_JOIN_PATH.md, all in one table's policies, all fixed together
-- because they are the same policy set and splitting them would leave a half-open door.
--
-- F2 (BLOCKER) — THE ANONYMOUS JOINER CANNOT READ THE GATEWAY SETTING.
-- `usePricingSettings` selects four keys; the public whitelist (20260203185605) contains none
-- of them, and RLS filters rows rather than erroring, so the hook resolves
-- `activeGateway = null` and JoinPaymentStep refuses with "gateway not configured". Nobody can
-- pay. An earlier policy (20260123130139) did include the fee keys and was replaced by the
-- narrower whitelist, which is how this was lost. The three keys the join flow needs are added
-- here — and only those three.
--
--   * settings_active_payment_gateway — which gateway to send the customer to.
--   * registration_fee_enabled        — whether the one-off fee is charged at all.
--   * registration_fee_discount       — the percentage off it.
--
-- `registration_test_mode_enabled` is deliberately NOT public. The wizard asks for it, but it
-- only decides whether an orange "complete without paying" button renders, and
-- `submit-registration` ignores the client's `testMode` and re-reads the setting itself
-- (pinned by src/test/testModeServerSide.test.ts). Keeping it staff-only costs an anonymous
-- visitor nothing except that button, and the sanctioned check on the live flow is a real card
-- through /join, refunded (PENDING_FOR_LEE.md).
--
-- F12 (HIGH) — EVERY ACTIVE STAFF ACCOUNT COULD READ THE PAYMENT SECRETS.
-- "Staff can view all settings" was `USING (public.is_staff(auth.uid()))` with no key
-- restriction, so any call-centre login could `select value from system_settings where key =
-- 'settings_stripe_secret_key'` and hold the key that can move money — plus the Twilio auth
-- token, the Mollie API key, the Facebook page token, and the device check-in key. Staff now
-- read everything EXCEPT credential-shaped keys; super_admin keeps the lot through the existing
-- "Super admins can manage settings" policy, which is what the admin Settings page needs.
--
-- The pattern is `(secret|token|password|api_key|_key)`. The last alternative is an addition to
-- the four names the brief lists, and it is there for one key: `settings_ev07b_checkin_key`,
-- the shared secret an EV07B pendant authenticates its check-ins with. It matches none of the
-- other four, and a life-safety device credential readable by every operator account is exactly
-- what this policy exists to stop. Nothing legitimate in the current key set ends in `_key`
-- (`settings_gps_gateway_port`, `settings_twilio_sms_number`, the company keys and the youtube
-- defaults are all unaffected), and the write path is unchanged: only super_admin has ever been
-- able to UPDATE a setting, so no staff account can blank a value it can no longer see.
--
-- Edge functions are unaffected — they read settings with the service role, which bypasses RLS.
--
-- P5 — ONE KEY FOR THE REGISTRATION FEE, NOT TWO FAMILIES OF IT.
-- The admin Settings page writes `settings_registration_fee_enabled` /
-- `settings_registration_fee_discount` (SettingsPage.tsx:57-58), while the wizard
-- (usePricingSettings.ts:45) and the server (submit-registration/index.ts:228) read
-- `registration_fee_enabled` / `registration_fee_discount`. The admin switch has therefore never
-- changed what a customer is charged: turning the fee off in the UI still charges €59.99. The
-- canonical pair is the one the money path reads. Any value sitting in the `settings_`-prefixed
-- rows is copied across ONLY where the canonical row is absent — so this is safe to apply
-- before or after the code change that points the admin page at the canonical keys — and the
-- old rows are then removed so nothing can write to a key nobody reads.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "Anyone can read the public settings whitelist" ON public.system_settings;
--   DROP POLICY IF EXISTS "Staff can view non-credential settings" ON public.system_settings;
--   CREATE POLICY "Public can read whitelisted settings only" ON public.system_settings
--     FOR SELECT USING (key IN ('settings_company_name','settings_emergency_phone',
--                               'settings_support_email','settings_address'));
--   CREATE POLICY "Staff can view all settings" ON public.system_settings
--     FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
--   The P5 key rename is data, not structure; to undo it:
--   INSERT INTO public.system_settings (key, value)
--     SELECT 'settings_' || key, value FROM public.system_settings
--      WHERE key IN ('registration_fee_enabled','registration_fee_discount')
--     ON CONFLICT (key) DO NOTHING;

-- ── F2: the three keys the anonymous join flow needs ───────────────────────
DROP POLICY IF EXISTS "Public can read whitelisted settings only" ON public.system_settings;
DROP POLICY IF EXISTS "Public can read company settings" ON public.system_settings;
-- ...and this file's own policy, so re-applying the migration is a no-op rather than an error.
-- Not decoration: scripts/rls/isolation.sql re-executes this file to prove the P5 key
-- consolidation below against stale rows, which a fresh database cannot contain.
DROP POLICY IF EXISTS "Anyone can read the public settings whitelist" ON public.system_settings;

-- Scoped `TO anon, authenticated` rather than left role-less. The policy it replaces applied to
-- every role including service_role, which was harmless but said nothing true about intent.
CREATE POLICY "Anyone can read the public settings whitelist"
ON public.system_settings
FOR SELECT
TO anon, authenticated
USING (
  key IN (
    -- company contact details, rendered on public pages
    'settings_company_name',
    'settings_emergency_phone',
    'settings_support_email',
    'settings_address',
    -- what /join needs before it can take a payment
    'settings_active_payment_gateway',
    'registration_fee_enabled',
    'registration_fee_discount'
  )
);

-- ── F12: staff read everything except credentials ──────────────────────────
DROP POLICY IF EXISTS "Staff can view all settings" ON public.system_settings;
DROP POLICY IF EXISTS "Staff can view settings" ON public.system_settings;
DROP POLICY IF EXISTS "Staff can view non-credential settings" ON public.system_settings;

CREATE POLICY "Staff can view non-credential settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  AND key !~* '(secret|token|password|api_key|_key)'
);

COMMENT ON TABLE public.system_settings IS
  'Key/value platform settings. READ: seven keys are public (company contact details plus the '
  'three the anonymous /join flow needs); staff read everything except keys matching '
  '(secret|token|password|api_key|_key); super_admin reads and writes all of it. WRITE: '
  'super_admin only. Edge functions use the service role and bypass RLS. '
  'Gateway credentials live here rather than in Supabase secrets — see PENDING_FOR_LEE.md.';

-- ── P5: one registration-fee key, not two ──────────────────────────────────
-- Fill the canonical rows from the admin-written ones only where the canonical row is missing,
-- so a correct value already in place is never overwritten by a stale one.
INSERT INTO public.system_settings (key, value)
SELECT substring(key from 10), value      -- strips the leading 'settings_'
  FROM public.system_settings
 WHERE key IN ('settings_registration_fee_enabled', 'settings_registration_fee_discount')
ON CONFLICT (key) DO NOTHING;

DELETE FROM public.system_settings
 WHERE key IN ('settings_registration_fee_enabled', 'settings_registration_fee_discount');
