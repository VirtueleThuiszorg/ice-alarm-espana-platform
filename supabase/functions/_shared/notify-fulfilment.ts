/**
 * ONE DISPATCHER FOR EVERY FULFILMENT STATE EDGE — WP3.
 *
 * `notifyFulfilment(order_id, transition)` is called once per state change and decides, per
 * recipient and per channel, whether anything is sent. Nothing else in this codebase decides
 * that, which is the point: six state edges × three channels × two audiences is thirty-six
 * places to get consent wrong if each caller works it out for itself.
 *
 * THE TWO GATES, BOTH REQUIRED (D7, and the reasoning is in 20260907100200):
 *
 *   1. the CHANNEL is on globally — `system_settings.notify_channel_{sms,email,whatsapp}`,
 *      Lee's table edit, seeded `false`
 *   2. the RECIPIENT has permission — a `member_notification_optin` row with `opted_in = true`
 *
 * Either alone is wrong. A global flag with no per-member consent sends to people who never
 * agreed; per-member consent with no global flag sends over a transport nobody has proved
 * delivers. All three flags are OFF today, so on current production data this dispatcher sends
 * NOTHING and records why — which is the correct behaviour, not a broken one.
 *
 * A SKIP IS RECORDED, NEVER SILENT. GOALS.md G2. Every decision writes one
 * `member_notification_log` row with a status that says which gate stopped it:
 *
 *   sent                     the transport accepted it
 *   failed                   it was attempted and refused
 *   skipped_channel_off      gate 1
 *   skipped_no_optin         gate 2
 *   skipped_no_address       no phone / no email for that recipient on that channel
 *   skipped_no_template      no active row in notification_templates for this combination
 *   skipped_no_payer_consent see PAYERS below
 *
 * A silent skip and a successful send are indistinguishable afterwards, and on a life-safety
 * product the record of what was sent to whom is evidence rather than convenience.
 *
 * NO TEMPLATE MEANS NO MESSAGE. There is no inline fallback text anywhere in this file. A
 * hardcoded English default would be the one thing that reaches a Spanish member the day
 * somebody forgets a seed row — and it would look like the feature working.
 *
 * PAYERS (D6). The brief: notify the member, and the payer when `subscriptions.payer_id` is set
 * and differs. Recipient resolution is built, and the payer's own templates are separate rows
 * (`….payer` event keys) because "your father's pendant has been dispatched" is not the same
 * message as "your pendant is on its way".
 *
 * But there is NOWHERE to record a payer's consent: `member_notification_optin` is keyed on
 * `member_id`, and a payer is not a member. So `payerConsent()` returns "none recorded" for
 * every payer and every payer send is skipped and logged. That is deliberate and it is the safe
 * direction on a privacy question — the alternative is inventing a legal basis in a module.
 * It is recorded for Lee as a decision with the table it needs.
 */

export type FulfilmentTransition =
  | "allocated"
  | "programmed"
  | "dispatched"
  | "delivered"
  | "tested"
  | "cancelled";

export type NotifyChannel = "sms" | "email" | "whatsapp";
export type NotifyAudience = "member" | "payer";

export type NotifyStatus =
  | "sent"
  | "failed"
  | "skipped_channel_off"
  | "skipped_no_optin"
  | "skipped_no_address"
  | "skipped_no_template"
  | "skipped_no_payer_consent";

export interface NotifyDecision {
  audience: NotifyAudience;
  channel: NotifyChannel;
  status: NotifyStatus;
  eventKey: string;
  error?: string;
}

export interface NotifyResult {
  orderId: string;
  transition: FulfilmentTransition;
  /** Every decision, in order. One per audience × channel — never fewer. */
  decisions: NotifyDecision[];
  /** Set when the dispatcher could not even work out who to tell. */
  fatal?: string;
}

/** Every channel, always evaluated, so a missing decision is a bug rather than a silence. */
export const NOTIFY_CHANNELS: NotifyChannel[] = ["sms", "email", "whatsapp"];

/**
 * The template key for one transition and audience.
 *
 * The audience is IN THE KEY rather than a column, because the brief requires different text for
 * the same event — "the payer is told about the order, the member about their alarm" — and a
 * single row with two bodies is a row somebody will eventually send the wrong half of.
 */
export function eventKeyFor(
  transition: FulfilmentTransition,
  audience: NotifyAudience,
): string {
  return `fulfilment.${transition}.${audience}`;
}

/** `system_settings.notify_channel_*`, which is Lee's switch and nobody else's. */
export function channelFlagKey(channel: NotifyChannel): string {
  return `notify_channel_${channel}`;
}

/**
 * `{{name}}` substitution and nothing more.
 *
 * Deliberately not a template language: a template is operational content edited by an admin
 * through a table, so anything that can execute is a hole. An unknown placeholder is LEFT AS IT
 * IS rather than blanked — a message reading "Hola {{nombre}}" tells whoever sees it that a
 * variable is wrong, where "Hola " tells them nothing.
 */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole,
  );
}

