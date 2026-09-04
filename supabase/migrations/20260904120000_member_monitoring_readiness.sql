-- Monitoring readiness as a second axis, independent of payment.
--
-- A member is `active` when the payment webhook clears (golden rule 4 — nothing else
-- activates anyone). A member is MONITORING-READY only when at least one emergency_contacts
-- row exists for them. The pendant ships on payment and there is no shipping hold, so the
-- window between the two states is real, expected, and can be days long. Before this there was
-- no completeness concept anywhere in the product: grep for profile_complete /
-- monitoring_ready / setup_complete / onboarding_complete returned nothing.
--
-- READINESS IS DERIVED, NOT STORED. Full argument in READINESS_MODEL.md §2; the short version:
-- a members.monitoring_ready column maintained by a trigger has to be fired by every path that
-- can create or delete a contact (the atomic registration RPC, submit-member-update, staff CRUD,
-- ON DELETE CASCADE from a member delete, any future import) and its drift is silent and in the
-- dangerous direction — a member reading `ready` with zero contacts, which is worse than the
-- bug this work exists to fix. A view cannot drift and has no write path to abuse.
--
-- security_invoker = on is load-bearing, not decoration. It makes the view evaluate
-- emergency_contacts' EXISTING policies as the querying user:
--
--   "Staff can view emergency contacts"  USING (public.is_staff(auth.uid()))
--   "Members can view own contacts"      USING (member_id = public.get_member_id(auth.uid()))
--
-- so a member sees exactly their own readiness and cannot see anyone else's, because they
-- cannot see the contact rows that produce it. Readiness inherits its access rules from the
-- data it is derived from, with no second policy to keep in sync — and specifically NOT from
-- public.members, which carers can reach through care_access_grants. Requires PostgreSQL 15+;
-- prod is 16.
--
-- NOTE: the three pre-existing views in this schema (partner_monthly_referral_counts,
-- staff_holiday_balance, staff_on_shift_now) are created WITHOUT security_invoker and so run
-- with the definer's rights, bypassing RLS. That is a pre-existing issue, out of scope here,
-- and flagged in READINESS_MODEL.md §8 q4. This migration deliberately does not follow it.
--
-- A view is not a table and cannot itself carry RLS, so golden rule 2's "RLS + isolation test
-- on every new table" is satisfied here by ASSERTIONS PROVING THE DELEGATION HOLDS, not by a
-- new policy — including one that reads pg_class.reloptions to prove security_invoker is
-- actually on, so the negative reads cannot pass for the wrong reason. See
-- scripts/rls/isolation.sql.
--
-- ROLLBACK: DROP VIEW IF EXISTS public.member_monitoring_readiness;
--   Reversible in one statement. Drops no data, no policy and no index; adds none either
--   (idx_emergency_contacts_member_id already exists from 20260121143325).

CREATE OR REPLACE VIEW public.member_monitoring_readiness
WITH (security_invoker = on) AS
SELECT
  m.id                                       AS member_id,
  count(ec.id)                               AS emergency_contact_count,
  count(ec.id) > 0                           AS monitoring_ready,
  m.created_at                               AS member_since,
  -- The subscription row is CREATED by the payment webhook and by nothing else (golden
  -- rule 4), so created_at IS the activation instant — exact, not an approximation. There is
  -- no activated_at column on subscriptions, and start_date is a `date` and so cannot order a
  -- same-day queue. NULL until the webhook fires.
  min(s.created_at)                          AS paid_since
FROM public.members m
LEFT JOIN public.emergency_contacts ec ON ec.member_id = m.id
LEFT JOIN public.subscriptions s ON s.member_id = m.id AND s.status = 'active'
GROUP BY m.id, m.created_at;

COMMENT ON VIEW public.member_monitoring_readiness IS
  'Derived monitoring readiness: a member is ready iff >=1 emergency_contacts row exists. '
  'Independent of payment/activation. security_invoker=on, so access follows '
  'emergency_contacts'' policies. See READINESS_MODEL.md.';

GRANT SELECT ON public.member_monitoring_readiness TO authenticated;
