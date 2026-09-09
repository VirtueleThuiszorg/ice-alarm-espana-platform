import type { DispatchOutcome } from "./notify-staff.ts";

/**
 * `notify-admin`'s TWELVE MESSAGES, moved out of the function and left BYTE-IDENTICAL.
 *
 * WHY THEY MOVED. notify-admin's WhatsApp path now goes through the one router
 * (_shared/notify-staff.ts), which takes `{title, body}` and builds each channel's text from
 * them. These formatters produce a whole WhatsApp message — emoji, several lines, the admin link
 * and a suggested action — and rewriting them into a title and a sentence would change what
 * arrives on Lee's phone. The brief says "keep its behaviour", so they are copied here
 * unchanged, and `splitFormatted` takes the first line as the title and the rest as the body so
 * that `textFor(event)` reassembles the ORIGINAL STRING exactly. Asserted, character for
 * character.
 *
 * ONE DISPATCHER instead of a `switch` inside a `for` inside a `serve`: `messageFor` returns
 * null for an event it does not know, which is what lets the handler answer 400 instead of
 * looping past it with a `continue` nobody sees.
 *
 * The four `escalation.*`/`system.runner_failure` messages are the ones that say the safety
 * machinery has failed. Their wording is not cosmetic — an operator reads it at 3am and has to
 * know to phone somebody manually — so those four are pinned in the tests too.
 */

/*
  This module is notify-admin's LEGACY CONTRACT — the two things twelve callers depend on: the
  twelve message strings, and the response shape two admin screens read. Both live outside the
  function because the function now calls `serve()` at module scope, and a contract that can only
  be tested by starting an HTTP server is a contract that does not get tested.
*/

export type LegacyEventType =
  | "sale.paid"
  | "partner.joined"
  | "hot.sales"
  | "test"
  | "ev07b.alert"
  | "shift.no_show"
  | "shift.no_coverage"
  | "shift.disconnected"
  | "system.runner_failure"
  | "escalation.call_failed"
  | "escalation.no_emergency_contacts"
  | "escalation.contacts_not_notified";

export interface NotifyPayload {
  event_type: LegacyEventType;
  entity_type?: string;
  entity_id?: string;
  payload: {
    // Runner-failure fields (system.runner_failure)
    runner?: string;
    scope?: string;
    error?: string;
    last_run_at?: string;
    age_s?: number | string;
    sweep_index?: number;
    // Escalation-call-failed fields (escalation.call_failed)
    escalation_level?: number;
    // Contacts-not-notified fields (escalation.contacts_not_notified)
    notify_outcome?: string;
    target_type?: string;
    phone_masked?: string;
    customer_name?: string;
    language?: string;
    amount?: number;
    products_summary?: string;
    source?: string;
    partner_name?: string;
    order_id?: string;
    partner_id?: string;
    contact_name?: string;
    company_name?: string;
    // EV-07B alert fields
    alert_id?: string;
    alert_type?: string;
    member_id?: string;
    member_name?: string;
    imei?: string;
    message?: string;
    lat?: number;
    lng?: number;
    // Shift monitoring fields
    staff_name?: string;
    shift_type?: string;
    shift_time?: string;
  };
}

function formatSalePaidMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const customerName = payload.customer_name || "Unknown";
  const language = payload.language?.toUpperCase() || "ES";
  const amount = payload.amount?.toFixed(2) || "0.00";
  const products = payload.products_summary || "N/A";
  const source = payload.partner_name 
    ? `Partner: ${payload.partner_name}` 
    : "Direct";

  return `🟢 PAID SALE
👤 ${customerName} (${language})
💶 €${amount}
📦 ${products}
🔗 Source: ${source}
🕒 ${timestamp}
➡️ Admin: /admin/orders/${payload.order_id || ""}
✅ Suggested: Create follow-up task / Welcome message`;
}

function formatPartnerJoinedMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const name = payload.contact_name || payload.company_name || "Unknown Partner";
  return `🤝 NEW PARTNER JOINED
👤 ${name}
🕒 ${timestamp}
➡️ Admin: /admin/partners
✅ Suggested: Welcome call / Setup assistance`;
}

