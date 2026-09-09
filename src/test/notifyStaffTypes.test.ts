// @vitest-environment node
//
// THE TYPE LAYER AND THE ROUTER HAVE TO AGREE ABOUT COLUMN NAMES.
//
// The defect this whole feature exists to remove is a column that was never there:
// `notify-admin` reads `notification_settings.whatsapp_ev07b_alerts`, no migration ever created
// it, `undefined` makes `shouldSend` false, and the EV07B WhatsApp alert has never sent — for
// months, silently, because reading a missing column through the Supabase client is not an
// error. It is `undefined`.
//
// `src/integrations/supabase/types.ts` is the only thing that can catch that at build time, and
// it mirrors THE MIGRATION SET (scripts/sync-supabase-types.py reads a database with every
// migration applied), not production. So these tests check the mirror both ways:
//
//   * a TYPE-LEVEL assertion, checked by tsc in CI, that the row the router inserts into
//     `notification_log` is assignable to that table's Insert type; and
//   * a runtime check that every column the router SELECTS by name exists in the typed Row.
//
// A `select("stff_id")` typo is not a type error — the string is opaque to tsc — so the second
// half is the one that would have caught `whatsapp_ev07b_alerts`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Database } from "../integrations/supabase/types";
import type { LogRow } from "../../supabase/functions/_shared/notify-staff";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Tables = Database["public"]["Tables"];

// ── compile-time half ──────────────────────────────────────────────────────
// These are checked by tsc in CI, and each is used in an assertion below so that "unused" can
// never quietly delete the check.
type LogInsert = Tables["notification_log"]["Insert"];

/**
 * If `LogRow` drops a column notification_log REQUIRES, or types a shared one differently, this
 * does not compile.
 *
 * It does not, on its own, catch a field LogRow invents: structural assignability allows extra
 * properties on a non-literal value, so `not_a_column?: string` slid straight through the first
 * version of this check. That is what the key comparison below is for — proven by adding exactly
 * that field and watching only the second half go red.
 */
const logRowIsInsertable: (row: LogRow) => LogInsert = (row) => row;

/**
 * ...and the other direction: every key of `LogRow` must be a column of the table.
 *
 * `false` here is a tsc error, which is the assertion. An invented column is not a type error at
 * the call site (see above) and is not a runtime error either — PostgREST rejects the whole
 * insert, so ONE unknown key silently costs the entire notification log for that dispatch.
 */
type LogRowInventsNothing = Exclude<keyof LogRow, keyof LogInsert> extends never ? true : false;
const logRowInventsNothing: LogRowInventsNothing = true;

/**
 * A row of each new table, spelled out. Indexing a table name the type layer does not have is a
 * tsc error, and so is a missing or misspelled property — which is the assertion. The runtime
 * `expect`s below then check the same thing against the file's text, because a `.select()`
 * string is opaque to tsc.
 */
const sampleRoute: Tables["notification_routes"]["Row"] = {
  event_type: "sale.paid",
  channel: "whatsapp",
  enabled: true,
  updated_at: "2026-09-09T00:00:00Z",
  updated_by: null,
};
const samplePref: Tables["staff_notification_prefs"]["Row"] = {
  id: "p-1",
  staff_id: "s-1",
  event_type: "sale.paid",
  channel: "whatsapp",
  enabled: true,
  updated_at: "2026-09-09T00:00:00Z",
  updated_by: null,
};
const sampleToken: Tables["staff_push_tokens"]["Row"] = {
  id: "t-1",
  staff_id: "s-1",
  token: "fcm-token",
  platform: "ios",
  last_seen_at: "2026-09-09T00:00:00Z",
  created_at: "2026-09-09T00:00:00Z",
  label: null,
};

describe("the row the router writes is insertable", () => {
  it("LogRow is assignable to notification_log's Insert type", () => {
    // The three columns the migration adds are what make this true: a LogRow carrying
    // `channel`, `recipient` and `idempotency_key` would be rejected by the old table.
    const row = logRowIsInsertable({
      admin_user_id: "u-1",
      event_type: "sale.paid",
      channel: "whatsapp",
      recipient: "+34600000000",
      message: "A sale — €39.90",
      status: "sent",
      idempotency_key: "sale.paid:order:o-1",
    });
    expect(logRowInventsNothing).toBe(true);
    expect(row.channel).toBe("whatsapp");
    expect(row.idempotency_key).toBe("sale.paid:order:o-1");
    expect(row.recipient).toBe("+34600000000");
  });

  it("the three new tables are shaped as the code reads them", () => {
    expect(Object.keys(sampleRoute).sort()).toEqual(
      ["channel", "enabled", "event_type", "updated_at", "updated_by"],
    );
    expect(samplePref.staff_id).toBe("s-1");
    expect(sampleToken.platform).toBe("ios");
  });
});

