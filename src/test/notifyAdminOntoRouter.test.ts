// @vitest-environment node
//
// notify-admin's WHATSAPP PATH ON THE ONE ROUTER, and the two things that decide whether that is
// a migration or a regression.
//
// 1. THE MESSAGES MUST NOT CHANGE. Ten internal callers and two admin screens point at this
//    function; the four `escalation.*` / `system.runner_failure` messages are read at 3am by
//    somebody who has to know to phone a member manually. The brief says "keep its behaviour",
//    so the twelve formatters moved BYTE FOR BYTE and the router's own `textFor` has to
//    reassemble the identical string.
//
// 2. THE "SEND A TEST" BUTTON MUST STILL MEAN SOMETHING. It reads
//    `results.some(r => r.status === "sent")`. The router writes a BELL row for every recipient
//    and the bell always succeeds — it is an insert, not a network call — so counting it would
//    make that check always true, and the button would report success on a deployment with no
//    Twilio credentials at all. That button exists to answer exactly that question.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  legacyResults,
  linkFor,
  madridTimestamp,
  messageFor,
  splitFormatted,
} from "../../supabase/functions/_shared/notify-admin-messages";
import {
  NOTIFY_EVENTS,
  isAlwaysLoud,
  textFor,
  type DispatchOutcome,
} from "../../supabase/functions/_shared/notify-staff";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const TS = "9/9/2026, 14:00:00";

const PAYLOADS: Record<string, Record<string, unknown>> = {
  "sale.paid": {
    customer_name: "Mary Smith",
    language: "es",
    amount: 39.9,
    products_summary: "Vivago SOS watch",
    order_id: "o-1",
  },
  "partner.joined": { contact_name: "Ana", company_name: "Clinica X", partner_id: "p-1" },
  "hot.sales": {},
  "ev07b.alert": {
    alert_type: "fall_detected",
    member_name: "Mary Smith",
    imei: "123456789",
    message: "Fall detected",
    lat: 36.5,
    lng: -4.9,
    alert_id: "a-1",
  },
  "shift.no_show": { staff_name: "Travis", shift_type: "night" },
  "shift.no_coverage": { shift_type: "morning" },
  "shift.disconnected": { staff_name: "Travis", shift_type: "afternoon" },
  "system.runner_failure": { runner: "sos-escalation-runner", scope: "heartbeat_stale", last_run_at: "x", age_s: 400 },
  "escalation.call_failed": { escalation_level: 2, target_type: "mobile_call", phone_masked: "***123", member_name: "Mary", alert_id: "a-1" },
  "escalation.no_emergency_contacts": { member_name: "Mary", escalation_level: 3, alert_id: "a-1" },
  "escalation.contacts_not_notified": { member_name: "Mary", notify_outcome: "no_answer", alert_id: "a-1" },
  test: {},
};

const LEGACY_EVENTS = Object.keys(PAYLOADS);