// `_payload` is unused and the parameter is KEPT: this message is generic by design — the
// caller's payload carries nothing the text uses — and a uniform signature is what lets
// `messageFor` dispatch all twelve the same way. Underscored so tsc can say so out loud.
function formatHotSalesMessage(_payload: NotifyPayload["payload"], timestamp: string): string {
  return `🔥 HOT SALES ESCALATION
📋 Action required for sales opportunity
🕒 ${timestamp}
➡️ Admin: /admin/dashboard
✅ Suggested: Review and take action`;
}

function formatTestMessage(): string {
  return `✅ TEST NOTIFICATION
WhatsApp notifications are working correctly!
🕒 ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`;
}

const ALERT_TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  sos_button: { emoji: "🚨", label: "SOS BUTTON PRESSED" },
  fall_detected: { emoji: "⚠️", label: "FALL DETECTED" },
  low_battery: { emoji: "🔋", label: "LOW BATTERY" },
  geo_fence: { emoji: "📍", label: "GEOFENCE BREACH" },
  device_offline: { emoji: "📡", label: "DEVICE OFFLINE" },
};

const SHIFT_LABELS: Record<string, string> = {
  morning: "Morning (07:00-15:00)",
  afternoon: "Afternoon (15:00-23:00)",
  night: "Night (23:00-07:00)",
};

function formatShiftNoShowMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const name = payload.staff_name || "Unknown";
  const shiftLabel = SHIFT_LABELS[payload.shift_type || ""] || payload.shift_type || "Unknown";
  return `🚫 SHIFT NO-SHOW
👤 ${name} has not signed in
📅 ${shiftLabel} shift
🕒 ${timestamp}
➡️ Action: Contact staff member or arrange cover immediately`;
}

function formatShiftNoCoverageMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const shiftLabel = SHIFT_LABELS[payload.shift_type || ""] || payload.shift_type || "Unknown";
  return `🔴 NO COVERAGE
⚠️ No staff member is currently on duty!
📅 ${shiftLabel} shift
🕒 ${timestamp}
➡️ Action: Immediate action required — assign coverage now`;
}

function formatShiftDisconnectedMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const name = payload.staff_name || "Unknown";
  const shiftLabel = SHIFT_LABELS[payload.shift_type || ""] || payload.shift_type || "Unknown";
  return `📡 STAFF DISCONNECTED
👤 ${name} has lost connection while on duty
📅 ${shiftLabel} shift
🕒 ${timestamp}
➡️ Action: Check staff member's status and ensure coverage`;
}

function formatRunnerFailureMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const runner = payload.runner || "unknown runner";
  const scope = payload.scope || "failure";
  const detail = payload.scope === "heartbeat_stale"
    ? `Last run: ${payload.last_run_at || "never"} (age ${payload.age_s ?? "?"}s)`
    : `Error: ${payload.error || "unknown"}`;
  return `🆘 SAFETY RUNNER FAILURE
⚙️ ${runner} — ${scope}
${detail}
🕒 ${timestamp}
➡️ Escalation/monitoring may be DOWN. Investigate immediately.`;
}

const ESCALATION_TARGET_LABELS: Record<string, string> = {
  mobile_call: "staff/supervisor/admin mobile",
  emergency_contact_call: "emergency contact",
  browser_alert: "browser alert",
};

function formatEscalationCallFailedMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const level = payload.escalation_level ?? "?";
  const who = ESCALATION_TARGET_LABELS[payload.target_type || ""] || payload.target_type || "target";
  const member = payload.member_name || "a member";
  return `🆘 SOS ESCALATION CALL FAILED
📞 Level ${level} call did NOT connect — ${who} (${payload.phone_masked || "number hidden"})
👤 Member: ${member}
🚨 A rung of the SOS ladder did not reach a human. Check the alert and call manually NOW.
🕒 ${timestamp}
➡️ Admin: /admin/alerts/${payload.alert_id || ""}`;
}

function formatNoEmergencyContactsMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const member = payload.member_name || payload.member_id || "a member";
  const level = payload.escalation_level;
  return `🆘 NO EMERGENCY CONTACTS
👤 Member: ${member}
🚫 This member has NO emergency contacts on file. Nobody can be called for them.${
    level ? `\n📞 Escalation level ${level} could not be served.` : ""
  }
🚨 Handle this alert directly and PHONE THIS MEMBER to get their next of kin.
🕒 ${timestamp}
➡️ Admin: /admin/alerts/${payload.alert_id || ""}`;
}

function formatContactsNotNotifiedMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const member = payload.member_name || payload.member_id || "a member";
  return `🆘 EMERGENCY CONTACTS NOT NOTIFIED
👤 Member: ${member}
🚫 Outcome: ${payload.notify_outcome || "unknown"} — no emergency contact was reached.
🚨 Call the member's contacts MANUALLY now.
🕒 ${timestamp}
➡️ Admin: /admin/alerts/${payload.alert_id || ""}`;
}

function formatEV07BAlertMessage(payload: NotifyPayload["payload"], timestamp: string): string {
  const alertInfo = ALERT_TYPE_LABELS[payload.alert_type || ""] || { emoji: "🔔", label: "DEVICE ALERT" };
  const memberName = payload.member_name || "Unknown member";
  const imei = payload.imei || "Unknown";
  const message = payload.message || "";
  const location = (payload.lat && payload.lng)
    ? `📍 https://www.google.com/maps?q=${payload.lat},${payload.lng}`
    : "📍 Location unavailable";

  return `${alertInfo.emoji} ${alertInfo.label}
👤 ${memberName}
📟 Pendant IMEI: ${imei}
💬 ${message}
${location}
🕒 ${timestamp}
➡️ Admin: /admin/alerts
✅ Action: Check member safety immediately`;
}


/**
 * The message for one event, or null for an event this function does not send.
 *
 * A `switch` with a `default: continue` — which is what this replaces — silently skipped an
 * unknown event type once per configured admin and answered `{success: true, results: []}`.
 * Returning null makes "I do not know that event" a value the caller can act on.
 */
export function messageFor(
  eventType: string,
  payload: NotifyPayload["payload"],
  timestamp: string,
): string | null {
  switch (eventType) {
    case "sale.paid":
      return formatSalePaidMessage(payload, timestamp);
    case "partner.joined":
      return formatPartnerJoinedMessage(payload, timestamp);
    case "hot.sales":
      return formatHotSalesMessage(payload, timestamp);
    case "ev07b.alert":
      return formatEV07BAlertMessage(payload, timestamp);
    case "shift.no_show":
      return formatShiftNoShowMessage(payload, timestamp);
    case "shift.no_coverage":
      return formatShiftNoCoverageMessage(payload, timestamp);
    case "shift.disconnected":
      return formatShiftDisconnectedMessage(payload, timestamp);
    case "system.runner_failure":
      return formatRunnerFailureMessage(payload, timestamp);
    case "escalation.call_failed":
      return formatEscalationCallFailedMessage(payload, timestamp);
    case "escalation.no_emergency_contacts":
      return formatNoEmergencyContactsMessage(payload, timestamp);
    case "escalation.contacts_not_notified":
      return formatContactsNotNotifiedMessage(payload, timestamp);
    case "test":
      return formatTestMessage();
    default:
      return null;
  }
}

/**
 * FIRST LINE IS THE TITLE, THE REST IS THE BODY — and that is not a stylistic choice.
 *
 * The router's `textFor(event)` renders `${title}\n${body}`, so splitting on the first newline
 * and nothing else means the WhatsApp message it sends is the SAME STRING these formatters
 * produce today. Any other split (a summary, a truncation, joining with a space) changes what
 * arrives on somebody's phone, and "keep its behaviour" is the instruction.
 *
 * A one-line message (`hot.sales` is close) yields an empty body, which the router accepts on
 * this path because the message is already whole — `parseNotifyRequest` is not used here, and
 * that is deliberate: it exists to refuse a WORDLESS notification from an external caller, and
 * a title alone from a formatter in this file is not wordless.
 */
