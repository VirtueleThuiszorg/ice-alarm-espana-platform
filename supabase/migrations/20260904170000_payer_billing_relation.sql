-- The payer is a DIFFERENT PERSON from the member (MEMBER_ONBOARDING.md §8 Q1, option B).
--
-- The adult child pays; the parent wears the pendant. Under the current schema the only way to
-- model that was to put the child's identity on the member row — which means an operator
-- handling an SOS reads the payer's name and reaches for medical information describing
-- somebody who is not on the floor. That is a life-safety defect, not a schema preference.
--
-- WHY A TABLE PLUS A COLUMN ON subscriptions, and not a column on members:
--
--   1. A payer is the counterparty of a SUBSCRIPTION, not of a person. stripe_customer_id
--      already hangs off subscriptions and today implicitly claims the member IS the Stripe
--      customer — the exact falsehood this fixes.
--   2. One payer paying for two parents is two subscriptions sharing a payer_id. No join
--      table, and no collision with plan_type='couple', which means two MONITORED people.
--   3. NOT CLIENT-WRITABLE BY CONSTRUCTION. `subscriptions` has no member INSERT or UPDATE
--      policy, so the billing link inherits that. A column on `members` would NOT: the
--      "Members can update own profile" policy has no column restriction and no guard trigger,
--      and a member can already set their own members.status (see PAYER_MODEL.md §2 — measured,
--      one row). A payer_id there would be reassignable by the member it belongs to.
--
-- THE PAYER IS NOT A CONSENT ROUTE. Paying for someone grants NO sight of their medical
-- information, location, alerts or emergency contacts. No policy below, and no policy added
-- later, may reference payer_id from a care table — scripts/rls/isolation.sql asserts that
-- against pg_policies, so a future convenient policy fails the suite rather than shipping.
-- A payer who should also see care data goes through care_access_grants (#135) like anybody
-- else: category-scoped, member-granted, revocable, audited. Billing and consent are separate
-- lifecycles in both directions.
--
-- ROLLBACK (reversible, no data loss — payer_id is additive and nullable, and nothing
-- populates it before increment 2):
--   DROP POLICY IF EXISTS "Payers view subscriptions they pay for" ON public.subscriptions;
--   DROP POLICY IF EXISTS "Payers view their own payer record" ON public.payers;
--   DROP POLICY IF EXISTS "Staff manage payers" ON public.payers;
--   DROP POLICY IF EXISTS "Staff view all payers" ON public.payers;
--   ALTER TABLE public.subscriptions DROP COLUMN payer_id;
--   DROP FUNCTION IF EXISTS public.get_payer_id(uuid);
--   DROP TABLE public.payers;

CREATE TABLE public.payers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable, and NULL FAILS CLOSED. A payer taken down over the phone has no account yet and
  -- may never have one; until user_id is linked the row matches no auth.uid() and therefore
  -- grants nothing. Same reasoning as care_access_grants.grantee_user_id.
  --
  -- ON DELETE SET NULL, not CASCADE: if the payer deletes their auth account the billing
  -- record survives (it is financial history) and access is lost rather than gained. Not
  -- RESTRICT either, so it can never block an auth.users delete.
  user_id       uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  full_name     text NOT NULL,
  email         text NOT NULL,
  phone         text,

  -- For a human reading the record ("daughter", "son"). NOT a consent category and NOT
  -- load-bearing for access — nothing reads this to decide anything.
  relationship  text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.staff(id)
);

COMMENT ON TABLE public.payers IS
  'Whoever pays for a subscription, when that is not the monitored member. A BILLING '
  'relationship only: being a payer grants no access to any care data. See PAYER_MODEL.md.';

-- ON DELETE SET NULL: losing a payer must never cascade into deleting a subscription. A NULL
-- payer_id reads as "the member pays for themselves", which is true of every existing row.
ALTER TABLE public.subscriptions
  ADD COLUMN payer_id uuid REFERENCES public.payers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.payer_id IS
  'Who pays. NULL = the member pays for themselves. Grants NO care access — PAYER_MODEL.md §4.';

CREATE INDEX idx_subscriptions_payer_id ON public.subscriptions (payer_id)
  WHERE payer_id IS NOT NULL;

-- ── the payer's own identity lookup ────────────────────────────────────────
-- Mirrors get_member_id(). SECURITY DEFINER so a policy can use it without the caller needing
-- to read `payers` first, which would be circular.
CREATE OR REPLACE FUNCTION public.get_payer_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.payers WHERE user_id = _user_id
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view all payers"
  ON public.payers FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff manage payers"
  ON public.payers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()));

-- A payer reads their OWN row and nothing else. No UPDATE policy: a payer changing their own
-- billing identity is a support action, not a self-service one, and an unrestricted self-UPDATE
-- is the exact shape of the members.status hole this design was written around.
CREATE POLICY "Payers view their own payer record"
  ON public.payers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A payer reads the subscriptions they pay for. This is the WHOLE of what being a payer buys.
-- Note what is absent and must stay absent: no policy on members, medical_information, alerts,
-- devices, emergency_contacts or member_monitoring_readiness mentions payer_id.
CREATE POLICY "Payers view subscriptions they pay for"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (payer_id IS NOT NULL AND payer_id = public.get_payer_id(auth.uid()));
