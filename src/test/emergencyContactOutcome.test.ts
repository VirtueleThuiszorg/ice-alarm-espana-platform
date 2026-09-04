// @vitest-environment node
//
// The lie this proves is gone: `emergency-contact-notify` returned
// `{success: true, notified: 0, reason: "no_contacts"}` at HTTP 200 for a member with NO
// emergency contacts, so a caller checking `success` could not tell "there was nobody to call"
// from "the entire chain was reached" (READINESS_MODEL.md §1-A).
//
// Written negative-first, per GOALS.md's adversarial stop conditions: the load-bearing
// assertions are that a zero-contact member is NEVER reported as successfully notified, and
// that the callers do NOT ignore the answer. A shape-only test would pass while the bug stayed,
// because before this change neither caller read the Response at all (§1-B).
//
// The Deno functions cannot be imported under vitest, so the pure decision module is tested
// directly and the two ingest callers are asserted at source level — the same split as
// escalation-outcome.ts / escalationOutcome.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NOTIFY_OUTCOME_STATUS,
  classifyNotifyResponse,
  requiresLoudAlert,
  resultForAttempted,
  resultForNoContacts,
  resultForUnreadable,
  type NotifyOutcome,
} from "../../supabase/functions/_shared/contact-notify-outcome";

const ALL_OUTCOMES: NotifyOutcome[] = [
  "notified",
  "all_failed",
  "no_contacts",
  "contacts_unreadable",
];

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("no-contacts is never a success", () => {
  it("a member with ZERO contacts is not reported as successfully notified", () => {
    const r = resultForNoContacts();
    expect(r.outcome).toBe("no_contacts");
    expect(r.success).toBe(false); // <-- the fix. Was `true`.
    expect(r.notified).toBe(0);
  });

  it("no-contacts does NOT return 2xx — a bare res.ok check gets the right answer", () => {
    const status = NOTIFY_OUTCOME_STATUS.no_contacts;
    expect(status).toBe(409);
    expect(status >= 200 && status < 300).toBe(false);
  });

  it("NO outcome may ever pair success:true with zero notified — swept, not spot-checked", () => {
    // A future branch cannot reintroduce the bug without failing here.
    const results = [
      resultForNoContacts(),
      resultForUnreadable(),
      resultForAttempted(0, 3),
      resultForAttempted(1, 3),
      resultForAttempted(3, 3),
    ];
    for (const r of results) {
      if (r.notified === 0) expect(r.success).toBe(false);
      if (r.success) expect(r.notified).toBeGreaterThan(0);
    }
  });

  it("only `notified` is a success, and only `notified` is 2xx", () => {
    for (const outcome of ALL_OUTCOMES) {
      const is2xx = NOTIFY_OUTCOME_STATUS[outcome] < 300;
      expect(is2xx).toBe(outcome === "notified");
      expect(requiresLoudAlert(outcome)).toBe(outcome !== "notified");
    }
  });

  it("every outcome has a status code (no branch can fall through to a default 200)", () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(typeof NOTIFY_OUTCOME_STATUS[outcome]).toBe("number");
    }
    expect(Object.keys(NOTIFY_OUTCOME_STATUS).sort()).toEqual([...ALL_OUTCOMES].sort());
  });
});

describe("an unreadable contacts table is not an empty one", () => {
  it("a failed read is a DISTINCT outcome from no contacts", () => {
    // These were the same response. A database failure reading contacts that exist and could
    // have been called was indistinguishable from a member who was never set up.
    expect(resultForUnreadable().outcome).not.toBe(resultForNoContacts().outcome);
    expect(NOTIFY_OUTCOME_STATUS.contacts_unreadable).not.toBe(
      NOTIFY_OUTCOME_STATUS.no_contacts,
    );
  });

  it("a failed read is marked retryable (503), an empty table is not", () => {
    expect(NOTIFY_OUTCOME_STATUS.contacts_unreadable).toBe(503);
    expect(NOTIFY_OUTCOME_STATUS.no_contacts).toBe(409);
  });

  it("the function does not fold contactsError into the empty-contacts branch", () => {
    const src = read("supabase/functions/emergency-contact-notify/index.ts");
    expect(src).not.toMatch(/contactsError\s*\|\|\s*!contacts/);
    expect(src).toContain("resultForUnreadable()");
    expect(src).toContain("resultForNoContacts()");
  });

  it("the function no longer contains the 200 no_contacts payload", () => {
    const src = read("supabase/functions/emergency-contact-notify/index.ts");
    expect(src).not.toContain('success: true, notified: 0');
    expect(src).not.toContain('reason: "no_contacts"');
  });
});

describe("an unreadable answer is never resolved to success", () => {
  it("a recognised outcome is passed through", () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(classifyNotifyResponse({ outcome })).toBe(outcome);
    }
  });

  it("a shapeless, null or legacy body is NOT `notified`", () => {
    // Includes the old payload: a stale deployed version returning {success:true,notified:0}
    // must not read as a success through the new classifier either.
    for (const body of [
      null,
      undefined,
      {},
      "not json",
      { success: true },
      { success: true, notified: 0, reason: "no_contacts" },
      { outcome: "something_else" },
    ]) {
      expect(classifyNotifyResponse(body)).not.toBe("notified");
      expect(requiresLoudAlert(classifyNotifyResponse(body))).toBe(true);
    }
  });
});

describe("the ingest callers do not ignore the answer", () => {
  // This is the assertion that makes the outcome union matter. Both callers previously did
  // `await fetch(...)` and discarded the Response entirely.
  const callers = [
    "supabase/functions/ev07b-sos-alert/index.ts",
    "supabase/functions/ev07b-checkin/index.ts",
  ];

  it.each(callers)("%s routes through the shared helper, not a bare fetch", (path) => {
    const src = read(path);
    expect(src).toContain("notifyEmergencyContacts");
    expect(src).toContain("_shared/notify-emergency-contacts.ts");
    // No inlined fire-and-forget call to the notify function is left behind.
    expect(src).not.toMatch(/functions\/v1\/emergency-contact-notify/);
  });

  it("the shared helper reads the body and acts on the outcome", () => {
    const src = read("supabase/functions/_shared/notify-emergency-contacts.ts");
    expect(src).toContain("res.json()");
    expect(src).toContain("classifyNotifyResponse");
    expect(src).toContain("requiresLoudAlert");
    expect(src).toContain("escalation.no_emergency_contacts");
  });

  it("there is ONE implementation, not one copied per caller", () => {
    for (const path of callers) {
      const src = read(path);
      expect(src).not.toContain("async function notifyEmergencyContacts");
    }
  });

  it("notify-admin actually handles the events the helper sends", () => {
    const src = read("supabase/functions/notify-admin/index.ts");
    for (const event of [
      "escalation.no_emergency_contacts",
      "escalation.contacts_not_notified",
    ]) {
      expect(src).toContain(`"${event}"`);
      expect(src).toContain(`case "${event}":`);
    }
  });
});
