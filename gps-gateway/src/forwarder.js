/**
 * Forwarder — sends parsed device data to Supabase edge functions.
 *
 * Requests are signed with HMAC-SHA256 (EV07B_HMAC_SECRET) over `${timestamp}.${rawBody}`,
 * sent as x-ev07b-timestamp + x-ev07b-signature. The legacy x-api-key is still sent during
 * the transition window so neither side is locked out if one deploys before the other.
 * Scheme MUST match supabase/functions/_shared/hmac.ts.
 */

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const EV07B_CHECKIN_KEY = process.env.EV07B_CHECKIN_KEY;
const EV07B_HMAC_SECRET = process.env.EV07B_HMAC_SECRET;

if (!SUPABASE_URL) {
  console.warn("[forwarder] SUPABASE_URL not set — forwarding disabled");
}
if (!EV07B_HMAC_SECRET) {
  console.warn("[forwarder] EV07B_HMAC_SECRET not set — signing disabled (legacy x-api-key only)");
}

/** Build request headers: HMAC signature (if secret set) + legacy api-key (transition). */
function buildHeaders(rawBody) {
  const headers = { "Content-Type": "application/json" };
  if (EV07B_CHECKIN_KEY) headers["x-api-key"] = EV07B_CHECKIN_KEY;
  if (EV07B_HMAC_SECRET) {
    const timestamp = String(Date.now());
    const signature = crypto
      .createHmac("sha256", EV07B_HMAC_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    headers["x-ev07b-timestamp"] = timestamp;
    headers["x-ev07b-signature"] = signature;
  }
  return headers;
}

/** POST a payload to an edge function with signed headers. Returns the fetch Response. */
async function postSigned(url, payload) {
  // Sign over the EXACT bytes we send — stringify once, reuse for both body and signature.
  const rawBody = JSON.stringify(payload);
  return fetch(url, {
    method: "POST",
    headers: buildHeaders(rawBody),
    body: rawBody,
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * Forward check-in / location / heartbeat data to ev07b-checkin edge function
 */
async function forwardToCheckin(payload) {
  if (!SUPABASE_URL || (!EV07B_CHECKIN_KEY && !EV07B_HMAC_SECRET)) return;

  const url = `${SUPABASE_URL}/functions/v1/ev07b-checkin`;

  try {
    const res = await postSigned(url, payload);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[forwarder] checkin HTTP ${res.status}: ${text}`);
    } else {
      const data = await res.json();
      console.log(`[forwarder] checkin OK for IMEI ${payload.imei}`, data);
    }
  } catch (err) {
    console.error(`[forwarder] checkin error for IMEI ${payload.imei}:`, err.message);
  }
}

/**
 * Forward SOS/alarm data to ev07b-sos-alert edge function
 */
async function forwardSosAlert(payload) {
  if (!SUPABASE_URL || (!EV07B_CHECKIN_KEY && !EV07B_HMAC_SECRET)) return;

  const url = `${SUPABASE_URL}/functions/v1/ev07b-sos-alert`;

  try {
    const res = await postSigned(url, payload);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[forwarder] sos-alert HTTP ${res.status}: ${text}`);
    } else {
      const data = await res.json();
      console.log(`[forwarder] sos-alert OK for IMEI ${payload.imei}`, data);
    }
  } catch (err) {
    console.error(`[forwarder] sos-alert error for IMEI ${payload.imei}:`, err.message);
  }
}

module.exports = { forwardToCheckin, forwardSosAlert };
