#!/usr/bin/env node
/**
 * Builds WIRING_REGISTER.md from the derived inventory + the hand annotations,
 * scored by the rubric in score.mjs.
 *
 *   node scripts/wiring/build.mjs            # write the register
 *   node scripts/wiring/build.mjs --check    # fail if the committed file differs
 *
 * The register is generated rather than edited so it cannot disagree with the
 * code it describes: the CI gate regenerates it and diffs. Edit annotations.mjs
 * (the human columns) or the code (the wires), never the markdown.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ABSENT_ADMIN_EVENTS, FAMILIES } from "./annotations.mjs";
import { scoreRow, distribution } from "./score.mjs";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = resolve(HERE, "../..");
const OUT = join(REPO, "WIRING_REGISTER.md");

const inv = JSON.parse(
  execFileSync("node", [join(HERE, "inventory.mjs")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
);

// ── collapse call sites into one row per distinct wire ──────────────────────
const byWire = new Map();
for (const w of inv.wires) {
  const key = `${w.kind}:${w.target}`;
  if (!byWire.has(key)) byWire.set(key, { key, kind: w.kind, target: w.target, sites: [], routes: new Set(), tests: new Set(), verbs: new Set() });
  const r = byWire.get(key);
  // FILE, not file:line. Line numbers made the register churn on any edit above
  // a call site: main went red on `Wiring register` the day two unrelated PRs
  // merged, because one save handler had moved eleven lines. A gate that reddens
  // for a reason nobody can act on is a gate that gets switched off within a
  // week — the exact failure this repo has catalogued seven times. The register
  // now changes when the WIRING changes, and not otherwise.
  if (!r.sites.includes(w.file)) r.sites.push(w.file);
  for (const x of w.routes) r.routes.add(x);
  for (const t of w.tests) r.tests.add(t);
  r.verbs.add(w.verb);
  // A wire is only as visible as its LEAST visible call site: one silent
  // failure in eight is still a silent failure for whoever hits that one.
  r.failureVisible = r.failureVisible === undefined ? w.failureVisible : (r.failureVisible && w.failureVisible ? r.failureVisible : null);
}

// ── attach annotations ──────────────────────────────────────────────────────
const annotationFor = new Map();
for (const fam of FAMILIES) {
  for (const key of fam.wires) {
    if (annotationFor.has(key)) throw new Error(`wire ${key} is annotated twice`);
    annotationFor.set(key, fam);
  }
}

const rows = [];
const unannotated = [];
for (const r of [...byWire.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  const a = annotationFor.get(r.key);
  if (!a) { unannotated.push(r.key); continue; }
  const row = {
    ...r,
    control: a.control,
    promise: a.promise,
    dest: a.dest,
    told: a.told,
    reaches: a.reaches ?? true,
    dead: a.dead ?? false,
    proof: a.proof ?? null,
    note: a.note,
    routes: [...r.routes].sort(),
    tests: [...r.tests].sort(),
  };
  Object.assign(row, scoreRow(row));
  rows.push(row);
}

const stale = [...annotationFor.keys()].filter((k) => !byWire.has(k));

// A cited proof must EXIST. Without this check the register scores itself on
// tests that were named rather than written — which is precisely the failure it
// is meant to expose, committed one level up. Four of the first nine proofs
// named in this file were fictional and this is what caught them.
const missingProofs = [...new Set(rows.map((r) => r.proof).filter(Boolean))].filter((p) => {
  try { readFileSync(join(REPO, p)); return false; } catch { return true; }
});
if (missingProofs.length) {
  console.error(`✗ ${missingProofs.length} cited proof(s) do not exist:`);
  for (const p of missingProofs) console.error(`    - ${p}`);
  console.error("\n  A score above 6 requires a proof that exists and was read. Write it, or");
  console.error("  set proof: null and let the row score what it actually earns.");
  process.exit(1);
}

if (unannotated.length || stale.length) {
  if (unannotated.length) {
    console.error(`✗ ${unannotated.length} wire(s) in the code carry no register annotation:`);
    for (const k of unannotated) console.error(`    - ${k}  (${[...byWire.get(k).sites].slice(0, 2).join(", ")})`);
    console.error("\n  Every control needs a row. Add it to scripts/wiring/annotations.mjs:");
    console.error("  what it promises, where it goes, who is told, and its proof.");
  }
  if (stale.length) {
    console.error(`\n✗ ${stale.length} annotated wire(s) no longer exist in the code:`);
    for (const k of stale) console.error(`    - ${k}`);
  }
  process.exit(1);
}

// ── verify the ABSENCE claims (item 3) ──────────────────────────────────────
//
// Every row in ABSENT_ADMIN_EVENTS says "this event tells nobody". A claim like that goes stale
// the moment somebody wires it — and a register that still says "nobody is told" about a fixed
// wire is worse than no register, because it sends the next reader to fix something twice. So
// each row carries a check and this fails the build when the check no longer holds.
//
// Comments are stripped first. Half of these claims are about a string that the code DISCUSSES
// at length ("nothing invokes ai-dispatch-events" is written in isabella-gate's own header), and
// this repo has now caught nine assertions matching prose instead of code.

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*(\/\/|--).*$/gm, "");

/** Every scannable file under a path, as [relativePath, sourceWithoutComments]. */
function* filesUnder(rel) {
  const abs = join(REPO, rel);
  let st;
  try { st = statSync(abs); } catch { return; }
  if (st.isFile()) {
    yield [rel, stripComments(readFileSync(abs, "utf8"))];
    return;
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    yield* filesUnder(join(rel, entry.name));
  }
}

