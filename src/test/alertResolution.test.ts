/**
 * WP-B (STAGE_SOS_FIX.md) — single resolve path through sos-alert-resolve.
 *
 * Before WP-B the call-centre queue, admin alerts page and both device panels
 * resolved alerts with direct `status='resolved'` writes, bypassing the edge
 * function's SOS close-out (conference teardown, contact notification,
 * courtesy-call scheduling). These tests prove:
 *   1. the client wrapper calls the edge function with the exact contract
 *   2. NO client code writes status='resolved' directly any more (source scan)
 *   3. the edge function is the only invoke site's target and is
 *      alert-type-aware server-side (source contract, same idiom as the
 *      migration-parsing tests in sosEscalation.e2e.test.ts)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAlertViaFunction } from "@/lib/alertResolution";

// ── mock functions-client capturing the invoke ───────────────────────────────
function mockFunctionsClient(result: { data: unknown; error: unknown }) {
  const captured: { name?: string; body?: Record<string, unknown> } = {};
  const client = {
    functions: {
      invoke(name: string, opts?: { body?: Record<string, unknown> }) {
        captured.name = name;
        captured.body = opts?.body;
        return Promise.resolve(result);
      },
    },
  };
  return { client: client as never, captured };
}

describe("WP-B 1 — client wrapper contract", () => {
  it("invokes sos-alert-resolve with the full body mapping", async () => {
    const { client, captured } = mockFunctionsClient({ data: { resolved: true }, error: null });
    const res = await resolveAlertViaFunction(
      "alert-1",
      { notes: "handled", isFalseAlarm: true, resolutionType: "ambulance_dispatched" },
      client,
    );
    expect(res).toEqual({ ok: true });
    expect(captured.name).toBe("sos-alert-resolve");
    expect(captured.body).toEqual({
      alert_id: "alert-1",
      resolution_notes: "handled",
      is_false_alarm: true,
      resolution_type: "ambulance_dispatched",
    });
  });

  it("defaults: empty notes, not a false alarm", async () => {
    const { client, captured } = mockFunctionsClient({ data: { resolved: true }, error: null });
    await resolveAlertViaFunction("alert-2", {}, client);
    expect(captured.body).toMatchObject({
      alert_id: "alert-2",
      resolution_notes: "",
      is_false_alarm: false,
    });
  });

  it("propagates invoke errors as failures, never success", async () => {
    const { client } = mockFunctionsClient({ data: null, error: { message: "nope" } });
    const res = await resolveAlertViaFunction("alert-3", {}, client);
    expect(res).toEqual({ ok: false, error: "nope" });
  });

  it("propagates function-level error payloads (e.g. notes required for SOS)", async () => {
    const { client } = mockFunctionsClient({
      data: { error: "resolution_notes is required for SOS alerts" },
      error: null,
    });
    const res = await resolveAlertViaFunction("alert-4", {}, client);
    expect(res).toEqual({ ok: false, error: "resolution_notes is required for SOS alerts" });
  });
});

// ── source scans ──────────────────────────────────────────────────────────────
const SRC_DIR = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("WP-B 2 — no direct client resolves remain", () => {
  it("no .update() literally sets status:'resolved' anywhere in src", () => {
    // The admin edit dialog passes a DYNAMIC status (not caught here); its
    // resolved-transition is explicitly routed through the resolve function in
    // AlertsPage.handleSaveEdit — this scan locks out literal direct resolves.
    const directResolve = /\.update\(\s*\{[^)]{0,400}?status:\s*["']resolved["']/s;
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file.includes("/test/")) continue;
      const src = readFileSync(file, "utf8");
      if (directResolve.test(src)) offenders.push(file.replace(SRC_DIR, "src"));
    }
    expect(
      offenders,
      `Direct status='resolved' writes found — WP-B unification regressed: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("sos-alert-resolve is invoked ONLY via src/lib/alertResolution.ts", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file.includes("lib/alertResolution.ts")) continue;
      if (file.includes("/test/")) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes('invoke("sos-alert-resolve"')) offenders.push(file.replace(SRC_DIR, "src"));
    }
    expect(offenders, `Rogue sos-alert-resolve invoke sites: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("WP-B 3 — edge function is alert-type-aware (source contract)", () => {
  const fnSource = readFileSync(
    join(process.cwd(), "supabase/functions/sos-alert-resolve/index.ts"),
    "utf8",
  );

  it("fetches the alert and derives isSos from the shared SOS type list", () => {
    expect(fnSource).toMatch(/SOS_TYPES\s*=\s*\[\s*"sos_button",\s*"fall_detected"\s*\]/);
    expect(fnSource).toMatch(/isSos\s*=\s*SOS_TYPES\.includes\(alertRow\.alert_type\)/);
    expect(fnSource).toContain('.select("id, alert_type, member_id")');
  });

  it("requires resolution notes for SOS alerts only", () => {
    expect(fnSource).toMatch(/if\s*\(isSos\s*&&\s*!resolution_notes\)/);
    expect(fnSource).toContain("resolution_notes is required for SOS alerts");
  });

  it("gates SOS-only side effects (Isabella log, contact SMS, courtesy calls)", () => {
    // Isabella note gated on isSos
    expect(fnSource).toMatch(/if\s*\(isSos\)\s*\{\s*await sbAdmin\.from\("isabella_assessment_notes"\)/);
    // contact notification + courtesy scheduling both gated on isSos && !is_false_alarm
    const gates = fnSource.match(/isSos\s*&&\s*!is_false_alarm/g) || [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });

  it("conference teardown stays graceful when no conference exists", () => {
    expect(fnSource).toMatch(/\.eq\("alert_id", alert_id\)\s*\.eq\("status", "active"\)\s*\.maybeSingle\(\)/);
    expect(fnSource).toMatch(/if\s*\(conference\)/);
  });
});