/**
 * A payer's permission to be messaged. Always "none recorded" today.
 *
 * NOT A STUB TO BE FILLED IN CASUALLY. `member_notification_optin` cannot hold it (it is keyed
 * on `member_id`), so representing payer consent needs a decision and a table. Until then this
 * returns false and every payer send is logged as `skipped_no_payer_consent`, which is visible
 * in `member_notification_log` rather than absent from it.
 */
export function payerConsent(_payerId: string, _channel: NotifyChannel): boolean {
  return false;
}

/** The address a channel needs, or null. `null` is `skipped_no_address`, never a silent drop. */
export function addressFor(
  channel: NotifyChannel,
  contact: { phone?: string | null; email?: string | null },
): string | null {
  if (channel === "email") return contact.email?.trim() || null;
  // SMS and WhatsApp both need a phone. WhatsApp's `whatsapp:` prefix belongs to the transport,
  // not here — twilio-whatsapp adds it, and duplicating that would produce `whatsapp:whatsapp:`.
  return contact.phone?.trim() || null;
}

/** The locale to render in, and the fallback is named rather than assumed. */
export function localeFor(preferred: string | null | undefined): "en" | "es" | "nl" {
  if (preferred === "en" || preferred === "es" || preferred === "nl") return preferred;
  // Spain is the market and Spanish is the default the rest of this codebase uses
  // (`send-email` defaults `language = "es"`). A member with no preference on file is far more
  // likely Spanish-speaking than English-speaking, and guessing English would be the guess that
  // reaches an 80-year-old in Almería in a language they may not read.
  return "es";
}

// ─────────────────────────────────────────────────────────────────────────────
// The dispatcher itself.
//
// Takes the client rather than building one, for the same reason `post-payment.ts` does: it is
// then drivable from a test against a recording double, and `webhookActivationContract.test.ts`
// proved that is the difference between a contract that is asserted and one that is hoped for.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bit of the Supabase client this module uses — structural, so a test double satisfies it.
 *
 * Written out rather than importing `SupabaseClient` because the point is to be drivable from a
 * recording double: `webhookActivationContract.test.ts` showed that is the difference between a
 * contract that is asserted and one that is hoped for. The real client is passed with a cast at
 * the one call site that has it (the edge function), which keeps the cast in one place instead
 * of loosening the type everything else is checked against.
 */
export interface NotifyQueryResult {
  data: unknown;
  error: unknown;
}

export interface NotifyQuery {
  select(cols: string): NotifyQuery;
  eq(col: string, val: unknown): NotifyQuery;
  in(col: string, vals: unknown[]): Promise<NotifyQueryResult>;
  maybeSingle(): Promise<NotifyQueryResult>;
}

export interface NotifyTable extends NotifyQuery {
  insert(rows: unknown): Promise<NotifyQueryResult>;
}

export interface NotifyDb {
  from(table: string): NotifyTable;
  functions: {
    invoke(name: string, opts: { body: unknown }): Promise<NotifyQueryResult>;
  };
}

/** Which edge function carries each channel. D7 names all three. */
const TRANSPORT: Record<NotifyChannel, string> = {
  sms: "twilio-sms",
  email: "send-email",
  whatsapp: "twilio-whatsapp",
};

interface Recipient {
  audience: NotifyAudience;
  /** The member this notification is ABOUT — the log's `member_id` either way. */
  memberId: string;
  payerId?: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: "en" | "es" | "nl";
}

