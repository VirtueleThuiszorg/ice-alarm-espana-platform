// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  computeHmacSignature,
  verifyHmacSignature,
  timingSafeEqualHex,
} from "../../supabase/functions/_shared/hmac";

const SECRET = "ev07b-shared-secret";
const BODY = JSON.stringify({ imei: "123456789", alarm_type: "sos" });
const NOW = 1700000000000;

describe("HMAC scheme parity: edge (WebCrypto) ↔ gateway (Node crypto)", () => {
  it("computeHmacSignature equals Node createHmac over `${ts}.${body}`", async () => {
    const ts = String(NOW);
    const gateway = createHmac("sha256", SECRET).update(`${ts}.${BODY}`).digest("hex");
    const edge = await computeHmacSignature(SECRET, `${ts}.${BODY}`);
    expect(edge).toBe(gateway);
  });
});

describe("verifyHmacSignature", () => {
  it("accepts a valid, fresh signature", async () => {
    const ts = String(NOW);
    const sig = await computeHmacSignature(SECRET, `${ts}.${BODY}`);
    const r = await verifyHmacSignature({ secret: SECRET, timestamp: ts, rawBody: BODY, signature: sig, nowMs: NOW });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("rejects a tampered body", async () => {
    const ts = String(NOW);
    const sig = await computeHmacSignature(SECRET, `${ts}.${BODY}`);
    const r = await verifyHmacSignature({ secret: SECRET, timestamp: ts, rawBody: BODY + "x", signature: sig, nowMs: NOW });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("signature_mismatch");
  });

  it("rejects a wrong secret", async () => {
    const ts = String(NOW);
    const sig = await computeHmacSignature("other-secret", `${ts}.${BODY}`);
    const r = await verifyHmacSignature({ secret: SECRET, timestamp: ts, rawBody: BODY, signature: sig, nowMs: NOW });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("signature_mismatch");
  });

  it("rejects a stale timestamp (replay protection) — past", async () => {
    const ts = String(NOW - 10 * 60 * 1000);
    const sig = await computeHmacSignature(SECRET, `${ts}.${BODY}`);
    const r = await verifyHmacSignature({ secret: SECRET, timestamp: ts, rawBody: BODY, signature: sig, nowMs: NOW });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("stale_timestamp");
  });

  it("rejects a far-future timestamp", async () => {
    const ts = String(NOW + 10 * 60 * 1000);
    const sig = await computeHmacSignature(SECRET, `${ts}.${BODY}`);
    const r = await verifyHmacSignature({ secret: SECRET, timestamp: ts, rawBody: BODY, signature: sig, nowMs: NOW });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("stale_timestamp");
  });

  it("rejects missing signature or timestamp", async () => {
    expect((await verifyHmacSignature({ secret: SECRET, timestamp: String(NOW), rawBody: BODY, signature: null, nowMs: NOW })).valid).toBe(false);
    expect((await verifyHmacSignature({ secret: SECRET, timestamp: null, rawBody: BODY, signature: "abcd", nowMs: NOW })).valid).toBe(false);
  });
});

describe("timingSafeEqualHex", () => {
  it("compares correctly", () => {
    expect(timingSafeEqualHex("aabb", "aabb")).toBe(true);
    expect(timingSafeEqualHex("aabb", "aabc")).toBe(false);
    expect(timingSafeEqualHex("aa", "aabb")).toBe(false);
  });
});
