// @vitest-environment node
//
// A FUNCTION AN EDGE FUNCTION CALLS MUST BE ONE THE SERVICE ROLE MAY EXECUTE.
//
// THE DEFECT THIS EXISTS FOR, found on 2026-09-11 by reviewing work that had already merged:
// `20260911130000` created `start_legacy_switch()` SECURITY DEFINER, revoked it from PUBLIC and
// from `authenticated` — right in intent, since a member must not be able to take themselves out
// of the Santander collection — and granted it to nobody.
//
// PostgREST runs an edge function's request as `service_role`, and in Postgres EXECUTE is an
// ordinary privilege: once revoked from PUBLIC, only the owner has it. So every "Move to Stripe
// billing" press hit permission denied. The feature was inert from the day it shipped.
//
// `create_payment_link_order` in `20260909110000` gets it right — REVOKE from PUBLIC, anon and
// authenticated, then GRANT EXECUTE TO service_role — so the convention existed and was simply
// not followed. This test is that convention, enforced.
//
// IT IS STATIC, AND THAT IS A LIMIT WORTH NAMING. It reads the migration text, so it catches a
// missing grant and not, say, a grant to a role that does not exist. The executable half lives in
// `scripts/rls/isolation.sql`, which now calls both billing functions AS `service_role` through
// `pg_temp.raises_as_role` — because the harness runs as the database owner, who can execute
// anything, and every positive assertion written without that helper passes for the wrong reason.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");

function everyTsFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) everyTsFile(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Every SQL function name an edge function calls through PostgREST. */
const rpcNames = (() => {
  const names = new Set<string>();
  for (const file of everyTsFile(join(ROOT, "supabase/functions"))) {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    for (const m of source.matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/g)) names.add(m[1]);
  }
  return [...names].sort();
})();

const MIGRATION_SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  // Comments out: these migrations quote their own REVOKE/GRANT lines in rollback notes, and a
  // rollback note is not a grant.
  .map((sql) => sql.replace(/^\s*--.*$/gm, ""))
  .join("\n");

/** Is this function's default PUBLIC grant taken away anywhere? */
const revokedFromPublic = (fn: string) =>
  new RegExp(`REVOKE\\s+[\\s\\S]{0,40}ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)[^;]*FROM[^;]*PUBLIC`, "i")
    .test(MIGRATION_SQL);

/** …and given back to the one role an edge function runs as? */
const grantedToServiceRole = (fn: string) =>
  new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)[^;]*TO[^;]*service_role`, "i")
    .test(MIGRATION_SQL);

describe("every RPC an edge function calls", () => {
  it("finds the call sites at all — otherwise this whole file passes on nothing", () => {
    expect(rpcNames.length).toBeGreaterThan(3);
  });

  it("finds the migrations at all", () => {
    expect(MIGRATION_SQL.length).toBeGreaterThan(10_000);
  });

  /*
    THE RULE. A function locked down to its owner, called by a service-role client, is not
    hardened — it is broken, and it is broken silently: the edge function gets "permission
    denied" and whatever it does with that is what the user sees. In the case that produced this
    test the answer was a refusal to hand out the payment link, which was safe and completely
    invisible.
  */
  it("is executable by the role PostgREST actually runs it as", () => {
    const broken = rpcNames.filter((fn) => revokedFromPublic(fn) && !grantedToServiceRole(fn));
    expect(
      broken,
      `revoked from PUBLIC with no GRANT EXECUTE … TO service_role: ${broken.join(", ")}`,
    ).toEqual([]);
  });

  // The other half of the same rule: a lockdown that forgot to lock anything down.
  it("and the ones that stay open to a browser are deliberate, not accidental", () => {
    // Every RPC either restricts itself (revoked from PUBLIC) or is reachable by `authenticated`
    // on purpose. This asserts the SET, so a new RPC joining either side is a decision somebody
    // made rather than a default nobody noticed.
    const restricted = rpcNames.filter(revokedFromPublic);
    expect(restricted).toContain("create_payment_link_order");
    expect(restricted).toContain("start_legacy_switch");
    expect(restricted).toContain("expire_legacy_switches");
  });
});

describe("the executable half, which a source scan cannot reach", () => {
  it("the isolation harness calls the billing functions as service_role", () => {
    const iso = readFileSync(join(ROOT, "scripts/rls/isolation.sql"), "utf8");
    expect(iso).toContain("pg_temp.raises_as_role");
    expect(iso).toContain("the SERVICE ROLE can start a switch");
    expect(iso).toContain("the SERVICE ROLE can run the expiry sweep");
  });

  // The helper exists because `exec_as`/`raises_as` both SET LOCAL ROLE authenticated, which is
  // right for a browser and wrong for the one caller that is not one.
  it("and that helper sets a named database role, not a JWT claim", () => {
    const iso = readFileSync(join(ROOT, "scripts/rls/isolation.sql"), "utf8");
    const helper = iso.slice(iso.indexOf("FUNCTION pg_temp.raises_as_role"));
    expect(helper.slice(0, 400)).toMatch(/SET LOCAL ROLE %I/);
  });
});
