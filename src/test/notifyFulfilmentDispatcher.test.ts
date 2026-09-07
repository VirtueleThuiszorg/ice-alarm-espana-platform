// @vitest-environment node
//
// WP3's dispatcher, driven against a recording double — the `webhookActivationContract.test.ts`
// shape, for the same reason: the thing that matters is not that the code runs but that the
// DECISIONS it makes are the ones D6 and D7 specify, and only exercising the real module proves
// that.
//
// THE ASSERTIONS THAT MATTER ARE THE REFUSALS. Every channel is off in production today, so on
// current data this dispatcher sends nothing and records why. A test suite that only proved it
// CAN send would pass against a version that sends to people who never agreed.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import type {
  NotifyDb,
  NotifyTable,
} from "../../supabase/functions/_shared/notify-fulfilment.ts";

/**
 * Imported through a non-literal specifier on purpose. A literal one pulls
 * `supabase/functions/**` into the app's typecheck, and those files use `Deno.env` and `npm:`
 * specifiers that `tsc` cannot resolve — fifteen errors, none of them about this test.
 */
const MODULE = "../../supabase/functions/_shared/notify-fulfilment.ts";

type Row = Record<string, unknown> | null;

interface Fixture {
  order: Row;
  member: Row;
  subscription: Row;
  payer: Row;
  flags: { key: string; value: string }[];
  optin: Record<string, boolean>;
  templates: Record<string, Row>;
  orderError?: unknown;
  memberError?: unknown;
  sendError?: unknown;
}

let fx: Fixture;
let logged: Record<string, unknown>[] = [];
let invoked: { fn: string; body: Record<string, unknown> }[] = [];

/**
 * A double that answers by TABLE and by the filters it was given, so "which template did it ask
 * for" and "did it ask about the right channel" are observable. A double that returns one shape
 * for everything cannot fail the assertions this suite is for.
 */
