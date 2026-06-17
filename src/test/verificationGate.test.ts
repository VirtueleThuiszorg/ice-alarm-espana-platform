import { describe, it, expect } from "vitest";
import {
  decideVerification,
  applyEscalation,
  ESCALATE_MARKER,
  VERIFICATION_ATTEMPT_LIMIT,
} from "../../supabase/functions/_shared/verification-gate";

describe("#6 — OUTBOUND calls never verify identity", () => {
  it("never allows verification on outbound, regardless of risk/attempts", () => {
    const d = decideVerification({ callDirection: "outbound", riskLevel: "high", failedAttempts: 5 });
    expect(d.allowVerification).toBe(false);
    expect(d.forceEscalate).toBe(false);
    expect(d.reason).toBe("outbound_no_verification");
  });
});

describe("#7 — force escalate after 2 failed inbound verifications", () => {
  it("allows verification under the attempt limit", () => {
    const d = decideVerification({ callDirection: "inbound", riskLevel: "high", failedAttempts: 1 });
    expect(d.allowVerification).toBe(true);
    expect(d.forceEscalate).toBe(false);
  });

  it("forces escalation at the attempt limit", () => {
    const d = decideVerification({ callDirection: "inbound", riskLevel: "high", failedAttempts: VERIFICATION_ATTEMPT_LIMIT });
    expect(d.allowVerification).toBe(false);
    expect(d.forceEscalate).toBe(true);
    expect(d.reason).toBe("attempt_limit_reached");
  });

  it("forces escalation beyond the attempt limit", () => {
    const d = decideVerification({ callDirection: "inbound", riskLevel: "high", failedAttempts: 4 });
    expect(d.forceEscalate).toBe(true);
  });
});

describe("inbound low-risk needs no verification", () => {
  it("does not verify or escalate", () => {
    const d = decideVerification({ callDirection: "inbound", riskLevel: "low", failedAttempts: 9 });
    expect(d.allowVerification).toBe(false);
    expect(d.forceEscalate).toBe(false);
    expect(d.reason).toBe("low_risk_no_verification");
  });
});

describe("applyEscalation — code forces the marker", () => {
  it("appends the marker when forced", () => {
    const out = applyEscalation("I'm sorry, I can't verify you.", true);
    expect(out).toContain(ESCALATE_MARKER);
  });

  it("does not duplicate if the model already escalated", () => {
    const out = applyEscalation("Transferring you now. [ESCALATE: failed]", true);
    expect(out.match(/\[ESCALATE/gi)?.length).toBe(1);
  });

  it("leaves the response untouched when not forced", () => {
    const text = "Sure, how can I help?";
    expect(applyEscalation(text, false)).toBe(text);
  });
});