describe("the notify-staff tables are in the type layer", () => {
  const types = read("src/integrations/supabase/types.ts");

  /** The `Row:` block for one table, as it appears in the generated file. */
  const rowBlock = (table: string) => {
    const start = types.indexOf(`      ${table}: {\n        Row: {`);
    expect(start, `${table} is in types.ts`).toBeGreaterThan(-1);
    const rowStart = types.indexOf("Row: {", start);
    const rowEnd = types.indexOf("        }", rowStart);
    return types.slice(rowStart, rowEnd);
  };

  const columnsOf = (table: string) =>
    [...rowBlock(table).matchAll(/^\s{10}([a-z_]+)\??:/gm)].map((m) => m[1]);

  it("declares each table with the columns the migration creates", () => {
    // Written out rather than parsed from the migration, because the migration is in a HELD PR
    // (schema travels in one held PR by instruction) and a test that read a path from another
    // branch would simply be red on main. The moment it lands, the SQL is the second opinion.
    expect(columnsOf("notification_routes").sort()).toEqual(
      ["channel", "enabled", "event_type", "updated_at", "updated_by"],
    );
    expect(columnsOf("staff_notification_prefs").sort()).toEqual(
      ["channel", "enabled", "event_type", "id", "staff_id", "updated_at", "updated_by"],
    );
    expect(columnsOf("staff_push_tokens").sort()).toEqual(
      ["created_at", "id", "label", "last_seen_at", "platform", "staff_id", "token"],
    );
  });

  it("gives notification_log the three columns that turn it into a channel log", () => {
    /*
      `notification_log` was the bell feed and nothing else. The router writes one row per
      DECISION — per recipient, per channel, skips included — so it needs to say WHICH channel
      and WHICH address, and carry the idempotency key that stops a webhook retry buzzing the
      same phone twice.

      `channel` defaults to 'bell' in the migration precisely so every row written by the old
      code, and every row already in the table, still reads as a bell notification.
    */
    const columns = columnsOf("notification_log");
    for (const added of ["channel", "recipient", "idempotency_key"]) {
      expect(columns, added).toContain(added);
    }
  });

  it("does NOT invent whatsapp_ev07b_alerts on notification_settings", () => {
    // The column notify-admin reads and no migration created. It must stay absent here: adding
    // it to the type layer would make the read compile and the bug permanent, where the router's
    // routes table replaces it outright.
    expect(columnsOf("notification_settings")).not.toContain("whatsapp_ev07b_alerts");
  });
});

describe("every column the router selects by name exists", () => {
  // `.select("staff_id, token, platform")` is an opaque string to tsc. This is the half that
  // would have caught whatsapp_ev07b_alerts, and it is why the strings are parsed rather than
  // trusted.
  // The router's reads moved to `_shared/notify-staff-runtime.ts` when notify-admin started
  // delegating to the same router — one implementation of the I/O, two doors.
  const fn = read("supabase/functions/_shared/notify-staff-runtime.ts");
  const types = read("src/integrations/supabase/types.ts");

  const columnsOf = (table: string) => {
    const start = types.indexOf(`      ${table}: {\n        Row: {`);
    const rowStart = types.indexOf("Row: {", start);
    const rowEnd = types.indexOf("        }", rowStart);
    return [...types.slice(rowStart, rowEnd).matchAll(/^\s{10}([a-z_]+)\??:/gm)].map((m) => m[1]);
  };

  const selects = [...fn.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.select\("([^"]+)"\)/g)].map(
    (m) => ({ table: m[1], columns: m[2].split(",").map((c) => c.trim()).filter(Boolean) }),
  );

  it("finds the router's selects at all", () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(selects.length).toBeGreaterThanOrEqual(4);
    expect(selects.map((s) => s.table)).toContain("notification_routes");
    expect(selects.map((s) => s.table)).toContain("staff_notification_prefs");
  });

  for (const { table, columns } of selects) {
    it(`${table}: ${columns.join(", ")}`, () => {
      const known = columnsOf(table);
      expect(known.length, `${table} is typed`).toBeGreaterThan(0);
      for (const column of columns) {
        expect(known, `${table}.${column}`).toContain(column);
      }
    });
  }
});

describe("the client-side push registration will have a table to write to", () => {
  it("staff_push_tokens carries the columns the brief names", () => {
    // "token storage per device (staff_push_tokens: staff_id, token, platform, last_seen)".
    // Typed as keys of the Row, so a name that is not a column is a tsc error as well as a
    // failed assertion — the string-vs-schema gap closed from both sides.
    const row: Array<keyof Tables["staff_push_tokens"]["Row"]> = [
      "staff_id",
      "token",
      "platform",
      "last_seen_at",
    ];
    const types = read("src/integrations/supabase/types.ts");
    const start = types.indexOf("      staff_push_tokens: {\n        Row: {");
    const block = types.slice(start, types.indexOf("Relationships", start));
    for (const column of row) expect(block, column).toContain(`${column}:`);
  });
});