function makeDb(): NotifyDb {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      };
      chain.in = (_col: string, _vals: unknown[]) =>
        Promise.resolve({ data: table === "system_settings" ? fx.flags : [], error: null });
      chain.maybeSingle = () => {
        if (table === "orders") return Promise.resolve({ data: fx.order, error: fx.orderError ?? null });
        if (table === "members") return Promise.resolve({ data: fx.member, error: fx.memberError ?? null });
        if (table === "subscriptions") return Promise.resolve({ data: fx.subscription, error: null });
        if (table === "payers") return Promise.resolve({ data: fx.payer, error: null });
        if (table === "member_notification_optin") {
          const key = String(filters.channel);
          return Promise.resolve({
            data: key in fx.optin ? { opted_in: fx.optin[key] } : null,
            error: null,
          });
        }
        if (table === "notification_templates") {
          const key = `${filters.event_key}|${filters.channel}|${filters.locale}`;
          return Promise.resolve({ data: fx.templates[key] ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.insert = (rows: Record<string, unknown>) => {
        if (table === "member_notification_log") logged.push(rows);
        return Promise.resolve({ data: null, error: null });
      };
      // Cast once, at the boundary: the chain is built as a bag of functions because that is
      // what a fluent builder is, and typing each step would be re-declaring the interface.
      return chain as unknown as NotifyTable;
    },
    functions: {
      invoke(fn: string, opts: { body: Record<string, unknown> }) {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve({ data: null, error: fx.sendError ?? null });
      },
    },
  };
}

async function load() {
  return (await import(/* @vite-ignore */ MODULE)) as typeof import("../../supabase/functions/_shared/notify-fulfilment.ts");
}

const ON = (...channels: string[]) =>
  ["sms", "email", "whatsapp"].map((c) => ({
    key: `notify_channel_${c}`,
    value: channels.includes(c) ? "true" : "false",
  }));

beforeEach(() => {
  logged = [];
  invoked = [];
  fx = {
    order: { id: "o1", order_number: "ICE-0001", member_id: "m1" },
    member: {
      id: "m1",
      first_name: "Ana",
      last_name: "Alfa",
      phone: "+34600000001",
      email: "ana@example.com",
      preferred_language: "es",
    },
    subscription: { payer_id: null },
    payer: null,
    flags: ON(),
    optin: {},
    templates: {},
  };
});

describe("every channel produces a decision — a silence is a bug, not a skip", () => {
  it("returns one decision per channel even when everything is off", async () => {
    const { notifyFulfilment } = await load();
    const result = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(result.decisions).toHaveLength(3);
    expect(result.decisions.map((d) => d.channel).sort()).toEqual(["email", "sms", "whatsapp"]);
    expect(result.fatal).toBeUndefined();
  });

  it("writes one log row per decision — a skip is recorded, never silent", async () => {
    // GOALS.md G2. A silent skip and a successful send are indistinguishable afterwards.
    const { notifyFulfilment } = await load();
    await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(logged).toHaveLength(3);
    for (const row of logged) {
      expect(row.status).toBe("skipped_channel_off");
      expect(row.event_key).toBe("fulfilment.dispatched.member");
      expect(row.member_id).toBe("m1");
    }
  });

  it("sends NOTHING when the flags are off, however willing the member is", async () => {
    fx.optin = { sms: true, email: true, whatsapp: true };
    const { notifyFulfilment } = await load();
    await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(invoked).toEqual([]);
  });
});

describe("the two gates, and which one stopped it", () => {
  it("gate 1: a channel that is off is `skipped_channel_off`", async () => {
    fx.flags = ON("email");
    fx.optin = { sms: true, email: true, whatsapp: true };
    fx.templates["fulfilment.dispatched.member|email|es"] = {
      subject: "Su colgante",
      body: "Hola {{name}}",
      is_active: true,
    };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    const by = Object.fromEntries(r.decisions.map((d) => [d.channel, d.status]));
    expect(by.sms).toBe("skipped_channel_off");
    expect(by.whatsapp).toBe("skipped_channel_off");
    expect(by.email).toBe("sent");
  });

  it("gate 2: no opt-in row is `skipped_no_optin`, and an ABSENT row is not permission", async () => {
    fx.flags = ON("sms");
    fx.optin = {}; // no row at all
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("skipped_no_optin");
    expect(invoked).toEqual([]);
  });

  it("gate 2: an explicit `opted_in = false` is also refused", async () => {
    fx.flags = ON("sms");
    fx.optin = { sms: false };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("skipped_no_optin");
  });

  it("a flag with any value other than the string 'true' is off", async () => {
    // Missing is not permission, and neither is "TRUE", "1" or "yes". `system_settings.value`
    // is text, so anything that is not exactly the written word is a typo, not a switch.
    for (const value of ["TRUE", "1", "yes", "", "false"]) {
      fx.flags = [{ key: "notify_channel_sms", value }];
      fx.optin = { sms: true };
      const { notifyFulfilment } = await load();
      const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
      expect(
        r.decisions.find((d) => d.channel === "sms")?.status,
        `value ${JSON.stringify(value)} was treated as on`,
      ).toBe("skipped_channel_off");
    }
  });
});

describe("no template means no message", () => {
  it("a missing template is `skipped_no_template`, never an inline default", async () => {
    // A hardcoded English fallback is the thing that reaches a Spanish member the day somebody
    // forgets a seed row — and it would look like the feature working.
    fx.flags = ON("sms");
    fx.optin = { sms: true };
    fx.templates = {};
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("skipped_no_template");
    expect(invoked).toEqual([]);
  });

  it("an INACTIVE template is treated as missing", async () => {
    fx.flags = ON("sms");
    fx.optin = { sms: true };
    fx.templates["fulfilment.dispatched.member|sms|es"] = {
      subject: null,
      body: "x",
      is_active: false,
    };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("skipped_no_template");
  });

  it("asks for the template in the MEMBER's language", async () => {
    fx.member = { ...(fx.member as object), preferred_language: "nl" } as Row;
    fx.flags = ON("sms");
    fx.optin = { sms: true };
    fx.templates["fulfilment.dispatched.member|sms|nl"] = {
      subject: null,
      body: "Hallo {{name}}",
      is_active: true,
    };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("sent");
    expect(invoked[0].body.message).toBe("Hallo Ana");
  });

  it("falls back to Spanish, not English, for a member with no language on file", async () => {
    // Spain is the market. Guessing English is the guess that reaches an 80-year-old in
    // Almería in a language they may not read.
    fx.member = { ...(fx.member as object), preferred_language: null } as Row;
    fx.flags = ON("sms");
    fx.optin = { sms: true };
    fx.templates["fulfilment.dispatched.member|sms|es"] = {
      subject: null,
      body: "Hola",
      is_active: true,
    };
    const { notifyFulfilment } = await load();
    expect(
      (await notifyFulfilment(makeDb(), "o1", "dispatched")).decisions.find(
        (d) => d.channel === "sms",
      )?.status,
    ).toBe("sent");
  });
});

describe("the payer — D6, and the consent that does not exist yet", () => {
  beforeEach(() => {
    fx.subscription = { payer_id: "p1" };
    fx.payer = {
      id: "p1",
      full_name: "Bruno Beta",
      email: "bruno@example.com",
      phone: "+34600000009",
    };
  });

  it("resolves the payer as a second recipient with their OWN event key", async () => {
    // "the payer is told about the order, the member about their alarm" — different text, so
    // different template rows, so the audience is in the key.
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions).toHaveLength(6);
    expect(r.decisions.filter((d) => d.audience === "payer")).toHaveLength(3);
    expect(r.decisions.find((d) => d.audience === "payer")?.eventKey).toBe(
      "fulfilment.dispatched.payer",
    );
  });

  it("does NOT notify a payer whose address is the member's own", async () => {
    // A payer record for the member themselves is common. Messaging them twice about one event
    // is how a member learns to ignore the messages.
    fx.payer = { id: "p1", full_name: "Ana Alfa", email: "ANA@example.com", phone: null };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.filter((d) => d.audience === "payer")).toHaveLength(0);
  });

  it("does not notify a payer at all when payer_id is unset", async () => {
    fx.subscription = { payer_id: null };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions).toHaveLength(3);
  });

  it("REFUSES every payer send, because payer consent has nowhere to live", async () => {
    // `member_notification_optin` is keyed on member_id and a payer is not a member. Rather
    // than invent a legal basis in a module, every payer send is skipped and LOGGED, so the
    // gap is visible in member_notification_log rather than absent from it.
    fx.flags = ON("sms", "email", "whatsapp");
    fx.optin = { sms: true, email: true, whatsapp: true };
    fx.templates["fulfilment.dispatched.payer|sms|es"] = {
      subject: null,
      body: "x",
      is_active: true,
    };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    for (const d of r.decisions.filter((x) => x.audience === "payer")) {
      expect(d.status).toBe("skipped_no_payer_consent");
    }
    expect(invoked.every((i) => i.body.recipientType !== "payer")).toBe(true);
  });

  it("logs a payer decision against the MEMBER the order is about", async () => {
    // The log has no payer column. `member_id` is who the notification is ABOUT, and the
    // audience is carried by the event key.
    const { notifyFulfilment } = await load();
    await notifyFulfilment(makeDb(), "o1", "dispatched");
    const payerRows = logged.filter((r) => String(r.event_key).endsWith(".payer"));
    expect(payerRows).toHaveLength(3);
    for (const row of payerRows) expect(row.member_id).toBe("m1");
  });
});

