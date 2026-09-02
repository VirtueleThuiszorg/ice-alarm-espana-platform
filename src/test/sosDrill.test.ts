/**
 * SOS drill tooling — safety contract tests.
 *
 * The drill exists so Lee can run LIVE end-to-end drills of the emergency path
 * (queue claim → SOS takeover → resolve) without any call/SMS/notification
 * leaving the building. These tests lock the properties that make it safe:
 *
 *  1. the drill alert is born at escalation_level_reached = 5 — the escalation
 *     runner's `for (level = current+1; level <= 5)` finds no next rung, so the
 *     ladder can never fire for it (verified against the runner source too)
 *  2. admin-only, clearly labelled, dedicated drill member, refuses a member
 *     with emergency contacts
 *  3. cleanup is scoped to the drill member's alerts only
 *  4. the function never touches Twilio or the notify functions
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDrillAlert, cleanupDrillAlerts } from "@/lib/sosDrill";

const fnSource = readFileSync(
  join(process.cwd(), "supabase/functions/sos-drill/index.ts"),
  "utf8",
);
const runnerSource = readFileSync(
  join(process.cwd(), "supabase/functions/sos-escalation-runner/index.ts"),
  "utf8",
);

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

describe("drill client wrapper", () => {
  it("create invokes sos-drill with action=create and surfaces the alert id", async () => {
    const { client, captured } = mockFunctionsClient({
      data: { created: true, alert_id: "drill-1" },
      error: null,
    });
    const res = await createDrillAlert(client);
    expect(captured.name).toBe("sos-drill");
    expect(captured.body).toEqual({ action: "create" });
    expect(res).toEqual({ ok: true, alertId: "drill-1" });
  });

  it("cleanup invokes sos-drill with action=cleanup and surfaces the count", async () => {
    const { client, captured } = mockFunctionsClient({
      data: { cleaned: true, alerts_deleted: 2 },
      error: null,
    });
    const res = await cleanupDrillAlerts(client);
    expect(captured.body).toEqual({ action: "cleanup" });
    expect(res).toEqual({ ok: true, alertsDeleted: 2 });
  });

  it("function-level errors (e.g. 403 non-admin) never read as success", async () => {
    const { client } = mockFunctionsClient({
      data: { error: "Admin role required for SOS drills" },
      error: null,
    });
    const res = await createDrillAlert(client);
    expect(res).toEqual({ ok: false, error: "Admin role required for SOS drills" });
  });
});

describe("drill edge function — safety contract (source)", () => {
  it("inserts the alert ladder-suppressed at escalation_level_reached: 5", () => {
    expect(fnSource).toMatch(/escalation_level_reached:\s*5/);
    // and it lands as a normal claimable incoming SOS
    expect(fnSource).toMatch(/alert_type:\s*"sos_button"/);
    expect(fnSource).toMatch(/status:\s*"incoming"/);
  });

  it("the runner's ladder proves level 5 has no next rung", () => {
    // The runner iterates level = currentLevel+1 .. 5; at 5 the loop body never
    // runs and nextLevel stays 0 → `continue` (no calls). Lock both halves.
    expect(runnerSource).toMatch(/for\s*\(let level = currentLevel \+ 1; level <= 5; level\+\+\)/);
    expect(runnerSource).toMatch(/if\s*\(nextLevel === 0 \|\| nextLevel <= currentLevel\)\s*continue;/);
  });

  it("is admin-gated server-side", () => {
    expect(fnSource).toMatch(/\["admin",\s*"super_admin"\]\.includes/);
    expect(fnSource).toContain("Admin role required for SOS drills");
  });

  it("uses the dedicated, clearly-labelled drill member and refuses one with contacts", () => {
    expect(fnSource).toContain("sos-drill@ice-alarm-espana.internal");
    expect(fnSource).toContain("SOS DRILL — not a real emergency");
    expect(fnSource).toMatch(/from\("emergency_contacts"\)/);
    expect(fnSource).toContain("refusing to create a drill alert");
  });

  it("cleanup deletes ONLY the drill member's alerts", () => {
    expect(fnSource).toMatch(/from\("alerts"\)\s*\.select\("id"\)\s*\.eq\("member_id", drillMemberId\)/);
    expect(fnSource).toMatch(/\.delete\(\)\.in\("alert_id", ids\)/);
    expect(fnSource).toMatch(/\.delete\(\)\.in\("id", ids\)/);
  });

  it("never touches Twilio or the notify/ingress functions (code, not comments)", () => {
    // Strip block + line comments so the safety-argument docs don't trip the scan.
    const codeOnly = fnSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "api.twilio.com",
      "loadTwilioCredentials",
      "notify-admin",
      "emergency-contact-notify",
      "partner-alert-notify",
      "ev07b",
    ]) {
      expect(codeOnly.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // ...and it performs no outbound HTTP at all:
    expect(codeOnly).not.toMatch(/\bfetch\(/);
  });
});
