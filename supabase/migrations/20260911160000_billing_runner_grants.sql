-- THE SWITCH LINK NEVER WORKED, and the expiry sweep was never callable.
--
-- 20260911130000 created `start_legacy_switch()` and `expire_legacy_switches()` SECURITY DEFINER
-- and then revoked them from PUBLIC and from `authenticated` — which was right in intent: a
-- member must not be able to take themselves out of the Santander collection with no Stripe
-- session behind them.
--
-- But it granted them to NOBODY, and the only callers are edge functions. PostgREST executes an
-- edge function's request as `service_role`, and in Postgres EXECUTE is an ordinary privilege:
-- once revoked from PUBLIC, only the owner has it. So:
--
--   "Move to Stripe billing"   send-payment-link called start_legacy_switch, got permission
--                              denied, and — correctly, by its own design — REFUSED TO HAND OUT
--                              THE LINK rather than leave the member in the Santander run with a
--                              payable Stripe session. Every press returned SWITCH_NOT_RECORDED.
--   the daily runner           could not call the expiry sweep at all.
--
-- The first is the whole of that feature, inert. It failed safe, which is the one consolation.
--
-- WHY NOTHING CAUGHT IT. `scripts/rls/isolation.sql` proved at length who may NOT call these —
-- a member, an operator, an admin — using helpers that `SET LOCAL ROLE authenticated`. It never
-- called them as the one role that actually does. And the suite runs as the database owner, who
-- can execute anything, so the positive assertions passed for the wrong reason. Three assertions
-- using a new `pg_temp.raises_as_role('service_role', …)` helper now cover it, and they FAILED
-- against the schema as merged, which is how this was found.
--
-- ── AND THE SAME DEFECT, ONE FUNCTION OLDER ──────────────────────────────────
--
-- The guard written for this (`src/test/serviceRoleRpcGrants.test.ts`, which asks the question
-- generically: is every function an edge function calls executable by the role PostgREST runs it
-- as) found one more, in code this work never touched.
--
-- `bootstrap_first_admin` creates the first admin account when no staff exist — the path that
-- recovers an installation nobody can log into. 20260616120000 revoked it from PUBLIC, anon and
-- authenticated and granted it to nobody, and `bootstrap-admin` is its only caller, as the
-- service role. LATENT rather than live: there are admins, so nothing has needed it. It is fixed
-- here rather than left for its own PR because the guard cannot ship while it is red, and an
-- exclusion list would be hiding the exact defect the guard exists to find.
--
-- Proven the same way: the assertion was added to the isolation harness FIRST and failed against
-- the schema as it stood.
--
-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz) FROM service_role;
--   REVOKE EXECUTE ON FUNCTION public.expire_legacy_switches() FROM service_role;
--   REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text) FROM service_role;
--   (which returns all three to being callable by nobody but the owner — i.e. to the defect above)

-- The revokes from PUBLIC and `authenticated` STAY. They are what stops a browser reaching these,
-- and the RLS harness asserts that a member, an operator and an admin are all refused.
GRANT EXECUTE ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.expire_legacy_switches()
  TO service_role;

GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text)
  TO service_role;
