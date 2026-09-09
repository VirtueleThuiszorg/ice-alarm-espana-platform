// @vitest-environment node
//
// THE ROUTER MUST NOT LOSE THE ALARMS BECAUSE A MIGRATION IS UNAPPLIED.
//
// WHAT HAPPENED. `notify-admin` was migrated onto the router (#277) while
// `20260909121500_notify_staff.sql` was still not in production. `routes()` threw on the missing
// table, `dispatchNotifications` propagated it, the function answered 500 — and every one of
// notify-admin's TWELVE events stopped, INCLUDING THE FOUR THAT SAY THE SAFETY MACHINERY HAS
// FAILED:
//
//     system.runner_failure              — the escalation runner is dead
//     escalation.call_failed             — a rung of the SOS ladder did not reach a human
//     escalation.no_emergency_contacts   — nobody can be called for this member
//     escalation.contacts_not_notified   — contacts exist and none was reached
//
// Every caller wraps its call in a try/catch and logs, which is right — a notification must not
// break an SOS escalation — so the loss was SILENT. Ten callers, one 500, no alarms, nothing
// said.
//
// A missing table now means what it says: no policy rows and no preference rows exist. Both read
// as off, which is what the planner does with an absent row anyway — and the four always-loud
// events bypass those gates, so they still send. Any OTHER error still throws, because "the
// query was refused" and "the table is empty" must never look the same.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isMissingColumn,
  isMissingRelation,
} from "../../supabase/functions/_shared/pg-errors";
import {
  ALWAYS_LOUD,
  NOTIFY_CHANNELS,
  dispatchNotifications,
  planNotifications,
  type LogRow,
  type NotifyEvent,
  type Recipient,
  type Store,
  type Transports,
} from "../../supabase/functions/_shared/notify-staff";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const RECIPIENT: Recipient = {
  staffId: "s-1",
  userId: "u-1",
  firstName: "Lee",
  role: "super_admin",
  email: "lee@example.com",
  phone: "+34600000000",
  whatsappNumber: "+34600000000",
  pushTokens: [{ token: "t-1", platform: "ios" }],
};

