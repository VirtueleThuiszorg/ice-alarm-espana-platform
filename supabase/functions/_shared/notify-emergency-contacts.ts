/**
 * notify-emergency-contacts.ts — call `emergency-contact-notify` and act on its answer.
 *
 * Both EV-07B ingest paths (ev07b-sos-alert, ev07b-checkin) used to inline a bare
 * `await fetch(...)` whose Response was discarded — no `.json()`, no `.ok`. So a member with
 * zero emergency contacts produced no signal of any kind on the highest-priority path in the
 * product. One shared implementation so the two paths cannot drift, and so a future third
 * caller inherits the correct behaviour instead of copying the old shape.
 *
 * The pure outcome vocabulary lives in ./contact-notify-outcome.ts (unit-tested under vitest);
 * this module is the I/O around it and is Deno-only.
 */

import {
  classifyNotifyResponse,
  requiresLoudAlert,
  type NotifyOutcome,
} from "./contact-notify-outcome.ts";

/**
 * Notify emergency contacts AND ACT ON THE ANSWER.
 *
 * This used to be a bare `await fetch(...)` whose Response was discarded — no `.json()`, no
 * `.ok`. So a member with zero emergency contacts produced no signal of any kind on the
 * highest-priority path in the product. The notification stays non-blocking (the alert row is
 * already written and the operator screen already has it, so this must never delay or fail
 * ingest); what stops is *ignoring the result*.
 *
 * See _shared/contact-notify-outcome.ts and READINESS_MODEL.md §5-B.
 */
export async function notifyEmergencyContacts(
  baseUrl: string,
  serviceKey: string,
  detail: { alert_id: string; member_id: string; alert_type: string },
): Promise<void> {
  let outcome: NotifyOutcome;
  try {
    const res = await fetch(`${baseUrl}/functions/v1/emergency-contact-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ alert_id: detail.alert_id, member_id: detail.member_id }),
    });
    const body = await res.json().catch(() => null);
    outcome = classifyNotifyResponse(body);
  } catch (err) {
    // A transport failure is a failure to notify, not a silent pass.
    console.error(
      JSON.stringify({
        event: "emergency_contact_notify_unreachable",
        alert_id: detail.alert_id,
        member_id: detail.member_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    outcome = "all_failed";
  }

  console.log(
    JSON.stringify({
      event: "emergency_contact_notify_outcome",
      outcome,
      alert_id: detail.alert_id,
      member_id: detail.member_id,
    }),
  );

  if (!requiresLoudAlert(outcome)) return;

  // Nobody was reached. Tell a human — this is the G2 obligation the discarded Response broke.
  try {
    await fetch(`${baseUrl}/functions/v1/notify-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        event_type:
          outcome === "no_contacts"
            ? "escalation.no_emergency_contacts"
            : "escalation.contacts_not_notified",
        entity_type: "alert",
        entity_id: detail.alert_id,
        payload: {
          alert_id: detail.alert_id,
          member_id: detail.member_id,
          alert_type: detail.alert_type,
          notify_outcome: outcome,
        },
      }),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "emergency_contact_notify_alert_send_failed",
        alert_id: detail.alert_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
