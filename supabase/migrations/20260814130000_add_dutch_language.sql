-- Accept Dutch. LAUNCH_SCOPE.md §6 is LOCKED on "EN + ES + NL, all three, full
-- coverage at launch" — the UI already ships all three (`supportedLngs:
-- ["en","es","nl"]`, and `localeParse.test.ts` enforces key parity across them),
-- but the database rejected `nl` in two separate mechanisms across three tables:
--
--   public.preferred_language  ENUM ('en','es')   → staff.preferred_language
--                                                 → members.preferred_language
--   partners.preferred_language TEXT CHECK (... IN ('en','es'))
--
-- So a Dutch-speaking member, staff member or partner could pick Dutch in the UI
-- and the write would be rejected by the database. This closes that.

-- ── the enum (staff, members) ───────────────────────────────────────────────
-- `ADD VALUE IF NOT EXISTS` is idempotent, so re-running this migration is safe.
--
-- Note for anyone editing this file: on PostgreSQL 12+ `ALTER TYPE ... ADD VALUE`
-- may run inside a transaction, but the new value cannot be USED in that same
-- transaction. Nothing here writes 'nl', so this is fine — do not add a data
-- backfill using 'nl' to this migration; put it in a separate one.
ALTER TYPE public.preferred_language ADD VALUE IF NOT EXISTS 'nl';

-- ── the partners CHECK ──────────────────────────────────────────────────────
-- `partners` predates the enum and uses TEXT + an inline CHECK, which PostgreSQL
-- auto-named `partners_preferred_language_check`. Dropped IF EXISTS so this does
-- not fail on an installation where the constraint was renamed by hand.
ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_preferred_language_check;

ALTER TABLE public.partners
  ADD CONSTRAINT partners_preferred_language_check
  CHECK (preferred_language IN ('en', 'es', 'nl'));

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Stated honestly, because half of this is NOT cleanly reversible.
--
-- The partners CHECK reverses exactly:
--
--   ALTER TABLE public.partners
--     DROP CONSTRAINT IF EXISTS partners_preferred_language_check;
--   ALTER TABLE public.partners
--     ADD CONSTRAINT partners_preferred_language_check
--     CHECK (preferred_language IN ('en', 'es'));
--
-- The enum does NOT. PostgreSQL has no `ALTER TYPE ... DROP VALUE`. Removing 'nl'
-- would mean creating a replacement type, rewriting both dependent columns and
-- their defaults, and dropping the old type — and it would fail outright if any
-- row already holds 'nl'.
--
-- The practical rollback is therefore to leave the value present and reject 'nl'
-- at the validation layer (`_shared/validation.ts` and
-- `src/lib/partnerRegistrationSchema.ts`), which is a one-line change in each and
-- takes effect immediately. An unused enum value is inert.
--
-- This is called out rather than glossed because CLAUDE.md requires migrations to
-- be reversible or to carry a documented rollback, and this one is the latter.
