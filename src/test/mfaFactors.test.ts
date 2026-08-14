/**
 * The mandatory-2FA gate (#125) asks one question: is this admin enrolled?
 *
 * It originally answered it by reading `mfaData.totp`, which answers a narrower
 * question — "do they have a TOTP factor" — and gets the real one wrong for
 * anyone enrolled another way. On `@supabase/auth-js` 2.91.0 that is reachable
 * today: `FactorTypes = ['totp', 'phone', 'webauthn']`, with a working WebAuthn
 * implementation in the shipped client.
 *
 * The failure mode is the worst kind for a security control — it fires on the
 * wrong person. An admin who enrolled a passkey, exactly as asked, reads as
 * unenrolled and is refused every admin route.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasVerifiedMfaFactor } from "@/lib/hasVerifiedMfaFactor";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

/** Shaped like a real `listFactors()` payload: per-type arrays plus `all`. */
const factors = (...items: { factor_type: string; status: string }[]) => ({
  all: items,
  totp: items.filter((f) => f.factor_type === "totp"),
  phone: items.filter((f) => f.factor_type === "phone"),
  webauthn: items.filter((f) => f.factor_type === "webauthn"),
});

const verified = (factor_type: string) => ({ factor_type, status: "verified" });
const unverified = (factor_type: string) => ({ factor_type, status: "unverified" });

describe("hasVerifiedMfaFactor counts every factor type", () => {
  it("an admin with ONLY a webauthn factor reads as enrolled", () => {
    // The case the previous implementation got wrong. `totp` is empty here.
    const data = factors(verified("webauthn"));
    expect(data.totp).toHaveLength(0);
    expect(hasVerifiedMfaFactor(data)).toBe(true);
  });

  it("an admin with ONLY a phone factor reads as enrolled", () => {
    expect(hasVerifiedMfaFactor(factors(verified("phone")))).toBe(true);
  });

  it("still reads a TOTP-only admin as enrolled", () => {
    expect(hasVerifiedMfaFactor(factors(verified("totp")))).toBe(true);
  });

  it("reads a mixed enrolment as enrolled", () => {
    expect(hasVerifiedMfaFactor(factors(verified("totp"), verified("webauthn")))).toBe(true);
  });
});

describe("hasVerifiedMfaFactor does not over-count", () => {
  it("an UNVERIFIED factor is not enrolment", () => {
    // enroll() creates a factor in `unverified`; it only protects anything after
    // verify(). Counting an abandoned enrolment would defeat the gate.
    expect(hasVerifiedMfaFactor(factors(unverified("webauthn")))).toBe(false);
    expect(hasVerifiedMfaFactor(factors(unverified("totp")))).toBe(false);
  });

  it("a user with no factors at all is not enrolled", () => {
    expect(hasVerifiedMfaFactor(factors())).toBe(false);
  });

  it("null / undefined / a missing `all` are not enrolment", () => {
    expect(hasVerifiedMfaFactor(null)).toBe(false);
    expect(hasVerifiedMfaFactor(undefined)).toBe(false);
    expect(hasVerifiedMfaFactor({})).toBe(false);
    expect(hasVerifiedMfaFactor({ all: null })).toBe(false);
  });

  it("one verified factor among unverified ones still counts", () => {
    expect(
      hasVerifiedMfaFactor(factors(unverified("totp"), verified("webauthn")))
    ).toBe(true);
  });
});

describe("AuthContext reads every factor, not one type", () => {
  const src = () => read("src/contexts/AuthContext.tsx");

  it("uses the shared helper", () => {
    expect(src()).toMatch(/import \{ hasVerifiedMfaFactor \}/);
    expect(src()).toMatch(/hasVerifiedMfaFactor\(mfaData\)/);
  });

  it("no longer reads mfaData.totp — the regression being pinned", () => {
    expect(src()).not.toMatch(/mfaData\?\.totp/);
  });

  it("still treats a failed lookup as unknown rather than unenrolled", () => {
    // Regression guard for #125's other deliberate choice: null means hold, so a
    // network blip cannot evict a properly-enrolled admin.
    expect(src()).toMatch(/mfaError \? null :/);
  });
});
