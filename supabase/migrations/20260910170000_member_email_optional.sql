-- members.email becomes optional, and gets an OWNER.
--
-- WHY. `email TEXT NOT NULL UNIQUE` is the single biggest reason a client of Lee's lands as a
-- CRM contact rather than a member: most of them have no email at all, and the ones who do
-- sometimes share a household address or hand over a carer's. The import worked around it by
-- inventing plus-tagged addresses (`name+tag@…`) for the second and later rows to claim one —
-- addresses nobody reads, on a column the platform treats as the way to reach the member.
--
-- Lee's ruling of 2026-09-10 (PENDING_FOR_LEE D-19 item 3): the column becomes NULLABLE, the
-- blanket UNIQUE becomes a PARTIAL unique index, and a second column says whose address it is.
--
-- ── WHAT THE PARTIAL INDEX BUYS ────────────────────────────────────────────────
--
--   UNIQUE (lower(email)) WHERE email IS NOT NULL AND email_owner = 'member'
--
--   * NULL is not unique-constrained, so any number of members may have no email. (Postgres
--     already treats NULLs as distinct in a unique index, but the predicate says it on purpose.)
--   * lower(email), so `Mary@Example.com` and `mary@example.com` cannot both be members. The old
--     constraint was case-SENSITIVE, which meant the uniqueness it promised was never quite what
--     anybody assumed.
--   * `email_owner = 'member'` is the half that lets a carer's address be shared. One daughter
--     looking after both her parents is TWO members whose contact address is hers, and that is
--     not a duplicate — it is the normal case in this business. Only an address the MEMBER owns
--     has to be unique, because only that one can become a login.
--
-- ── WHY LOGIN IS NOT AFFECTED ──────────────────────────────────────────────────
--
-- `members.email` is not the credential. `auth.users.email` is, and it carries its own
-- uniqueness. A member with no email simply has no login until somebody adds one — which the
-- second-stage flow already handles, because it was written for members created by staff.
--
-- ROLLBACK:
--   -- Restoring NOT NULL requires every NULL to be given an address first, which is a decision
--   -- and not a rollback. The reversible half:
--   DROP INDEX IF EXISTS members_member_email_unique_idx;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS email_owner;
--   ALTER TABLE public.members ADD CONSTRAINT members_email_key UNIQUE (email);
--   -- (which will fail if two members share a carer's address, correctly.)

-- ── 1. whose address is it ────────────────────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS email_owner text NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_email_owner_check') THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_email_owner_check
      CHECK (email_owner IN ('member', 'carer', 'payer', 'family'));
  END IF;
END $$;

COMMENT ON COLUMN public.members.email_owner IS
  'Whose address members.email is: member (theirs, and the only kind that may become a login), '
  'carer, payer or family. DEFAULT member, because every address collected at checkout is the '
  'member''s own — a default of carer would quietly exempt real addresses from the unique index.';

-- ── 2. the column becomes optional ────────────────────────────────────────────
ALTER TABLE public.members ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN public.members.email IS
  'The best address for reaching this member — NULLABLE since 20260910170000, because most '
  'legacy clients have none. NOT the credential: auth.users.email is, with its own uniqueness. '
  'Read email_owner before treating it as the member''s own.';

-- ── 3. the blanket UNIQUE becomes a partial, case-insensitive one ─────────────
--
-- Dropped and replaced rather than left alongside: two uniqueness rules on one column is two
-- answers to "may these two rows coexist", and the stricter one silently wins.
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS members_member_email_unique_idx
  ON public.members (lower(email))
  WHERE email IS NOT NULL AND email_owner = 'member';

-- A non-unique index for the rest, because the roster searches on email whatever its owner and
-- the partial unique index above cannot serve a carer's address.
CREATE INDEX IF NOT EXISTS members_email_lower_idx
  ON public.members (lower(email))
  WHERE email IS NOT NULL;
