#!/usr/bin/env node
/**
 * WIRE INVENTORY — the machine half of WIRING_REGISTER.md.
 *
 * Lee sent a message from the public Contact page and it landed in `leads` with
 * nobody told. The register exists so that is knowable for every control on
 * every page instead of being discovered one at a time; this script exists so
 * the register cannot quietly fall behind the code.
 *
 * WHY DERIVE THE INVENTORY INSTEAD OF WRITING IT BY HAND: a hand-walked list of
 * buttons misses the button someone adds next week. Every wire out of this app
 * is one of eight syntactic things, and all eight are greppable:
 *
 *   table   supabase.from('t').insert/update/upsert/delete
 *   fn      supabase.functions.invoke('f')
 *   rpc     supabase.rpc('f')
 *   channel supabase.channel(…).on('postgres_changes', { table: 't' })
 *   auth    supabase.auth.signInWithPassword / signOut / resetPasswordForEmail / …
 *   storage supabase.storage.from('b').upload / remove / …
 *   link    href={`mailto:…`} / tel: / wa.me
 *   open    window.open(…) / window.location.href = …
 *
 * A control with no wire cannot do anything, so a complete wire list bounds the
 * set of controls that can. The register's own rows carry the human half — what
 * the user is promised, who is told, what failure looks like — which no grep
 * can know.
 *
 * THAT CLAIM WAS FALSE FOR THE FIRST THREE KINDS ABOVE. The original scanner
 * looked for table/fn/rpc/channel/link only, and this header nonetheless claimed
 * completeness. `auth`, `storage` and `open` were missing, and the gap was not
 * marginal: sign in, sign out, register and password reset are none of the five,
 * so /login, /staff/login, /partner/login, /forgot-password and /reset-password
 * carried no wire of their own on a register whose brief named the login and
 * reset flows explicitly. Adding them also surfaced a dead page (Register.tsx,
 * unreachable, holding the only self-service signUp) and put the
 * password-reset EMAIL on the register, which is the highest-stakes channel
 * question in the product.
 *
 * STILL NOT ENUMERATED, deliberately: internal navigation — `navigate('/x')`
 * and `<Link to>`. There are hundreds, one per button, and a broken internal
 * link fails visibly (NotFound, or /unauthorized behind a guard) rather than
 * silently, which is the failure this register is built to catch. Enumerating
 * them would triple the file to record something a click already tells you.
 *
 * ROUTE ATTRIBUTION is by import graph, not by directory: `useMemberAction` sits
 * in src/hooks and its wire belongs to every page that reaches it. Pages are
 * resolved from src/pages/**; a wire in a shared module is attributed to every
 * page that transitively imports it, because that is where a user can press it.
 *
 * Output: JSON on stdout. `--check` compares against WIRING_REGISTER.md and
 * exits non-zero when a wire exists in code that the register does not carry
 * (or the register carries one the code no longer has).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const SRC = join(REPO, "src");

/** Every .ts/.tsx under src/, excluding tests and generated type files. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "test" || name === "__tests__") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC).sort();
const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const rel = (f) => relative(REPO, f);

// ── import graph ────────────────────────────────────────────────────────────
/** Resolve an import specifier to a file under src/, or null. */
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (text.has(cand)) return cand;
  }
  return null;
}

const APP = join(SRC, "App.tsx");

/**
 * Import edges. Static (`from "…"`) and dynamic (`import("…")`) are kept apart
 * because App.tsx needs only the static ones.
 *
 * WHY THAT MATTERS — this is the bug that made the routes column worthless.
 * App.tsx was treated as a page reaching every route, so that a wire mounted
 * app-wide (the PageTracker's `website_events`) was not orphaned. But App.tsx
 * *dynamically* imports every page, so reachability from App.tsx is
 * reachability from anywhere: 169 of 171 wires came back claiming all 108
 * routes, and `table:leads` claimed `/dashboard/medical`. The per-surface
 * tables were then just the same list six times.
 *
 * App.tsx's own edges are therefore its STATIC imports only — PageTracker, the
 * cookie banner, the layouts, the auth provider: exactly the things mounted on
 * every route — and never the lazy page imports.
 */
const imports = new Map(); // file -> Set<file>
for (const f of files) {
  const set = new Set();
  const src = text.get(f);
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const r = resolveImport(m[1], f);
    if (r) set.add(r);
  }
  if (f !== APP) {
    for (const m of src.matchAll(/import\(\s*["']([^"']+)["']/g)) {
      const r = resolveImport(m[1], f);
      if (r) set.add(r);
    }
  }
  imports.set(f, set);
}