describe("addresses, transports and rendering", () => {
  it("no phone is `skipped_no_address`, not a failed send", async () => {
    fx.member = { ...(fx.member as object), phone: null } as Row;
    fx.flags = ON("sms");
    fx.optin = { sms: true };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.find((d) => d.channel === "sms")?.status).toBe("skipped_no_address");
    expect(invoked).toEqual([]);
  });

  it("each channel goes to its own transport function", async () => {
    fx.flags = ON("sms", "email", "whatsapp");
    fx.optin = { sms: true, email: true, whatsapp: true };
    for (const c of ["sms", "email", "whatsapp"]) {
      fx.templates[`fulfilment.dispatched.member|${c}|es`] = {
        subject: "s",
        body: "b",
        is_active: true,
      };
    }
    const { notifyFulfilment } = await load();
    await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(invoked.map((i) => i.fn).sort()).toEqual(["send-email", "twilio-sms", "twilio-whatsapp"]);
  });

  it("does not add the `whatsapp:` prefix — that belongs to the transport", async () => {
    // Duplicating it here produces `whatsapp:whatsapp:+34…`.
    fx.flags = ON("whatsapp");
    fx.optin = { whatsapp: true };
    fx.templates["fulfilment.dispatched.member|whatsapp|es"] = {
      subject: null,
      body: "b",
      is_active: true,
    };
    const { notifyFulfilment } = await load();
    await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(invoked[0].body.to).toBe("+34600000001");
  });

  it("a transport failure is `failed` with the reason, and does not stop the next channel", async () => {
    fx.flags = ON("sms", "email");
    fx.optin = { sms: true, email: true };
    for (const c of ["sms", "email"]) {
      fx.templates[`fulfilment.dispatched.member|${c}|es`] = {
        subject: "s",
        body: "b",
        is_active: true,
      };
    }
    fx.sendError = { message: "twilio 401" };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions.filter((d) => d.status === "failed")).toHaveLength(2);
    expect(r.decisions[0].error).toContain("twilio 401");
    expect(logged.filter((l) => l.status === "failed")).toHaveLength(2);
  });

  it("leaves an unknown placeholder visible rather than blanking it", async () => {
    // "Hola {{nombre}}" tells whoever sees it that a variable is wrong. "Hola " tells them
    // nothing, and it reads as finished text.
    const { renderTemplate } = await load();
    expect(renderTemplate("Hola {{nombre}}", { name: "Ana" })).toBe("Hola {{nombre}}");
    expect(renderTemplate("Hola {{name}}", { name: "Ana" })).toBe("Hola Ana");
  });
});

