-- HOW LONG A PENDANT TEST STAYS GOOD FOR — a row, so it can be changed without a deploy.
--
-- `member_monitoring_readiness.device_tested_at` has always been read on the member dashboard,
-- and always as a NULL CHECK: `const tested = input.readiness?.device_tested_at != null`. The
-- date itself was thrown away. So a member who tested their pendant on the day it arrived
-- fourteen months ago reads "Your pendant is tested and checking in" and has no way to learn
-- that it has been fourteen months — while the knowledge base tells them to test monthly and we
-- ring them monthly to say so.
--
-- ── WHY 90 AND NOT 30 ───────────────────────────────────────────────────────
--
-- The KB says monthly. A monthly nag on a rung that otherwise reads "all well" is a great deal
-- of noise for a reader this product is trying not to alarm, and a prompt a member learns to
-- scroll past is worth less than no prompt. 90 days is the starting point; this row exists so it
-- can become 30 by editing a value rather than by shipping code.
--
-- ON CONFLICT DO NOTHING, for the reason 20260910190000 gives: re-applying a migration must not
-- reset a number somebody has since changed.
INSERT INTO public.system_settings (key, value)
VALUES ('pendant_test_reminder_days', '90')
ON CONFLICT (key) DO NOTHING;

-- ── the whitelist, with one key added ──────────────────────────────────────
--
-- THE ROW IS INERT WITHOUT THIS, and inert in the worst way: silently. A member is
-- `authenticated` with no staff row, so a key outside the whitelist reads back as nothing, the
-- client falls back to its default, and the setting appears to work while being permanently
-- stuck at 90 — the exact state four pricing keys were in until 20260908120000 and the alert
-- history flag was in until 20260910190000. A row nobody can read is not a setting.
--
-- IS IT GENUINELY PUBLIC? That is the question this list must be read against, rather than "does
-- somebody need it", which is how a whitelist grows. The value is one integer saying how often
-- this company suggests testing a pendant. It names no person, carries no credential, and an
-- anonymous visitor learning that we suggest 90 days learns something the knowledge base already
-- tells them in a sentence.
--
-- REPLACED WHOLE rather than patched: a policy cannot be altered in place, and CLAUDE.md's rule
-- about accreted patch-on-patch policies applies hardest to the one policy that decides what an
-- anonymous visitor may read. The list below is 20260910190000's eight keys plus this one, with
-- that file's own comments carried forward so the reasons are not lost in the copy.
--
-- TO REVERSE: re-run 20260910190000's policy block, which recreates this without the new key.
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
    'member_alert_history_enabled',
    -- how long a pendant test stays good for, in days, before the member's own checklist
    -- suggests another one. Display only, and it changes no alerting: a stale test is still a
    -- pendant that is online and monitored.
    'pendant_test_reminder_days'
  )
);
