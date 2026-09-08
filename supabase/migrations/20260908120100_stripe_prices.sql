-- Join-path schema, part 2 of the held bundle: the Stripe Price objects behind our prices (P2).
--
-- THE DEFECT THIS EXISTS TO CLOSE. `create-checkout` builds every line item from `price_data`
-- with `unit_amount: Math.round(item.amount * 100)`, where `item.amount` came from the BROWSER
-- (REVIEW_JOIN_PATH.md F7). Nothing on the server ever checks it, and `stripe-webhook` never
-- compares `amount_total` to what we expected, so a visitor who edited the request body paid
-- whatever they typed and was activated as a full member (F9). The fix has two halves: prices
-- become Stripe objects created from OUR tables, and the browser stops sending amounts at all.
-- This is the schema for the first half.
--
-- WHY A TABLE AND NOT `stripe_price_id` COLUMNS. The brief says to add columns to
-- pricing_plans / pricing_settings, and this does the same job while avoiding three problems
-- those columns have:
--
--   1. BOTH THOSE TABLES ARE PUBLICLY READABLE — `FOR SELECT TO anon, authenticated USING (true)`
--      (20260617120000), because the landing and /pricing pages render without auth. RLS is
--      row-level, so a column added there is public too, and the sync bookkeeping (what was
--      synced, when, by whom) would be published along with it. Price ids are not secrets, but
--      there is no reason to publish our sync state to the world.
--   2. A PLAN NEEDS TWO PRICES (monthly and annual) and a `pricing_settings` row needs one or
--      none — tax-rate rows have no Price at all. As columns that is four nullable columns on
--      one table and two on the other, with nothing saying which rows are meant to have them.
--   3. STRIPE PRICES ARE IMMUTABLE. Changing a price means creating a NEW Price, and existing
--      subscriptions keep charging the OLD one. A column can only hold today's id, so the
--      moment Lee edits a price the id an active subscription is actually billed on is gone from
--      the database — exactly when reconciling a charge matters most.
--
-- So: one row per Price, history kept, `is_current` marking the one new checkouts use. Say the
-- word and it becomes columns instead.
--
-- WHAT GETS SYNCED, and why the amount is stored next to the id. Seven price keys: the four
-- recurring plan prices (single/couple × monthly/annual) and three one-offs (pendant, shipping,
-- registration fee). `amount_cents` is what the Price was CREATED with, so `create-checkout` can
-- compare it against a freshly computed amount from pricing_plans / pricing_settings and REFUSE
-- rather than charge on a stale Price. Without that column a price edit that was never synced
-- looks identical to one that was, and the customer is quietly charged last month's price.
--
-- Amounts are IVA-INCLUDED (P6), matching what the public pages show: membership +10%,
-- pendant +21%, registration fee +0%. The registration fee is synced at its BASE amount;
-- `registration_fee_discount` is a percentage in system_settings and cannot be a fixed Price, so
-- a discounted fee is applied at checkout time from the server's own figure, never the client's.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.stripe_prices;
--   Drops no pre-existing data: every row in it is written by stripe-sync-prices.

CREATE TABLE public.stripe_prices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which of our prices this is. Not a foreign key: two of the seven (a plan's monthly and
  -- annual) come from ONE pricing_plans row, and the shape is stable enough to name.
  price_key           text NOT NULL CHECK (price_key IN (
                        'plan_single_monthly', 'plan_single_annual',
                        'plan_couple_monthly', 'plan_couple_annual',
                        'pendant', 'shipping', 'registration_fee')),

  stripe_product_id   text NOT NULL,
  stripe_price_id     text NOT NULL UNIQUE,

  -- What the Price was created with. The comparison `create-checkout` makes before it charges.
  amount_cents        integer NOT NULL CHECK (amount_cents >= 0),
  -- We sell in euros. A currency column that accepts anything is how a 27.49 price becomes a
  -- 27.49 GBP charge; widen it deliberately if that day ever comes.
  currency            text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),

  -- 'month' | 'year' for the four plan prices, NULL for the three one-offs. A one-off with an
  -- interval would put the pendant on a subscription; a plan without one would charge it once.
  recurring_interval  text CHECK (recurring_interval IN ('month', 'year')),

  -- How the amount was derived, in words, at the moment of sync — e.g.
  -- '24.99 net x 10 months x 1.10 IVA'. An audit line for a number that moves money.
  source_description  text,

  -- FALSE once a newer Price supersedes it. Kept, never deleted: an active subscription is still
  -- being billed on the old Price, and reconciling its invoices needs the amount it carried.
  is_current          boolean NOT NULL DEFAULT true,

  synced_at           timestamptz NOT NULL DEFAULT now(),
  synced_by           uuid REFERENCES public.staff(id) ON DELETE SET NULL
);

-- One current Price per key. A partial unique index rather than a plain one, so superseded rows
-- can pile up under the same key while exactly one stays live.
CREATE UNIQUE INDEX stripe_prices_one_current_per_key
  ON public.stripe_prices (price_key) WHERE is_current;

CREATE INDEX stripe_prices_price_id ON public.stripe_prices (stripe_price_id);

-- A recurring price must have an interval and a one-off must not. Written as one constraint so
-- neither half can be satisfied by accident.
ALTER TABLE public.stripe_prices ADD CONSTRAINT stripe_prices_interval_matches_key CHECK (
  (price_key LIKE 'plan_%' AND recurring_interval IS NOT NULL)
  OR
  (price_key NOT LIKE 'plan_%' AND recurring_interval IS NULL)
);

ALTER TABLE public.stripe_prices ENABLE ROW LEVEL SECURITY;

-- Staff read (the admin pricing editor shows what is synced and whether it is stale); only
-- super_admin writes from a client. stripe-sync-prices uses the service role and bypasses this.
-- Deliberately NOT public: unlike pricing_plans, nothing anonymous needs to render from it.
CREATE POLICY "Staff can view synced Stripe prices"
ON public.stripe_prices
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Super admins manage synced Stripe prices"
ON public.stripe_prices
FOR ALL
TO authenticated
USING (public.get_staff_role(auth.uid()) = 'super_admin')
WITH CHECK (public.get_staff_role(auth.uid()) = 'super_admin');

COMMENT ON TABLE public.stripe_prices IS
  'Stripe Product/Price objects created FROM pricing_plans + pricing_settings by the '
  'stripe-sync-prices function (P2). One current row per price_key; superseded rows are kept '
  'because Stripe Prices are immutable and active subscriptions still bill on them. '
  'amount_cents is what the Price was created with, so the charge path can refuse a stale one.';

COMMENT ON COLUMN public.stripe_prices.amount_cents IS
  'IVA-included, in cents, as created in Stripe. Compared against a freshly computed amount '
  'before a checkout session is created — a mismatch means the tables were edited without a '
  'sync, and is a refusal, not a warning.';
