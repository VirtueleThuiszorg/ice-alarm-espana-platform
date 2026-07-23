/**
 * WP-A (STAGE_SOS_FIX.md) — unified alert ownership.
 *
 * Proves, at the logic level, the contract Lee asked to see verified:
 *   claim from the QUEUE → the SOS page derives that alert as ACTIVE for the
 *   claiming operator, because both surfaces now write/read the SAME canonical
 *   field (accepted_by_staff_id) through the SAME guarded write path.
 *
 * Four layers:
 *   1. Write-path behaviour (fields written, guard applied, race loser told so)
 *   2. Shared-state derivation (queue-claimed row IS the SOS page's activeAlert)
 *   3. Two-operator race across screens (second claimer cannot steal)
 *   4. Source-scan invariant: NO ownership write exists outside alertOwnership.ts
 *      (so the unification cannot silently regress)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  acceptAlertOwnership,
  deriveActiveAlert,
  derivePendingAlerts,
  isSosAlertType,
  SOS_ALERT_TYPES,
} from "@/lib/alertOwnership";

// ── chainable supabase mock capturing the exact query built ──────────────────
type Captured = {
  table?: string;
  updatePayload?: Record<string, unknown>;
  eqArgs?: [string, unknown];
  isArgs?: [string, unknown];
  selected?: boolean;
};

function mockClient(result: { data: unknown; error: unknown }) {
  const captured: Captured = {};
  const chain = {
    update(payload: Record<string, unknown>) {
      captured.updatePayload = payload;
      return chain;
    },
    eq(col: string, val: unknown) {
      captured.eqArgs = [col, val];
      return chain;
    },
    is(col: string, val: unknown) {
      captured.isArgs = [col, val];
      return chain;
    },
    select() {
      captured.selected = true;
      return chain;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
  };
  const client = {
    from(table: string) {
      captured.table = table;
      return chain;
    },
  };
  return { client: client as never, captured };
}

const STAFF_A = "staff-aaa";
const STAFF_B = "staff-bbb";
const ALERT_ID = "alert-123";

// What the DB row looks like after the guarded UPDATE succeeds for STAFF_A —
// mirrors exactly the payload acceptAlertOwnership writes.
function acceptedRow(staffId: string) {
  return {
    id: ALERT_ID,
    alert_type: "sos_button",
    status: "in_progress",
    accepted_by_staff_id: staffId,
    accepted_at: "2026-07-22T20:00:00.000Z",
    claimed_by: staffId,
    claimed_at: "2026-07-22T20:00:00.000Z",
  };
}

describe("WP-A 1 — the single write path", () => {
  it("writes canonical ownership + legacy mirror + status in ONE update", async () => {
    const { client, captured } = mockClient({ data: acceptedRow(STAFF_A), error: null });
    const res = await acceptAlertOwnership(ALERT_ID, STAFF_A, client);

    expect(res.ok).toBe(true);
    expect(captured.table).toBe("alerts");
    // canonical
    expect(captured.updatePayload).toMatchObject({
      accepted_by_staff_id: STAFF_A,
      status: "in_progress",
    });
    expect(captured.updatePayload).toHaveProperty("accepted_at");
    // legacy mirror — keeps SLA dashboard, ShiftHistory, admin joins working
    expect(captured.updatePayload).toMatchObject({ claimed_by: STAFF_A });
    expect(captured.updatePayload).toHaveProperty("claimed_at");
    // accepted_at and claimed_at are the same instant (one timeline, not two)
    expect(captured.updatePayload!.accepted_at).toBe(captured.updatePayload!.claimed_at);
  });

  it("always applies the concurrency guard (accepted_by_staff_id IS NULL)", async () => {
    const { client, captured } = mockClient({ data: acceptedRow(STAFF_A), error: null });
    await acceptAlertOwnership(ALERT_ID, STAFF_A, client);
    expect(captured.eqArgs).toEqual(["id", ALERT_ID]);
    expect(captured.isArgs).toEqual(["accepted_by_staff_id", null]);
    expect(captured.selected).toBe(true); // returns the row so callers can sync state
  });

  it("tells the loser 'already_accepted' when the guard matches no row", async () => {
    const { client } = mockClient({ data: null, error: null });
    const res = await acceptAlertOwnership(ALERT_ID, STAFF_B, client);
    expect(res).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("reports errors as errors, never as success", async () => {
    const { client } = mockClient({ data: null, error: { message: "boom" } });
    const res = await acceptAlertOwnership(ALERT_ID, STAFF_A, client);
    expect(res).toEqual({ ok: false, reason: "error" });
  });
});

describe("WP-A 2 — queue claim is visible on the SOS page (shared state)", () => {
  it("a QUEUE-claimed SOS alert is the SOS page's activeAlert for that operator", async () => {
    // 1. Operator A claims from the queue — same function the queue now calls.
    const { client } = mockClient({ data: acceptedRow(STAFF_A), error: null });
    const res = await acceptAlertOwnership(ALERT_ID, STAFF_A, client);
    expect(res.ok).toBe(true);

    // 2. The SOS page receives that row (initial fetch or realtime UPDATE
    //    replaces the row wholesale — useSOSTakeover.ts realtime handler).
    const sosPageAlerts = [
      (res as { ok: true; alert: Record<string, unknown> }).alert as {
        accepted_by_staff_id: string | null;
      },
      { id: "other", accepted_by_staff_id: null },
    ];

    // 3. The SOS page's own derivations (extracted, used verbatim by the hook):
    const active = deriveActiveAlert(sosPageAlerts, STAFF_A);
    expect(active).not.toBeNull();
    expect(active!.accepted_by_staff_id).toBe(STAFF_A);

    // …and it is no longer pending for anyone.
    const pending = derivePendingAlerts(sosPageAlerts);
    expect(pending.map((a) => (a as { id?: string }).id)).toEqual(["other"]);
  });

  it("the same alert is NOT active for a different operator", async () => {
    const alerts = [acceptedRow(STAFF_A)];
    expect(deriveActiveAlert(alerts, STAFF_B)).toBeNull();
    expect(deriveActiveAlert(alerts, null)).toBeNull();
  });

  it("SOS routing helper recognises exactly the takeover types", () => {
    expect(SOS_ALERT_TYPES).toEqual(["sos_button", "fall_detected"]);
    expect(isSosAlertType("sos_button")).toBe(true);
    expect(isSosAlertType("fall_detected")).toBe(true);
    expect(isSosAlertType("low_battery")).toBe(false);
    expect(isSosAlertType(undefined)).toBe(false);
  });
});

describe("WP-A 3 — two operators, two screens, one owner", () => {
  it("queue claim then SOS accept: the second operator is refused", async () => {
    // Operator A wins from the queue:
    const winner = mockClient({ data: acceptedRow(STAFF_A), error: null });
    const first = await acceptAlertOwnership(ALERT_ID, STAFF_A, winner.client);
    expect(first.ok).toBe(true);

    // Operator B tries from the SOS page: the guard (accepted_by_staff_id IS
    // NULL) now matches nothing → maybeSingle returns no row.
    const loser = mockClient({ data: null, error: null });
    const second = await acceptAlertOwnership(ALERT_ID, STAFF_B, loser.client);
    expect(second).toEqual({ ok: false, reason: "already_accepted" });

    // And the derivation agrees: owner is A on BOTH screens.
    const rows = [acceptedRow(STAFF_A)];
    expect(deriveActiveAlert(rows, STAFF_A)?.accepted_by_staff_id).toBe(STAFF_A);
    expect(deriveActiveAlert(rows, STAFF_B)).toBeNull();
  });
});

describe("WP-A 4 — invariant: no ownership write outside alertOwnership.ts", () => {
  // vitest runs with cwd = project root
  const SRC_DIR = join(process.cwd(), "src");

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  it("no other file .update()s accepted_by_staff_id or claimed_by on the alerts table", () => {
    // Matches an .update({ ... }) object literal that sets an ownership field.
    const ownershipWrite = /\.update\(\s*\{[^)]{0,600}?(accepted_by_staff_id|claimed_by)\s*:/s;
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file.includes("lib/alertOwnership.ts")) continue; // the one allowed site
      if (file.includes("/test/")) continue;
      const src = readFileSync(file, "utf8");
      if (ownershipWrite.test(src)) offenders.push(file.replace(SRC_DIR, "src"));
    }
    expect(
      offenders,
      `Ownership writes found outside alertOwnership.ts — WP-A unification regressed: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