describe("the twelve messages", () => {
  it("covers every event notify-admin has ever accepted", () => {
    // From the function's OLD switch, preserved as this file's fixture list. An event dropped
    // in the move is a caller whose notification silently becomes a 400.
    expect(LEGACY_EVENTS).toHaveLength(12);
    for (const type of LEGACY_EVENTS) {
      expect(messageFor(type, PAYLOADS[type], TS), type).toBeTruthy();
      // ...and every one is an event the router will accept, or the dispatch 400s.
      expect(NOTIFY_EVENTS, type).toContain(type);
    }
  });

  it("returns null for an event it does not know, instead of skipping it silently", () => {
    /*
      The `switch` this replaces ended `default: console.log("Unknown event type"); continue` —
      inside the per-admin loop. So an unknown event was skipped once per configured admin and
      the function answered `{success: true, results: []}`: a success for a notification nobody
      could have received.
    */
    expect(messageFor("not.a.real.event", {}, TS)).toBeNull();
    expect(messageFor("", {}, TS)).toBeNull();
  });

  it("is BYTE-IDENTICAL through the router's own textFor", () => {
    /*
      THE LOAD-BEARING ASSERTION. The router renders `${title}\n${body}` (plus the link only when
      a siteUrl is passed, which this path does not do for the text). `splitFormatted` takes the
      first line as the title and everything after it as the body, so this round trip must return
      the formatter's exact output — every emoji, every newline, every trailing line.

      Anything else — a summary, a truncation, joining lines with a space — changes what arrives
      on Lee's phone, which is what "keep its behaviour" forbids.
    */
    for (const type of LEGACY_EVENTS) {
      const original = messageFor(type, PAYLOADS[type], TS)!;
      const { title, body } = splitFormatted(original);
      const rebuilt = textFor({ type: type as never, title, body });
      expect(rebuilt, type).toBe(original);
    }
  });

  it("keeps the four safety messages' actual words, which are read at 3am", () => {
    // Not cosmetic: each of these tells somebody to act MANUALLY because the automation did not.
    expect(messageFor("system.runner_failure", PAYLOADS["system.runner_failure"], TS)).toContain(
      "Escalation/monitoring may be DOWN",
    );
    expect(messageFor("escalation.call_failed", PAYLOADS["escalation.call_failed"], TS)).toContain(
      "call manually NOW",
    );
    expect(
      messageFor("escalation.no_emergency_contacts", PAYLOADS["escalation.no_emergency_contacts"], TS),
    ).toContain("PHONE THIS MEMBER");
    expect(
      messageFor("escalation.contacts_not_notified", PAYLOADS["escalation.contacts_not_notified"], TS),
    ).toContain("MANUALLY");

    // And the router sends all four regardless of any switch.
    for (const type of [
      "system.runner_failure",
      "escalation.call_failed",
      "escalation.no_emergency_contacts",
      "escalation.contacts_not_notified",
    ] as const) {
      expect(isAlwaysLoud(type), type).toBe(true);
    }
  });

  it("splits on the FIRST newline only", () => {
    expect(splitFormatted("one\ntwo\nthree")).toEqual({ title: "one", body: "two\nthree" });
    // A one-line message has no body, and that is allowed on this path: the message is already
    // whole, and `parseNotifyRequest`'s wordless-notification guard is for external callers.
    expect(splitFormatted("just one line")).toEqual({ title: "just one line", body: "" });
    expect(splitFormatted("title\n")).toEqual({ title: "title", body: "" });
  });

  it("stamps Madrid time, as every one of these messages always has", () => {
    const stamped = madridTimestamp(new Date("2026-09-09T12:00:00Z"));
    // 12:00 UTC is 14:00 in Madrid in September. A UTC timestamp on an operator's WhatsApp is
    // two hours wrong in the direction that matters for a shift.
    expect(stamped).toMatch(/14:00/);
  });
});

describe("where a tap goes", () => {
  it("gives every event a real admin route, or none at all", () => {
    /*
      The formatted text carries "➡️ Admin: /admin/alerts/<id>" as PROSE — WhatsApp renders it as
      text and nobody could tap it. Push turns the link into an actual tap, so it has to resolve:
      a link to a path with no route lands somebody on the catch-all while an alert is open.
    */
    const app = read("src/App.tsx");
    const routes = [...app.matchAll(/<Route\s+path="([a-z0-9\-/:]+)"/g)].map((m) => m[1]);

    for (const type of LEGACY_EVENTS) {
      const link = linkFor(type, PAYLOADS[type]);
      if (!link) continue;
      const path = link.replace(/^\/admin\/?/, "").split("?")[0];
      if (path === "") continue; // "/admin" itself — the index route.
      // Compare against the route patterns, allowing one :param segment.
      const matched = routes.some((route) => {
        const a = route.split("/");
        const b = path.split("/");
        return a.length === b.length && a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
      });
      expect(matched, `${type} → ${link} has no admin route`).toBe(true);
    }
  });

  it("does NOT deep-link an alert, because there is no alert-detail route", () => {
    // The prose has claimed /admin/alerts/<id> for as long as these messages have existed, and
    // it 404s. Harmless as text; a broken tap as a push link. The list is where an operator can
    // act, so that is where it goes.
    for (const type of ["ev07b.alert", "escalation.call_failed", "escalation.no_emergency_contacts", "escalation.contacts_not_notified"]) {
      expect(linkFor(type, PAYLOADS[type]), type).toBe("/admin/alerts");
    }
  });

  it("uses the entity id where a detail route exists", () => {
    expect(linkFor("sale.paid", { order_id: "o-9" })).toBe("/admin/orders/o-9");
    expect(linkFor("partner.joined", { partner_id: "p-9" })).toBe("/admin/partners/p-9");
    // ...and falls back to the list rather than to `/admin/orders/undefined`.
    expect(linkFor("sale.paid", {})).toBe("/admin/orders");
    expect(linkFor("partner.joined", {})).toBe("/admin/partners");
  });
});

