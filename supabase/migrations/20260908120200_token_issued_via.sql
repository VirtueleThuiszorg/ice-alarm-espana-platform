-- Join-path schema, part 3 of the held bundle: who issued a second-stage token (item 6).
--
-- THE DEFECT. REVIEW_JOIN_PATH.md F6, BLOCKER, and the safety-relevant one. The wizard stopped
-- collecting emergency contacts and medical data — they moved to the post-payment second stage
-- (ONBOARDING_SPLIT.md option B) — but nothing on the payment path ever mints the token that
-- second stage needs. The only code that creates one is `send-member-update-request`, which is
-- staff-only and fires from a button in MemberUpdateRequestModal. So a member who pays is left
-- with no contacts at all, `member_monitoring_readiness` can never be true for them, and an
-- operator answering their SOS has nobody to ring.
--
-- WHAT THIS MIGRATION IS FOR. `post-payment.ts` will mint those tokens, and
-- `member_update_tokens.created_by` references `staff(id)`: an automated issue has no staff
-- member to name. Leaving it NULL is not good enough, because NULL ALREADY MEANS SOMETHING ELSE
-- HERE — 20260905100000 made that FK `ON DELETE SET NULL` precisely so a token survives the
-- staff member who issued it. A NULL would then be ambiguous between "issued automatically at
-- payment" and "issued by someone who has since left", and the difference matters the first time
-- somebody asks why a member was never asked for their contacts.
--
-- WHY NOT A SYSTEM STAFF ROW. The obvious alternative is a `staff` row called "System". It would
-- work — `is_staff()` requires `user_id = auth.uid()`, and a row with a NULL `user_id` can never
-- match, so it is not a login surface. But it puts a person who does not exist into every staff
-- list, every assignee dropdown and every headcount, and every future query about staff has to
-- remember to exclude it. A column says the same thing without inventing a colleague.
--
-- THE SHAPE FOLLOWS `submitted_via`, WHICH IS ALREADY HERE. 20260904150000 added
-- `submitted_via` ('member_link' | 'operator_assisted') to this same table as a CHECK rather
-- than an enum, on the stated grounds that a CHECK can be edited in place while an enum needs
-- its own migration. `issued_via` is its mirror on the issuing side, same convention.
--
-- AND ONE THING IT DELIBERATELY DOES NOT DO. There is no CHECK saying "issued_via = 'staff'
-- implies created_by IS NOT NULL". That is the exact mistake 20260905100000 had to undo: a CHECK
-- over a column that ON DELETE SET NULL later empties makes the row un-orphanable, so deleting a
-- staff member fails instead of the record surviving them. The one direction that is safe is
-- asserted — an automated token may not name a staff member — because no delete can ever put a
-- value INTO that column.
--
-- ROLLBACK:
--   ALTER TABLE public.member_update_tokens
--     DROP CONSTRAINT IF EXISTS member_update_tokens_issued_via_chk,
--     DROP CONSTRAINT IF EXISTS member_update_tokens_automated_has_no_staff_chk,
--     DROP COLUMN IF EXISTS issued_via;
--   Drops no pre-existing data: every existing row has issued_via NULL, which stays legal.

ALTER TABLE public.member_update_tokens
  ADD COLUMN IF NOT EXISTS issued_via text;

-- NULL is legal and means "issued before this column existed". Not backfilled to 'staff':
-- every existing token WAS issued by a staff member through send-member-update-request, but
-- writing that in retrospectively would be asserting provenance this migration cannot verify.
ALTER TABLE public.member_update_tokens
  ADD CONSTRAINT member_update_tokens_issued_via_chk CHECK (
    issued_via IS NULL OR issued_via IN ('staff', 'post_payment')
  );

-- The safe half of the coherence rule: an automated token cannot name an operator. The mirror
-- ("a staff token must name one") is deliberately absent — see the header.
ALTER TABLE public.member_update_tokens
  ADD CONSTRAINT member_update_tokens_automated_has_no_staff_chk CHECK (
    issued_via IS DISTINCT FROM 'post_payment' OR created_by IS NULL
  );

COMMENT ON COLUMN public.member_update_tokens.issued_via IS
  'Who issued this token: ''staff'' (send-member-update-request, created_by names them) or '
  '''post_payment'' (minted automatically when payment cleared, created_by NULL). NULL means '
  'issued before this column existed. Adding a value is a one-line CHECK edit, by design. The '
  'mirror column for the other end of the exchange is submitted_via (20260904150000).';

-- The paid-but-not-ready queue asks "was a second-stage link ever issued for this member, and
-- is it still open" — and after item 6 the answer for a new member is a row this migration
-- makes distinguishable. Partial index on the automated ones, which is the set that says
-- "payment cleared and we asked them".
CREATE INDEX IF NOT EXISTS idx_member_update_tokens_automated
  ON public.member_update_tokens (member_id, created_at)
  WHERE issued_via = 'post_payment';
