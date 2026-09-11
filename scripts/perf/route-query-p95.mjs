#!/usr/bin/env -S node --experimental-strip-types
/**
 * HOW LONG EACH ROUTE'S DATABASE READS ACTUALLY TAKE — the one column the browser
 * harness cannot fill.
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
 *     node scripts/perf/route-query-p95.mjs [rows]
 *
 * `e2e/perf/scorecard.spec.ts` answers Supabase from a stub, so it can count a
 * page's queries EXACTLY and can say nothing at all about how long they take. A
 * stub has no query planner. Rather than leave `dbQueryP95Ms` null — which the
 * scorer treats as a FAIL, deliberately — this measures the real thing: a real
 * PostgreSQL built from the real migration set, with RLS on, read as the route's
 * own persona.
 *
 * ── WHAT IS MEASURED, AND WHY IT IS AN UPPER BOUND ──────────────────────────
 *
 * For each table a route read, this times an UNFILTERED `count(*)` — every row
 * the policy admits. The real page reads are narrower: `.eq("member_id", …)`,
 * `.limit(20)`, `.range(…)`. Translating each recorded PostgREST call back into
 * SQL would be a second PostgREST, so this deliberately measures the worst case
 * instead.
 *
 * That makes the number an UPPER BOUND, and the argument it supports is one-way:
 * if the whole table under RLS comes back inside the budget, every filtered read
 * of it does too. It cannot be used the other way round — a route over budget
 * here might still be fine in practice, and would need its actual queries timed.
 *
 * p95 across the route's tables, because the budget is about the slowest thing a
 * page waits on, not the average.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MEASUREMENTS = path.join(REPO_ROOT, "docs/perf/measurements.json");
const ROWS = Number(process.argv[2] ?? 20000);

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("DATABASE_URL is required — point it at a PostgreSQL 16 built by rls-explain.sh");
  process.exit(2);
}
if (!fs.existsSync(MEASUREMENTS)) {
  console.error("no docs/perf/measurements.json — run `npm run perf:measure` first");
  process.exit(2);
}

const measurements = JSON.parse(fs.readFileSync(MEASUREMENTS, "utf8"));

const psql = (sql) =>
  execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

/*
  ONE IDENTITY: AN ADMIN, for every route — and that is the worst case rather
  than a shortcut.

  Reached exactly as production reaches it: `SET LOCAL ROLE authenticated` plus
  the JWT claims GUC that `scripts/rls/bootstrap.sql`'s `auth.uid()` reads.
  Running as the table owner would bypass RLS entirely and time a query the
  product never issues.

  Why not one identity per persona: RLS scopes a MEMBER to their own handful of
  rows, so timing a member route as a member reads almost nothing and reports a
  fraction of a millisecond — a number that says the policy filtered well, not
  that the query is fast. An admin sees every row the table holds, so an admin's
  read is the ceiling for anyone's. If the ceiling is inside the budget, every
  narrower read is too.
*/
const WORST_CASE_UID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Every table any route reads, so each is timed once rather than per route. */
const allTables = [...new Set(measurements.flatMap((m) => m.tablesRead ?? []))].sort();
if (allTables.length === 0) {
  console.error(
    "measurements.json records no tablesRead — re-run `npm run perf:measure` with a harness\n" +
      "new enough to record them, or this would report a p95 over nothing.",
  );
  process.exit(2);
}

/*
  SEED FIRST, or the measurement is about an empty database.

  Most of these tables are untouched by `rls-explain.sh`, which seeds only the
  four it reports on. An unseeded table answers a count in a tenth of a
  millisecond and every route reading it would look perfect. The generic seeder
  from rls-explain.sql fills each to ROWS rows in ONE psql session, because
  `pg_temp` functions do not survive a new connection.
*/
const SEEDER = path.join(REPO_ROOT, "scripts/perf/rls-explain.sql");
console.log(`seeding ${allTables.length} table(s) to ${ROWS} rows…`);
{
  const calls = allTables
    .map((t) => `SELECT pg_temp.seed('public."${t}"', ${ROWS});`)
    .join("\n");
  try {
    execFileSync(
      "psql",
      [
        DB,
        "-v",
        "ON_ERROR_STOP=0", // a table that refuses a generic row is skipped, not fatal
        "-q",
        "-f",
        SEEDER,
        "-c",
        `SET session_replication_role = replica;\n${calls}`,
        "-c",
        allTables.map((t) => `ANALYZE public."${t}";`).join("\n"),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    // ON_ERROR_STOP=0 means psql reports per-statement failures and exits 0;
    // a non-zero exit here is the connection itself, which is worth failing on.
    console.error("seeding could not run at all — is DATABASE_URL reachable?");
    process.exit(2);
  }
}

const rowCounts = psql(
  allTables.map((t) => `SELECT '${t}', count(*) FROM public."${t}"`).join(" UNION ALL "),
)
  .split("\n")
  .filter(Boolean);
const empty = rowCounts.filter((line) => line.endsWith("|0")).map((l) => l.split("|")[0]);
if (empty.length) {
  // Said out loud: a table the seeder could not fill is timed against nothing,
  // and its route's p95 is correspondingly optimistic.
  console.warn(
    `  ! ${empty.length} table(s) could not be seeded and are timed EMPTY: ${empty.join(", ")}`,
  );
}

console.log(`timing ${allTables.length} table(s) as an admin (the widest read)…`);

/** Time one read, taking the best of three: the worst run measures the disk. */
function timeRead(table, uid) {
  const durations = [];
  for (let i = 0; i < 3; i++) {
    const out = psql(`
      BEGIN;
      SELECT set_config('request.jwt.claims',
        '{"sub":"${uid}","role":"authenticated"}', true);
      SET LOCAL ROLE authenticated;
      EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON, COSTS OFF)
        SELECT count(*) FROM public."${table}";
      ROLLBACK;
    `);
    const ms = /Execution Time: ([\d.]+) ms/.exec(out)?.[1];
    if (ms) durations.push(Number(ms));
  }
  return durations.length ? Math.min(...durations) : null;
}

const cache = new Map();
function timingFor(table) {
  if (cache.has(table)) return cache.get(table);
  let value = null;
  try {
    value = timeRead(table, WORST_CASE_UID);
  } catch {
    // A table the harness saw but this database does not have (a view added
    // later, a typo) is recorded as unmeasured rather than as fast.
    value = null;
  }
  cache.set(table, value);
  return value;
}

/** p95 of a small set: the highest value below the 95th percentile position. */
function p95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

let filled = 0;
let unmeasured = 0;

for (const m of measurements) {
  const timings = (m.tablesRead ?? []).map((t) => timingFor(t)).filter((v) => v !== null);

  if (timings.length === 0) {
    // A route that read no table has nothing to time, and `null` keeps saying
    // "unproven" rather than quietly claiming 0 ms.
    m.dbQueryP95Ms = null;
    unmeasured += 1;
    continue;
  }
  m.dbQueryP95Ms = Number(p95(timings).toFixed(2));
  filled += 1;
}

fs.writeFileSync(MEASUREMENTS, `${JSON.stringify(measurements, null, 2)}\n`);

const worst = [...measurements]
  .filter((m) => m.dbQueryP95Ms !== null)
  .sort((a, b) => b.dbQueryP95Ms - a.dbQueryP95Ms)
  .slice(0, 5);

console.log(
  `\nroute-query-p95: filled ${filled} route(s); ${unmeasured} read no table and stay unproven.\n` +
    `slowest:\n` +
    worst.map((m) => `  ${m.routeId.padEnd(22)} ${m.dbQueryP95Ms} ms`).join("\n"),
);