describe("the response the test button reads", () => {
  const outcome = (over: Partial<DispatchOutcome>): DispatchOutcome => ({
    channel: "whatsapp",
    staffId: "s-1",
    to: "+34600000000",
    status: "sent",
    ...over,
  });

  it("EXCLUDES the bell, or the test button reports success on a dead deployment", () => {
    /*
      THE ONE THAT MATTERS. The bell is an insert; it always succeeds. `results.some(r =>
      r.status === "sent")` counting it would be true on a deployment with no Twilio credentials
      at all — and "Test WhatsApp sent successfully!" would be a lie told by the one control
      whose entire job is to tell the truth about whether WhatsApp works.
    */
    const results = legacyResults([
      outcome({ channel: "bell", to: "u-1", status: "sent" }),
      outcome({ channel: "whatsapp", status: "skipped", reason: "not_configured" }),
      outcome({ channel: "sms", status: "skipped", reason: "channel_off" }),
      outcome({ channel: "push", status: "skipped", reason: "no_address" }),
      outcome({ channel: "email", status: "skipped", reason: "route_off" }),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("skipped");
    expect(results.some((r) => r.status === "sent")).toBe(false);
    // The reason travels with it, so "nothing was sent" is answerable from the response.
    expect(results[0].error).toBe("not_configured");
  });

  it("says sent when any real channel sent", () => {
    const results = legacyResults([
      outcome({ channel: "bell", status: "sent" }),
      outcome({ channel: "whatsapp", status: "sent" }),
      outcome({ channel: "sms", status: "failed", error: "Twilio 21211" }),
    ]);
    expect(results[0].status).toBe("sent");
    expect(results[0].error).toBeNull();
    expect(results.some((r) => r.status === "sent")).toBe(true);
  });

  it("says failed, with the provider's reason, when a send was attempted and broke", () => {
    // Distinguished from "skipped": one is a misconfiguration, the other is Twilio refusing.
    const results = legacyResults([
      outcome({ channel: "whatsapp", status: "failed", error: "Twilio 63016" }),
      outcome({ channel: "sms", status: "skipped", reason: "channel_off" }),
    ]);
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toBe("Twilio 63016");
  });

  it("gives one row per recipient, not one per channel", () => {
    // PaidSalesFeed and the test button both read this as "one entry per admin".
    const results = legacyResults([
      outcome({ staffId: "s-1", channel: "whatsapp", status: "sent" }),
      outcome({ staffId: "s-1", channel: "sms", status: "skipped", reason: "channel_off" }),
      outcome({ staffId: "s-2", channel: "whatsapp", status: "failed", error: "no number" }),
      outcome({ staffId: "s-2", channel: "bell", status: "sent" }),
    ]);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.admin_user_id === "s-1")!.status).toBe("sent");
    expect(results.find((r) => r.admin_user_id === "s-2")!.status).toBe("failed");
  });

  it("is empty when there are no recipients, rather than claiming a send", () => {
    expect(legacyResults([])).toEqual([]);
    // A bell-only dispatch is not a send either.
    expect(legacyResults([outcome({ channel: "bell", status: "sent" })])).toEqual([]);
  });
});

