// @vitest-environment node
//
// WP6 G6 — an inbound SMS or WhatsApp becomes a message in the member's conversation.
//
// THE DEFECT THIS REPLACES, in both `twilio-sms` and `twilio-whatsapp`:
//
//     if (activeAlert) { await sb.from("alert_communications").insert({...}); }
//
// with no else. A member texting the service when no alert was open had their message matched to
// their record and then dropped — while the auto-reply told them "an operator will review your
// message". The tests below are written negative-first around that: what must be WRITTEN, what
// must NOT be written, and what we are allowed to SAY in each case.
//
// The second half is the security half. This handler now writes into a member's conversation, so
// an unsigned POST would let anyone put words in a member's mouth in their own thread. The
// existing copy of Twilio signature validation in `sos-conference-status` ends
// `console.warn("Invalid Twilio signature — proceeding anyway")`, which is a log line, not a
// check. These assertions pin the opposite: no token means invalid, no signature means invalid.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/stripComments";
import {
  twilioParams,
  twilioSignatureBase,
  verifyTwilioSignature,
} from "../../supabase/functions/_shared/twilio-signature";
import {
  escapeXml,
  inboundReply,
  isPlausiblePhone,
  phoneCandidates,
  recordInboundMessage,
  type InboundDb,
} from "../../supabase/functions/_shared/inbound-message";

const ROOT = process.cwd();

// ── the recording double ────────────────────────────────────────────────────────────────────
type Op = { method: string; args: unknown[] };
interface Recorded {
  table: string;
  ops: Op[];
}

interface DbState {
  member?: { id: string; preferred_language: string | null } | null;
  duplicate?: { conversation_id: string } | null;
  openConversation?: { id: string } | null;
  createdConversation?: { id: string } | null;
  errorOn?: string;
}

function makeDb(state: DbState) {
  const recorded: Recorded[] = [];

  const build = (table: string) => {
    const entry: Recorded = { table, ops: [] };
    recorded.push(entry);
    const chain: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      entry.ops.push({ method, args });
      return chain;
    };
    for (const m of ["select", "eq", "in", "order", "limit", "insert", "update", "or"]) {
      chain[m] = record(m);
    }
    chain.maybeSingle = () => {
      const did = (m: string) => entry.ops.some((o) => o.method === m);
      if (state.errorOn === table) return Promise.resolve({ data: null, error: new Error("boom") });
      if (table === "members") return Promise.resolve({ data: state.member ?? null, error: null });
      if (table === "messages") {
        // The duplicate probe SELECTs; the write INSERTs.
        if (did("insert")) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: state.duplicate ?? null, error: null });
      }
      if (table === "conversations") {
        if (did("insert")) return Promise.resolve({ data: state.createdConversation ?? { id: "new-conv" }, error: null });
        if (did("update")) return Promise.resolve({ data: { id: "c1" }, error: null });
        return Promise.resolve({ data: state.openConversation ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    return chain;
  };

  const db = { from: (t: string) => build(t) } as unknown as InboundDb;
  return { db, recorded };
}

const inserted = (recorded: Recorded[], table: string) =>
  recorded
    .filter((r) => r.table === table)
    .flatMap((r) => r.ops.filter((o) => o.method === "insert").map((o) => o.args[0] as Record<string, unknown>));

const MEMBER = { id: "m1", preferred_language: "es" };
const SMS = { from: "+34600111222", body: "Hola, my pendant is beeping", providerSid: "SM123", channel: "sms" as const };

// ── 1. the signature ────────────────────────────────────────────────────────────────────────
describe("is this request actually from Twilio", () => {
  const TOKEN = "an-auth-token";
  const URL_ = "https://example.supabase.co/functions/v1/twilio-sms?action=incoming";
  const PARAMS = { From: "+34600111222", Body: "hello", MessageSid: "SM1" };
  const sign = (url: string, params: Record<string, string>, token = TOKEN) =>
    createHmac("sha1", token).update(twilioSignatureBase(url, params)).digest("base64");

  it("accepts a signature computed Twilio's way", async () => {
    const v = await verifyTwilioSignature({
      authToken: TOKEN, url: URL_, params: PARAMS, signature: sign(URL_, PARAMS),
    });
    expect(v.valid).toBe(true);
  });

  it("sorts the parameters, so key order in the request cannot matter", () => {
    const a = twilioSignatureBase(URL_, { b: "2", a: "1" });
    const b = twilioSignatureBase(URL_, { a: "1", b: "2" });
    expect(a).toBe(b);
    expect(a).toBe(`${URL_}a1b2`);
  });

  it("rejects a body that was edited after signing", async () => {
    const signature = sign(URL_, PARAMS);
    const v = await verifyTwilioSignature({
      authToken: TOKEN, url: URL_, params: { ...PARAMS, Body: "send me money" }, signature,
    });
    expect(v).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature made with a different token", async () => {
    const v = await verifyTwilioSignature({
      authToken: TOKEN, url: URL_, params: PARAMS, signature: sign(URL_, PARAMS, "other"),
    });
    expect(v.valid).toBe(false);
  });

  it("NO CONFIGURED TOKEN IS INVALID, never 'cannot check, let it through'", async () => {
    const v = await verifyTwilioSignature({ authToken: "", url: URL_, params: PARAMS, signature: "x" });
    expect(v).toEqual({ valid: false, reason: "no_auth_token" });
  });

  it("a missing signature header is invalid", async () => {
    const v = await verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature: null });
    expect(v).toEqual({ valid: false, reason: "no_signature" });
  });

  it("reads form fields as strings", () => {
    const form = new URLSearchParams([["From", "+34600111222"], ["Body", "hi"]]);
    expect(twilioParams(form)).toEqual({ From: "+34600111222", Body: "hi" });
  });
});

