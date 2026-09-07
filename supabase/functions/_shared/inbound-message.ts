/**
 * AN INBOUND SMS OR WHATSAPP BECOMES A MESSAGE IN THE MEMBER'S CONVERSATION — WP6 G6.
 *
 * *"channel on messages widened to chat|voice|whatsapp|sms|email; inbound twilio-whatsapp and
 * twilio-sms write into the member's conversation."* The column landed in `20260907100400`.
 * The writing did not, and what was there instead is the reason this is a defect and not a
 * missing feature:
 *
 * ── WHAT HAPPENED TO A MEMBER'S TEXT MESSAGE BEFORE THIS ───────────────────────────────────
 *
 * Both `twilio-sms` and `twilio-whatsapp` found the member by phone, then:
 *
 *     if (activeAlert) { await sb.from("alert_communications").insert({...}); }
 *
 * There is no `else`. With no alert open — which is the ordinary case, because most people who
 * text a care service are not mid-emergency — the message was read, matched to a member, and
 * **dropped**. Nothing was stored anywhere an operator looks.
 *
 * And both functions then auto-replied, in Spanish and English:
 *
 *     "Gracias por contactar ICE Alarm España. Un operador revisará su mensaje."
 *     "An operator will review your message."
 *
 * So the product told the member their message was in hand while deleting it. That is the same
 * shape as the internal-note leak (G4): the screen says one thing, the write says another.
 *
 * ── WHAT THIS DOES INSTEAD ─────────────────────────────────────────────────────────────────
 *
 * One row in `messages` — `sender_type = 'member'`, `channel = 'sms' | 'whatsapp'`, unread — in
 * the member's own conversation, which is the thread both staff surfaces already render and the
 * member already reads. The alert_communications write is UNCHANGED and still happens when an
 * alert is open: an SMS during an emergency belongs on the alert record too, and removing that
 * to "tidy up" would delete evidence from the SOS path.
 *
 * ── THE DECISIONS, EACH ONE A WAY TO GET THIS WRONG ────────────────────────────────────────
 *
 * IDEMPOTENT ON THE PROVIDER'S SID. Twilio retries a webhook that does not answer 2xx, and it
 * answers with the same `MessageSid`. Without this, one slow database write turns one text
 * message into three identical ones in a member's thread. The sid is stored in `metadata` and
 * checked before inserting.
 *
 * AN UNKNOWN NUMBER IS NOT A MEMBER, AND MUST NOT BECOME ONE. No conversation is created, no
 * member is guessed at from a partial match. The caller is told `unknown_sender` so it can
 * answer honestly rather than promising an operator who will never see it.
 *
 * THE PHONE MATCH IS TWO EXACT QUERIES, NOT `.or()`. `twilio-whatsapp` built
 * `.or(\`phone.eq.${from},phone.eq.${withoutPlus}\`)` from request input; it sanitises first, so
 * it is not exploitable today, but a filter string assembled from a webhook body is one edit
 * away from being so. `twilio-sms` already used two `.eq()` queries. One shape, the safe one.
 *
 * A RESOLVED THREAD IS NOT REOPENED SILENTLY. The member's most recent `open` or `pending`
 * conversation is reused; if the last one was resolved or closed, this starts a new one. An
 * operator marked that thread finished, and a new question arriving inside it looks answered.
 *
 * NOTHING IS TRIAGED HERE. No priority is inferred from the words, no alert is raised, no reply
 * is composed. CLAUDE.md's red lines apply to any code on this path: an inbound "help" is an
 * operator's judgement, and a keyword matcher that decides otherwise is exactly the automated
 * triage this product must not have.
 */

export type InboundChannel = "sms" | "whatsapp";

export interface InboundMessage {
  /** The sender's number as the provider gave it (`whatsapp:` prefix already stripped). */
  from: string;
  body: string;
  /** Twilio's `MessageSid`. The idempotency key. */
  providerSid: string;
  channel: InboundChannel;
}

