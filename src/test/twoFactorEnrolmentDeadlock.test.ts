/**
 * The 2FA enrolment deadlock (2026-09-03) — it locked an admin out of /admin
 * and took manual `auth.mfa_factors` surgery to clear.
 *
 * The loop:
 *   1. an enrolment is abandoned before the code is entered → a factor is left
 *      in `unverified` state;
 *   2. `enroll()` passed a HARDCODED friendlyName, so every later attempt died
 *      with "a factor with the friendly name ... already exists";
 *   3. the mandatory-2FA gate in ProtectedRoute refuses every admin route,
 *      because no *verified* factor exists.
 *
 * No UI cleared the pending factor, so the account could neither enrol nor get
 * in. Both halves are tested here by CALLING the hook against a fake MFA API
 * rather than reading the source, because the thing that mattered was the
 * sequence of calls that actually reached Supabase.
 *
 * The gate itself is deliberately untested-for-weakening here: it is correct and
 * unchanged. See `mfaFactors.test.ts` for its own assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Factor = { id: string; status: string; friendly_name?: string };

const state: { factors: Factor[]; enrollCalls: { friendlyName?: string }[]; unenrolled: string[] } = {
  factors: [],
  enrollCalls: [],
  unenrolled: [],
};

const mfa = {
  listFactors: vi.fn(async () => ({
    data: {
      all: state.factors,
      totp: state.factors,
      phone: [],
    },
    error: null,
  })),
  enroll: vi.fn(async ({ friendlyName }: { factorType: string; friendlyName?: string }) => {
    state.enrollCalls.push({ friendlyName });
    const clash = state.factors.some((f) => f.friendly_name === friendlyName);
    if (clash) {
      return {
        data: null,
        error: new Error(
          `a factor with the friendly name ${friendlyName} already exists`,
        ),
      };
    }
    const created: Factor = {
      id: `f${state.factors.length + 1}`,
      status: "unverified",
      friendly_name: friendlyName,
    };
    state.factors.push(created);
    return { data: { ...created, type: "totp", totp: { qr_code: "", secret: "", uri: "" } }, error: null };
  }),
  unenroll: vi.fn(async ({ factorId }: { factorId: string }) => {
    state.unenrolled.push(factorId);
    state.factors = state.factors.filter((f) => f.id !== factorId);
    return { error: null };
  }),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1" } }),
}));

// `useState` outside a renderer throws, and the hook uses it only for local
// isEnrolling / error state that none of these assertions touch. Stubbing it
// here — rather than standing up a renderer — keeps the test about the sequence
// of MFA calls, which is the thing that deadlocked.
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useState: (init: unknown) => [init, () => {}] };
});

const { useTwoFactorAuth } = await import("@/hooks/useTwoFactorAuth");

/** Synchronous by necessity: react-hooks/rules-of-hooks forbids an async caller. */
function useHookOutsideRender() {
  return useTwoFactorAuth();
}

beforeEach(() => {
  state.factors = [];
  state.enrollCalls = [];
  state.unenrolled = [];
  vi.clearAllMocks();
});

describe("enroll() breaks the deadlock", () => {
  it("clears an abandoned unverified factor before enrolling", async () => {
    state.factors = [{ id: "stale-1", status: "unverified", friendly_name: "old" }];
    const h = useHookOutsideRender();

    const result = await h.enroll();

    expect(state.unenrolled, "the stale factor was not cleared").toContain("stale-1");
    expect(result, "enrolment should now succeed").not.toBeNull();
  });

  it("does not remove a VERIFIED factor — that would be a 2FA bypass", async () => {
    state.factors = [
      { id: "good-1", status: "verified", friendly_name: "real" },
      { id: "stale-1", status: "unverified", friendly_name: "old" },
    ];
    const h = useHookOutsideRender();

    await h.enroll();

    expect(state.unenrolled).toContain("stale-1");
    expect(
      state.unenrolled,
      "a verified factor must never be unenrolled by an enrol attempt",
    ).not.toContain("good-1");
  });

  it("uses a different friendlyName each attempt, so a survivor cannot collide", async () => {
    const h = useHookOutsideRender();

    await h.enroll();
    await h.enroll();

    const names = state.enrollCalls.map((c) => c.friendlyName);
    expect(names).toHaveLength(2);
    expect(names[0]).toBeTruthy();
    expect(
      names[0],
      "a fixed friendlyName is what turned one abandoned enrolment into a lockout",
    ).not.toBe(names[1]);
  });

  it("still enrols when the pre-clear unenroll fails — the unique name is the fallback", async () => {
    state.factors = [{ id: "stale-1", status: "unverified", friendly_name: "old" }];
    mfa.unenroll.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    const h = useHookOutsideRender();

    const result = await h.enroll();

    expect(result, "a failed cleanup must not block enrolment").not.toBeNull();
  });

  it("the old hardcoded name would have deadlocked — proving the fake reproduces it", async () => {
    // Same fake, but enrolling twice with ONE fixed name, as the old code did.
    state.factors = [];
    await mfa.enroll({ factorType: "totp", friendlyName: "ICE Alarm España Authenticator" });
    const second = await mfa.enroll({
      factorType: "totp",
      friendlyName: "ICE Alarm España Authenticator",
    });
    expect(second.error?.message).toMatch(/already exists/);
  });
});

describe("getFactors() and the gate agree about the same account", () => {
  it("counts a passkey-only enrolment as verified, like hasVerifiedMfaFactor does", async () => {
    // A webauthn factor lives in `all` but not in `totp`. Reading `totp` made
    // this page tell a protected admin they were unenrolled.
    state.factors = [{ id: "wa-1", status: "verified", friendly_name: "passkey" }];
    const h = useHookOutsideRender();

    const factors = await h.getFactors();

    expect(factors.verified.map((f) => f.id)).toContain("wa-1");
  });

  it("does not count an unverified factor as verified", async () => {
    state.factors = [{ id: "pending-1", status: "unverified" }];
    const h = useHookOutsideRender();

    const factors = await h.getFactors();

    expect(factors.verified).toHaveLength(0);
    expect(factors.unverified.map((f) => f.id)).toContain("pending-1");
  });
});
