/**
 * Forwarder — sends parsed device data to Supabase edge functions.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const EV07B_CHECKIN_KEY = process.env.EV07B_CHECKIN_KEY;

if (!SUPABASE_URL) {
  console.warn("[forwarder] SUPABASE_URL not set — forwarding disabled");
}

/**
 * Forward check-in / location / heartbeat data to ev07b-checkin edge function
 */
async function forwardToCheckin(payload) {
  if (!SUPABASE_URL || !EV07B_CHECKIN_KEY) return;

  const url = `${SUPABASE_URL}/functions/v1/ev07b-checkin`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EV07B_CHECKIN_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

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
  if (!SUPABASE_URL || !EV07B_CHECKIN_KEY) return;

  const url = `${SUPABASE_URL}/functions/v1/ev07b-sos-alert`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EV07B_CHECKIN_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

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
