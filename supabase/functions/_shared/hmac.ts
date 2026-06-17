/**
 * HMAC-SHA256 request signing/verification (shared, Web Crypto — works in Deno + Node).
 *
 * Scheme (MUST match gps-gateway/src/forwarder.js):
 *   message   = `${timestamp}.${rawBody}`   (timestamp = unix milliseconds)
 *   signature = hex( HMAC-SHA256(secret, message) )
 *   headers   = x-ev07b-timestamp, x-ev07b-signature
 *
 * Dependency-free; unit-testable under vitest.
 */

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish compare of two hex strings (avoids early-exit timing leak). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function computeHmacSignature(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

export interface HmacVerifyArgs {
  secret: string;
  timestamp: string | number | null; // unix ms (string or number)
  rawBody: string;
  signature: string | null; // hex
  /** Max allowed clock skew (replay window). Default 5 minutes. */
  maxSkewMs?: number;
  /** Injectable clock for tests. Defaults to Date.now(). */
  nowMs?: number;
}

export type HmacVerifyReason =
  | "ok"
  | "no_secret"
  | "missing_signature_or_timestamp"
  | "bad_timestamp"
  | "stale_timestamp"
  | "signature_mismatch";

export async function verifyHmacSignature(
  args: HmacVerifyArgs,
): Promise<{ valid: boolean; reason: HmacVerifyReason }> {
  const { secret, timestamp, rawBody, signature } = args;
  const maxSkewMs = args.maxSkewMs ?? 5 * 60 * 1000;
  const nowMs = args.nowMs ?? Date.now();

  if (!secret) return { valid: false, reason: "no_secret" };
  if (!signature || timestamp === null || timestamp === undefined || timestamp === "") {
    return { valid: false, reason: "missing_signature_or_timestamp" };
  }

  const tsMs = Number(timestamp);
  if (!Number.isFinite(tsMs)) return { valid: false, reason: "bad_timestamp" };

  // Replay protection: reject timestamps outside the skew window (past or future).
  if (Math.abs(nowMs - tsMs) > maxSkewMs) return { valid: false, reason: "stale_timestamp" };

  const expected = await computeHmacSignature(secret, `${timestamp}.${rawBody}`);
  if (!timingSafeEqualHex(expected, signature.toLowerCase())) {
    return { valid: false, reason: "signature_mismatch" };
  }
  return { valid: true, reason: "ok" };
}
