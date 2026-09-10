-- MEMBER ALERT HISTORY, OFF BY DEFAULT — and readable by the member whose account it governs.
--
-- WHY THE SETTING EXISTS. A member's alert history is a list of the times their alarm went off.
-- For most members most of the time it is empty, and the empty state is the good outcome — but
-- for the members it is NOT empty for, it is a list of their own worst days, on the screen they
-- open to check their alarm still works. Whether to show it at all is a product decision, not a
-- code decision, so it becomes a setting rather than a deletion. Nothing about how alerts are
-- CREATED, escalated or seen by staff changes: this governs member display only.
--
-- WHY IT IS PUBLIC-WHITELISTED. The member's own portal has to read it before it can decide
-- whether to render a sidebar item, and a member is `authenticated` with no staff row. Without
-- the whitelist the read returns nothing, the value is indistinguishable from "off", and the
-- setting would appear to work while being permanently stuck — the same shape of silent failure
-- as `usePricingSettings` reading four keys that the whitelist did not contain (20260908120000).
--
-- It carries no secret: it is one boolean about which nav items a member sees.
--
-- WHY THE KEY HAS NO `settings_` PREFIX. `member_` is its namespace, the way `holiday_` and
-- `registration_` are namespaces in this table already. It matters here rather than being a
-- style question: `save-api-keys` prefixes an incoming key with its `service` unless the key
-- already starts with it, so the admin switch calls that function with `service: 'member'` and
-- the key is written verbatim. The same arrangement `HolidayPolicyCard` uses with `holiday`.

-- ── the setting ────────────────────────────────────────────────────────────
--
-- FALSE, and ON CONFLICT DO NOTHING. Re-applying this migration must not reset a value Lee has
-- since turned on: a migration that silently un-does an admin's decision is worse than one that
-- fails loudly.
INSERT INTO public.system_settings (key, value)
VALUES ('member_alert_history_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ── the whitelist, with one key added ──────────────────────────────────────
--
-- REPLACED WHOLE rather than patched, because a policy cannot be altered in place — and because
-- CLAUDE.md's rule about accreted patch-on-patch policies applies hardest to the one policy that
-- decides what an anonymous visitor may read. The list below is 20260908120000's seven keys plus
-- `member_alert_history_enabled`; nothing else changes, and the previous file's own comment about
-- each group is carried forward so the reasons do not get lost in the copy.
--
-- TO REVERSE: re-run 20260908120000's F2 block, which recreates this policy without the new key.
-- The setting row itself is harmless to leave — with nothing reading it, it is inert.
DROP POLICY IF EXISTS "Anyone can read the public settings whitelist" ON public.system_settings;

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
    'registration_fee_discount',
    -- which member-portal sections a member is shown. Display only: alert creation, escalation
    -- and every staff view are unaffected by it.
    'member_alert_history_enabled'
  )
);

COMMENT ON TABLE public.system_settings IS
  'Platform settings. The public whitelist policy names every key an anonymous or member-level '
  'caller may read; everything else needs staff. Adding a key to that list is a decision to '
  'publish it.';
