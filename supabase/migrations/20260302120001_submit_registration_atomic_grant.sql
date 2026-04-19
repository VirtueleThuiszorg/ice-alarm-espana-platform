-- ============================================================
-- Grant EXECUTE on submit_registration_atomic
-- ============================================================
-- Split from 20260302120000_submit_registration_atomic.sql because
-- Supabase CLI's pooler-based migration runner uses PQprepare() which
-- only accepts one command per prepared statement. The function
-- definition's $$ dollar-quoting terminates with $$;, and having a
-- GRANT statement after it in the same file triggers SQLSTATE 42601
-- (cannot insert multiple commands into a prepared statement).
--
-- Moving the GRANT to its own file preserves ICE's original permission
-- model without restructuring the function.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.submit_registration_atomic(JSONB) TO service_role;