/** Pages are the route endpoints named in App.tsx's lazy imports plus layouts. */
const appTsx = text.get(APP) ?? "";
const routeOf = new Map(); // page file -> route path(s)
{
  // const Name = lazyWithRetry(() => import("./pages/x/Y"));
  const compFile = new Map();
  for (const m of appTsx.matchAll(/const (\w+) = lazyWithRetry\(\(\) => import\("([^"]+)"\)\)/g)) {
    const r = resolveImport(m[2], APP);
    if (r) compFile.set(m[1], r);
  }
  for (const m of appTsx.matchAll(/import \{ (\w+) \} from "@\/components\/layout\/(\w+)"/g)) {
    const r = resolveImport(`@/components/layout/${m[2]}`, APP);
    if (r) compFile.set(m[1], r);
  }
  // Tag-ordered walk with a path stack, so a nested route inherits its parent's
  // prefix. Line-based matching does not work here: `<Route path="/admin"` puts
  // its `element={…}` on the following lines, and a child `path="members"` is
  // only `/admin/members` because of the enclosing tag. Whitespace is collapsed
  // first so one tag is one token regardless of how it was formatted.
  const flat = appTsx.replace(/\s+/g, " ");
  const stack = [""];
  const layoutGroups = [];

  // Tags are scanned with a brace counter rather than a regex. A group's element
  // is nested JSX — `element={<ProtectedRoute …><AdminLayout /></ProtectedRoute>}`
  // — so `[^>]*?>` ends the tag on the guard's own `>` and the layout inside is
  // never seen. The tag ends at the first `>` outside any `{}`.
  const tags = [];
  for (let i = 0; i < flat.length; i++) {
    if (flat.startsWith("</Route>", i)) {
      tags.push({ raw: "</Route>", close: true });
      i += 7;
      continue;
    }
    if (!flat.startsWith("<Route", i) || /\w/.test(flat[i + 6] ?? "")) continue;
    let depth = 0;
    let j = i;
    for (; j < flat.length; j++) {
      const c = flat[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const raw = flat.slice(i, j + 1);
    tags.push({ raw, close: false, selfClosing: /\/>$/.test(raw) });
    i = j;
  }
  const join2 = (prefix, seg) =>
    seg.startsWith("/") ? seg : `${prefix.replace(/\/$/, "")}/${seg}`;
  for (const tag of tags) {
    const raw = tag.raw;
    if (tag.close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = tag.selfClosing;
    const pathAttr = raw.match(/\bpath="([^"]*)"/);
    const isIndex = /\bindex\b/.test(raw);
    const el = raw.match(/element=\{ ?<(\w+)/);
    const prefix = stack[stack.length - 1];
    const full = pathAttr ? join2(prefix, pathAttr[1]) : prefix;

    if (el) {
      const f = compFile.get(el[1]);
      if (f && (pathAttr || isIndex)) {
        if (!routeOf.has(f)) routeOf.set(f, []);
        routeOf.get(f).push(full || "/");
      }
    }
    // A LAYOUT is the element of a route *group*, and its wires are reachable
    // from every route inside it — the notification bell lives in AdminHeader
    // and CallCentreHeader, not in any page, so attributing it by the import
    // graph alone credited it to /admin and missed /call-centre entirely.
    //
    // EVERY component named in the element is considered, not just the first:
    // the group element is `element={<ProtectedRoute …><AdminLayout /></…>}`, so
    // matching one name finds the guard and never the layout that carries the bell.
    if (!selfClosing) {
      for (const c of raw.matchAll(/<(\w+)/g)) {
        const lf = compFile.get(c[1]);
        if (lf) layoutGroups.push({ file: lf, prefix: full });
      }
    }
    if (!selfClosing) stack.push(full);
  }
  // Expand each layout to every route beneath its group.
  const allRoutes = [...new Set([...routeOf.values()].flat())];
  for (const { file, prefix } of layoutGroups) {
    const under = allRoutes.filter((r) => r === prefix || r.startsWith(`${prefix}/`) || prefix === "");
    if (!under.length) continue;
    if (!routeOf.has(file)) routeOf.set(file, []);
    routeOf.get(file).push(...under);
  }
  for (const [f, rs] of routeOf) routeOf.set(f, [...new Set(rs)]);
}

// App.tsx is not a page but it mounts things that are on every route — the
// PageTracker's `website_events` writes and the cookie banner among them. Left
// out, those wires came back attributed to no route at all.
//
// Its edges exclude anything the route walk has already placed: App.tsx
// statically imports the four LAYOUTS, and following those made the
// notification bell — which lives in the headers of the authenticated layouts
// — come back attributed to all 108 routes including `/contact`. A layout
// belongs to its group, and layoutGroups above says which.
{
  const placed = new Set(routeOf.keys());
  const appEdges = new Set([...(imports.get(APP) ?? [])].filter((f) => !placed.has(f)));
  imports.set(APP, appEdges);
  routeOf.set(APP, [...new Set([...routeOf.values()].flat())]);
}

const pages = [...routeOf.keys()];

/** Which pages transitively reach this file. */
const reachCache = new Map();
function pagesReaching(target) {
  if (reachCache.has(target)) return reachCache.get(target);
  const hit = [];
  for (const p of pages) {
    const seen = new Set([p]);
    const q = [p];
    let found = false;
    while (q.length) {
      const cur = q.pop();
      if (cur === target) { found = true; break; }
      for (const d of imports.get(cur) ?? []) if (!seen.has(d)) { seen.add(d); q.push(d); }
    }
    if (found) hit.push(p);
  }
  const routes = [...new Set(hit.flatMap((p) => routeOf.get(p) ?? []))].sort();
  reachCache.set(target, routes);
  return routes;
}

// ── wire extraction ─────────────────────────────────────────────────────────
const wires = [];
const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/**
 * Comments are blanked before scanning, with the line count preserved so
 * reported line numbers still point at real code. `functionError.ts` documents
 * its own use with `invoke("x", { body })` in a doc comment, and a scanner that
 * reads comments turns that into a wire called `x` that the register would then
 * be required to carry — a phantom control on 90 routes.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? " ".repeat(l.length) : l))
    .join("\n");
}

for (const f of files) {
  const src = stripComments(text.get(f));
  const push = (kind, target, verb, index, extra = {}) =>
    wires.push({ kind, target, verb, file: rel(f), line: lineOf(src, index), ...extra });

  for (const m of src.matchAll(/from\(["'](\w+)["']\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/g))
    push("table", m[1], m[2], m.index);
  for (const m of src.matchAll(/functions\.invoke\(\s*["']([\w-]+)["']/g))
    push("fn", m[1], "invoke", m.index);
  for (const m of src.matchAll(/\.rpc\(\s*["'](\w+)["']/g))
    push("rpc", m[1], "call", m.index);
  // Normalised to the destination kind, not the literal: `wa.me/` and
  // `https://wa.me` are one wire (a WhatsApp hand-off), not two.
  for (const m of src.matchAll(/mailto:|tel:|wa\.me/g))
    push("link", m[0].replace(/[/:]+$/, ""), "open", m.index);
  for (const m of src.matchAll(/postgres_changes["'][\s\S]{0,200}?table:\s*["'](\w+)["']/g))
    push("channel", m[1], "subscribe", m.index);

  // ── three classes this scanner originally missed entirely ────────────────
  //
  // The header used to claim that a complete wire list bounds the set of
  // controls that can do anything. That was FALSE while these were absent, and
  // the omission was not marginal: the whole authentication surface — sign in,
  // sign out, register, request a password reset, set a new password — is none
  // of table/fn/rpc/channel/link, so /login, /staff/login, /partner/login,
  // /forgot-password and /reset-password carried no wire of their own at all,
  // on a register whose brief was to walk the login and reset flows.
  //
  // auth     — GoTrue. `resetPasswordForEmail` is a channel question ("does
  //            the email arrive?") of exactly the kind this register exists to
  //            ask, and it was not being asked.
  // storage  — a file put somewhere, which can silently go nowhere.
  // open     — window.open / window.location, the platform being left. A
  //            `tel:` in an href was counted while the same number handed to
  //            window.location.href was not.
  for (const m of src.matchAll(/\bauth\.(signInWithPassword|signInWithOtp|signUp|signOut|resetPasswordForEmail|updateUser|verifyOtp|exchangeCodeForSession|setSession|refreshSession)\b/g))
    push("auth", m[1], "call", m.index);
  for (const m of src.matchAll(/storage\s*\.\s*from\(\s*["']([\w-]+)["']\s*\)[\s\S]{0,200}?\.(upload|remove|move|copy|createSignedUrl)\(/g))
    push("storage", m[1], m[2], m.index);
  for (const m of src.matchAll(/window\.open\(|window\.location\.(?:href\s*=|assign\(|replace\()/g))
    push("open", "window", "navigate", m.index);
}

// ── derived: does the user see it fail? ─────────────────────────────────────
/**
 * A wire whose failure is invisible is worse than one that is missing, so this
 * is derived from the code rather than asserted in the register. The window is
 * the 30 lines after the call — a toast, a thrown error inside a react-query
 * mutation (which has an onError), or a setError that renders.
 *
 * `console.error` alone does NOT count: that is the definition of failing
 * silently, and it is what the contact form did with a lead nobody received.
 */
function failureVisible(src, line) {
  const lines = src.split("\n");
  const window = lines.slice(Math.max(0, line - 3), line + 30).join("\n");
  if (/toast\.error\(|toast\(\{[^}]*destructive/.test(window)) return "toast";
  if (/setError\(|setSubmitError\(/.test(window)) return "inline";
  if (/\bthrow\b/.test(window) && /useMutation|mutationFn/.test(src)) return "mutation onError";
  return null;
}

// ── derived: is there a test that names this wire? ──────────────────────────
const testFiles = [];
for (const dir of [join(SRC, "test"), join(REPO, "e2e"), join(REPO, "tests")]) {
  try {
    walkAny(dir, testFiles);
  } catch { /* absent */ }
}
function walkAny(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAny(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
}
const testText = new Map(testFiles.map((f) => [f, readFileSync(f, "utf8")]));

function testsNaming(target) {
  const needle = new RegExp(`["'\`]${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
  return testFiles.filter((f) => needle.test(testText.get(f))).map(rel);
}

for (const w of wires) {
  w.routes = pagesReaching(join(REPO, w.file));
  w.failureVisible = failureVisible(text.get(join(REPO, w.file)), w.line);
  w.tests = testsNaming(w.target);
}

const out = {
  generated: wires.length,
  files: files.length,
  routes: [...new Set([...routeOf.values()].flat())].sort(),
  wires: wires.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
};

// ── --channels: the tables src/ subscribes to, for the realtime contract ───
//
// Emitted for `scripts/rls/realtime.sql`, which checks each against the real
// `pg_publication_tables`. Deriving the list here rather than writing it into
// the SQL means a subscription added tomorrow is checked tomorrow — the five
// dead subscriptions this found had been dead since the day they were written.
// Emitted as SQL, not as a plain list: psql's `\copy` does not interpolate
// psql variables, so passing the list as a filename silently produced an empty
// table and a contract that "passed" over nothing.
if (process.argv.includes("--channels")) {
  const tables = [...new Set(wires.filter((w) => w.kind === "channel").map((w) => w.target))].sort();
  if (!tables.length) {
    console.error("refusing to emit an empty subscription list — the scan found no channels");
    process.exit(2);
  }
  console.log("-- generated by scripts/wiring/inventory.mjs --channels; do not edit");
  console.log("CREATE TEMP TABLE wiring_subscribed (tbl text);");
  console.log(
    `INSERT INTO wiring_subscribed (tbl) VALUES\n${tables.map((t) => `  ('${t}')`).join(",\n")};`,
  );
  process.exit(0);
}

// ── --check: the register must carry every wire in the code ────────────────
if (process.argv.includes("--check")) {
  const reg = readFileSync(join(REPO, "WIRING_REGISTER.md"), "utf8");
  const key = (w) => `${w.kind}:${w.target}`;
  const inCode = new Set(wires.map(key));
  // The register names each wire as `kind:target` inside a backticked cell.
  const inReg = new Set([...reg.matchAll(/`(table|fn|rpc|link|channel):([\w.-]+)`/g)].map((m) => `${m[1]}:${m[2]}`));
  const missing = [...inCode].filter((k) => !inReg.has(k)).sort();
  const stale = [...inReg].filter((k) => !inCode.has(k)).sort();
  if (missing.length || stale.length) {
    console.error("✗ WIRING REGISTER DRIFT — the register no longer matches the code.\n");
    if (missing.length) {
      console.error(`  ${missing.length} wire(s) in code but NOT in WIRING_REGISTER.md:`);
      for (const k of missing) {
        const w = wires.find((x) => key(x) === k);
        console.error(`    - ${k}  (${w.file}:${w.line})`);
      }
    }
    if (stale.length) {
      console.error(`\n  ${stale.length} wire(s) in the register but NOT in code:`);
      for (const k of stale) console.error(`    - ${k}`);
    }
    console.error("\n  A new control needs a register row: what it promises, where it goes,");
    console.error("  who is told, what failure shows, and its proof. Add it, then re-run.");
    process.exit(1);
  }
  console.log(`✓ wiring register matches code — ${inCode.size} distinct wires, ${wires.length} call sites`);
  process.exit(0);
}

console.log(JSON.stringify(out, null, 2));