const SCANNABLE = /\.(ts|tsx|js|mjs|jsx|sql|yml|yaml)$/;

// TESTS ARE NOT WIRING. `src/test/absentAdminEvents.test.ts` plants the string
// "ai-dispatch-events" on purpose, to prove A1's check bites — and without this exclusion that
// probe made A1 report itself as fixed. A test naming a function is not a caller of it, and a
// test asserting an absence is the opposite of wiring one up.
const NOT_WIRING = ["src/test/", "e2e/", "scripts/wiring/"];

/** Files matching a claim's scan, minus its exclusions. */
function claimFiles(claim) {
  const out = [];
  for (const rel of claim.scan) {
    for (const [file, src] of filesUnder(rel)) {
      if (!SCANNABLE.test(file)) continue;
      if (NOT_WIRING.some((ex) => file.startsWith(ex))) continue;
      if ((claim.exclude ?? []).some((ex) => file.startsWith(ex))) continue;
      out.push([file, src]);
    }
  }
  return out;
}

const brokenClaims = [];
for (const row of ABSENT_ADMIN_EVENTS) {
  const claim = row.absence;
  const hits = [];

  if (claim.kind === "absentEverywhere") {
    const re = new RegExp(claim.pattern, "g");
    for (const [file, src] of claimFiles(claim)) if (re.test(src)) hits.push(file);
  } else if (claim.kind === "absentPair") {
    const reA = new RegExp(claim.a, "g");
    const reB = new RegExp(claim.b);
    for (const [file, src] of claimFiles(claim)) {
      let m;
      reA.lastIndex = 0;
      while ((m = reA.exec(src)) !== null) {
        // Both directions: a notifier can sit before or after the event it reports on.
        const from = Math.max(0, m.index - claim.window);
        if (reB.test(src.slice(from, m.index + claim.window))) { hits.push(file); break; }
      }
    }
  } else {
    brokenClaims.push(`${row.id}: unknown absence check kind "${claim.kind}"`);
    continue;
  }

  if (hits.length) {
    brokenClaims.push(
      `${row.id} claims nobody is told about "${row.event}", but ${hits.length} file(s) say ` +
        `otherwise: ${hits.slice(0, 3).join(", ")}`,
    );
  }
}

if (brokenClaims.length) {
  console.error(`✗ ${brokenClaims.length} absence claim(s) in ABSENT_ADMIN_EVENTS no longer hold:`);
  for (const c of brokenClaims) console.error(`    - ${c}`);
  console.error("\n  If the wire now exists, give it a real register row in FAMILIES and delete");
  console.error("  the ABSENT_ADMIN_EVENTS entry. A register that still calls a fixed wire dead");
  console.error("  sends the next reader to fix it twice.");
  process.exit(1);
}

// ── render ──────────────────────────────────────────────────────────────────
const dist = distribution(rows);
const total = rows.length;
const sites = inv.wires.length;
const bar = (n) => "█".repeat(Math.round((n / Math.max(...dist)) * 34)) || "";

const SURFACES = [
  ["Public & marketing", (r) => r.routes.some((x) => ["/", "/contact", "/pricing", "/pendant", "/how-it-works", "/blog", "/help", "/terms", "/privacy"].includes(x))],
  ["Join & auth", (r) => r.routes.some((x) => ["/join", "/login", "/forgot-password", "/reset-password", "/complete-registration", "/staff/login", "/staff/invite", "/member-update", "/unauthorized"].includes(x))],
  ["Member dashboard", (r) => r.routes.some((x) => x.startsWith("/dashboard"))],
  ["Call centre", (r) => r.routes.some((x) => x.startsWith("/call-centre"))],
  ["Admin", (r) => r.routes.some((x) => x.startsWith("/admin"))],
  ["Partner", (r) => r.routes.some((x) => x.startsWith("/partner"))],
];

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const short = (list, n = 3) =>
  list.length <= n ? list.join(", ") : `${list.slice(0, n).join(", ")} +${list.length - n}`;

