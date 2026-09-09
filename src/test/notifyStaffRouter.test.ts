// @vitest-environment node
//
// ONE ROUTER, and the questions it has to answer without lying.
//
// WHAT WENT WRONG WITHOUT IT. "Who gets told" was decided in six places that did not know about
// each other, and the schema was a boolean COLUMN PER EVENT on a one-row-per-admin table. That
// produced the defect this router exists to make impossible: `notify-admin` reads
// `settings.whatsapp_ev07b_alerts`, a column NO MIGRATION EVER CREATED, so `undefined` makes
// `shouldSend` false and the EV07B WhatsApp alert has never sent — silently, since it shipped.
//
// SO EVERY TEST HERE IS ABOUT A NAMED OUTCOME. There is no assertion that "a notification was
// sent"; there are assertions that each recipient × channel produced exactly one decision, that
// each skip names WHICH of the three gates stopped it, and that the four events which mean the
// safety machinery has failed cannot be silenced by any switch.
//
// The pure planner is tested against fixtures; the dispatcher against injected transports that
// record what they were asked to send. Nothing here needs Twilio, Firebase or a database.

import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALWAYS_LOUD,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  addressFor,
  deriveIdempotencyKey,
  dispatchNotifications,
  emailFor,
  isAlwaysLoud,
  parseNotifyRequest,
  planNotifications,
  textFor,
  type ChannelConfigured,
  type ChannelFlags,
  type LogRow,
  type NotifyChannel,
  type NotifyEvent,
  type Planned,
  type PlannedSkip,
  type Pref,
  type Recipient,
  type Route,
  type Store,
  type Transports,
} from "../../supabase/functions/_shared/notify-staff";
import {
  fcmMessage,
  isDeadToken,
  jwtClaims,
  parseServiceAccount,
} from "../../supabase/functions/_shared/fcm";
import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const ALL_ON: ChannelFlags = { sms: true, whatsapp: true, push: true, email: true };
const ALL_CONFIGURED: ChannelConfigured = { sms: true, whatsapp: true, push: true, email: true };

/** Every route on, so a test that wants a gate closed closes exactly one. */
const routesAllOn = (): Route[] =>
  NOTIFY_EVENTS.flatMap((event_type) =>
    NOTIFY_CHANNELS.map((channel) => ({ event_type, channel, enabled: true })),
  );

const prefsAllOn = (staffIds: string[]): Pref[] =>
  staffIds.flatMap((staff_id) =>
    NOTIFY_EVENTS.flatMap((event_type) =>
      NOTIFY_CHANNELS.map((channel) => ({ staff_id, event_type, channel, enabled: true })),
    ),
  );

const admin = (over: Partial<Recipient> = {}): Recipient => ({
  staffId: "s-admin",
  userId: "u-admin",
  firstName: "Lee",
  role: "super_admin",
  email: "lee@icealarm.es",
  phone: "+34600000001",
  whatsappNumber: "+34600000009",
  pushTokens: [{ token: "tok-phone", platform: "ios" }],
  ...over,
});

const SALE: NotifyEvent = {
  type: "sale.paid",
  title: "New paid sale — €426.96",
  body: "Lena Link, couple membership, billed monthly.",
  link: "/admin/members/m-1",
  entity: { type: "order", id: "o-1" },
};

const decisionFor = (planned: Planned[], channel: NotifyChannel, staffId = "s-admin") =>
  planned.find((p) => p.channel === channel && p.staffId === staffId)!;
const reasonFor = (planned: Planned[], channel: NotifyChannel, staffId = "s-admin") =>
  (decisionFor(planned, channel, staffId) as PlannedSkip).reason;

