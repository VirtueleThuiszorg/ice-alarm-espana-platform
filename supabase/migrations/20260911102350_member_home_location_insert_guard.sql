-- THE INSERT HALF OF THE HOME-PIN PROVENANCE RULE.
--
-- 20260910140000 made the provenance of a home pin unforgeable — and then attached the guard
-- to BEFORE UPDATE only. `Staff can manage members` (20260121143325) is FOR ALL, so an
-- authenticated member of staff can INSERT a members row, and an INSERT carrying
-- `home_location_source = 'member_pin'` puts "Home location (set by member on 11 Sep 2026)" on
-- an operator's SOS card for a pin no member has ever seen. That is the same lie the UPDATE
-- path refuses, told with a different verb.
--
-- Proven by execution before it was fixed: the three assertions added to scripts/rls/isolation.sql
-- alongside this migration, run as asoares (call_centre). The forge assertion FAILED.
--
-- Why this is not paranoia about our own staff: the operator reading that card cannot verify
-- it. The label IS the evidence, and a label the database does not enforce is decoration. The
-- honest failure mode is a row that says "from our records — not confirmed by the member",
-- which is what `staff_pin`/`geocoded`/`imported` render as. Nobody is prevented from storing
-- a coordinate; they are prevented from storing somebody else's word for it.
--
-- ── WHAT CHANGES ──────────────────────────────────────────────────────────────
-- The trigger becomes BEFORE INSERT OR UPDATE. The function branches on TG_OP, because OLD
-- does not exist in a BEFORE INSERT row trigger and every comparison in the UPDATE path
-- dereferences it.
--
-- On INSERT, by actor — deliberately NOT a copy of the UPDATE rules:
--   no pin at all                      untouched. Adding a member is the overwhelmingly common
--                                      INSERT and must cost exactly nothing.
--   service_role (auth.uid() IS NULL)  any source, as on UPDATE.
--   staff                              'staff_pin', 'geocoded' or 'imported'. `imported` is the
--                                      one source allowed here and refused on UPDATE, because
--                                      the CRM import (src/lib/crmImportWriter.ts) runs in the
--                                      browser as staff and CREATES rows from parsed
--                                      coordinates — those four columns are in its NEVER_PATCH
--                                      list precisely so it can never claim `imported` on an
--                                      existing row.
--   anyone else                        'member_pin' / 'member_gps'. There is no member INSERT
--                                      policy on public.members today, so this branch is
--                                      unreachable; it is written anyway so that adding one
--                                      during onboarding cannot silently reopen the hole.
--
-- ── WHY set_at IS STAMPED ON INSERT BUT NOT ALWAYS TO now() ───────────────────
-- set_by is stamped always: whoever ran the INSERT is who set it, and attributing it to a
-- third party is the same forgery in a different column.
-- set_at is stamped to now() for a pin somebody has just placed (staff_pin, geocoded) — but
-- forced to NULL for `imported`, because an imported coordinate has no moment of confirmation.
-- Claiming today's date for a figure that came off a KarmaCRM export would make a spreadsheet
-- cell look freshly checked. The import already writes NULL there; this makes that the only
-- possible value, and HomeLocationBlock already renders the no-date label for it.
--
-- ROLLBACK: restore the BEFORE UPDATE trigger and the TG_OP-free function body from
-- 20260910140000 — no data is written or altered by this migration.

CREATE OR REPLACE FUNCTION public.guard_member_home_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed boolean;
BEGIN
  -- ── INSERT ──────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- No location claimed: an ordinary Add-a-member. `members_home_location_complete` already
    -- refuses half a location, so this one test covers all three columns.
    IF NEW.home_location_source IS NULL THEN
      RETURN NEW;
    END IF;

    -- service_role: the edge functions, which establish the setter by their own means and
    -- stamp provenance themselves. Overwriting it here would erase what they just proved.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    NEW.home_location_set_by := auth.uid();

    IF public.is_staff(auth.uid()) THEN
      IF NEW.home_location_source NOT IN ('staff_pin', 'geocoded', 'imported') THEN
        RAISE EXCEPTION
          'a staff-created members row may carry a home location of source staff_pin, geocoded '
          'or imported, not % — only the member can confirm their own front door',
          NEW.home_location_source
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      -- An imported coordinate was never confirmed by anyone, so it gets no confirmation date.
      NEW.home_location_set_at :=
        CASE WHEN NEW.home_location_source = 'imported' THEN NULL ELSE now() END;
      RETURN NEW;
    END IF;

    IF NEW.home_location_source NOT IN ('member_pin', 'member_gps') THEN
      RAISE EXCEPTION
        'members.home_location_source must be member_pin or member_gps on a member''s own write, '
        'not % — a member cannot record their pin as a staff correction or an import',
        NEW.home_location_source
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    NEW.home_location_set_at := now();
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────────
  -- Unchanged from 20260910140000.
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
  'Makes the provenance of a home pin unforgeable on INSERT and on UPDATE: source is '
  'constrained by actor, and set_at/set_by are stamped rather than accepted. Companion to '
  'guard_member_status_self_write() — same table, same reason a trigger is used.';

DROP TRIGGER IF EXISTS guard_member_home_location ON public.members;
CREATE TRIGGER guard_member_home_location
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_home_location();
