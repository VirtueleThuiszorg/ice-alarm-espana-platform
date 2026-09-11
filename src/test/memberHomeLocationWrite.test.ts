/**
 * WHO MAY WRITE A MEMBER'S FRONT DOOR, and what they may claim about it.
 *
 * The pin is what an operator is sent to when the pendant has no fix, so the number matters
 * less than the LABEL beside it: "set by the member on 3 June" is only worth anything if a
 * member really set it on 3 June. This suite holds the three copies of that rule in step —
 * the migration, the edge function, and `src/lib/homeLocation.ts` — because the two of them
 * that run on Deno and in Postgres cannot import the third.
 *
 * The database half of the same rule is PROVEN BY EXECUTION in `scripts/rls/isolation.sql`
 * (member A cannot read B's pin; a member cannot claim staff_pin; a >100 m fix raises). What
 * is asserted here is the agreement between the copies, and the properties of the edge
 * function's handler that no unit test can reach because it runs on Deno.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_LOCATION_SOURCES,
  MEMBER_GPS_MAX_ACCURACY_M,
  MEMBER_WRITABLE_SOURCES,
} from "@/lib/homeLocation";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const fn = read("supabase/functions/member-self-service/index.ts");
const migration = read("supabase/migrations/20260910140000_member_home_location.sql");
const insertGuard = read(
  "supabase/migrations/20260911102350_member_home_location_insert_guard.sql",
);
const isolation = read("scripts/rls/isolation.sql");

/** The six columns the migration adds. Parsed, not retyped, so a renamed column fails here. */
const MIGRATION_COLUMNS = [...migration.matchAll(/ADD COLUMN IF NOT EXISTS\s+(home_\w+)/g)].map(
  (m) => m[1],
);

describe("the migration", () => {
  it("adds exactly the six home-location columns", () => {
    expect(MIGRATION_COLUMNS.sort()).toEqual(
      [
        "home_lat",
        "home_lng",
        "home_location_accuracy_m",
        "home_location_set_at",
        "home_location_set_by",
        "home_location_source",
      ].sort(),
    );
  });

  it("declares the same five sources the client knows about, in the same order", () => {
    const enumBody = migration.match(
      /CREATE TYPE public\.home_location_source AS ENUM \(([\s\S]*?)\);/,
    )?.[1];
    expect(enumBody).toBeTruthy();
    const values = [...(enumBody as string).matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...HOME_LOCATION_SOURCES]);
  });

  it("attributes the pin to auth.users, not to staff — the setter is often the member", () => {
    expect(migration).toMatch(/home_location_set_by\s+uuid REFERENCES auth\.users\(id\)/);
  });

  it("stamps provenance rather than accepting it", () => {
    expect(migration).toMatch(/NEW\.home_location_set_at\s*:=\s*now\(\)/);
    expect(migration).toMatch(/NEW\.home_location_set_by\s*:=\s*auth\.uid\(\)/);
  });

  it("constrains the source by actor: staff may not claim a member confirmation, or vice versa", () => {
    expect(migration).toMatch(/is_staff\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/NEW\.home_location_source NOT IN \('staff_pin', 'geocoded'\)/);
    expect(migration).toMatch(/NEW\.home_location_source NOT IN \('member_pin', 'member_gps'\)/);
  });

  it("refuses a provenance-only rewrite — history cannot be edited in place", () => {
    expect(migration).toMatch(/are not independently writable/);
  });

  it("carries the 100 m rule as a CHECK, so no future caller can bypass the dialog", () => {
    expect(migration).toMatch(/members_home_location_gps_accuracy/);
    expect(migration).toMatch(
      /home_location_accuracy_m IS NOT NULL AND home_location_accuracy_m <= 100/,
    );
  });

  it("refuses half a coordinate and an unlabelled pin", () => {
    expect(migration).toMatch(/members_home_location_complete/);
    expect(migration).toMatch(/members_home_location_bounds/);
  });

  it("runs on members beside the status guard rather than instead of it", () => {
    /*
      THE SHAPE THAT MATTERS IS THE LAST ONE WRITTEN, not this file's. 20260910140000 attached
      the guard to BEFORE UPDATE, which left the INSERT path open (see the block at the foot of
      this suite); 20260911102350 replaces the trigger. Asserting this file alone would have
      gone on passing while the rule it describes was half-enforced, so the effective definition
      is read out of the newest migration that declares one.
    */
    expect(migration).toMatch(/CREATE TRIGGER guard_member_home_location/);
    // The status guard is a separate trigger and must survive. Asserted by execution in the
    // isolation suite; named here so a rewrite of this migration cannot quietly drop it.
    expect(isolation).toMatch(/the members\.status guard still holds with the location guard beside it/);
  });

  it("documents its own rollback, like every migration in this repo", () => {
    expect(migration).toMatch(/ROLLBACK/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS guard_member_home_location ON public\.members/);
    expect(migration).toMatch(/DROP TYPE IF EXISTS public\.home_location_source/);
  });
});

