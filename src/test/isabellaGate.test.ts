import { describe, it, expect, vi } from "vitest";
import {
  isIsabellaFunctionAllowed,
  isActionNeverGated,
  isNeverGated,
  functionKeyForTrigger,
  SAFETY_CRITICAL_FUNCTIONS,
  LEGAL_NEVER_GATED_FUNCTIONS,
  NEVER_GATED_ACTION_TYPES,
  type IsabellaSettingsClient,
} from "../../supabase/functions/_shared/isabella-gate";

/**
 * Build a mock Supabase-like client whose maybeSingle() resolves to the given
 * {data,error} (or throws). Tracks how many times the query chain was entered so
 * tests can prove a code path never touched the DB.
 */
function makeClient(
  maybeSingleImpl: () => Promise<{ data: unknown; error: unknown }>,
) {
  const fromSpy = vi.fn();
  const client: IsabellaSettingsClient = {
    from: (table: string) => {
      fromSpy(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: maybeSingleImpl as never,
          }),
        }),
      };
    },
  };
  return { client, fromSpy };
}

const ENABLED = () => Promise.resolve({ data: { enabled: true }, error: null });
const DISABLED = () => Promise.resolve({ data: { enabled: false }, error: null });
const NO_ROW = () => Promise.resolve({ data: null, error: null });
const DB_ERROR = () =>
  Promise.resolve({ data: null, error: { message: "connection reset" } });
const THROWS = () => {
  throw new Error("network down");
};

// A client that must never be consulted (its DB access blows up if used).
const TRIPWIRE = () => {
  throw new Error("DB was read for a never-gated function — must not happen");
};

describe("Isabella gate — never-gated allowlist composition", () => {
  it("contains exactly the required safety-critical functions", () => {
    expect([...SAFETY_CRITICAL_FUNCTIONS].sort()).toEqual(
      [
        "bulk_offline_alert",
        "device_offline_response",
        "emergency_escalation_alert",
        "fall_detection_triage",
        "inactivity_check",
        "inbound_phone_calls",
        "sos_button_triage",
      ].sort(),
    );
  });

  it("treats GDPR deletion/export as never-gated (legal)", () => {
    expect([...LEGAL_NEVER_GATED_FUNCTIONS].sort()).toEqual([
      "gdpr_deletion_request",
      "gdpr_export_request",
    ]);
    expect(isNeverGated("gdpr_deletion_request")).toBe(true);
    expect(isNeverGated("gdpr_export_request")).toBe(true);
  });
});

describe("Isabella gate — SAFETY-CRITICAL always run, never read the DB", () => {
  const safetyCritical = [...SAFETY_CRITICAL_FUNCTIONS];

  it.each(safetyCritical)(
    "%s runs when its row is FALSE (and DB is never queried)",
    async (fn) => {
      const { client, fromSpy } = makeClient(DISABLED);
      const result = await isIsabellaFunctionAllowed(client, fn);
      expect(result.allowed).toBe(true);
      expect(result.neverGated).toBe(true);
      expect(result.reason).toBe("safety_critical");
      expect(fromSpy).not.toHaveBeenCalled();
    },
  );

  it.each(safetyCritical)(
    "%s runs when its row is MISSING (and DB is never queried)",
    async (fn) => {
      const { client, fromSpy } = makeClient(NO_ROW);
      const result = await isIsabellaFunctionAllowed(client, fn);
      expect(result.allowed).toBe(true);
      expect(fromSpy).not.toHaveBeenCalled();
    },
  );

  it.each(safetyCritical)(
    "%s runs even when the settings lookup THROWS (short-circuits before any DB call)",
    async (fn) => {
      // TRIPWIRE throws if the DB is touched at all; safety-critical must not touch it.
      const { client } = makeClient(TRIPWIRE);
      const result = await isIsabellaFunctionAllowed(client, fn);
      expect(result.allowed).toBe(true);
      expect(result.neverGated).toBe(true);
    },
  );
});

