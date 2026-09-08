/**
 * IS THIS REQUEST ACTUALLY FROM TWILIO? — one validator, and it answers with a verdict.
 *
 * Twilio signs every webhook: HMAC-SHA1 over the full request URL followed by each POST
 * parameter in key order (`key` immediately followed by `value`, no separators), keyed on the
 * account's auth token, base64-encoded, sent as `X-Twilio-Signature`.
 *
 * ── WHY THIS EXISTS AS A MODULE ────────────────────────────────────────────────────────────
 *
 * There was one copy of this algorithm, inline in `sos-conference-status`, and it ends:
 *
 *     if (!isValid) console.warn(`[${FN}] Invalid Twilio signature — proceeding anyway`);
 *
 * A validator that proceeds anyway is not a validator; it is a log line. That is survivable for
 * a conference status callback, which only records what a call did. It is NOT survivable for an
 * inbound message webhook, because that one WRITES INTO A MEMBER'S CONVERSATION: an unsigned
 * POST with `From=<any member's phone>` would put words in that member's mouth, in their own
 * thread, for an operator to act on. The inbound functions therefore refuse rather than warn.
 *
 * (`sos-conference-status` is left as it is on purpose — it is the SOS path, where CLAUDE.md
 * makes a human gate mandatory. Adopting this module there is a one-line change recorded for
 * Lee rather than taken here.)
 *
 * ── THE FAILURE DIRECTION ──────────────────────────────────────────────────────────────────
 *
 * NO auth token configured means INVALID, never valid. The tempting shape is
 * `if (!authToken) return true` — "we cannot check, so let it through" — which turns a
 * misconfiguration into an open endpoint, silently, and only on the environment that is
 * misconfigured. Same for a missing signature header.
 */

export type TwilioSignatureVerdict =
  | { valid: true }
  | { valid: false; reason: "no_auth_token" | "no_signature" | "mismatch" };

/** Twilio's canonical string: the full URL, then every parameter in key order. */
export function twilioSignatureBase(url: string, params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
}

/** Form fields as a plain record. Repeated keys keep the LAST value, as Twilio's own SDK does. */
export function twilioParams(form: Iterable<[string, FormDataEntryValue]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form) out[key] = typeof value === "string" ? value : "";
  return out;
}

/** Length-independent byte comparison, so a mismatch does not leak where it diverged. */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export async function verifyTwilioSignature(input: {
  authToken: string;
  /** The full URL Twilio was configured with, exactly as it signed it. */
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): Promise<TwilioSignatureVerdict> {
  if (!input.authToken) return { valid: false, reason: "no_auth_token" };
  if (!input.signature) return { valid: false, reason: "no_signature" };

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(twilioSignatureBase(input.url, input.params)),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return constantTimeEqual(expected, input.signature) ? { valid: true } : { valid: false, reason: "mismatch" };
}