/*
  THE INSERT HALF OF THE SAME RULE (20260911102350).

  The original guard was BEFORE UPDATE, and `Staff can manage members` is FOR ALL — so a staff
  INSERT carrying `home_location_source = 'member_pin'` put "set by member on <today>" on an
  operator's SOS card for a pin no member had ever seen. It was found by review after the
  feature merged and proven by execution in the isolation suite before it was fixed.

  What is asserted here is the agreement between the copies, as above. The behaviour itself is
  proven against a real Postgres in `scripts/rls/isolation.sql`, which is the only place the
  trigger actually runs.
*/
describe("the INSERT guard", () => {
  /** The trigger as the database will end up with it: the newest migration that declares one. */
  const effectiveTrigger = (() => {
    const dir = join(ROOT, "supabase/migrations");
    const declaring = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("CREATE TRIGGER guard_member_home_location"));
    expect(declaring.length).toBeGreaterThan(0);
    return read(`supabase/migrations/${declaring[declaring.length - 1]}`);
  })();

  it("is what the database ends up with — an INSERT is not a way round an UPDATE rule", () => {
    expect(effectiveTrigger).toMatch(
      /CREATE TRIGGER guard_member_home_location\s*\n\s*BEFORE INSERT OR UPDATE ON public\.members/,
    );
    expect(effectiveTrigger).toMatch(
      /DROP TRIGGER IF EXISTS guard_member_home_location ON public\.members/,
    );
  });

  it("branches on TG_OP, because OLD does not exist in a BEFORE INSERT row trigger", () => {
    expect(insertGuard).toMatch(/IF TG_OP = 'INSERT' THEN/);
  });

  it("lets staff create a row carrying an imported pin — that is the CRM import", () => {
    expect(insertGuard).toMatch(
      /NEW\.home_location_source NOT IN \('staff_pin', 'geocoded', 'imported'\)/,
    );
  });

  it("still refuses a member confirmation claimed by anybody but the member", () => {
    expect(insertGuard).toMatch(/NEW\.home_location_source NOT IN \('member_pin', 'member_gps'\)/);
  });

  it("gives an imported coordinate no confirmation date, because nobody confirmed it", () => {
    expect(insertGuard).toMatch(
      /CASE WHEN NEW\.home_location_source = 'imported' THEN NULL ELSE now\(\) END/,
    );
  });

  it("costs an ordinary Add-a-member nothing", () => {
    expect(insertGuard).toMatch(/IF NEW\.home_location_source IS NULL THEN\s*\n\s*RETURN NEW;/);
  });

  it("is proven by execution, not only by the text above", () => {
    expect(isolation).toMatch(
      /STAFF CANNOT CREATE A MEMBER WITH A PIN THAT CLAIMS THE MEMBER CONFIRMED IT/,
    );
    expect(isolation).toMatch(/A FORGED set_at \/ set_by ON AN INSERT IS OVERWRITTEN, NOT STORED/);
    expect(isolation).toMatch(/AN IMPORTED PIN GETS NO CONFIRMATION DATE/);
  });

  it("documents its own rollback, like every migration in this repo", () => {
    expect(insertGuard).toMatch(/ROLLBACK/);
  });
});