export type InboundOutcome =
  | { status: "stored"; conversationId: string; startedConversation: boolean; locale: string | null }
  | { status: "duplicate"; conversationId: string | null; locale: string | null }
  | { status: "unknown_sender" }
  | { status: "empty" }
  | { status: "failed"; reason: string };

/** The bit of the Supabase client this module uses — structural, so a test double satisfies it. */
export interface InboundQueryResult {
  data: unknown;
  error: unknown;
}

export interface InboundQuery {
  select(cols: string): InboundQuery;
  eq(col: string, val: unknown): InboundQuery;
  in(col: string, vals: unknown[]): InboundQuery;
  order(col: string, opts: { ascending: boolean }): InboundQuery;
  limit(n: number): InboundQuery;
  maybeSingle(): Promise<InboundQueryResult>;
}

export interface InboundTable extends InboundQuery {
  insert(rows: unknown): InboundQuery;
  update(patch: unknown): InboundQuery;
}

export interface InboundDb {
  from(table: string): InboundTable;
}

/** Digits and a leading `+` only, and both spellings a member's row might hold. */
export function phoneCandidates(raw: string): string[] {
  const clean = (raw || "").replace(/[^\d+]/g, "");
  const withoutPlus = clean.replace(/^\+/, "");
  return clean === withoutPlus ? [clean] : [clean, withoutPlus];
}

/** E.164, the same test `twilio-sms` already applied before trusting a number. */
export function isPlausiblePhone(raw: string): boolean {
  return /^\+?[1-9]\d{1,14}$/.test((raw || "").replace(/[^\d+]/g, ""));
}

const OPEN_STATUSES = ["open", "pending"];

export async function recordInboundMessage(
  db: InboundDb,
  msg: InboundMessage,
): Promise<InboundOutcome> {
  const body = (msg.body ?? "").trim();
  // An empty body is a delivery receipt or a stray media-only message, not something to show an
  // operator as a blank bubble they have to guess at.
  if (!body) return { status: "empty" };
  if (!isPlausiblePhone(msg.from)) return { status: "unknown_sender" };

  // ── the member ────────────────────────────────────────────────────────────
  let memberId: string | null = null;
  let locale: string | null = null;
  for (const candidate of phoneCandidates(msg.from)) {
    const { data, error } = await db
      .from("members")
      .select("id, preferred_language")
      .eq("phone", candidate)
      .maybeSingle();
    if (error) return { status: "failed", reason: "member lookup failed" };
    const row = data as { id: string; preferred_language: string | null } | null;
    if (row?.id) {
      memberId = row.id;
      locale = row.preferred_language ?? null;
      break;
    }
  }
  if (!memberId) return { status: "unknown_sender" };

  // ── already stored? ───────────────────────────────────────────────────────
  if (msg.providerSid) {
    const { data, error } = await db
      .from("messages")
      .select("id, conversation_id")
      .eq("metadata->>provider_sid", msg.providerSid)
      .maybeSingle();
    if (error) return { status: "failed", reason: "duplicate check failed" };
    const existing = data as { conversation_id: string } | null;
    if (existing) return { status: "duplicate", conversationId: existing.conversation_id, locale };
  }

  // ── the conversation ──────────────────────────────────────────────────────
  const { data: openConv, error: convError } = await db
    .from("conversations")
    .select("id")
    .eq("member_id", memberId)
    .in("status", OPEN_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (convError) return { status: "failed", reason: "conversation lookup failed" };

  let conversationId = (openConv as { id: string } | null)?.id ?? null;
  const startedConversation = !conversationId;

  if (!conversationId) {
    const { data: created, error: createError } = await db
      .from("conversations")
      .insert({
        member_id: memberId,
        conversation_type: "member",
        status: "open",
        priority: "normal",
        source: msg.channel,
        last_channel: msg.channel,
        // No subject invented from the message text: a first line quoted as a subject reads as a
        // summary an operator can skim, and this one has not been read by anybody yet.
        subject: msg.channel === "whatsapp" ? "WhatsApp message" : "SMS message",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (createError) return { status: "failed", reason: "conversation create failed" };
    conversationId = (created as { id: string } | null)?.id ?? null;
    if (!conversationId) return { status: "failed", reason: "conversation create returned no id" };
  }

  // ── the message ───────────────────────────────────────────────────────────
  const { error: insertError } = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: "member",
      sender_id: null,
      content: body,
      message_type: "text",
      channel: msg.channel,
      is_read: false,
      metadata: { provider_sid: msg.providerSid, from: msg.from, direction: "inbound" },
    })
    .maybeSingle();
  if (insertError) return { status: "failed", reason: "message insert failed" };

  const { error: touchError } = await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_channel: msg.channel })
    .eq("id", conversationId)
    // `.select()` before `.maybeSingle()`: an UPDATE with no representation requested returns no
    // body, and asking PostgREST for a single object from an empty body is an error rather than
    // a null.
    .select("id")
    .maybeSingle();
  if (touchError) return { status: "failed", reason: "conversation update failed" };

  return { status: "stored", conversationId, startedConversation, locale };
}

