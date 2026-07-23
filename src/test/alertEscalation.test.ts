/**
 * WP-C (STAGE_SOS_FIX.md) — real manual escalation, truthful notification claim.
 *
 * Before WP-C, escalating was a bare status write + a FALSE "Admin has been
 * notified" toast (no alert_escalations row, nothing sent). These tests prove:
 *   1. the client wrapper's contract, and that "notified" can only be true
 *      when the function confirmed a send
 *   2. NO client code writes status='escalated' directly any more (source scan);
 *      sos-alert-escalate is invoked only via the lib
 *   3. the edge function's safety contract: audit row (level-1 +
 *      call_placed=true — the slot the runner's tier-check provably treats as
 *      harmless), escalated_by recorded, notified derived from notify-admin's
 *      per-admin results, and the manual event registered in notify-admin
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { escalateAlertViaFunction } from "@/lib/alertEscalation";

const escalateFnSource = readFileSync(
  join(process.cwd(), "supabase/functions/sos-alert-escalate/index.ts"),
  "utf8",
);
const notifyAdminSource = readFileSync(
  join(process.cwd(), "supabase/functions/notify-admin/index.ts"),
  "utf8",
);
const runnerSource = readFileSync(
  join(process.cwd(), "supabase/functions/sos-escalation-runner/index.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  join(process.cwd(), "supabase/migrations/20260723150000_manual_escalation_audit.sql"),
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

describe("WP-C 1 — client wrapper: notified is never invented", () => {
  it("passes the alert id and surfaces confirmed notification counts", async () => {
    const { client, captured } = mockFunctionsClient({
      data: { escalated: true, notified: true, notified_count: 2 },
      error: null,
    });
    const res = await escalateAlertViaFunction("alert-1", client);
    expect(captured.name).toBe("sos-alert-escalate");
    expect(captured.body).toEqual({ alert_id: "alert-1" });
    expect(res).toEqual({ ok: true, notified: true, notifiedCount: 2 });
  });

  it("escalated-but-not-notified comes back notified:false (the honest case)", async () => {
    const { client } = mockFunctionsClient({
      data: { escalated: true, notified: false, notified_count: 0 },
      error: null,
    });
    const res = await escalateAlertViaFunction("alert-2", client);
    expect(res).toEqual({ ok: true, notified: false, notifiedCount: 0 });
  });

  it("a missing notified field is treated as NOT notified, never as success", async () => {
    const { client } = mockFunctionsClient({ data: { escalated: true }, error: null });
    const res = await escalateAlertViaFunction("alert-3", client);
    expect(res).toEqual({ ok: true, notified: false, notifiedCount: 0 });
  });

  it("invoke errors and fn-level errors never read as success", async () => {
    const err = mockFunctionsClient({ data: null, error: { message: "boom" } });
    expect(await escalateAlertViaFunction("a", err.client)).toEqual({ ok: false, error: "boom" });
    const fnErr = mockFunctionsClient({ data: { error: "Alert not found" }, error: null });
    expect(await escalateAlertViaFunction("a", fnErr.client)).toEqual({ ok: false, error: "Alert not found" });
  });
});

describe("WP-C 2 — no direct client escalations remain", () => {
  const SRC_DIR = join(process.cwd(), "src");
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  it("no .update() literally sets status:'escalated' on the ALERTS table in src", () => {
    // Table-aware: conversations also use an 'escalated' status (Isabella chat
    // handoff, useAgentHandoff) — that is a different, non-SOS domain. The
    // admin edit dialog's DYNAMIC status is handled by its explicit
    // escalated-transition branch (AlertsPage.handleSaveEdit) — this scan
    // locks out literal direct alert escalations.
    const directEscalate = /\.from\(["']alerts["']\)\s*\.update\(\s*\{[^)]{0,400}?status:\s*["']escalated["']/s;
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file.includes("/test/")) continue;
      const src = readFileSync(file, "utf8");
      if (directEscalate.test(src)) offenders.push(file.replace(SRC_DIR, "src"));
    }
    expect(offenders, `Direct status='escalated' writes: ${offenders.join(", ")}`).toEqual([]);
  });

  it("sos-alert-escalate is invoked ONLY via src/lib/alertEscalation.ts", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file.includes("lib/alertEscalation.ts")) continue;
      if (file.includes("/test/")) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes('invoke("sos-alert-escalate"')) offenders.push(file.replace(SRC_DIR, "src"));
    }
    expect(offenders).toEqual([]);
  });
});

describe("WP-C 3 — edge function + schema safety contract (source)", () => {
  it("records the audit row: level 1, admin_notification, call_placed, escalated_by", () => {
    expect(escalateFnSource).toMatch(/escalation_level:\s*1/);
    expect(escalateFnSource).toMatch(/target_type:\s*"admin_notification"/);
    expect(escalateFnSource).toMatch(/call_placed:\s*true/);
    expect(escalateFnSource).toMatch(/escalated_by:\s*staffRow\.id/);
  });

  it("the runner treats a call_placed=true row at a tier as 'reached' (harmless slot proof)", () => {
    expect(runnerSource).toMatch(/call_placed === true[\s\S]{0,40}continue/);
  });

  it("derives notified ONLY from notify-admin's per-admin 'sent' results", () => {
    expect(escalateFnSource).toMatch(/results\.filter\(\(r\) => r\.status === "sent"\)/);
    expect(escalateFnSource).toMatch(/notified\s*=\s*notifiedCount > 0/);
  });

  it("notify-admin knows the escalation.manual event and always sends it loud", () => {
    expect(notifyAdminSource).toContain('"escalation.manual"');
    expect(notifyAdminSource).toMatch(/case "escalation\.manual":[\s\S]{0,200}shouldSend = true/);
    expect(notifyAdminSource).toContain("formatManualEscalationMessage");
  });

  it("the migration adds the enum value and escalated_by column", () => {
    expect(migrationSource).toMatch(/ADD VALUE IF NOT EXISTS 'admin_notification'/);
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES public\.staff\(id\)/);
  });
});