// ── 2. the phone match ──────────────────────────────────────────────────────────────────────
describe("matching the number", () => {
  it("tries both spellings a member row might hold", () => {
    expect(phoneCandidates("+34 600 111 222")).toEqual(["+34600111222", "34600111222"]);
    expect(phoneCandidates("34600111222")).toEqual(["34600111222"]);
  });

  it("refuses something that is not a phone number", () => {
    expect(isPlausiblePhone("+34600111222")).toBe(true);
    expect(isPlausiblePhone("not-a-number")).toBe(false);
    expect(isPlausiblePhone("")).toBe(false);
  });
});

// ── 3. what gets written ────────────────────────────────────────────────────────────────────
describe("an inbound message from a member we know", () => {
  it("becomes an unread member message on the right channel, in their conversation", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    const out = await recordInboundMessage(db, SMS);

    expect(out).toEqual({ status: "stored", conversationId: "c1", startedConversation: false, locale: "es" });
    const rows = inserted(recorded, "messages");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      conversation_id: "c1",
      sender_type: "member",
      channel: "sms",
      is_read: false,
      content: "Hola, my pendant is beeping",
    });
    expect((rows[0].metadata as Record<string, unknown>).provider_sid).toBe("SM123");
  });

  it("carries the channel through — a WhatsApp message is not filed as an SMS", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    await recordInboundMessage(db, { ...SMS, channel: "whatsapp", providerSid: "WA1" });
    expect(inserted(recorded, "messages")[0]).toMatchObject({ channel: "whatsapp" });
  });

  it("starts a conversation when the member has no OPEN one, rather than reopening a resolved thread", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: null, createdConversation: { id: "c9" } });
    const out = await recordInboundMessage(db, SMS);

    expect(out).toEqual({ status: "stored", conversationId: "c9", startedConversation: true, locale: "es" });
    const convs = inserted(recorded, "conversations");
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ member_id: "m1", status: "open", conversation_type: "member", source: "sms" });
  });

  it("only ever reuses a conversation that is open or pending", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    await recordInboundMessage(db, SMS);
    const lookup = recorded.find((r) => r.table === "conversations")!;
    const statusFilter = lookup.ops.find((o) => o.method === "in");
    expect(statusFilter?.args).toEqual(["status", ["open", "pending"]]);
  });

  it("trims the body — a text ending in a newline is not a different message", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    await recordInboundMessage(db, { ...SMS, body: "  help please \n" });
    expect(inserted(recorded, "messages")[0].content).toBe("help please");
  });

  it("never builds a filter string from the request — no `.or()` anywhere", async () => {
    // `twilio-whatsapp` used `.or(`phone.eq.${from},…`)` built from webhook input. Sanitised, so
    // not exploitable then; one edit from being so.
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    await recordInboundMessage(db, SMS);
    expect(recorded.flatMap((r) => r.ops).filter((o) => o.method === "or")).toEqual([]);
  });
});