describe("Isabella gate — LEGAL functions always run, never read the DB", () => {
  const legal = [...LEGAL_NEVER_GATED_FUNCTIONS];

  it.each(legal)("%s runs when FALSE / MISSING / THROWS", async (fn) => {
    for (const impl of [DISABLED, NO_ROW, TRIPWIRE]) {
      const { client, fromSpy } = makeClient(impl);
      const result = await isIsabellaFunctionAllowed(client, fn);
      expect(result.allowed).toBe(true);
      expect(result.neverGated).toBe(true);
      expect(result.reason).toBe("legal_never_gated");
      expect(fromSpy).not.toHaveBeenCalled();
    }
  });
});

describe("Isabella gate — DISCRETIONARY honest gating", () => {
  it("is SUPPRESSED when the row is false", async () => {
    const { client, fromSpy } = makeClient(DISABLED);
    const result = await isIsabellaFunctionAllowed(client, "courtesy_calls");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(result.neverGated).toBe(false);
    expect(fromSpy).toHaveBeenCalledWith("isabella_settings");
  });

  it("RUNS when the row is true", async () => {
    const { client } = makeClient(ENABLED);
    const result = await isIsabellaFunctionAllowed(client, "courtesy_calls");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("enabled");
  });

  it("is SUPPRESSED when there is no row (default-off / opt-in)", async () => {
    const { client } = makeClient(NO_ROW);
    const result = await isIsabellaFunctionAllowed(client, "b2b_outreach_campaigns");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_row");
  });

  it("FAILS OPEN (runs) on a settings lookup error", async () => {
    const { client } = makeClient(DB_ERROR);
    const result = await isIsabellaFunctionAllowed(client, "chat_widget");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("lookup_error_fail_open");
  });

  it("FAILS OPEN (runs) when the settings lookup throws", async () => {
    const { client } = makeClient(THROWS);
    const result = await isIsabellaFunctionAllowed(client, "chat_widget");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("lookup_threw_fail_open");
  });

  it("chat_widget enabled -> runs; disabled -> suppressed", async () => {
    const on = makeClient(ENABLED);
    expect((await isIsabellaFunctionAllowed(on.client, "chat_widget")).allowed).toBe(true);
    const off = makeClient(DISABLED);
    expect((await isIsabellaFunctionAllowed(off.client, "chat_widget")).allowed).toBe(false);
  });
});

describe("Isabella gate — escalate-to-human action carve-out", () => {
  it("never gates escalate / request_human", () => {
    expect(isActionNeverGated("escalate")).toBe(true);
    expect(isActionNeverGated("request_human")).toBe(true);
    expect([...NEVER_GATED_ACTION_TYPES].sort()).toEqual(["escalate", "request_human"]);
  });

  it("does gate ordinary action types", () => {
    expect(isActionNeverGated("whatsapp_notify")).toBe(false);
    expect(isActionNeverGated("task_create")).toBe(false);
    expect(isActionNeverGated("chat_reply")).toBe(false);
  });
});

describe("Isabella gate — trigger resolution", () => {
  it("maps safety-critical triggers to their function keys", () => {
    expect(functionKeyForTrigger("alert.sos_button")).toBe("sos_button_triage");
    expect(functionKeyForTrigger("alert.fall_detected")).toBe("fall_detection_triage");
    expect(functionKeyForTrigger("call.inbound")).toBe("inbound_phone_calls");
  });

  it("maps discretionary triggers to their function keys", () => {
    expect(functionKeyForTrigger("chat.message")).toBe("chat_widget");
    expect(functionKeyForTrigger("shift.assigned")).toBe("shift_notifications");
  });

  it("returns null for unmapped / empty event types", () => {
    expect(functionKeyForTrigger("conversation.started")).toBeNull();
    expect(functionKeyForTrigger(null)).toBeNull();
    expect(functionKeyForTrigger(undefined)).toBeNull();
  });
});
