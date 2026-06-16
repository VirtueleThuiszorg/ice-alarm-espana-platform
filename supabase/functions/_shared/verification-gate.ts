/**
 * Identity-verification policy — CODE-ENFORCED Isabella non-negotiables #6 and #7.
 * (Action-level rules, unlike the language/cadence rules which stay prompt-governed.)
 *
 *   #6 — OUTBOUND calls must NEVER trigger identity verification (Name/DOB/NIE).
 *   #7 — After 2 failed verification attempts on an INBOUND high-risk request, force a
 *        [ESCALATE] to a human — not left to the model to decide.
 *
 * Dependency-free; unit-testable under vitest.
 */

export const VERIFICATION_ATTEMPT_LIMIT = 2;
/** The marker the voice handler detects to transfer the call to a human. */
export const ESCALATE_MARKER = "[ESCALATE: identity verification failed]";

export type CallDirection = "inbound" | "outbound";
export type RiskLevel = "low" | "high";

export interface VerificationContext {
  callDirection: CallDirection;
  riskLevel: RiskLevel;
  /** How many identity-verification attempts have already failed this interaction. */
  failedAttempts: number;
}

export interface VerificationDecision {
  /** May the agent ask for identity (Name/DOB/NIE) at all? */
  allowVerification: boolean;
  /** Must the code force an escalation to a human now? */
  forceEscalate: boolean;
  reason:
    | "outbound_no_verification" // #6
    | "attempt_limit_reached" // #7
    | "verification_allowed"
    | "low_risk_no_verification";
}

/**
 * Decide verification/escalation purely from call context.
 *  - OUTBOUND  -> never verify, never escalate-for-verification (#6).
 *  - INBOUND high-risk, failedAttempts >= limit -> force escalate (#7).
 *  - INBOUND high-risk, under limit -> verification allowed.
 *  - INBOUND low-risk -> no verification needed.
 */
export function decideVerification(ctx: VerificationContext): VerificationDecision {
  if (ctx.callDirection === "outbound") {
    return { allowVerification: false, forceEscalate: false, reason: "outbound_no_verification" };
  }
  if (ctx.riskLevel !== "high") {
    return { allowVerification: false, forceEscalate: false, reason: "low_risk_no_verification" };
  }
  if (ctx.failedAttempts >= VERIFICATION_ATTEMPT_LIMIT) {
    return { allowVerification: false, forceEscalate: true, reason: "attempt_limit_reached" };
  }
  return { allowVerification: true, forceEscalate: false, reason: "verification_allowed" };
}

/**
 * Force the escalation marker into a model response when policy requires it (#7), so the
 * call transfer happens regardless of what the model decided. Idempotent — won't duplicate.
 */
export function applyEscalation(responseText: string, forceEscalate: boolean): string {
  if (!forceEscalate) return responseText;
  if (/\[ESCALATE/i.test(responseText)) return responseText; // model already escalated
  const base = (responseText || "").trim();
  return base ? `${base}\n${ESCALATE_MARKER}` : ESCALATE_MARKER;
}

/**
 * Build a hard, code-derived directive to inject into the system prompt, reflecting the
 * policy decision. This makes #6/#7 explicit at the prompt layer too (defence in depth) but
 * the binding enforcement is decideVerification + applyEscalation in code.
 */
export function verificationDirective(decision: VerificationDecision): string {
  switch (decision.reason) {
    case "outbound_no_verification":
      return "\n\n[SYSTEM ENFORCEMENT] This is an OUTBOUND call. You MUST NOT request identity verification (no Name/DOB/NIE). Proceed without any verification step.";
    case "attempt_limit_reached":
      return "\n\n[SYSTEM ENFORCEMENT] Identity verification has failed the maximum number of times. Do NOT ask again. Escalate to a human operator now.";
    case "verification_allowed":
      return "\n\n[SYSTEM ENFORCEMENT] This is an inbound high-risk request. Identity verification (Name + DOB + NIE) is permitted before disclosing or changing account data.";
    case "low_risk_no_verification":
      return "\n\n[SYSTEM ENFORCEMENT] This is a low-risk request. Identity verification is not required.";
  }
}