// ── 4. what must NOT be written ─────────────────────────────────────────────────────────────
describe("what must not happen", () => {
  it("a retry of the same MessageSid writes nothing a second time", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, duplicate: { conversation_id: "c1" } });
    const out = await recordInboundMessage(db, SMS);

    expect(out).toEqual({ status: "duplicate", conversationId: "c1", locale: "es" });
    expect(inserted(recorded, "messages")).toEqual([]);
    expect(inserted(recorded, "conversations")).toEqual([]);
  });

  it("an unknown number creates nothing at all — no member, no conversation", async () => {
    const { db, recorded } = makeDb({ member: null });
    const out = await recordInboundMessage(db, SMS);

    expect(out).toEqual({ status: "unknown_sender" });
    expect(inserted(recorded, "conversations")).toEqual([]);
    expect(inserted(recorded, "messages")).toEqual([]);
  });

  it("an empty body is not stored as a blank bubble", async () => {
    const { db, recorded } = makeDb({ member: MEMBER, openConversation: { id: "c1" } });
    const out = await recordInboundMessage(db, { ...SMS, body: "   " });
    expect(out).toEqual({ status: "empty" });
    expect(recorded).toEqual([]);
  });

  it("a failed lookup is reported as failed, not swallowed as 'unknown sender'", async () => {
    const { db } = makeDb({ member: MEMBER, errorOn: "members" });
    const out = await recordInboundMessage(db, SMS);
    expect(out.status).toBe("failed");
  });
});

// ── 5. what we say back ─────────────────────────────────────────────────────────────────────
describe("the auto-reply now matches what happened to the message", () => {
  const stored = (locale: string | null) =>
    inboundReply({ status: "stored", conversationId: "c1", startedConversation: false, locale });

  it("answers a stored message in the MEMBER's language", () => {
    expect(stored("es").xml).toContain("Gracias por contactar");
    expect(stored("nl").xml).toContain("Bedankt voor uw bericht");
    expect(stored("en").xml).toContain("Thank you for contacting");
  });

  it("falls back to English only when no language is recorded", () => {
    expect(stored(null).xml).toContain("Thank you for contacting");
    expect(stored("de").xml).toContain("Thank you for contacting");
  });

  it("tells an unmatched number the truth, and names 112 rather than promising an operator", () => {
    const xml = inboundReply({ status: "unknown_sender" }).xml;
    expect(xml).toContain("112");
    expect(xml).toMatch(/no operator has received this message/i);
    expect(xml).not.toMatch(/an operator will reply here/i);
  });

  it("says nothing at all to an empty message", () => {
    const reply = inboundReply({ status: "empty" });
    expect(reply.httpStatus).toBe(200);
    expect(reply.xml).not.toContain("<Message>");
  });

  it("answers a FAILED write with 5xx, so Twilio retries instead of losing the message", () => {
    expect(inboundReply({ status: "failed", reason: "boom" }).httpStatus).toBe(500);
  });

  it("escapes XML, because TwiML with a bare ampersand is silently dropped", () => {
    expect(escapeXml('a & b < c > "d" \'e\'')).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
  });
});

// ── 6. the two functions, in source ─────────────────────────────────────────────────────────
describe("both inbound handlers, as shipped", () => {
  const FILES = ["twilio-sms", "twilio-whatsapp"].map((fn) => ({
    fn,
    src: readFileSync(join(ROOT, `supabase/functions/${fn}/index.ts`), "utf8"),
  }));

  it("each one writes the message into the member's conversation", () => {
    for (const { fn, src } of FILES) expect(src, fn).toContain("recordInboundMessage");
  });

  it("each one verifies the signature BEFORE it writes, and refuses", () => {
    for (const { fn, src } of FILES) {
      const verify = src.indexOf("verifyTwilioSignature");
      const write = src.indexOf("recordInboundMessage(");
      expect(verify, fn).toBeGreaterThan(-1);
      expect(verify, fn).toBeLessThan(write);
      expect(src, fn).toMatch(/status:\s*403/);
    }
  });

  it("neither one still proceeds on an invalid signature", () => {
    for (const { fn, src } of FILES) expect(src, fn).not.toMatch(/proceeding anyway/);
  });

  it("no edge function sends WhatsApp from a number this company does not own", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.ts$/.test(name)) continue;
        // Comments first: the comment recording the removal quotes the number it removed,
        // which is the prose-vs-code slip this repo has produced six times now.
        if (/\+?34900000000/.test(stripComments(readFileSync(p, "utf8")))) offenders.push(p.replace(`${ROOT}/`, ""));
      }
    };
    walk(join(ROOT, "supabase/functions"));
    expect(offenders).toEqual([]);
  });
});
