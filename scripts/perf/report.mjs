#!/usr/bin/env -S node --experimental-strip-types
/**
 * RENDER THE SCORECARD. Joins the three sources of truth and prints the tables.
 *
 *   docs/perf/measurements.json   what the browser reported (npm run perf:measure)
 *   dist/.vite/manifest.json      what each route actually ships (npm run build)
 *   perf/budgets.json             what it was allowed to be
 *
 * The scoring itself is NOT reimplemented here — `scoreRoute` from
 * src/test/perf/scorecard.ts is imported and called, so the table, the vitest and
 * the CI gate can never disagree about whether a route passes.
 *
 * Usage:
 *   node scripts/perf/report.mjs                     # print to stdout
 *   node scripts/perf/report.mjs --out docs/perf/BASELINE.md --title "BEFORE"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const { ROUTES, CHECKS, scoreRoute, loadBudgets, allRoutesPerfect } = await import(
  new URL("../../src/test/perf/scorecard.ts", import.meta.url).href
);
const { measureRoute } = await import(new URL("./route-bundles.mjs", import.meta.url).href);

const MEASUREMENTS = path.join(REPO_ROOT, "docs/perf/measurements.json");
if (!fs.existsSync(MEASUREMENTS)) {
  console.error(
    `report: no measurements at docs/perf/measurements.json.\n` +
      `  Run \`npm run perf:measure\` first. This script reports; it never invents.`,
  );
  process.exit(2);
}

const measurements = JSON.parse(fs.readFileSync(MEASUREMENTS, "utf8"));
const byId = new Map(measurements.map((m) => [m.routeId, m]));
const budgets = loadBudgets();

/** Fill in the JS figure from the build manifest — the browser cannot see gzip. */
const rows = ROUTES.filter((r) => byId.has(r.id)).map((route) => {
  const m = { ...byId.get(route.id) };
  m.routeJsGzBytes = measureRoute(route.module).totalGzBytes;
  return { route, m, score: scoreRoute(route, m, budgets) };
});

const num = (v) => (Number.isFinite(v) ? Math.round(v) : "—");
const kb = (v) => (Number.isFinite(v) ? `${(v / 1024).toFixed(0)}` : "—");

let out = "";
const title = (() => {
  const i = process.argv.indexOf("--title");
  return i !== -1 ? process.argv[i + 1] : "Scorecard";
})();

out += `## ${title}\n\n`;
out += `Measured on the production build, ${rows.length} routes. `;
out += `Score is out of ${CHECKS.length} — one point per check, no partial credit.\n\n`;

out += `| Route | Score | LCP mob | LCP desk | Warm | Cold | JS gz | DB q | p95 | N+1 | CLS | Long task |\n`;
out += `|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const { route, m, score } of [...rows].sort((a, b) => a.score.score - b.score.score)) {
  out +=
    `| \`${route.id}\` | **${score.score}/10** | ${num(m.mobile.lcpMs)} | ${num(m.desktop.lcpMs)} ` +
    `| ${num(m.mobile.transitionWarmMs)} | ${num(m.mobile.transitionColdMs)} | ${kb(m.routeJsGzBytes)} ` +
    `| ${m.dbQueries} | ${m.dbQueryP95Ms === null ? "—" : num(m.dbQueryP95Ms)} ` +
    `| ${m.nPlusOneTables.length ? m.nPlusOneTables.join(" ") : "ok"} | ${m.mobile.cls.toFixed(3)} ` +
    `| ${num(m.mobile.longTasksMs.length ? Math.max(...m.mobile.longTasksMs) : 0)} |\n`;
}
out += `\nUnits: ms except JS (KB gz). \`—\` is unmeasured, which scores as a fail.\n\n`;

out += `### Weight and requests (cold load, reported not scored)\n\n`;
out += `| Route | Mobile requests | Mobile bytes | Desktop requests | Desktop bytes |\n|---|---|---|---|---|\n`;
for (const { route, m } of rows) {
  out +=
    `| \`${route.id}\` | ${m.mobile.requestCount} | ${(m.mobile.totalBytes / 1024).toFixed(0)} KB ` +
    `| ${m.desktop.requestCount} | ${(m.desktop.totalBytes / 1024).toFixed(0)} KB |\n`;
}

out += `\n### Failing checks, by how many routes fail them\n\n`;
const tally = new Map(CHECKS.map((c) => [c, 0]));
for (const { score } of rows) {
  for (const check of score.checks) if (!check.passed) tally.set(check.name, tally.get(check.name) + 1);
}
out += `| Check | Routes failing |\n|---|---|\n`;
for (const [name, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  out += `| ${name} | ${count} / ${rows.length} |\n`;
}

const perfect = allRoutesPerfect(rows.map((r) => r.score));
out += `\n**Stop condition: ${perfect ? "MET — every route scores 10/10." : "NOT met."}**`;
if (!perfect) {
  const worst = [...rows].sort((a, b) => a.score.score - b.score.score).slice(0, 5);
  out += ` Worst routes: ${worst.map((r) => `\`${r.route.id}\` (${r.score.score}/10)`).join(", ")}.\n`;
} else {
  out += `\n`;
}

const outFlag = process.argv.indexOf("--out");
if (outFlag !== -1 && process.argv[outFlag + 1]) {
  const dest = path.resolve(REPO_ROOT, process.argv[outFlag + 1]);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`report: wrote ${path.relative(REPO_ROOT, dest)}`);
} else {
  console.log(out);
}