let md = "";
md += "# WIRING REGISTER\n\n";
md += "Every connection out of this application, where it actually goes, who finds out, and\n";
md += "whether anything would go red if it broke.\n\n";
md += "> Lee sent a message from the public Contact page and found nothing in Communications,\n";
md += "> Messages or notifications. It had gone to the `leads` table and nobody was told. This\n";
md += "> register exists so that is a known fact about every control on every page rather than\n";
md += "> something discovered one at a time.\n\n";
md += "**GENERATED FILE — do not edit.** `node scripts/wiring/build.mjs` rebuilds it from the\n";
md += "code plus `scripts/wiring/annotations.mjs`. CI regenerates and diffs, so the register in\n";
md += "main cannot drift from the code in main. To change a row, change the wire or the annotation.\n\n";

md += "## Score distribution\n\n";
md += "```\n";
for (let s = 10; s >= 0; s--) {
  md += `${String(s).padStart(2)} │ ${String(dist[s]).padStart(3)}  ${bar(dist[s])}\n`;
}
md += "```\n\n";
const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;
const band = (lo, hi) => dist.slice(lo, hi + 1).reduce((a, b) => a + b, 0);
md += `${total} distinct wires across ${sites} call sites and ${inv.routes.length} routes.\n\n`;
md += `| band | meaning | wires | share |\n|---|---|---:|---:|\n`;
md += `| 10 | fully wired — arrives, right person told on a live channel, failure shown, proof that goes red | ${dist[10]} | ${pct(dist[10])} |\n`;
md += `| 7–9 | arrives and proven; notification missing or on a channel not live today | ${band(7, 9)} | ${pct(band(7, 9))} |\n`;
md += `| 4–6 | arrives; nobody told; nothing proves it | ${band(4, 6)} | ${pct(band(4, 6))} |\n`;
md += `| 1–3 | fails, fails silently, or lands where nobody looks | ${band(1, 3)} | ${pct(band(1, 3))} |\n`;
md += `| 0 | dead control | ${dist[0]} | ${pct(dist[0])} |\n\n`;

md += "### How to read a low score\n\n";
md += "Most of this platform's wires **arrive**. What almost none of them have is a proof that\n";
md += "would go red if they stopped arriving, and that alone caps a row at 6 — deliberately, and\n";
md += "without rounding up. A screen full of buttons that all work today scores 5 because nothing\n";
md += "would tell anyone the day one of them stops. The rubric is applied by\n";
md += "`scripts/wiring/score.mjs`, not by judgement per row.\n\n";
md += "Two rules do the most work:\n\n";
md += "1. **No proof, no score above 6.** A test that names the table is not a proof; `proof`\n";
md += "   holds a test read and confirmed to exercise client → destination → visible.\n";
md += "2. **Only the bell counts as a channel live today.** `notification_log` is published to\n";
md += "   `supabase_realtime` and needs no secret, so it is provably live from the repo. Email,\n";
md += "   SMS and WhatsApp all return \"not configured\" without a production secret this repo\n";
md += "   cannot read — so they cap at 8 and appear in *Only Lee can verify* below.\n\n";

md += "## Method\n\n";
md += "Wires are **derived from the source**, not walked by hand — a hand-walked list misses the\n";
md += "control someone adds next week. Every exit from this app is one of five syntactic things,\n";
md += "and a control with no wire cannot do anything:\n\n";
md += "| kind | what it is | call sites |\n|---|---|---:|\n";
for (const k of ["table", "fn", "rpc", "channel", "link"]) {
  const n = inv.wires.filter((w) => w.kind === k).length;
  const what = {
    table: "`supabase.from(t).insert/update/upsert/delete` — a row written",
    fn: "`supabase.functions.invoke(f)` — an edge function",
    rpc: "`supabase.rpc(f)` — a SQL function",
    channel: "`postgres_changes` — a realtime subscription",
    link: "`mailto:` / `tel:` / `wa.me` — a hand-off off the platform",
  }[k];
  md += `| \`${k}\` | ${what} | ${n} |\n`;
}
md += "\nRoutes come from an import graph over `src/App.tsx`, so a wire in a shared hook is\n";
md += "attributed to every page that can reach it, and a wire in a **layout** (the notification\n";
md += "bell lives in the headers, not in any page) is attributed to every route in its group.\n\n";
md += "Three facts are checked against the real schema rather than by grep — the migration set is\n";
md += "applied to a throwaway PostgreSQL and queried:\n\n";
md += "- **realtime publication membership** — 28 tables are in `supabase_realtime`; a\n";
md += "  `postgres_changes` subscription on a table outside it is a **dead control**, and five were\n";
md += "  found this way;\n";
md += "- **RLS** — every table in `public` has row-level security enabled (golden rule 2 holds);\n";
md += "- **triggers** — **no** database function anywhere writes `notification_log`, which is why\n";
md += "  \"who is told\" is only ever true where client code or an edge function says so explicitly.\n\n";
md += "`failure shown` is derived too: a `toast.error`, an inline error, or a throw inside a\n";
md += "react-query mutation. A bare `console.error` does **not** count — that is the definition of\n";
md += "failing silently, and it is exactly what the contact form did.\n\n";

