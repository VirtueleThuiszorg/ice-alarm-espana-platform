import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * A GUESS DOES NOT RING THE BELL — and everything else about the enquiry is unchanged.
 *
 * `leads` carries two AFTER INSERT triggers, and the spam submission that started this rang
 * both: one notification_log row per active staff member, and a lead.new POST that texts and
 * emails the admins. `suspected_spam` now gates both.
 *
 * The assertions here are mostly ABSENCES, because the dangerous version of this change is the
 * one that goes further than "does not ring": a trigger that refuses the INSERT, a filter that
 * hides the row, an UPDATE that deletes it. Losing a real enquiry is far worse than one
 * unnecessary bell, and the heuristics that set this flag are guesses with real enquiries
 * behind them.
 */

const MIGRATIONS = path.resolve(process.cwd(), "supabase/migrations");
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const all = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(path.join(MIGRATIONS, f), "utf8") }));

/** The last CREATE TRIGGER for a name, comments stripped — i.e. the one in force. */
function liveTrigger(name: string): string {
  let live = "";
  for (const { sql } of all) {
    for (const m of stripSqlComments(sql).matchAll(
      new RegExp(`CREATE\\s+TRIGGER\\s+${name}\\b([\\s\\S]*?);`, "gi"),
    )) {
      live = m[1];
    }
  }
  return live;
}

const BELLS = ["notify_staff_of_new_lead", "emit_lead_new_to_router"];

describe("the replay found the triggers", () => {
  it("is not passing everything because it matched nothing", () => {
    // Comments are stripped first: each migration's rollback block contains a CREATE TRIGGER
    // for what it replaced, and a replay that reads those would report the OLD definition as
    // the live one — which would make every assertion below pass against the version this
    // change exists to replace.
    for (const name of BELLS) {
      expect(liveTrigger(name), `${name} was not found`).toMatch(/AFTER INSERT ON public\.leads/i);
    }
  });
});

describe("both new-lead triggers are gated on the flag", () => {
  it.each(BELLS)("%s does not fire for a suspected-spam row", (name) => {
    expect(liveTrigger(name)).toMatch(/WHEN \(NEW\.suspected_spam IS NOT TRUE\)/i);
  });

  it.each(BELLS)("%s uses IS NOT TRUE, never = false", (name) => {
    /*
      `NULL = false` is NULL, which is not TRUE — so `WHEN (NEW.suspected_spam = false)` would
      silently stop the bell for any row holding NULL, which is exactly the enquiries nobody
      flagged. This way NULL rings.
    */
    expect(liveTrigger(name)).not.toMatch(/suspected_spam\s*=\s*false/i);
  });
});

describe("what it must NOT do", () => {
  const sql = all.find((m) => m.name.includes("suspected_spam_does_not_ring"))!.sql;
  const code = stripSqlComments(sql);

  it("the enquiry is still written — nothing here can refuse an INSERT", () => {
    // A BEFORE trigger returning NULL, or a rule, would drop the row. Losing a real enquiry to
    // a language heuristic is the one outcome this whole feature must not be able to produce.
    expect(code).not.toMatch(/BEFORE\s+INSERT/i);
    expect(code).not.toMatch(/RETURN NULL/i);
    // `DELETE FROM`, not the bare word: the COMMENT ON COLUMN text says in so many words that
    // this is "never a reason to hide or delete an enquiry", and a check that forbade the word
    // would forbid the sentence promising not to do it.
    expect(code).not.toMatch(/DELETE\s+FROM/i);
  });

  it("does not touch the trigger functions themselves", () => {
    // The functions are shared and do one thing each. The condition belongs in the schema,
    // where `\d leads` shows it, not buried in an early RETURN inside a function body.
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  });

  it("is reversible, and the rollback restores the unconditional triggers", () => {
    expect(sql).toMatch(/-- ── rollback/);
    for (const name of BELLS) {
      expect(sql).toMatch(new RegExp(`--\\s*CREATE TRIGGER ${name}`));
    }
  });
});
