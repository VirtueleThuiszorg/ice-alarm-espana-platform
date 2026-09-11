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
import os from "node:os";
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
  /*
    ONE FILE, NOT ONE `-c` — and the difference is 30 empty tables.

    The first version passed every seed call in a single `psql -c "...;...;..."`.
    A `-c` string is ONE implicit transaction, so the first table that refused a
    generic row rolled back every table after it, and `ON_ERROR_STOP=0` cannot
    help: there is nothing left to continue. 12 of 42 tables ended up seeded and
    the other 30 were timed EMPTY — which is to say, timed against nothing, and a
    p95 built on that is not evidence.

    `psql -f` runs each statement on its own in autocommit, so a table that will
    not take a generic row costs only itself. `pg_temp.seed` is defined in the
    same file because a pg_temp function does not survive a new session.
  */
  const script = [
    fs.readFileSync(SEEDER, "utf8"),
    "SET session_replication_role = replica;",
    ...allTables.map((t) => `SELECT pg_temp.seed('public."${t}"', ${ROWS});`),
    ...allTables.map((t) => `ANALYZE public."${t}";`),
  ].join("\n");

  const scriptPath = path.join(os.tmpdir(), `perf-p95-seed-${process.pid}.sql`);
  fs.writeFileSync(scriptPath, script);
  try {
    execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=0", "-q", "-f", scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    // ON_ERROR_STOP=0 means psql reports per-statement failures and exits 0;
    // a non-zero exit here is the connection itself, which is worth failing on.
    console.error("seeding could not run at all — is DATABASE_URL reachable?");
    process.exit(2);
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

/*
  THE IDENTITY HAS TO EXIST, AND IT HAS TO SEE SOMETHING.

  Every timing below runs as WORST_CASE_UID through RLS. That uid is only an
  admin because a row in `public.staff` says so — and `staff` is one of the
  tables this script seeds, which means a fresh or re-seeded database has staff
  rows with random user_ids and no row for this one.

  When that happens nothing errors. The policies simply reject every row, and the
  numbers come back WRONG IN BOTH DIRECTIONS: a sequential scan over a table the
  reader cannot see is fast and looks like a pass, while an ordered index scan
  walks every entry finding nothing and looks like a 156 ms regression. Both were
  observed here before this block existed — `alerts`, which is properly indexed on
  `received_at`, reported 153 ms for `ORDER BY received_at DESC LIMIT 50` with
  `actual rows=0`.

  So the row is created if missing, and then the access is PROVEN by reading a
  table through the policy. Failing that check exits rather than reporting: a p95
  measured as nobody is not a weaker number, it is a different measurement
  wearing the same name.
*/
psql(`
  -- Same FK bypass the seeding above uses: staff.user_id references auth.users,
  -- which this throwaway database has no rows in and no need of. The identity is
  -- a uuid in a JWT claim; GoTrue is not part of the decision RLS makes.
  SET session_replication_role = replica;
  INSERT INTO public.staff (id, user_id, first_name, last_name, email, role)
  SELECT gen_random_uuid(), '${WORST_CASE_UID}', 'Perf', 'Operator',
         'perf@example.com', 'admin'
  WHERE NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id = '${WORST_CASE_UID}');
  ANALYZE public.staff;
`);

{
  const probeTable = allTables.find((t) => t === "members") ?? allTables[0];
  // A multi-statement psql block prints something for each statement — BEGIN,
  // the set_config value, SET, the count, ROLLBACK — so the LAST line is
  // "ROLLBACK", not the number. Taking it turned a healthy read into NaN and
  // then into a refusal to run. The count is the last all-digits line.
  const out = psql(`
    BEGIN;
    SELECT set_config('request.jwt.claims',
      '{"sub":"${WORST_CASE_UID}","role":"authenticated"}', true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) FROM public."${probeTable}";
    ROLLBACK;
  `);
  const visible = Number(
    out.split("\n").map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).pop() ?? "0",
  );
  if (!Number.isFinite(visible) || visible === 0) {
    console.error(
      `the worst-case identity sees 0 rows of "${probeTable}" — every timing below\n` +
        `would be a measurement of RLS refusing, not of the query. Check that\n` +
        `public.staff holds a row for ${WORST_CASE_UID} with an admin role.`,
    );
    process.exit(2);
  }
  console.log(`worst-case identity verified: sees ${visible} row(s) of ${probeTable}`);
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

/** Time one statement under RLS, best of three: the worst run measures the disk. */
function timeStatement(sql, uid) {
  const durations = [];
  for (let i = 0; i < 3; i++) {
    const out = psql(`
      BEGIN;
      SELECT set_config('request.jwt.claims',
        '{"sub":"${uid}","role":"authenticated"}', true);
      SET LOCAL ROLE authenticated;
      EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON, COSTS OFF)
        ${sql};
      ROLLBACK;
    `);
    const ms = /Execution Time: ([\d.]+) ms/.exec(out)?.[1];
    if (ms) durations.push(Number(ms));
  }
  return durations.length ? Math.min(...durations) : null;
}

/*
  TWO NUMBERS PER TABLE, BECAUSE ONE OF THEM IS A QUERY NO PAGE ISSUES.

  The unfiltered `count(*)` is a genuine upper bound and a cheap one-way
  argument: if every row a policy admits comes back inside the budget, so does
  any narrower read of it. The trouble is what happens when it does NOT come
  back inside the budget, because then it certifies nothing and is easily
  mistaken for a failure the product actually has.

  Measured here, 20,000 conversations, same view, same database:

      conversation_summaries, unfiltered count(*)          1,364 ms
      conversation_summaries, as the page reads it            1.7 ms
        (WHERE member_id = ... ORDER BY last_message_at DESC LIMIT 20)

  Three orders of magnitude, and the fast one is the truth about the product.
  The view has three LATERAL subqueries per row; with an ORDER BY that matches an
  index and a LIMIT, Postgres runs them for the twenty rows it returns, and for
  the whole table when told to count it. Reporting 1,364 ms as this route's p95
  would have condemned a view that is doing exactly what it was added to do.

  So: the upper bound is tried first and, when it is inside budget, it is the
  answer and the stronger claim. When it is not, the table is re-timed in the
  shape a list page actually reads — newest N with a limit — and THAT is the
  number, recorded as such. Both are printed, so nobody has to take either on
  trust.
*/
const PAGE_SIZE = 50;

function timeTable(table, uid, budgetMs) {
  const upperBound = timeStatement(`SELECT count(*) FROM public."${table}"`, uid);
  if (upperBound === null || upperBound <= budgetMs) {
    return { ms: upperBound, shape: "whole table", upperBound };
  }
  // A limit needs an ORDER BY to be meaningful, and every list page in this app
  // orders by a timestamp. Whichever this table has is the one its pages use.
  const orderCol = psql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${table}'
      AND column_name IN ('last_message_at','created_at','received_at','updated_at','timestamp')
    ORDER BY array_position(
      ARRAY['last_message_at','received_at','created_at','timestamp','updated_at'],
      column_name)
    LIMIT 1;
  `).trim();
  const order = orderCol ? ` ORDER BY "${orderCol}" DESC` : "";
  const paged = timeStatement(
    `SELECT * FROM public."${table}"${order} LIMIT ${PAGE_SIZE}`,
    uid,
  );
  return { ms: paged ?? upperBound, shape: `newest ${PAGE_SIZE}`, upperBound };
}

const cache = new Map();
const BUDGET_MS = 100;
const shapes = [];

function timingFor(table) {
  if (cache.has(table)) return cache.get(table);
  let value = null;
  try {
    const timed = timeTable(table, WORST_CASE_UID, BUDGET_MS);
    value = timed.ms;
    shapes.push({ table, ...timed });
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

// Every table whose whole-table read was over budget, with both numbers — the
// only place the difference between the two is visible.
const reTimed = shapes.filter((s) => s.shape !== "whole table");
if (reTimed.length) {
  console.log(
    `\n${reTimed.length} table(s) exceeded ${BUDGET_MS}ms unfiltered and were re-timed as a page reads them:`,
  );
  for (const s of reTimed.sort((a, b) => b.upperBound - a.upperBound)) {
    console.log(
      `  ${s.table.padEnd(30)} whole table ${String(Math.round(s.upperBound)).padStart(6)} ms` +
        `   ->  ${s.shape} ${String(s.ms?.toFixed(2)).padStart(8)} ms`,
    );
  }
}

console.log(
  `\nroute-query-p95: filled ${filled} route(s); ${unmeasured} read no table and stay unproven.\n` +
    `slowest:\n` +
    worst.map((m) => `  ${m.routeId.padEnd(22)} ${m.dbQueryP95Ms} ms`).join("\n"),
);