/**
 * WHAT WE SAY BACK, AND THE HTTP STATUS THAT GOES WITH IT.
 *
 * The auto-reply that was there said *"an operator will review your message"* to everybody,
 * including the people whose message had just been dropped. Each branch below now matches what
 * actually happened to the message:
 *
 *   stored / duplicate   an operator really will see it — and it is in their language, taken
 *                        from `members.preferred_language`, for the same reason the canned
 *                        replies are (`src/lib/cannedReplies.ts`)
 *   unknown_sender       we could not match the number, so nobody has it. Saying so is the
 *                        whole point; a reassuring reply to a stranger in trouble is worse than
 *                        no reply, because it stops them trying another way. 112 is named
 *                        because it is the only number safe to give without knowing who they are
 *   empty               nothing to answer; an empty TwiML response is Twilio's "no reply"
 *   failed              5xx, so Twilio RETRIES. The retry is safe: the provider sid makes the
 *                       write idempotent. Answering 200 to a failed write is how a message is
 *                       lost silently, which is the defect this module exists to fix
 */
export interface InboundReply {
  httpStatus: number;
  xml: string;
}

const RECEIVED: Record<string, string> = {
  en: "Thank you for contacting ICE Alarm España. Your message has reached our team and an operator will reply here.",
  es: "Gracias por contactar con ICE Alarm España. Su mensaje ha llegado a nuestro equipo y un operador le responderá por aquí.",
  nl: "Bedankt voor uw bericht aan ICE Alarm España. Uw bericht is bij ons team aangekomen en een medewerker antwoordt u hier.",
};

/** Neither language is a guess when we know the member; both are shown when we do not. */
const UNMATCHED =
  "No hemos podido identificar este número, así que ningún operador ha recibido este mensaje. " +
  "Si se trata de una emergencia, llame al 112. / We could not match this number to an account, " +
  "so no operator has received this message. In an emergency, call 112.";

function twiml(message?: string): string {
  const inner = message ? `\n  <Message>${escapeXml(message)}</Message>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function inboundReply(outcome: InboundOutcome): InboundReply {
  switch (outcome.status) {
    case "stored":
    case "duplicate": {
      const code = (outcome.locale ?? "").split("-")[0];
      return { httpStatus: 200, xml: twiml(RECEIVED[code] ?? RECEIVED.en) };
    }
    case "unknown_sender":
      return { httpStatus: 200, xml: twiml(UNMATCHED) };
    case "empty":
      return { httpStatus: 200, xml: twiml() };
    case "failed":
      return { httpStatus: 500, xml: twiml() };
  }
}