// ── the event list is one list ─────────────────────────────────────────────
describe("the event types", () => {
  it("cover the eight the brief names and the eleven notify-admin already sends", () => {
    for (const required of [
      "sale.paid", "lead.new", "payment.failed", "subscription.cancelled",
      "sos.opened", "sos.unassigned", "device.offline", "isabella.down",
    ]) {
      expect(NOTIFY_EVENTS, required).toContain(required);
    }
    for (const legacy of [
      "partner.joined", "hot.sales", "ev07b.alert", "shift.no_show", "shift.no_coverage",
      "shift.disconnected", "system.runner_failure", "escalation.call_failed",
      "escalation.no_emergency_contacts", "escalation.contacts_not_notified", "test",
    ]) {
      expect(NOTIFY_EVENTS, legacy).toContain(legacy);
    }
    expect(new Set(NOTIFY_EVENTS).size).toBe(NOTIFY_EVENTS.length);
  });

  it("every event notify-admin can be asked for is one the router knows", () => {
    // The migration's contract: notify-admin's WhatsApp path moves onto the router, so an event
    // type it accepts and the router refuses would be a 400 where a WhatsApp used to arrive.
    const legacy = stripComments(read("supabase/functions/notify-admin/index.ts"));
    const declared = [...legacy.matchAll(/case "([a-z0-9_.]+)":/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(8);
    for (const t of declared) expect(NOTIFY_EVENTS, `notify-admin sends ${t}`).toContain(t);
  });

  it("MATCHES the SQL CHECK list, when the migration is in this branch", () => {
    /*
      A mirror, asserted where both halves exist. The migration is in a HELD PR (schema goes to
      one held PR by instruction) while the router merges now, so this guards on the file rather
      than reading a path from another branch — a test that read one would simply be red on main.
      The moment the migration lands, this becomes a strict comparison.
    */
    const migration = "supabase/migrations/20260909120000_notify_staff.sql";
    if (!existsSync(join(ROOT, migration))) {
      expect(existsSync(join(ROOT, migration))).toBe(false);
      return;
    }
    const sql = read(migration);
    const block = sql.slice(sql.indexOf("event_type text NOT NULL CHECK"), sql.indexOf("channel text NOT NULL CHECK"));
    const inSql = [...block.matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
    expect([...inSql].sort()).toEqual([...NOTIFY_EVENTS].sort());
  });
});

// ── the three gates, and which one is reported ─────────────────────────────
describe("the three gates", () => {
  const plan = (over: {
    flags?: Partial<ChannelFlags>;
    configured?: Partial<ChannelConfigured>;
    routes?: Route[];
    prefs?: Pref[];
    recipients?: Recipient[];
    event?: NotifyEvent;
    alreadySent?: Set<string>;
  } = {}) =>
    planNotifications({
      event: over.event ?? SALE,
      recipients: over.recipients ?? [admin()],
      routes: over.routes ?? routesAllOn(),
      prefs: over.prefs ?? prefsAllOn(["s-admin"]),
      flags: { ...ALL_ON, ...over.flags },
      configured: { ...ALL_CONFIGURED, ...over.configured },
      alreadySent: over.alreadySent,
    });

  it("produces exactly one decision per recipient per channel — never fewer", () => {
    // A channel missing from the list would be a silence, and silence is the defect.
    const planned = plan({ recipients: [admin(), admin({ staffId: "s-2", userId: "u-2" })] });
    expect(planned).toHaveLength(2 * NOTIFY_CHANNELS.length);
    for (const channel of NOTIFY_CHANNELS) {
      expect(planned.filter((p) => p.channel === channel), channel).toHaveLength(2);
    }
  });

  it("sends on all four when every gate is open", () => {
    expect(plan().every((p) => p.send)).toBe(true);
  });

  it("gate 1: Lee's transport switch off is reported as channel_off", () => {
    const planned = plan({ flags: { sms: false } });
    expect(reasonFor(planned, "sms")).toBe("channel_off");
    expect(decisionFor(planned, "whatsapp").send).toBe(true);
  });

  it("gate 1: a transport with no credentials is not_configured, which is a different fix", () => {
    expect(reasonFor(plan({ configured: { push: false } }), "push")).toBe("not_configured");
  });

  it("the transport is reported BEFORE a missing address — one of them is the action", () => {
    // "Turn SMS on" is the fix; naming a missing phone number instead sends somebody hunting
    // for the wrong thing.
    const planned = plan({ flags: { sms: false }, recipients: [admin({ phone: null })] });
    expect(reasonFor(planned, "sms")).toBe("channel_off");
  });

  it("gate 2: a route the company has not turned on is route_off", () => {
    const routes = routesAllOn().map((r) =>
      r.event_type === "sale.paid" && r.channel === "sms" ? { ...r, enabled: false } : r,
    );
    expect(reasonFor(plan({ routes }), "sms")).toBe("route_off");
  });

  it("gate 2: a MISSING route row reads as off — a new event type does not start shouting", () => {
    const routes = routesAllOn().filter((r) => !(r.event_type === "sale.paid" && r.channel === "email"));
    expect(reasonFor(plan({ routes }), "email")).toBe("route_off");
  });

  it("gate 3: the person's own switch is pref_off", () => {
    const prefs = prefsAllOn(["s-admin"]).map((p) =>
      p.event_type === "sale.paid" && p.channel === "whatsapp" ? { ...p, enabled: false } : p,
    );
    expect(reasonFor(plan({ prefs }), "whatsapp")).toBe("pref_off");
  });

  it("gate 3: a MISSING preference row reads as off, not as consent", () => {
    const prefs = prefsAllOn(["s-admin"]).filter((p) => p.channel !== "push");
    expect(reasonFor(plan({ prefs }), "push")).toBe("pref_off");
  });

  it("nobody to send to is no_address, per channel", () => {
    const planned = plan({
      recipients: [admin({ phone: null, whatsappNumber: null, email: null, pushTokens: [] })],
    });
    for (const channel of NOTIFY_CHANNELS) {
      expect(reasonFor(planned, channel), channel).toBe("no_address");
    }
  });

  it("an identical send that already succeeded is already_sent, not a second SMS", () => {
    const planned = plan({ alreadySent: new Set(["sms:+34600000001"]) });
    expect(reasonFor(planned, "sms")).toBe("already_sent");
    expect(decisionFor(planned, "email").send).toBe(true);
  });
});

// ── the four no switch may silence ─────────────────────────────────────────
describe("the events that say the safety machinery has failed", () => {
  const LOUD: NotifyEvent = {
    type: "escalation.call_failed",
    title: "Escalation call failed",
    body: "Level 2 could not reach a human for alert a-1.",
    entity: { type: "alert", id: "a-1" },
  };

  it("is exactly the four notify-admin sends ungated", () => {
    expect([...ALWAYS_LOUD].sort()).toEqual([
      "escalation.call_failed",
      "escalation.contacts_not_notified",
      "escalation.no_emergency_contacts",
      "system.runner_failure",
    ]);
    for (const t of ALWAYS_LOUD) expect(isAlwaysLoud(t)).toBe(true);
    expect(isAlwaysLoud("sale.paid")).toBe(false);
  });

  it("SEND EVEN WITH EVERY ROUTE AND EVERY PREFERENCE OFF", () => {
    // The load-bearing assertion of this file. A preferences table that could silence the alarm
    // saying the SOS ladder is broken would be worse than no preferences table.
    const planned = planNotifications({
      event: LOUD,
      recipients: [admin()],
      routes: routesAllOn().map((r) => ({ ...r, enabled: false })),
      prefs: prefsAllOn(["s-admin"]).map((p) => ({ ...p, enabled: false })),
      flags: ALL_ON,
      configured: ALL_CONFIGURED,
    });
    expect(planned.every((p) => p.send)).toBe(true);
  });

  it("and with no route or preference rows at all", () => {
    const planned = planNotifications({
      event: LOUD,
      recipients: [admin()],
      routes: [],
      prefs: [],
      flags: ALL_ON,
      configured: ALL_CONFIGURED,
    });
    expect(planned.every((p) => p.send)).toBe(true);
  });

  it("but an UNCONFIGURED transport still cannot send — that is physics, not policy", () => {
    const planned = planNotifications({
      event: LOUD,
      recipients: [admin()],
      routes: [],
      prefs: [],
      flags: { ...ALL_ON, sms: false },
      configured: { ...ALL_CONFIGURED, whatsapp: false },
      alreadySent: new Set(),
    });
    expect(reasonFor(planned, "sms")).toBe("channel_off");
    expect(reasonFor(planned, "whatsapp")).toBe("not_configured");
    expect(decisionFor(planned, "push").send).toBe(true);
  });

  it("every ordinary event IS silenced by its route — the bypass is not a hole", () => {
    for (const type of NOTIFY_EVENTS.filter((t) => !isAlwaysLoud(t))) {
      const planned = planNotifications({
        event: { ...SALE, type },
        recipients: [admin()],
        routes: [],
        prefs: [],
        flags: ALL_ON,
        configured: ALL_CONFIGURED,
      });
      expect(planned.every((p) => !p.send), type).toBe(true);
    }
  });
});

// ── addresses and idempotency ──────────────────────────────────────────────
describe("where a channel sends", () => {
  it("WhatsApp prefers the configured number over the staff mobile", () => {
    // notify-admin sends to notification_settings.whatsapp_number today; "keep its behaviour"
    // means the number Lee configured there keeps receiving WhatsApp.
    expect(addressFor("whatsapp", admin())).toBe("+34600000009");
    expect(addressFor("sms", admin())).toBe("+34600000001");
  });

  it("falls back to the mobile when no WhatsApp number is configured", () => {
    expect(addressFor("whatsapp", admin({ whatsappNumber: null }))).toBe("+34600000001");
  });

  it("treats blank and whitespace as no address", () => {
    expect(addressFor("sms", admin({ phone: "   " }))).toBeNull();
    expect(addressFor("email", admin({ email: "" }))).toBeNull();
    expect(addressFor("push", admin({ pushTokens: [] }))).toBeNull();
  });

  it("counts devices for push, because a person has more than one", () => {
    expect(
      addressFor("push", admin({ pushTokens: [
        { token: "a", platform: "ios" },
        { token: "b", platform: "web" },
      ] })),
    ).toBe("2 device(s)");
  });
});

describe("the idempotency key", () => {
  it("is the event and its entity — a retry is the same notification", () => {
    expect(deriveIdempotencyKey(SALE)).toBe("sale.paid:order:o-1");
  });

  it("honours an explicit key", () => {
    expect(deriveIdempotencyKey({ ...SALE, idempotencyKey: "custom" })).toBe("custom");
  });

  it("is NULL with no entity rather than something made up", () => {
    // A key containing a timestamp deduplicates nothing and would be a lie about what the
    // unique index protects.
    expect(deriveIdempotencyKey({ ...SALE, entity: undefined })).toBeNull();
  });
});

// ── the dispatcher: what it sends, and what it writes down ─────────────────
describe("dispatchNotifications", () => {
  interface Recorded { sms: string[][]; whatsapp: string[][]; email: string[][]; push: string[][] }

  function harness(over: {
    recipients?: Recipient[];
    routes?: Route[];
    prefs?: Pref[];
    flags?: Partial<ChannelFlags>;
    configured?: Partial<ChannelConfigured>;
    smsFails?: boolean;
    pushDead?: string[];
    alreadySent?: Set<string>;
  } = {}) {
    const recipients = over.recipients ?? [admin()];
    const sent: Recorded = { sms: [], whatsapp: [], email: [], push: [] };
    const logged: LogRow[] = [];
    const pruned: string[] = [];

    const transports: Transports = {
      async sms(to, text) {
        sent.sms.push([to, text]);
        return over.smsFails ? { ok: false, error: "twilio 500" } : { ok: true, providerMessageId: "SM1" };
      },
      async whatsapp(to, text) {
        sent.whatsapp.push([to, text]);
        return { ok: true, providerMessageId: "WA1" };
      },
      async email(to, subject) {
        sent.email.push([to, subject]);
        return { ok: true };
      },
      async push(tokens) {
        sent.push.push(tokens);
        return tokens.map((token) => ({
          token,
          ok: !(over.pushDead ?? []).includes(token),
          invalid: (over.pushDead ?? []).includes(token),
          error: (over.pushDead ?? []).includes(token) ? "fcm 404 (token pruned)" : undefined,
        }));
      },
    };

    const store: Store = {
      recipients: async () => recipients,
      routes: async () => over.routes ?? routesAllOn(),
      prefs: async () => over.prefs ?? prefsAllOn(recipients.map((r) => r.staffId)),
      flags: async () => ({ ...ALL_ON, ...over.flags }),
      alreadySent: async () => over.alreadySent ?? new Set(),
      log: async (rows) => { logged.push(...rows); },
      pruneToken: async (t) => { pruned.push(t); },
    };

    return { transports, store, sent, logged, pruned, configured: { ...ALL_CONFIGURED, ...over.configured } };
  }

  it("sends on every open channel and writes one row per decision", async () => {
    const h = harness();
    const result = await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports,
      store: h.store,
      configured: h.configured,
      siteUrl: "https://icealarm.es",
    });

    expect(h.sent.sms).toHaveLength(1);
    expect(h.sent.whatsapp).toHaveLength(1);
    expect(h.sent.email).toHaveLength(1);
    expect(h.sent.push).toEqual([["tok-phone"]]);

    // Four channels + the bell.
    expect(h.logged.map((r) => r.channel).sort()).toEqual(["bell", "email", "push", "sms", "whatsapp"]);
    expect(result.outcomes.filter((o) => o.status === "sent")).toHaveLength(5);
  });

  it("the SMS carries the title, the body and the link as a real URL", async () => {
    const h = harness();
    await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured, siteUrl: "https://icealarm.es",
    });
    const [, text] = h.sent.sms[0];
    expect(text).toContain(SALE.title);
    expect(text).toContain(SALE.body);
    expect(text).toContain("https://icealarm.es/admin/members/m-1");
  });

  it("EVERY SKIP IS A ROW, with the gate that stopped it", async () => {
    // "It didn't arrive" must be answerable from the table, not from Deno logs nobody keeps.
    const h = harness({ flags: { sms: false }, configured: { push: false } });
    await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });

    const sms = h.logged.find((r) => r.channel === "sms")!;
    expect(sms.status).toBe("skipped");
    expect(sms.error).toBe("channel_off");
    const push = h.logged.find((r) => r.channel === "push")!;
    expect(push.status).toBe("skipped");
    expect(push.error).toBe("not_configured");
    expect(h.sent.sms).toEqual([]);
    expect(h.sent.push).toEqual([]);
  });

  it("a failed send is logged as failed with the provider's reason, and does not stop the rest", async () => {
    const h = harness({ smsFails: true });
    const result = await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });
    const sms = h.logged.find((r) => r.channel === "sms")!;
    expect(sms.status).toBe("failed");
    expect(sms.error).toBe("twilio 500");
    expect(h.sent.email).toHaveLength(1);
    expect(result.outcomes.find((o) => o.channel === "sms")?.status).toBe("failed");
  });

  it("writes a bell row per recipient, and the bell is not one of the gated channels", async () => {
    // The bell is in-app, costs nothing, and is how a notification survives a phone in a drawer.
    const h = harness({ flags: { sms: false, whatsapp: false, push: false, email: false } });
    await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });
    const bell = h.logged.filter((r) => r.channel === "bell");
    expect(bell).toHaveLength(1);
    expect(bell[0].admin_user_id).toBe("u-admin");
    expect(bell[0].status).toBe("pending");
  });

  it("does NOT write bell rows when a trigger already did — lead.new", async () => {
    // The AFTER INSERT trigger on `leads` raises one bell row per active staff member, which is
    // broader than this router's audience. Writing a second set would double every enquiry in
    // the bell.
    const h = harness();
    await dispatchNotifications(
      { type: "lead.new", title: "New enquiry", body: "from Albox", bellWrittenElsewhere: true },
      { roles: ["admin"] },
      { transports: h.transports, store: h.store, configured: h.configured },
    );
    expect(h.logged.filter((r) => r.channel === "bell")).toHaveLength(0);
    expect(h.sent.sms).toHaveLength(1);
  });

  it("prunes a token FCM rejected, and logs the send per token rather than per person", async () => {
    const h = harness({
      recipients: [admin({ pushTokens: [
        { token: "tok-live", platform: "ios" },
        { token: "tok-dead", platform: "web" },
      ] })],
      pushDead: ["tok-dead"],
    });
    const result = await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });

    expect(h.pruned).toEqual(["tok-dead"]);
    expect(result.prunedTokens).toEqual(["tok-dead"]);
    const pushRows = h.logged.filter((r) => r.channel === "push");
    expect(pushRows).toHaveLength(2);
    // The token, not "2 device(s)": "sent, but where?" has to be answerable.
    expect(pushRows.map((r) => r.recipient).sort()).toEqual(["tok-dead", "tok-live"]);
    expect(pushRows.find((r) => r.recipient === "tok-dead")!.status).toBe("failed");
  });

  it("carries the idempotency key onto every row, so a retry can find them", async () => {
    const h = harness();
    await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });
    expect(h.logged.every((r) => r.idempotency_key === "sale.paid:order:o-1")).toBe(true);
    expect(h.logged.every((r) => r.entity_type === "order" && r.entity_id === "o-1")).toBe(true);
  });

  it("logs ONCE, at the end — a half-logged dispatch is worse than a slow one", async () => {
    const h = harness();
    const spy = vi.spyOn(h.store, "log");
    await dispatchNotifications(SALE, { roles: ["admin"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("sends to two recipients independently — one person's gate is not everybody's", async () => {
    const other = admin({ staffId: "s-op", userId: "u-op", email: "op@icealarm.es", phone: "+34600000002", whatsappNumber: null, pushTokens: [] });
    const prefs = prefsAllOn(["s-admin", "s-op"]).map((p) =>
      p.staff_id === "s-op" && p.channel === "sms" ? { ...p, enabled: false } : p,
    );
    const h = harness({ recipients: [admin(), other], prefs });
    await dispatchNotifications(SALE, { roles: ["admin", "call_centre"] }, {
      transports: h.transports, store: h.store, configured: h.configured,
    });

    expect(h.sent.sms.map(([to]) => to)).toEqual(["+34600000001"]);
    expect(h.sent.email.map(([to]) => to).sort()).toEqual(["lee@icealarm.es", "op@icealarm.es"]);
    const opSms = h.logged.find((r) => r.channel === "sms" && r.recipient === "+34600000002");
    expect(opSms?.error).toBe("pref_off");
  });
});

// ── the message bodies ─────────────────────────────────────────────────────
describe("what a phone shows", () => {
  it("the text has no link when there is no site URL to build one from", () => {
    expect(textFor(SALE)).not.toContain("http");
    expect(textFor(SALE)).toContain(SALE.title);
  });

  it("the email escapes what it interpolates", () => {
    const { html, subject } = emailFor(
      { ...SALE, title: '<script>x</script>', body: "A & B" },
      "https://icealarm.es",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(subject).toContain("ICE Alarm España");
  });

  it("the email links the event, so it is one tap from the inbox to the record", () => {
    expect(emailFor(SALE, "https://icealarm.es").html)
      .toContain("https://icealarm.es/admin/members/m-1");
  });
});

// ── FCM: the parts that must be right before anything is sent ──────────────
describe("the FCM credential", () => {
  const SA = JSON.stringify({
    project_id: "ice-alarm",
    client_email: "fcm@ice-alarm.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n",
  });

  it("an ABSENT secret is 'not configured', not an error", () => {
    // The router reports `not_configured` and carries on; that is a legitimate state.
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("   ")).toBeNull();
  });

  it("a MALFORMED secret throws, naming what is wrong", () => {
    // Treating a typo as "not configured" would hide it behind a skip nobody investigates.
    expect(() => parseServiceAccount("not json")).toThrow(/not valid JSON/);
    expect(() => parseServiceAccount('{"project_id":"x"}')).toThrow(/client_email, private_key/);
  });

  it("un-escapes the newlines a dashboard paste turns into backslash-n", () => {
    // Left unhandled, importKey fails with "invalid keyData" and says nothing about why.
    const sa = parseServiceAccount(SA)!;
    expect(sa.private_key).toContain("\n");
    expect(sa.private_key).not.toContain("\\n");
  });

  it("the JWT claims are the ones Google's token endpoint accepts", () => {
    const claims = jwtClaims(parseServiceAccount(SA)!, 1_700_000_000);
    expect(claims.iss).toBe("fcm@ice-alarm.iam.gserviceaccount.com");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/firebase.messaging");
    // One hour is the maximum; longer is rejected as invalid_grant.
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

describe("the FCM message", () => {
  it("carries the link in BOTH places FCM reads it from", () => {
    // The service worker reads webpush.fcm_options.link; the foreground handler reads data.
    // Sending only one is how "tapping it does nothing" happens.
    const msg = fcmMessage("tok", SALE, "https://icealarm.es").message;
    expect(msg.webpush.fcm_options?.link).toBe("https://icealarm.es/admin/members/m-1");
    expect(msg.data.link).toBe("/admin/members/m-1");
    expect(msg.token).toBe("tok");
    expect(msg.notification).toEqual({ title: SALE.title, body: SALE.body });
  });

  it("tags by event type, so six device-offline cards do not stack on a lock screen", () => {
    expect(fcmMessage("tok", SALE).message.webpush.notification.tag).toBe("sale.paid");
  });

  it("omits the link entirely when there is nothing to open", () => {
    const msg = fcmMessage("tok", { ...SALE, link: undefined }).message;
    expect(msg.webpush.fcm_options).toBeUndefined();
    expect(msg.data.link).toBeUndefined();
  });
});

describe("is this token dead", () => {
  it("404 UNREGISTERED is dead — the app was uninstalled", () => {
    expect(isDeadToken(404, { error: { status: "NOT_FOUND" } })).toBe(true);
  });

  it("400 INVALID_ARGUMENT is dead — that is not a token", () => {
    expect(isDeadToken(400, { error: { status: "INVALID_ARGUMENT" } })).toBe(true);
    expect(isDeadToken(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } })).toBe(true);
  });

  it("401, 429 and 500 are OUR problem and the token SURVIVES", () => {
    // Deleting somebody's device because Google had a bad minute would silently stop their
    // alerts, and nothing would say so.
    expect(isDeadToken(401, { error: { status: "UNAUTHENTICATED" } })).toBe(false);
    expect(isDeadToken(429, {})).toBe(false);
    expect(isDeadToken(500, {})).toBe(false);
    expect(isDeadToken(400, { error: { status: "QUOTA_EXCEEDED" } })).toBe(false);
  });
});

// ── the request contract, executed ────────────────────────────────────────
describe("parseNotifyRequest", () => {
  const valid = {
    event: { type: "sale.paid", title: "New sale", body: "€426.96" },
    audience: { roles: ["admin"] },
  };

  it("accepts a well-formed request and trims the copy", () => {
    const parsed = parseNotifyRequest({
      event: { type: "sale.paid", title: "  New sale  ", body: " €426.96 " },
      audience: { staffIds: ["s-1"] },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.event.title).toBe("New sale");
    expect(parsed.request.event.body).toBe("€426.96");
    expect(parsed.request.audience.staffIds).toEqual(["s-1"]);
  });

  it("REFUSES an event type it does not know, by code", () => {
    // The mutation this replaces: deleting the type check left the error STRING in the file and
    // the old source-scan assertion passed.
    for (const type of ["sale.invented", "", null, 42, undefined]) {
      const parsed = parseNotifyRequest({ ...valid, event: { ...valid.event, type } });
      expect(parsed.ok, String(type)).toBe(false);
      if (!parsed.ok) expect(parsed.problem.code).toBe("UNKNOWN_EVENT_TYPE");
    }
  });

  it("accepts every type the router declares — the list is the contract", () => {
    for (const type of NOTIFY_EVENTS) {
      expect(parseNotifyRequest({ ...valid, event: { ...valid.event, type } }).ok, type).toBe(true);
    }
  });

  it("REFUSES an audience of nobody", () => {
    for (const audience of [undefined, {}, { roles: [] }, { staffIds: [] }, { roles: [], staffIds: [] }]) {
      const parsed = parseNotifyRequest({ ...valid, audience });
      expect(parsed.ok, JSON.stringify(audience)).toBe(false);
      if (!parsed.ok) expect(parsed.problem.code).toBe("NO_AUDIENCE");
    }
  });

  it("REFUSES a notification with no words — a push with no words is a buzz", () => {
    for (const event of [
      { type: "sale.paid", title: "", body: "x" },
      { type: "sale.paid", title: "x", body: "   " },
      { type: "sale.paid", title: "x" },
    ]) {
      const parsed = parseNotifyRequest({ ...valid, event });
      expect(parsed.ok, JSON.stringify(event)).toBe(false);
      if (!parsed.ok) expect(parsed.problem.code).toBe("MISSING_COPY");
    }
  });

  it("REFUSES a body that is not an object at all", () => {
    for (const body of [null, undefined, "", "sale.paid", 7]) {
      const parsed = parseNotifyRequest(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.problem.code).toBe("BAD_BODY");
    }
  });

  it("carries the optional fields through, and invents none", () => {
    const parsed = parseNotifyRequest({
      event: { ...valid.event, link: "/admin/x", entity: { type: "order", id: "o-1" }, bellWrittenElsewhere: true },
      audience: { roles: ["admin"] },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.event.link).toBe("/admin/x");
    expect(parsed.request.event.entity).toEqual({ type: "order", id: "o-1" });
    expect(parsed.request.event.bellWrittenElsewhere).toBe(true);
    expect(deriveIdempotencyKey(parsed.request.event)).toBe("sale.paid:order:o-1");
  });
});

// ── the function's own contract ────────────────────────────────────────────
describe("the notify-staff function", () => {
  const fn = stripComments(read("supabase/functions/notify-staff/index.ts"));

  it("accepts the service role and an admin, and nobody else", () => {
    expect(fn).toContain("bearer === serviceRoleKey");
    expect(fn).toContain('["admin", "super_admin"].includes(staff.role)');
    expect(fn).toContain("Admin access required");
    // An operator who could post here could text the whole company.
    expect(fn).not.toMatch(/is_staff|isStaff/);
  });

  it("delegates its request contract to the executable validator, and acts on the answer", () => {
    /*
      Pinned as the CALL and the BRANCH, not as the word.

      `expect(fn).toContain("parseNotifyRequest")` was the first version, and a mutation that
      replaced the call with `{ ok: true, request: await req.json() } as ReturnType<typeof
      parseNotifyRequest>` — i.e. no validation at all — kept the word and stayed green. The
      name of a guard is not the guard.
    */
    expect(fn).toMatch(/parseNotifyRequest\(await req\.json\(\)/);
    expect(fn).toMatch(/if \(!parsed\.ok\)[\s\S]{0,120}?return json\(400/);
    expect(fn).not.toMatch(/as ReturnType<typeof parseNotifyRequest>/);
    expect(fn).not.toMatch(/isEventType\(/);
  });

  it("resolves recipients from ACTIVE staff only — in the recipients query, not just the auth check", () => {
    /*
      TWO `.eq("is_active", true)` calls in this file: one checks the CALLER is an active staff
      member, one filters the RECIPIENTS. A regex looking for the string found the first and
      passed while a mutation deleted the second — so this asserts both, and asserts the
      recipient one inside the function that resolves recipients.
    */
    expect(fn.match(/\.eq\("is_active", true\)/g) ?? []).toHaveLength(2);
    const recipients = fn.slice(fn.indexOf("async recipients("), fn.indexOf("async routes("));
    expect(recipients).toContain('.eq("is_active", true)');
    expect(recipients).toContain('from("staff")');
  });

  it("reads all three gates from tables, never from code", () => {
    expect(fn).toContain('from("notification_routes")');
    expect(fn).toContain('from("staff_notification_prefs")');
    expect(fn).toContain("notify_channel_");
  });

  it("prunes a dead token by deleting the row", () => {
    expect(fn).toMatch(/from\("staff_push_tokens"\)\s*\.delete\(\)/);
  });

  it("does not touch the SOS decision path", () => {
    // It sends notifications ABOUT alerts and cannot change who is called or in what order.
    for (const forbidden of ["alert_escalations", "escalation_chains", "sos-escalation-runner"]) {
      expect(fn, forbidden).not.toContain(forbidden);
    }
  });

  it("builds its redirect base server-side, never from the request", () => {
    expect(fn).toContain("PUBLIC_SITE_URL");
    expect(fn).not.toMatch(/siteUrl:\s*body\./);
  });
});