export async function notifyFulfilment(
  db: NotifyDb,
  orderId: string,
  transition: FulfilmentTransition,
): Promise<NotifyResult> {
  const decisions: NotifyDecision[] = [];
  const result: NotifyResult = { orderId, transition, decisions };

  // ── who is this about ────────────────────────────────────────────────────
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, order_number, member_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    // No decisions, and a fatal that says so. Returning an empty `decisions` with no `fatal`
    // would read as "nothing needed sending", which is the one thing it must never mean.
    result.fatal = orderError
      ? `order read failed: ${describe(orderError)}`
      : `order ${orderId} not found`;
    return result;
  }

  const o = order as { id: string; order_number: string | null; member_id: string };

  const { data: member, error: memberError } = await db
    .from("members")
    .select("id, first_name, last_name, phone, email, preferred_language")
    .eq("id", o.member_id)
    .maybeSingle();

  if (memberError || !member) {
    result.fatal = memberError
      ? `member read failed: ${describe(memberError)}`
      : `member ${o.member_id} not found`;
    return result;
  }

  const m = member as {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    preferred_language: string | null;
  };

  const recipients: Recipient[] = [
    {
      audience: "member",
      memberId: o.member_id,
      name: `${m.first_name ?? ""}`.trim() || "—",
      phone: m.phone,
      email: m.email,
      locale: localeFor(m.preferred_language),
    },
  ];

  // ── the payer, per D6: only when set, and only when they are someone else ──
  const { data: sub } = await db
    .from("subscriptions")
    .select("payer_id")
    .eq("member_id", o.member_id)
    .maybeSingle();

  const payerId = (sub as { payer_id: string | null } | null)?.payer_id ?? null;
  if (payerId) {
    const { data: payer } = await db
      .from("payers")
      .select("id, full_name, email, phone, user_id")
      .eq("id", payerId)
      .maybeSingle();
    const p = payer as {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    } | null;

    // "and differs" is the brief's condition and it is checked on the ADDRESSES, not the ids.
    // A payer row for the member themselves is common — somebody paying for their own
    // subscription through a payer record — and messaging them twice about one event is how a
    // member learns to ignore the messages.
    const sameAddress =
      !!p &&
      ((!!p.email && !!m.email && p.email.toLowerCase() === m.email.toLowerCase()) ||
        (!!p.phone && !!m.phone && p.phone.replace(/\s/g, "") === m.phone.replace(/\s/g, "")));

    if (p && !sameAddress) {
      recipients.push({
        audience: "payer",
        memberId: o.member_id,
        payerId: p.id,
        name: p.full_name?.trim() || "—",
        phone: p.phone,
        email: p.email,
        // `payers` has no preferred_language column. Falling back to the MEMBER's is a guess,
        // and a named one: the payer is usually family, and family usually shares a language.
        // Recorded for Lee rather than left as a silent inference.
        locale: localeFor(m.preferred_language),
      });
    }
  }

  // ── gate 1: the global channel flags ─────────────────────────────────────
  const { data: flagRows } = await db
    .from("system_settings")
    .select("key, value")
    .in(
      "key",
      NOTIFY_CHANNELS.map(channelFlagKey),
    );

  const flags = new Map<string, string>();
  for (const row of (flagRows as { key: string; value: string }[] | null) ?? []) {
    flags.set(row.key, row.value);
  }

  for (const recipient of recipients) {
    for (const channel of NOTIFY_CHANNELS) {
      const eventKey = eventKeyFor(transition, recipient.audience);
      const decide = (status: NotifyStatus, error?: string) => {
        decisions.push({ audience: recipient.audience, channel, status, eventKey, error });
        return logDecision(db, recipient.memberId, channel, eventKey, status, error);
      };

      // A flag that is ABSENT is off. Missing is not permission.
      if (flags.get(channelFlagKey(channel)) !== "true") {
        await decide("skipped_channel_off");
        continue;
      }

      if (recipient.audience === "payer") {
        if (!payerConsent(recipient.payerId as string, channel)) {
          await decide("skipped_no_payer_consent");
          continue;
        }
      } else {
        const { data: optin } = await db
          .from("member_notification_optin")
          .select("opted_in")
          .eq("member_id", recipient.memberId)
          .eq("channel", channel)
          .maybeSingle();
        if ((optin as { opted_in: boolean } | null)?.opted_in !== true) {
          await decide("skipped_no_optin");
          continue;
        }
      }

      const to = addressFor(channel, recipient);
      if (!to) {
        await decide("skipped_no_address");
        continue;
      }

      const { data: template } = await db
        .from("notification_templates")
        .select("subject, body, is_active")
        .eq("event_key", eventKey)
        .eq("channel", channel)
        .eq("locale", recipient.locale)
        .maybeSingle();

      const tpl = template as { subject: string | null; body: string; is_active: boolean } | null;
      if (!tpl || !tpl.is_active) {
        // No inline fallback, ever. A hardcoded English default is the thing that reaches a
        // Spanish member the day somebody forgets a seed row, and it would look like success.
        await decide("skipped_no_template");
        continue;
      }

      const vars = {
        name: recipient.name,
        order_number: o.order_number ?? "",
        member_name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      };

      const { error: sendError } = await db.functions.invoke(TRANSPORT[channel], {
        body:
          channel === "email"
            ? {
                to,
                subject: tpl.subject ? renderTemplate(tpl.subject, vars) : undefined,
                html: renderTemplate(tpl.body, vars),
                language: recipient.locale,
                module: "fulfilment",
                related_entity_id: o.id,
                related_entity_type: "order",
              }
            : { to, message: renderTemplate(tpl.body, vars), recipientType: recipient.audience },
      });

      await decide(sendError ? "failed" : "sent", sendError ? describe(sendError) : undefined);
    }
  }

  return result;
}

/**
 * Every decision, written down. Failures here are swallowed DELIBERATELY and that is the one
 * swallow in this file: a log write that fails must not stop the next recipient being told, and
 * it must not turn a successful send into a reported failure. It is surfaced through the
 * returned `decisions`, which the caller has regardless of what the table did.
 */
async function logDecision(
  db: NotifyDb,
  memberId: string,
  channel: NotifyChannel,
  eventKey: string,
  status: NotifyStatus,
  error?: string,
): Promise<void> {
  try {
    await db.from("member_notification_log").insert({
      member_id: memberId,
      channel,
      event_key: eventKey,
      status,
      error: error ?? null,
    });
  } catch {
    // Intentionally ignored — see above.
  }
}

function describe(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
