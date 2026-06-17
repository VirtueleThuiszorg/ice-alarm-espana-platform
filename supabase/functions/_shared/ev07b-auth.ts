/**
 * EV-07B emergency-ingress authentication (shared).
 *
 * TRANSITION-SAFE by design: during rollout we accept EITHER the new HMAC signature OR the
 * legacy x-api-key, so a pendant/gateway is never locked out if one side deploys before the
 * other. Once both sides are confirmed live, set EV07B_ENFORCE_HMAC=true to require HMAC.
 *
 * The emergency endpoint is NEVER unauthenticated: if neither a valid HMAC nor a valid
 * api-key is present, the request is rejected.
 */

import { verifyHmacSignature } from "./hmac.ts";

export interface Ev07bAuthArgs {
  apiKey: string | null;
  expectedApiKey: string | null | undefined;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  hmacSecret: string | null | undefined;
  /** When true, require a valid HMAC — legacy api-key is no longer accepted. */
  enforceHmacOnly?: boolean;
  maxSkewMs?: number;
  nowMs?: number;
}

export interface Ev07bAuthResult {
  ok: boolean;
  method: "hmac" | "api_key" | "none";
  reason: string;
}

export async function authenticateEv07bRequest(args: Ev07bAuthArgs): Promise<Ev07bAuthResult> {
  const { apiKey, expectedApiKey, signature, timestamp, rawBody, hmacSecret, enforceHmacOnly } = args;

  // 1) Preferred: HMAC, if a secret is configured and the client sent a signature.
  let hmacReason: string | null = null;
  if (hmacSecret && signature && timestamp) {
    const v = await verifyHmacSignature({
      secret: hmacSecret,
      timestamp,
      rawBody,
      signature,
      maxSkewMs: args.maxSkewMs,
      nowMs: args.nowMs,
    });
    if (v.valid) return { ok: true, method: "hmac", reason: "ok" };
    hmacReason = v.reason; // remember why it failed (for logging / strict mode)
  }

  // 2) Strict mode: HMAC required — do not fall back to the legacy key.
  if (enforceHmacOnly) {
    return { ok: false, method: "none", reason: hmacReason ? `hmac_invalid:${hmacReason}` : "hmac_required" };
  }

  // 3) Transition window: accept the legacy x-api-key (constant-time compare).
  if (expectedApiKey && apiKey && apiKey.length === expectedApiKey.length) {
    let diff = 0;
    for (let i = 0; i < apiKey.length; i++) diff |= apiKey.charCodeAt(i) ^ expectedApiKey.charCodeAt(i);
    if (diff === 0) {
      return { ok: true, method: "api_key", reason: hmacReason ? "legacy_key_hmac_failed" : "legacy_api_key" };
    }
  }

  return { ok: false, method: "none", reason: hmacReason ? `hmac_invalid:${hmacReason}` : "no_valid_credentials" };
}