describe("telling the two kinds of error apart", () => {
  it("recognises a missing TABLE from Postgres and from PostgREST", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205" })).toBe(true);
    // PostgREST's schema cache has worded this differently between versions, so the message is
    // checked as well as the code.
    expect(isMissingRelation({ message: 'relation "public.notification_routes" does not exist' })).toBe(true);
    expect(isMissingRelation({ message: "Could not find the table 'public.notification_routes' in the schema cache" })).toBe(true);
  });

  it("does NOT mistake a refusal, a timeout or RLS for a missing table", () => {
    /*
      The distinction that matters. If a permission denial read as "no rows", the router would
      silently route nothing and report every channel as `route_off` — a misconfiguration
      rendered as a policy decision, which is the failure mode this whole feature exists to
      remove.
    */
    expect(isMissingRelation({ code: "42501", message: "permission denied for table notification_routes" })).toBe(false);
    expect(isMissingRelation({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isMissingRelation({ message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingRelation({ message: "new row violates row-level security policy" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation({})).toBe(false);
  });

  it("recognises a missing COLUMN separately", () => {
    expect(isMissingColumn({ code: "42703" })).toBe(true);
    expect(isMissingColumn({ code: "PGRST204" })).toBe(true);
    expect(isMissingColumn({ message: "Could not find the 'channel' column of 'notification_log' in the schema cache" })).toBe(true);
    // A missing table is not a missing column: the two need different recoveries.
    expect(isMissingColumn({ code: "42P01" })).toBe(false);
    expect(isMissingColumn({ code: "42501" })).toBe(false);
  });
});

// ── the behaviour that matters, driven through the real dispatcher ──────────
function storeWith(opts: { routes?: "missing" | "refused"; logged: LogRow[][] }): Store {
  return {
    recipients: async () => [RECIPIENT],
    routes: async () => {
      if (opts.routes === "refused") throw { code: "42501", message: "permission denied" };
      // "missing" behaves as the patched runtime does: no rows.
      return [];
    },
    prefs: async () => [],
    flags: async () => ({ sms: true, whatsapp: true, push: true, email: true }),
    alreadySent: async () => new Set<string>(),
    log: async (rows) => {
      opts.logged.push(rows);
    },
    pruneToken: async () => {},
  };
}

function transportsThatRecord() {
  const sent: Array<{ channel: string; to: string }> = [];
  const transports: Transports = {
    sms: async (to) => {
      sent.push({ channel: "sms", to });
      return { ok: true };
    },
    whatsapp: async (to) => {
      sent.push({ channel: "whatsapp", to });
      return { ok: true };
    },
    email: async (to) => {
      sent.push({ channel: "email", to });
      return { ok: true };
    },
    push: async (tokens) => {
      for (const token of tokens) sent.push({ channel: "push", to: token });
      return tokens.map((token) => ({ token, ok: true }));
    },
  };
  return { transports, sent };
}

describe("with the tables missing, the alarms still sound", () => {
  const ALL_CONFIGURED = { sms: true, whatsapp: true, push: true, email: true };

  it("sends every ALWAYS_LOUD event with no routes and no preferences at all", async () => {
    for (const type of ALWAYS_LOUD) {
      const logged: LogRow[][] = [];
      const { transports, sent } = transportsThatRecord();
      const event: NotifyEvent = { type, title: "SAFETY", body: "the machinery has failed" };

      await dispatchNotifications(event, { roles: ["admin"] }, {
        transports,
        store: storeWith({ logged }),
        configured: ALL_CONFIGURED,
      });

      // All four gated channels, not just one: an unconfigured route table must not narrow the
      // alarm to whichever channel happened to be seeded.
      expect(sent.map((s) => s.channel).sort(), type).toEqual(["email", "push", "sms", "whatsapp"].sort());
    }
  });

  it("and a paid sale is skipped as route_off, not as an error", async () => {
    // The honest degradation: nothing is routed, every skip names the gate, and the bell row is
    // still written — so "why did nobody get this" is answerable from the table.
    const logged: LogRow[][] = [];
    const { transports, sent } = transportsThatRecord();

    const result = await dispatchNotifications(
      { type: "sale.paid", title: "PAID SALE", body: "€39.90" },
      { roles: ["admin"] },
      { transports, store: storeWith({ logged }), configured: ALL_CONFIGURED },
    );

    expect(sent).toEqual([]);
    for (const channel of NOTIFY_CHANNELS) {
      const outcome = result.outcomes.find((o) => o.channel === channel)!;
      expect(outcome.status, channel).toBe("skipped");
      expect(outcome.reason, channel).toBe("route_off");
    }
    // The bell is not one of the gated channels and is written regardless.
    expect(result.outcomes.some((o) => o.channel === "bell" && o.status === "sent")).toBe(true);
  });

  it("but a REFUSED read still throws — it is not an empty table", async () => {
    const logged: LogRow[][] = [];
    const { transports } = transportsThatRecord();
    await expect(
      dispatchNotifications(
        { type: "sale.paid", title: "PAID SALE", body: "€39.90" },
        { roles: ["admin"] },
        { transports, store: storeWith({ routes: "refused", logged }), configured: ALL_CONFIGURED },
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("the planner treats an absent route row as off anyway, which is why this is safe", () => {
    // The degradation is not a special case bolted on: no rows has always meant no routes.
    const planned = planNotifications({
      event: { type: "sale.paid", title: "t", body: "b" },
      recipients: [RECIPIENT],
      routes: [],
      prefs: [],
      flags: { sms: true, whatsapp: true, push: true, email: true },
      configured: ALL_CONFIGURED,
    });
    expect(planned.every((p) => !p.send)).toBe(true);
    expect(planned.every((p) => !p.send && p.reason === "route_off")).toBe(true);
  });
});

// ── the log, and the bell that reads it ────────────────────────────────────
describe("the bell survives the migration not being applied", () => {
  const runtime = stripComments(read("supabase/functions/_shared/notify-staff-runtime.ts"));

  it("retries the insert without the three new columns", () => {
    /*
      PostgREST rejects the WHOLE insert for one unknown column, so pre-migration not a single
      row lands — and the bell reads this table. It is the only channel that needs no secret, and
      it is how a notification survives a phone being in a drawer.
    */
    const log = runtime.slice(runtime.indexOf("async log("), runtime.indexOf("async pruneToken("));
    expect(log).toContain("isMissingColumn(error)");
    expect(log).toMatch(/const legacy = rows\.map\(\(\{ channel, recipient, idempotency_key, \.\.\.rest \}\)/);
    expect(log).toMatch(/\.from\("notification_log"\)\.insert\(legacy\)/);
    // The channel is not lost — it moves into the message, because a reader of an old-shaped row
    // still needs to know whether it was a bell entry or an SMS attempt.
    expect(log).toMatch(/\[\$\{channel\}\] \$\{rest\.message\}/);
    // A bell row keeps its text exactly, so the bell feed does not suddenly read "[bell] …".
    expect(log).toMatch(/channel === "bell" \? rest :/);
  });

  it("does not retry a failure that has nothing to do with columns", () => {
    const log = runtime.slice(runtime.indexOf("async log("), runtime.indexOf("async pruneToken("));
    // One retry, for one reason. A blind retry on any error doubles every logged row.
    expect(log.match(/\.insert\(/g) ?? []).toHaveLength(2);
    expect(log).toMatch(/console\.error\("notify-staff: notification_log insert failed:/);
  });

  it("cannot tell whether something was already sent → sends it", () => {
    /*
      `alreadySent` returns an EMPTY set on any error, and that is the safe direction: a
      duplicate notification is an annoyance, a suppressed one is the defect. Pre-migration there
      is no `idempotency_key` column to filter on at all.
    */
    const already = runtime.slice(runtime.indexOf("async alreadySent("), runtime.indexOf("async log("));
    expect(already).toMatch(/if \(error\) return new Set\(\);/);
  });
});

describe("the two doors report it rather than 500ing", () => {
  it("neither function throws on a missing table any more", () => {
    const runtime = stripComments(read("supabase/functions/_shared/notify-staff-runtime.ts"));
    const routes = runtime.slice(runtime.indexOf("async routes("), runtime.indexOf("async prefs("));
    const prefs = runtime.slice(runtime.indexOf("async prefs("), runtime.indexOf("async flags("));
    for (const [name, block] of [["routes", routes], ["prefs", prefs]] as const) {
      expect(block, name).toContain("isMissingRelation(error)");
      expect(block, name).toContain("return [];");
      // ...and every other error still throws.
      expect(block, name).toContain("if (error) throw error;");
    }
  });

  it("says so in the logs, because a deployment routing nothing anywhere is worth seeing", () => {
    const runtime = read("supabase/functions/_shared/notify-staff-runtime.ts");
    expect(runtime).toContain("notification_routes does not exist yet");
    expect(runtime).toContain("staff_notification_prefs does not exist yet");
    /*
      And nothing sensitive is INTERPOLATED into any of them — CLAUDE.md's "no PII or auth state
      in production logs". Asserted on the interpolations rather than on the words: the prune
      message legitimately contains the word "token" while printing only Postgres's error text,
      and a scan that failed on that would be deleted rather than fixed.
    */
    const logCalls = [...runtime.matchAll(/console\.(warn|error|log)\(([^;]*)\)/g)].map((m) => m[2]);
    expect(logCalls.length).toBeGreaterThan(2);
    for (const call of logCalls) {
      const interpolated = [...call.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
      for (const expr of interpolated) {
        expect(expr, call).not.toMatch(/phone|token|email|whatsapp|recipient|\bto\b|Authorization|serviceRoleKey/i);
      }
    }
  });
});