describe("one implementation, two doors", () => {
  const admin = stripComments(read("supabase/functions/notify-admin/index.ts"));
  const staff = stripComments(read("supabase/functions/notify-staff/index.ts"));

  it("notify-admin no longer decides anything itself", () => {
    // It formatted, POSTed to Twilio, and wrote notification_log by hand. All three are gone.
    expect(admin).not.toContain("api.twilio.com");
    expect(admin).not.toMatch(/from\("notification_log"\)/);
    expect(admin).not.toMatch(/from\("notification_settings"\)/);
    expect(admin).not.toContain("whatsapp_paid_sales");
    // The column that never existed, and the read that made EV07B silent.
    expect(admin).not.toContain("whatsapp_ev07b_alerts");
    expect(admin).not.toMatch(/shouldSend/);
  });

  it("both doors dispatch through the same router and the same runtime", () => {
    for (const [name, src] of [["notify-admin", admin], ["notify-staff", staff]] as const) {
      expect(src, name).toContain("dispatchNotifications(");
      expect(src, name).toContain("notify-staff-runtime.ts");
      expect(src, name).toContain("makeStore(db)");
    }
  });

  it("neither door carries its own copy of the store or the transports", () => {
    // The seventh copy of "who gets told" is what this whole feature exists to prevent.
    for (const [name, src] of [["notify-admin", admin], ["notify-staff", staff]] as const) {
      expect(src, name).not.toMatch(/function makeStore\(/);
      expect(src, name).not.toMatch(/function makeTransports\(/);
      expect(src, name).not.toMatch(/from\("staff"\)\s*\n?\s*\.select/);
    }
    const runtime = read("supabase/functions/_shared/notify-staff-runtime.ts");
    expect(runtime).toContain("export function makeStore(");
    expect(runtime).toContain("export function makeTransports(");
  });

  it("notify-admin sends to admins by role, and keeps Lee's configured WhatsApp number", () => {
    expect(admin).toMatch(/roles: \["admin", "super_admin"\]/);
    // notification_settings.whatsapp_number is still preferred for WhatsApp — the router's
    // `addressFor` does that, which is why "keep its behaviour" survives the audience change.
    const runtime = read("supabase/functions/_shared/notify-staff-runtime.ts");
    expect(runtime).toContain("whatsapp_number");
  });

  it("refuses an unknown event instead of answering success", () => {
    expect(admin).toMatch(/if \(!message \|\| !isNotifyEventType\(event_type\)\)/);
    expect(admin).toMatch(/return json\(400/);
    // The old shape: a `continue` inside the per-admin loop.
    expect(admin).not.toMatch(/^\s*continue;/m);
  });

  it("still identifies its caller before reading the body", () => {
    /*
      Compared on the CALL, inside the handler, not on the name: the first version measured
      `indexOf("identifyNotifyCaller")`, which finds the IMPORT at the top of the file — so
      moving the guard below the body read left it green. The name of a guard is not the guard,
      and this is the third time that has been true in this feature.

      Why the order matters: a non-admin must not get "Unknown event_type: x" back, because that
      answer enumerates which events exist for anyone with a login.
    */
    const handler = admin.slice(admin.indexOf("serve(async (req)"));
    expect(handler.indexOf("await identifyNotifyCaller(")).toBeGreaterThan(-1);
    expect(handler.indexOf("await identifyNotifyCaller(")).toBeLessThan(handler.indexOf("req.json()"));
    expect(handler.indexOf("if (!verdict.ok)")).toBeLessThan(handler.indexOf("req.json()"));
  });

  it("does not touch the SOS decision path", () => {
    // It notifies ABOUT alerts and escalations; it cannot change who is called or in what order.
    for (const forbidden of ["alert_escalations", "escalation_chains", "sos-escalation-runner"]) {
      expect(admin, forbidden).not.toContain(forbidden);
    }
  });
});