export function splitFormatted(message: string): { title: string; body: string } {
  const newline = message.indexOf("\n");
  if (newline === -1) return { title: message, body: "" };
  return { title: message.slice(0, newline), body: message.slice(newline + 1) };
}

/** Madrid time, the way every one of these messages has always stamped itself. */
export function madridTimestamp(now: Date = new Date()): string {
  return now.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
}

/**
 * Where a notification opens in the admin surface.
 *
 * The formatted text carries "➡️ Admin: /admin/alerts/…" as a LINE OF PROSE, which WhatsApp
 * renders as text and push notifications cannot act on. The router wants a real path, so it is
 * derived here from the same payload rather than parsed back out of the message — parsing a
 * link out of prose is how a tap ends up on a 404.
 */
export function linkFor(eventType: string, payload: NotifyPayload["payload"]): string | undefined {
  switch (eventType) {
    case "sale.paid":
      return payload.order_id ? `/admin/orders/${payload.order_id}` : "/admin/orders";
    case "partner.joined":
      return payload.partner_id ? `/admin/partners/${payload.partner_id}` : "/admin/partners";
    case "hot.sales":
      return "/admin";
    // `/admin/alerts` AND NOT `/admin/alerts/<id>`: THERE IS NO ALERT-DETAIL ROUTE. The
    // formatted text has printed "➡️ Admin: /admin/alerts/<id>" for as long as these messages
    // have existed, and it 404s — harmless while it was prose in a WhatsApp nobody could tap,
    // fatal now that push turns the link into a tap. The list is where an operator can act, and
    // a working list beats a broken deep link. (Fixing the prose is a separate change to
    // messages that must stay byte-identical here.)
    case "ev07b.alert":
    case "escalation.call_failed":
    case "escalation.no_emergency_contacts":
    case "escalation.contacts_not_notified":
      return "/admin/alerts";
    case "shift.no_show":
    case "shift.no_coverage":
    case "shift.disconnected":
      return "/admin/rota";
    case "system.runner_failure":
      return "/admin/alerts";
    case "test":
      return "/admin/settings?tab=notifications";
    default:
      return undefined;
  }
}

/** The response shape two callers already read. `status === "sent"` is the test button's test. */
interface LegacyResult {
  admin_user_id: string | null;
  status: "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  error: string | null;
}

/**
 * Per-recipient results, from per-recipient-per-channel outcomes.
 *
 * THE BELL IS EXCLUDED, and that is the load-bearing line. The bell always "sends" — it is an
 * insert, not a network call — so counting it would make `results.some(r => r.status === "sent")`
 * ALWAYS TRUE, and the "Test WhatsApp" button would report success on a deployment with no
 * Twilio credentials at all. That button exists to answer exactly that question.
 */
export function legacyResults(outcomes: DispatchOutcome[]): LegacyResult[] {
  const byStaff = new Map<string, DispatchOutcome[]>();
  for (const outcome of outcomes) {
    if (outcome.channel === "bell") continue;
    const list = byStaff.get(outcome.staffId) ?? [];
    list.push(outcome);
    byStaff.set(outcome.staffId, list);
  }

  return [...byStaff.entries()].map(([staffId, list]) => {
    const sent = list.find((o) => o.status === "sent");
    const failed = list.find((o) => o.status === "failed");
    return {
      // The old shape's key was an auth user id and the callers only ever compared `status`, so
      // the staff id goes here rather than a null: it is the identifier that can be looked up.
      admin_user_id: staffId,
      status: sent ? "sent" : failed ? "failed" : "skipped",
      provider_message_id: null,
      // The first reason it did not go, so "nothing was sent" is answerable from the response
      // and not only from notification_log.
      error: sent ? null : (failed?.error ?? list.find((o) => o.reason)?.reason ?? null),
    };
  });
}

