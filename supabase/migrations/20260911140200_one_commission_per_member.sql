-- One member earns one partner commission, ever. Enforced by the database.
--
-- WHY. Commission is payable on joining only (Lee, 2026-09-08): "one member,
-- one payment". Two things stood in the way.
--
-- 1. The dedup check keyed on `order_id`, so a replacement pendant shipped to
--    an existing member — a second order, marked delivered — paid the referrer
--    another €50. Fixed in `useOrderActions.ts` in the same change, which now
--    asks whether this MEMBER has ever earned one.
--
-- 2. `partner_commissions` carried no unique constraint of any kind — not on
--    `order_id`, not on `(partner_id, member_id)`. Compare `partner_attributions`,
--    which has had `UNIQUE(partner_id, member_id)` since day one. The only
--    insert in the tree runs in the admin browser as a SELECT then an INSERT,
--    two round trips apart, so two staff marking the same order delivered in
--    the same moment produced two €50 rows and nothing objected. An application
--    check cannot fix that; only the database can.
--
-- WHY `member_id` ALONE, not `(partner_id, member_id)`. A member has at most
-- one attribution (`partner_attributions` is UNIQUE on partner+member and the
-- lookup is `.maybeSingle()`), so in practice they are the same thing. Keying
-- on the member alone is the stricter and more honest statement of the rule:
-- one member is worth one commission to somebody, not one commission to each
-- partner who could claim them.
--
-- WHY `status <> 'cancelled'`. Correcting an order out of `delivered` cancels
-- its commission (20260907100000). If that pendant is then genuinely delivered,
-- the partner must still be paid — a cancelled row is not a payment and must
-- not behave like one. So cancelled rows sit outside the index, and a member
-- may accumulate any number of them while holding at most one live commission.
--
-- REVERSIBLE:  DROP INDEX IF EXISTS public.partner_commissions_one_live_per_member;

-- ── Existing duplicates, if any, before the index can exist ─────────────────
-- Keep the earliest live row per member and cancel the rest, with a reason that
-- says what happened. A paid duplicate is NOT touched: money has left the bank
-- and this migration will not rewrite that history — it reports instead, and a
-- human decides.
DO $$
DECLARE
  v_paid_dupes  int;
  v_cancelled   int;
BEGIN
  SELECT count(*) INTO v_paid_dupes
  FROM (
    SELECT member_id
    FROM public.partner_commissions
    WHERE status = 'paid'
    GROUP BY member_id
    HAVING count(*) > 1
  ) d;

  IF v_paid_dupes > 0 THEN
    RAISE WARNING
      'ATTENTION: % member(s) have more than one PAID commission. Those are real payments already made and this migration has not altered them, so the index below will fail until they are reconciled by hand. Query: select member_id, count(*) from partner_commissions where status = ''paid'' group by member_id having count(*) > 1;',
      v_paid_dupes;
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY member_id
             ORDER BY created_at, id
           ) AS rn
    FROM public.partner_commissions
    WHERE status <> 'cancelled'
      AND status <> 'paid'
  )
  UPDATE public.partner_commissions c
     SET status = 'cancelled',
         cancel_reason = COALESCE(c.cancel_reason || ' | ', '')
           || 'duplicate: commission is payable once per member (20260911140200)'
    FROM ranked r
   WHERE c.id = r.id
     AND r.rn > 1;

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  IF v_cancelled > 0 THEN
    RAISE NOTICE 'cancelled % duplicate unpaid commission row(s)', v_cancelled;
  ELSE
    RAISE NOTICE 'no duplicate commissions to clean up';
  END IF;
END $$;

-- ── The rule ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_one_live_per_member
  ON public.partner_commissions (member_id)
  WHERE status <> 'cancelled';

COMMENT ON INDEX public.partner_commissions_one_live_per_member IS
  'One member is worth one partner commission, ever (Lee 2026-09-08). Cancelled rows are excluded so a corrected-then-genuinely-delivered order can still pay.';