describe("member-self-service save_home_location", () => {
  it("is on the closed action set", () => {
    expect(fn).toContain('case "save_home_location"');
  });

  const handler = () => {
    const start = fn.indexOf('case "save_home_location"');
    const end = fn.indexOf("      default:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return fn.slice(start, end);
  };

  it("NEVER spreads the request body into the update — the defect #297 fixed elsewhere", () => {
    expect(handler()).not.toMatch(/\.\.\.body/);
    expect(handler()).not.toMatch(/update\(\s*\{\s*\.\.\./);
  });

  it("whitelists the six columns and refuses to write anything else", () => {
    const listed = [...fn.matchAll(/const HOME_LOCATION_COLUMNS = \[([\s\S]*?)\]/g)][0]?.[1] ?? "";
    const columns = [...listed.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(columns.sort()).toEqual(MIGRATION_COLUMNS.sort());
    expect(handler()).toMatch(/not on the home-location whitelist/);
  });

  it("stamps provenance from the verified caller, never from the body", () => {
    const h = handler();
    expect(h).toMatch(/home_location_set_by: user\.id/);
    expect(h).toMatch(/home_location_set_at: setAt/);
    expect(h).toMatch(/const setAt = new Date\(\)\.toISOString\(\)/);
    // The body's own attempt at either is not read at all.
    expect(h).not.toMatch(/body\.home_location_set_by/);
    expect(h).not.toMatch(/body\.set_at/);
  });

  it("narrows the source to the two a member may claim", () => {
    expect(fn).toMatch(/const MEMBER_LOCATION_SOURCES = \["member_pin", "member_gps"\]/);
    expect(handler()).toMatch(/MEMBER_LOCATION_SOURCES as readonly string\[\]\)\.includes\(body\.source\)/);
  });

  it("scopes the write to the caller's own member row", () => {
    expect(handler()).toMatch(/\.eq\("id", member\.id\)/);
    // `member` is resolved from the bearer token's user_id at the top of the handler.
    expect(fn).toMatch(/\.eq\("user_id", user\.id\)/);
  });

  it("refuses a coordinate that is not a place, 0,0 included", () => {
    const h = handler();
    expect(h).toMatch(/lat < -90 \|\| lat > 90 \|\| lng < -180 \|\| lng > 180/);
    expect(h).toMatch(/lat === 0 && lng === 0/);
    expect(h).toMatch(/must be a real coordinate/);
  });

  it("refuses a fix worse than the limit and says how bad it was", () => {
    const h = handler();
    expect(h).toMatch(/reported > MEMBER_GPS_MAX_ACCURACY_M/);
    expect(h).toMatch(/"accuracy_too_low"/);
    expect(h).toMatch(/max_accuracy_m: MEMBER_GPS_MAX_ACCURACY_M/);
  });

  it("gives a dragged pin no accuracy figure rather than a fake one", () => {
    const h = handler();
    expect(h).toMatch(/let accuracyM: number \| null = null/);
    expect(h).toMatch(/if \(source === "member_gps"\)/);
  });

  it("writes an audit row with the provenance and WITHOUT the coordinates", () => {
    const h = handler();
    expect(h).toMatch(/action: "home_location_set"/);
    expect(h).toMatch(/replaced_source/);
    const details = h.slice(h.indexOf("details: {"), h.indexOf("});", h.indexOf("details: {")));
    expect(details).not.toMatch(/\blat\b/);
    expect(details).not.toMatch(/\blng\b/);
  });

  it("does not fail the member's save because the audit row failed, but does not hide it either", () => {
    const h = handler();
    expect(h).toMatch(/if \(logError\) console\.error/);
    expect(h).toMatch(/home location save failed/);
  });

  it("stores nothing on any other request — one row, overwritten, no history table", () => {
    expect(migration).not.toMatch(/CREATE TABLE[\s\S]*home_location/i);
    expect(handler()).toMatch(/NEVER STORED EXCEPT AT THIS MOMENT/);
  });
});

describe("the three copies of the 100 m rule agree", () => {
  it("edge function, client library and CHECK constraint carry the same number", () => {
    const inFn = Number(fn.match(/const MEMBER_GPS_MAX_ACCURACY_M = (\d+)/)?.[1]);
    const inCheck = Number(
      migration.match(/home_location_accuracy_m <= (\d+)/)?.[1],
    );
    expect(inFn).toBe(MEMBER_GPS_MAX_ACCURACY_M);
    expect(inCheck).toBe(MEMBER_GPS_MAX_ACCURACY_M);
  });

  it("edge function and client library agree on which sources are the member's", () => {
    const listed = fn.match(/const MEMBER_LOCATION_SOURCES = \[([^\]]*)\]/)?.[1] ?? "";
    const sources = [...listed.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(sources).toEqual([...MEMBER_WRITABLE_SOURCES]);
  });
});
