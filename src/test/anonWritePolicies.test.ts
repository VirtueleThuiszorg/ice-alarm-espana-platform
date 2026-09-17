import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * THE POLICIES THAT LET THE BROWSER WRITE ARE GONE, AND STAY GONE.
 *
 * `publicWritePaths.test.ts` guards the client half — that no public page makes such a write.
 * This guards the schema half: that the grant it used no longer exists. Both are needed, because
 * either one alone leaves the hole open from the other side. A page can be rewritten; a policy
 * that says `WITH CHECK (true)` is available to anything holding the anon key, which is a string
 * published in the site's own JavaScript.
 */

const MIGRATIONS = path.resolve(process.cwd(), "supabase/migrations");

/**
 * COMMENTS ARE STRIPPED FIRST, and that is not a detail.
 *
 * Every migration in this repo ends with a commented-out rollback block, which by construction
 * contains a `CREATE POLICY` for each policy the migration dropped. A replay that reads comments
 * concludes that every policy ever dropped is still live — this check passed for exactly that
 * reason on its first run, with the revoking migration sitting right there in the branch.
 */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const allMigrations = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({
    name: f,
    sql: stripSqlComments(readFileSync(path.join(MIGRATIONS, f), "utf8")),
  }));

/**
 * The policies in force at the end of the migration series, for one table.
 *
 * Policies accrete across 200-odd files and are dropped and recreated by name, so grepping for
 * "CREATE POLICY" alone would report ones that no longer exist. This replays them in order.
 */
function policiesOn(table: string): Map<string, string> {
  const live = new Map<string, string>();
  for (const { sql } of allMigrations) {
    for (const m of sql.matchAll(
      new RegExp(
        `DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?"([^"]+)"\\s+ON\\s+(?:public\\.)?${table}\\b`,
        "gi",
      ),
    )) {
      live.delete(m[1]);
    }
    for (const m of sql.matchAll(
      new RegExp(
        `CREATE\\s+POLICY\\s+"([^"]+)"\\s*\\n?\\s*ON\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
        "gi",
      ),
    )) {
      live.set(m[1], m[2]);
    }
  }
  return live;
}

describe("the replay itself", () => {
  it("is reading policies at all", () => {
    /*
      A SWEEP THAT FINDS NOTHING PASSES EVERYTHING AFTER IT. If the regex stopped matching — a
      formatting change in a future migration would do it — every assertion below would go green
      against an empty map while the policies were still live. So the replay is asserted to have
      found policies on a table nobody is revoking anything on.
    */
    expect(allMigrations.length).toBeGreaterThan(200);
    expect(policiesOn("leads").size).toBeGreaterThan(0);
    expect(policiesOn("website_events").size).toBeGreaterThan(0);
  });
});

describe("the anon INSERT policies that made the empty lead possible", () => {
  it("leads: no policy grants an INSERT to anyone but the service role", () => {
    /*
      "Anyone can submit leads" FOR INSERT WITH CHECK (true) had been on this table since
      January. `public-submit` writes with the service role, which does not consult RLS at all —
      so the correct replacement is NO insert policy rather than a narrower one.
    */
    for (const [name, body] of policiesOn("leads")) {
      if (!/FOR\s+INSERT/i.test(body)) continue;
      expect(body, `${name} still grants INSERT on leads`).toMatch(/TO\s+service_role/i);
    }
    expect([...policiesOn("leads").keys()]).not.toContain("Anyone can submit leads");
  });

  it("registration_drafts: the policy nothing had used for months is gone", () => {
    // Half-finished registrations: names, addresses, dates of birth. An unused anon INSERT
    // policy is the worst kind — nobody is watching it because nobody uses it.
    expect([...policiesOn("registration_drafts").keys()]).not.toContain("Anyone can insert drafts");
  });

  it("website_events: anon may still insert, but only a bounded row", () => {
    /*
      Deliberately different, and it would be dishonest to treat it the same. This is page-view
      telemetry written on every page load: routing it through a function would put an invocation
      on every visit to protect rows holding a path and a browser string. What was wrong was
      `WITH CHECK (true)` — anon could write any shape, including using the table as storage.
    */
    const live = policiesOn("website_events");
    expect([...live.keys()]).not.toContain("Anyone can insert website events");
    const bounded = live.get("Visitors can record a bounded website event");
    expect(bounded).toBeTruthy();
    expect(bounded).not.toMatch(/WITH CHECK \(\s*true\s*\)/i);
    expect(bounded).toMatch(/length\(metadata::text\)/);
  });

  it("website_events: every free-text column the table has is bounded, not just the obvious ones", () => {
    /*
      THE LIST IS READ OFF THE CREATE TABLE, not typed out here. The first version of the policy
      bounded thirteen columns and left nine — `city`, `browser`, `screen_resolution` and the
      rest — accepting anything, which is the same hole in a less obvious place. Deriving the
      list means a column added next year is covered or this goes red.
    */
    const create = allMigrations.find((m) => /CREATE TABLE public\.website_events/.test(m.sql));
    expect(create, "the website_events CREATE TABLE").toBeTruthy();
    const body = create!.sql.slice(create!.sql.indexOf("CREATE TABLE public.website_events"));
    const columns = [...body.slice(0, body.indexOf(");")).matchAll(/^\s*(\w+)\s+TEXT\b/gim)].map(
      (m) => m[1],
    );
    expect(columns.length).toBeGreaterThan(15);

    const bounded = policiesOn("website_events").get("Visitors can record a bounded website event")!;
    const unbounded = columns.filter((c) => !new RegExp(`length\\(${c}\\)`).test(bounded));
    expect(unbounded, `these TEXT columns accept anything: ${unbounded.join(", ")}`).toEqual([]);
  });
});

describe("a contact-form lead has to be answerable", () => {
  const file = allMigrations.find((m) => /leads_contact_form_is_actionable/.test(m.sql))!;
  const sql = file.sql;
  /*
    READ RAW as well as stripped. The counting query and the VALIDATE line are deliberately
    COMMENTS — instructions for whoever has production access — and the stripped copy every other
    assertion here uses removes them, which is how this test first went red against its own
    subject.
  */
  const raw = readFileSync(path.join(MIGRATIONS, file.name), "utf8");

  it("names all three fields, and only for the contact form", () => {
    // The spam lead had none of the three. The other sources legitimately hold less — a
    // product_interest row is an email by design — so a blanket constraint would be false
    // about them.
    expect(sql).toMatch(/source IS DISTINCT FROM 'contact_form'/);
    for (const field of ["first_name", "email", "phone"]) {
      expect(sql, `${field} must be required`).toMatch(
        new RegExp(`length\\(trim\\(${field}\\)\\)\\s*>\\s*0`),
      );
    }
  });

  it("is NOT VALID, so it cannot reject or rewrite a lead that arrived before the rule", () => {
    /*
      Not a hedge. Nobody here has production access to count the existing incomplete rows, and a
      validating constraint would either fail the migration or force somebody to decide, under
      time pressure, what to do with real enquiries from real people. NOT VALID governs every new
      row from now on; the counting query is in the migration for whoever validates it.
    */
    expect(sql).toMatch(/NOT VALID/);
    // The count to run first, and the one line that validates it, are both written down.
    expect(raw).toMatch(/count\(\*\) FILTER \(WHERE first_name IS NULL/);
    expect(raw).toMatch(/VALIDATE CONSTRAINT leads_contact_form_is_actionable/);
  });
});
