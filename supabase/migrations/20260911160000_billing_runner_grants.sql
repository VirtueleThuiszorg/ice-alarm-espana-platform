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

-- ── AND THE ANNUAL LADDER'S MIDDLE RUNG ALWAYS FAILED ────────────────────────
--
-- Lee's rule: an annual member gets a notice 14 days before their renewal, a reminder at 7, and
-- a staff phone call at 3 — because an annual member who misses the switch waits TWELVE MONTHS
-- for another chance.
--
-- The notice puts them into `switch_pending`. The reminder then asks for another link, and
-- `start_legacy_switch` refused it: `billing_source` is no longer `legacy`. So the reminder
-- errored for every annual member, the runner bells a failure, and the member is left with the
-- notice's link — which Stripe expired after 24 HOURS, because 24 hours is Stripe's ceiling for
-- a Checkout Session while the switch window is 14 days.
--
-- The refusal exists to stop TWO LIVE SESSIONS being payable at once: that is how somebody gets
-- charged twice. An EXPIRED session is not live, and re-issuing against it is exactly what the
-- reminder is for. So the rule becomes:
--
--   legacy                                        -> issue
--   switch_pending, previous session EXPIRED      -> re-issue (the reminder)
--   switch_pending, previous session still LIVE   -> REFUSE, unchanged
--   anything else (stripe, none)                  -> REFUSE, unchanged
--
-- `switch_expires_at` is re-stamped with it, which keeps the member out of the Santander export
-- for another 14 days rather than letting them lapse back mid-ladder.
CREATE OR REPLACE FUNCTION public.start_legacy_switch(
  _member_id          uuid,
  _session_id         text,
  _expires_at         timestamptz,
  _staff_id           uuid    DEFAULT NULL,
  _checkout_url       text    DEFAULT NULL,
  _session_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (member_id uuid, billing_source text, switch_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $start$
DECLARE
  v_source          text;
  v_status          public.member_status;
  v_session_expires timestamptz;
BEGIN
  SELECT m.billing_source, m.status, m.switch_session_expires_at
    INTO v_source, v_status, v_session_expires
    FROM public.members m WHERE m.id = _member_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'start_legacy_switch: no member %', _member_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_source NOT IN ('legacy', 'switch_pending') THEN
    RAISE EXCEPTION 'start_legacy_switch: member % is billing_source %, not legacy', _member_id, v_source
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  /*
    A link Stripe has not yet expired is still payable, and a second one beside it is a second
    way to be charged for the same month.

    AN UNKNOWN EXPIRY COUNTS AS LIVE. `switch_session_expires_at` is NULL only for a row written
    before it existed, or by a caller that did not supply it — and "I cannot tell whether their
    link still works" must not resolve to "issue another one". Refusing costs nothing
    permanent: the 14-day `switch_expires_at` sweep returns the member to `legacy` and the next
    run issues afresh.
  */
  IF v_source = 'switch_pending'
     AND (v_session_expires IS NULL OR v_session_expires > now()) THEN
    RAISE EXCEPTION 'start_legacy_switch: member % already has a live switch link (until %)',
      _member_id, v_session_expires
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.members
     SET billing_source              = 'switch_pending',
         switch_started_at           = now(),
         switch_expires_at           = _expires_at,
         switch_checkout_session_id  = _session_id,
         switch_checkout_url         = _checkout_url,
         switch_session_expires_at   = _session_expires_at,
         updated_at                  = now()
   WHERE id = _member_id;

  INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    _staff_id, 'member.switch_link_sent', 'member', _member_id,
    jsonb_build_object('billing_source', v_source),
    jsonb_build_object(
      'billing_source', 'switch_pending',
      'checkout_session_id', _session_id,
      'expires_at', _expires_at,
      -- So "why did this member get two links" is answerable from the record.
      'reissued', v_source = 'switch_pending'
    )
  );

  RETURN QUERY SELECT _member_id, 'switch_pending'::text, _expires_at;
END
$start$;

GRANT EXECUTE ON FUNCTION public.start_legacy_switch(uuid, text, timestamptz, uuid, text, timestamptz)
  TO service_role;
