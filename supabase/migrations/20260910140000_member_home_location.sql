-- MEMBER HOME LOCATION — the front door, confirmed by the person who lives behind it.
--
-- WHY THIS COLUMN SET EXISTS. An EV07B pendant indoors usually has no GPS fix, and indoors is
-- where falls happen. Today the SOS card shows, in order: the fix on the alert
-- (alerts.location_lat/lng), the device's last fix (devices.last_location_*), or the typed
-- postal address. In Almería a typed postal address is regularly a rural property that a
-- driver cannot find at night. A pin the member has stood on and confirmed is the best
-- fallback this platform can hold, and it is a DIFFERENT KIND OF FACT from a pendant fix —
-- so it lives in its own columns and is labelled separately on the card, never merged with
-- the live fix.
--
-- THE HONESTY OF A LOCATION IS ITS PROVENANCE. "36.83, -2.46" is worthless to an operator
-- who cannot tell whether the member stood at their own door and pressed Save, or whether
-- somebody typed it off a map three years ago. So source / set_at / set_by are not metadata
-- to be filled in later: they are the reason the number can be trusted, and the trigger
-- below makes them unforgeable rather than merely conventional.
--
-- ── WHY A TRIGGER AND NOT A POLICY ────────────────────────────────────────────
-- "Members can update own profile" (20260121143325) is FOR UPDATE with NO column restriction,
-- and Postgres RLS is row-level: a policy cannot say "you may write these columns but not
-- that one". So a member can already write any column on their own row that no trigger
-- defends — which is exactly the hole 20260904180000 closed for `status`. Same shape, same
-- fix, same reasoning: a BEFORE UPDATE trigger sees every write, names only what it protects,
-- and leaves the rest alone.
--
-- What the trigger enforces, by actor:
--   service_role (auth.uid() IS NULL)  any source. This is the CRM import ('imported') and
--                                      the member-self-service edge function, which stamps
--                                      provenance itself from a verified caller identity.
--   staff                              'staff_pin' or 'geocoded' only, stamped as themselves.
--   the member (their own row)         'member_pin' or 'member_gps' only, stamped as themselves.
--
-- A member therefore CANNOT claim their guess was a staff correction, and staff cannot claim
-- their correction was the member standing at the door. Nobody authenticated can backdate
-- `set_at` or attribute the pin to another account: both are overwritten with now()/auth.uid().
--
-- ── THE 100 m RULE IS A CONSTRAINT, NOT A DIALOG ──────────────────────────────
-- A browser geolocation fix of ±800 m is a fix on the wrong street. The member dialog refuses
-- to save one and says "please stand at your front door and try again" — but a rule that
-- lives only in a dialog is a rule that the next caller does not have. So a CHECK carries it:
-- a 'member_gps' row must have an accuracy, and it must be 100 m or better. 'member_pin' and
-- 'staff_pin' are dragged pins and legitimately have no accuracy figure at all.
--
-- ROLLBACK (reverses cleanly; every object here is new):
--   DROP TRIGGER IF EXISTS guard_member_home_location ON public.members;
--   DROP FUNCTION IF EXISTS public.guard_member_home_location();
--   ALTER TABLE public.members
--     DROP CONSTRAINT IF EXISTS members_home_location_complete,
--     DROP CONSTRAINT IF EXISTS members_home_location_bounds,
--     DROP CONSTRAINT IF EXISTS members_home_location_gps_accuracy,
--     DROP COLUMN IF EXISTS home_lat,
--     DROP COLUMN IF EXISTS home_lng,
--     DROP COLUMN IF EXISTS home_location_accuracy_m,
--     DROP COLUMN IF EXISTS home_location_source,
--     DROP COLUMN IF EXISTS home_location_set_at,
--     DROP COLUMN IF EXISTS home_location_set_by;
--   DROP TYPE IF EXISTS public.home_location_source;

-- ── 1. the source enum ────────────────────────────────────────────────────────
-- FIVE VALUES, not the four in the brief. 'imported' is the fifth and it is required by the
-- same brief's §5: the KarmaCRM export carries `GPS Co-ordinates` for 108 of 431 rows, and a
-- coordinate that arrived in a spreadsheet must not be able to describe itself as a member
-- pin. An operator reading "set by member on 14 March" when nobody ever asked the member is
-- the precise failure this column exists to prevent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'home_location_source'
                   AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.home_location_source AS ENUM (
      'member_pin',   -- the member dragged a pin onto their own door
      'member_gps',   -- the member pressed "use my current location" while standing there
      'staff_pin',    -- staff placed or corrected it from the member record
      'geocoded',     -- derived from the postal address; nobody has confirmed it
      'imported'      -- came in on the KarmaCRM export; nobody has confirmed it
    );
  END IF;
END $$;

COMMENT ON TYPE public.home_location_source IS
  'How a member''s home pin came to exist. member_* are member-confirmed; staff_pin is a '
  'staff correction; geocoded and imported are UNCONFIRMED and must be labelled as such on '
  'the SOS card.';

