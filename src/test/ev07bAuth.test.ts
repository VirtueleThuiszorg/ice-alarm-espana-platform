// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeHmacSignature } from "../../supabase/functions/_shared/hmac";
import { authenticateEv07bRequest } from "../../supabase/functions/_shared/ev07b-auth";

const HMAC_SECRET = "hmac-secret";
const API_KEY = "legacy-api-key";
const BODY = JSON.stringify({ imei: "123456789", alarm_type: "sos" });
const NOW = 1700000000000;

const sign = (ts: number | string) => computeHmacSignature(HMAC_SECRET, `${ts}.${BODY}`);

describe("EV07B ingress auth — HMAC accepted", () => {
  it("accepts a valid HMAC (no api-key needed)", async () => {
    const ts = String(NOW);
    const r = await authenticateEv07bRequest({
      apiKey: null, expectedApiKey: API_KEY, signature: await sign(ts), timestamp: ts,
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("hmac");
  });
});

describe("EV07B ingress auth — transition window (accept EITHER)", () => {
  it("falls back to a valid x-api-key when no HMAC is sent", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: API_KEY, expectedApiKey: API_KEY, signature: null, timestamp: null,
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("api_key");
  });

  it("accepts a valid x-api-key even when the HMAC is invalid (never lock out)", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: API_KEY, expectedApiKey: API_KEY, signature: "deadbeef", timestamp: String(NOW),
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("api_key");
    expect(r.reason).toBe("legacy_key_hmac_failed");
  });

  it("accepts a valid x-api-key when the HMAC timestamp is stale (clock drift)", async () => {
    const staleTs = String(NOW - 10 * 60 * 1000);
    const r = await authenticateEv07bRequest({
      apiKey: API_KEY, expectedApiKey: API_KEY, signature: await sign(staleTs), timestamp: staleTs,
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("api_key");
  });
});

describe("EV07B ingress auth — rejection", () => {
  it("rejects invalid HMAC with no api-key", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: null, expectedApiKey: API_KEY, signature: "deadbeef", timestamp: String(NOW),
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when no credentials at all are present", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: null, expectedApiKey: API_KEY, signature: null, timestamp: null,
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_valid_credentials");
  });

  it("rejects a wrong api-key", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: "wrong", expectedApiKey: API_KEY, signature: null, timestamp: null,
      rawBody: BODY, hmacSecret: HMAC_SECRET, nowMs: NOW,
    });
    expect(r.ok).toBe(false);
  });
});

describe("EV07B ingress auth — enforce-HMAC-only mode (post-transition)", () => {
  it("accepts a valid HMAC", async () => {
    const ts = String(NOW);
    const r = await authenticateEv07bRequest({
      apiKey: null, expectedApiKey: API_KEY, signature: await sign(ts), timestamp: ts,
      rawBody: BODY, hmacSecret: HMAC_SECRET, enforceHmacOnly: true, nowMs: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("hmac");
  });

  it("REJECTS a valid api-key once HMAC is enforced (no legacy fallback)", async () => {
    const r = await authenticateEv07bRequest({
      apiKey: API_KEY, expectedApiKey: API_KEY, signature: null, timestamp: null,
      rawBody: BODY, hmacSecret: HMAC_SECRET, enforceHmacOnly: true, nowMs: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("hmac_required");
  });
});
