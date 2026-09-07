-- WP1(b), the half that was never built — seed the 24-hour number.
--
-- CC_MASTER_BRIEF.md WP1(b) is two things: "Migration: seed system_settings.emergency_phone =
-- '950 473 199' if absent" AND "Remove the hardcoded fallback in useCompanySettings.ts and
-- App.tsx". The second half shipped in #172. THE FIRST HALF NEVER DID.
--
-- So the fake number (+34 900 123 456, a number this company does not own, as a live tel: link)
-- was correctly removed, and nothing put the real one in its place. The result is live right
-- now: `useCompanySettings` logs "settings_emergency_phone is not set" and renders NOTHING —
-- public site, pendant page, member device/support/dashboard, join confirmation, invoices. A
-- member looking for the 24-hour number finds no number at all.
--
-- It has been sitting in PENDING_FOR_LEE.md as a manual table edit (S6) since 5 September,
-- described there as "the highest-value five-second job on this list". It was never a manual
-- job: the brief asked for a migration, and a migration is reproducible, reviewable and applies
-- to every environment rather than to whichever one somebody remembered.
--
-- THE KEY IS `settings_emergency_phone`, NOT `emergency_phone`. The brief writes the latter;
-- the code reads the former (useCompanySettings.ts:35, and the public-read RLS policies in
-- 20260123130139 and 20260203185605 whitelist the `settings_` prefixed name). Seeding the
-- brief's spelling literally would create a row nothing reads and leave the bug in place.
--
-- ON CONFLICT DO NOTHING: if Lee has already set it by hand, his value wins. A migration that
-- overwrites live configuration with a hardcoded constant is how a corrected number gets
-- un-corrected on the next deploy.
--
-- ROLLBACK: DELETE FROM public.system_settings WHERE key = 'settings_emergency_phone';
--   Reversible, and reverting restores the "no number anywhere" state — so only do it
--   alongside restoring a real value by another route.

INSERT INTO public.system_settings (key, value)
VALUES ('settings_emergency_phone', '950 473 199')
ON CONFLICT (key) DO NOTHING;