-- ── 2. the columns ────────────────────────────────────────────────────────────
-- numeric(9,6) matches gps_lat/gps_lng (20260903091000): ~11 cm of precision, which is well
-- past a doorway and stops a bogus 15-decimal value being stored as if it meant something.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS home_lat                 numeric(9,6),
  ADD COLUMN IF NOT EXISTS home_lng                 numeric(9,6),
  ADD COLUMN IF NOT EXISTS home_location_accuracy_m  numeric(8,1),
  ADD COLUMN IF NOT EXISTS home_location_source      public.home_location_source,
  ADD COLUMN IF NOT EXISTS home_location_set_at      timestamptz,
  -- auth.users, not staff: the setter may be the member themselves. ON DELETE SET NULL so
  -- deleting an account never deletes the pin — the pin is about the house, not the account.
  ADD COLUMN IF NOT EXISTS home_location_set_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.members.home_lat IS
  'Latitude of the member''s front door. NOT a pendant fix — see devices.last_location_lat / '
  'alerts.location_lat. Shown on the SOS card as a separately labelled fallback.';
COMMENT ON COLUMN public.members.home_location_accuracy_m IS
  'Metres of accuracy reported by the browser for a member_gps fix. NULL for a dragged pin, '
  'which has no such figure. A member_gps row is constrained to 100 m or better.';
COMMENT ON COLUMN public.members.home_location_set_by IS
  'auth.users id of whoever set it. Overwritten with auth.uid() by guard_member_home_location() '
  'on every authenticated write, so it cannot be attributed to somebody else.';

-- ── 3. what a stored location must look like ──────────────────────────────────
-- Named constraints, added only if absent, so a re-run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_home_location_complete') THEN
    ALTER TABLE public.members ADD CONSTRAINT members_home_location_complete CHECK (
      -- Half a coordinate is not a location, and a source with no coordinate is a claim about
      -- nothing. Either the whole thing is set or none of it is.
      (home_lat IS NULL AND home_lng IS NULL AND home_location_source IS NULL)
      OR (home_lat IS NOT NULL AND home_lng IS NOT NULL AND home_location_source IS NOT NULL)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_home_location_bounds') THEN
    ALTER TABLE public.members ADD CONSTRAINT members_home_location_bounds CHECK (
      (home_lat IS NULL OR (home_lat >= -90  AND home_lat <= 90))
      AND (home_lng IS NULL OR (home_lng >= -180 AND home_lng <= 180))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_home_location_gps_accuracy') THEN
    ALTER TABLE public.members ADD CONSTRAINT members_home_location_gps_accuracy CHECK (
      home_location_source IS DISTINCT FROM 'member_gps'::public.home_location_source
      OR (home_location_accuracy_m IS NOT NULL AND home_location_accuracy_m <= 100)
    );
  END IF;
END $$;

-- Operators filter "members with a confirmed pin" when planning; and the SOS card reads one
-- row by id, which the primary key already serves. So the only index worth its cost is the
-- partial one over rows that HAVE a pin.
CREATE INDEX IF NOT EXISTS idx_members_home_location
  ON public.members(home_location_source)
  WHERE home_lat IS NOT NULL;

-- ── 4. the guard ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_member_home_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed boolean;
BEGIN
  changed :=
    NEW.home_lat                IS DISTINCT FROM OLD.home_lat
    OR NEW.home_lng             IS DISTINCT FROM OLD.home_lng
    OR NEW.home_location_source IS DISTINCT FROM OLD.home_location_source
    OR NEW.home_location_accuracy_m IS DISTINCT FROM OLD.home_location_accuracy_m;

  -- An ordinary profile update — phone, address, away dates — must stay exactly as cheap as it
  -- was. Nothing below runs unless the location itself is moving.
  IF NOT changed THEN
    -- ...but a write that changes only the PROVENANCE is a rewrite of history with the
    -- coordinates left alone, and that is the whole attack. Refuse it for anyone authenticated.
    IF auth.uid() IS NOT NULL
       AND (NEW.home_location_set_at IS DISTINCT FROM OLD.home_location_set_at
            OR NEW.home_location_set_by IS DISTINCT FROM OLD.home_location_set_by) THEN
      RAISE EXCEPTION
        'members.home_location_set_at / set_by describe a location that has not changed; they '
        'are not independently writable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- service_role has no auth.uid(): the CRM import and the member-self-service edge function,
  -- both of which establish who the setter is by their own means and stamp it. Nothing to
  -- guard, and nothing to overwrite — overwriting set_by with NULL here would erase exactly
  -- the attribution those callers just proved.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Provenance is stamped, never accepted. Both directions matter: a backdated set_at makes a
  -- fresh guess look like a long-standing confirmation, and a borrowed set_by blames somebody
  -- else for it.
  NEW.home_location_set_at := now();
  NEW.home_location_set_by := auth.uid();

  IF public.is_staff(auth.uid()) THEN
    IF NEW.home_location_source NOT IN ('staff_pin', 'geocoded') THEN
      RAISE EXCEPTION
        'a staff write of members.home_lat/home_lng must be source staff_pin or geocoded, not %; '
        'only the member can confirm their own front door',
        NEW.home_location_source
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- Anyone else is the member writing their own row, because RLS has already restricted them
  -- to it. They may confirm their own door and nothing else.
  IF NEW.home_location_source NOT IN ('member_pin', 'member_gps') THEN
    RAISE EXCEPTION
      'members.home_location_source must be member_pin or member_gps on a member''s own write, '
      'not % — a member cannot record their pin as a staff correction or an import',
      NEW.home_location_source
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.guard_member_home_location() IS
  'Makes the provenance of a home pin unforgeable: source is constrained by actor, and '
  'set_at/set_by are stamped rather than accepted. Companion to '
  'guard_member_status_self_write() — same table, same reason a trigger is used.';

CREATE TRIGGER guard_member_home_location
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_home_location();