md += "## Admin-audience events that write nowhere\n\n";
md += "The register above answers *who is told* for every wire that EXISTS. It cannot answer it\n";
md += "for something that never happens — and that is the more dangerous half, because a\n";
md += "notification nobody wrote looks exactly like a notification nobody needed. The bell is\n";
md += "fine as a reader; what is missing is on the other side of it.\n\n";
md += "Each row below is a claim about an ABSENCE, and each carries a check that this generator\n";
md += "verifies — so the build FAILS if one of these has since been wired, naming the file. A\n";
md += "fixed item cannot sit here looking broken, and a broken item cannot be quietly dropped.\n\n";
md += "| # | event | who should be told | what happens today | owner |\n";
md += "|---|---|---|---|---|\n";
for (const r of ABSENT_ADMIN_EVENTS) {
  md += `| **${r.id}** | ${esc(r.event)} | ${esc(r.audience)} — ${esc(r.expectation)} | ${esc(r.today)} | ${esc(r.owner)} |\n`;
}
md += "\nThe checks, verified on every build:\n\n";
for (const r of ABSENT_ADMIN_EVENTS) {
  const a = r.absence;
  const how =
    a.kind === "absentEverywhere"
      ? `\`${a.pattern}\` appears nowhere in ${a.scan.join(", ")}`
      : `\`${a.a}\` and \`${a.b}\` never appear within ${a.window} characters of each other in the same file (${a.scan.join(", ")})`;
  md += `- **${r.id}** — ${how}. ${esc(a.why)}\n`;
}
md += "\n";

md += "## The register\n\n";
for (const [name, pred] of SURFACES) {
  const surface = rows.filter(pred).sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
  if (!surface.length) continue;
  md += `### ${name}\n\n`;
  md += "| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |\n";
  md += "|---:|---|---|---|---|---|---|---:|\n";
  for (const r of surface) {
    md += `| **${r.score}** | \`${r.key}\` | ${esc(r.control)} — ${esc(r.promise)} | ${esc(r.dest)} | ${esc(r.told)}${r.dead ? " · **DEAD**" : ""} | ${r.failureVisible ?? "—"} | ${r.proof ? `\`${r.proof}\`` : "none"} | ${r.sites.length} |\n`;
  }
  md += "\n";
}

md += "## Notes, worst first\n\n";
for (const r of [...rows].sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))) {
  md += `### \`${r.key}\` — ${r.score}/10 (${r.band})\n\n`;
  md += `- **control** ${r.control}\n`;
  md += `- **promised** ${r.promise}\n`;
  md += `- **goes to** ${r.dest}\n`;
  md += `- **who is told** ${r.told}${r.dead ? " — the wire cannot fire at all" : ""}\n`;
  md += `- **failure shown to user** ${r.failureVisible ?? "no"}\n`;
  md += `- **proof** ${r.proof ? `\`${r.proof}\`` : "none — capped at 6"}\n`;
  md += `- **routes** ${r.routes.length ? short(r.routes, 6) : "—"}\n`;
  md += `- **call sites** ${short(r.sites, 4)}\n`;
  // The "tests naming it" list is deliberately NOT written to the register. It
  // was only ever a candidate list — a test that mentions a table is not a proof
  // and this file says so — and it changed every time anyone added a test file,
  // reddening the gate for something that is not a wiring change. `proof` is the
  // column that carries a claim, and that one is hand-authored.
  md += `\n${r.note}\n\n`;
}

md += `---\n\nGenerated by \`scripts/wiring/build.mjs\`. Rubric in \`scripts/wiring/score.mjs\`.\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(OUT, "utf8"); } catch { /* absent */ }
  if (current !== md) {
    console.error("✗ WIRING_REGISTER.md is out of date with the code.");
    console.error("  Run: node scripts/wiring/build.mjs");
    console.error("  The register describes every control on every page; a wire added or removed");
    console.error("  without a register row is how the contact form went unnoticed.");
    process.exit(1);
  }
  console.log(`✓ WIRING_REGISTER.md matches the code — ${total} wires, ${sites} call sites`);
  process.exit(0);
}

writeFileSync(OUT, md);
console.log(`wrote WIRING_REGISTER.md — ${total} wires, ${sites} call sites, ${inv.routes.length} routes`);
console.log(`distribution 0→10: ${dist.join(" ")}`);