describe("it cannot report an absence as a success", () => {
  it("a missing order is FATAL, not an empty decision list", async () => {
    // Returning `decisions: []` with no fatal would read as "nothing needed sending", which is
    // the one thing it must never mean.
    fx.order = null;
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.decisions).toEqual([]);
    expect(r.fatal).toMatch(/not found/);
  });

  it("a failed order read is FATAL and names the error", async () => {
    fx.orderError = { message: "connection reset" };
    const { notifyFulfilment } = await load();
    const r = await notifyFulfilment(makeDb(), "o1", "dispatched");
    expect(r.fatal).toContain("connection reset");
  });

  it("a missing member is FATAL", async () => {
    fx.member = null;
    const { notifyFulfilment } = await load();
    expect((await notifyFulfilment(makeDb(), "o1", "dispatched")).fatal).toMatch(/not found/);
  });
});

describe("the edge function's own contract", () => {
  const fn = "supabase/functions/notify-fulfilment/index.ts";
  const src = () => readFileSync(fn, "utf8");

  it("exists", () => {
    expect(existsSync(fn)).toBe(true);
  });

  it("REQUIRES a JWT — it is absent from config.toml, which is how that is expressed", () => {
    // config.toml lists only the functions with `verify_jwt = false`. This one writes
    // member_notification_log under the service role, and that table has no authenticated
    // write path at all by design: a client that could write it could fabricate a delivery
    // record. Being listed there would be the whole guard gone.
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).not.toContain("[functions.notify-fulfilment]");
  });

  it("validates the transition against a list rather than casting it", () => {
    // An unknown transition produces an event key no template matches, so every channel would
    // read `skipped_no_template` — a caller's typo disguised as a content gap.
    expect(src()).toContain("TRANSITIONS.includes(transition)");
  });

  it("does not decide anything itself — the deciding is in the shared module", () => {
    const s = src();
    expect(s).toContain("notifyFulfilment(");
    for (const gate of ["notify_channel_", "member_notification_optin", "opted_in"]) {
      expect(s, `the edge function re-implements ${gate}`).not.toContain(gate);
    }
  });

  it("touches neither stripe-webhook nor create-checkout", () => {
    /*
      The `paid` edge belongs to the payment webhook, and per the brief that hook is a separate
      PR left open for a human. This one must be mergeable on its own.

      Asserted on CODE, not on the word: the file's own comment explains why the `paid` edge is
      elsewhere, and a grep for "stripe" would fail on the explanation. What must be absent is
      an import from those functions or an invoke of them.
    */
    const s = src();
    expect(s).not.toMatch(/from\s+"[^"]*(stripe-webhook|create-checkout)/);
    expect(s).not.toMatch(/invoke\(\s*"(stripe-webhook|create-checkout)"/);
    // And it must not write any of the columns golden rule 4 reserves for the webhook.
    for (const forbidden of ['status: "active"', "subscription_tier", "plan_type:"]) {
      expect(s, `the dispatcher writes ${forbidden}`).not.toContain(forbidden);
    }
  });
});
