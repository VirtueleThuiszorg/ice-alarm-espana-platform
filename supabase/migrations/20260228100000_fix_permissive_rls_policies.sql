-- Fix 6 overly permissive RLS policies that were intended for service_role
-- but missing the TO clause, making them open to all users including anon.

-- ============================================================
-- 1. partner_verification_tokens: FOR ALL USING(true) -> service_role only
-- ============================================================
DROP POLICY IF EXISTS "Service role can manage tokens" ON public.partner_verification_tokens;

CREATE POLICY "Service role can manage tokens"
ON public.partner_verification_tokens FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- 2. registration_drafts: UPDATE USING(true) -> scope to own session
--    The original INSERT policy uses WITH CHECK(true) which is fine
--    for anonymous registration, but UPDATE must be scoped.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can update own draft by session" ON public.registration_drafts;

CREATE POLICY "Anyone can update own draft by session"
ON public.registration_drafts
FOR UPDATE
USING (session_id = current_setting('request.headers', true)::json ->> 'x-session-id')
WITH CHECK (session_id = current_setting('request.headers', true)::json ->> 'x-session-id');

-- ============================================================
-- 3. partner_clicks: INSERT WITH CHECK(true) -> service_role only
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert clicks" ON public.partner_clicks;

CREATE POLICY "Service role can insert clicks"
ON public.partner_clicks FOR INSERT
TO service_role
WITH CHECK (true);

-- Also allow anon to insert via the track-referral-click edge function
-- The edge function uses the service_role key, so this is handled above.

-- ============================================================
-- 4. email_log: INSERT WITH CHECK(true) -> service_role only
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert email logs" ON public.email_log;

CREATE POLICY "Service role can insert email logs"
ON public.email_log FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================
-- 5. inbound_email_log: INSERT WITH CHECK(true) -> service_role only
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert inbound email logs" ON public.inbound_email_log;

CREATE POLICY "Service role can insert inbound email logs"
ON public.inbound_email_log FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================
-- 6. notification_log: INSERT WITH CHECK(true) -> service_role only
-- ============================================================
DROP POLICY IF EXISTS "Service can insert notification logs" ON public.notification_log;

CREATE POLICY "Service can insert notification logs"
ON public.notification_log FOR INSERT
TO service_role
WITH CHECK (true);
