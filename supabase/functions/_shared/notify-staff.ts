/**
 * ONE ROUTER for every notification that reaches a member of staff.
 *
 * WHAT IT REPLACES. Today "who gets told" is decided in six places that do not know about each
 * other: `notify-admin` (WhatsApp only, one admin, a boolean column per event), the lead trigger
 * (bell only, all staff), `notify-fulfilment` (its own two-gate dispatcher), `twilio-sms` called
 * directly from three functions, and two paths that write `notification_log` by hand. A seventh
 * would have been added for push. Adding a channel meant editing all of them; adding an event
 * type meant a migration for another boolean column — which is how `whatsapp_ev07b_alerts` came
 * to be read by `notify-admin` without ever existing, so the EV07B WhatsApp alert has never
 * sent.
 *
 * THE SHAPE. An event goes in — `{type, title, body, link, entity}` — with an audience (roles or
 * staff ids). Out comes one DECISION PER RECIPIENT PER CHANNEL: send, or a named reason not to.
 * Nothing is silent, because "it didn't arrive" is the failure this whole feature exists to
 * remove, and a skip with no reason is indistinguishable from a bug.
 *
 * THREE GATES, IN THIS ORDER, AND THE ORDER IS THE ANSWER SOMEBODY NEEDS:
 *
 *   1. TRANSPORT   `system_settings.notify_channel_{sms,whatsapp,push,email}` — Lee's switch. A
 *                  channel nobody has proven delivers must not send, whatever anyone prefers.
 *   2. ROUTE       `notification_routes` (event × channel) — company policy: does a paid sale
 *                  go out by SMS at all?
 *   3. PERSON      `staff_notification_prefs` (staff × event × channel) — their own choice.
 *
 * Reported outermost-first on purpose: if the transport is off, "turn SMS on" is the action, and
 * naming a missing phone number instead sends somebody hunting for the wrong thing.
 *
 * FOUR EVENTS IGNORE GATES 2 AND 3, and this is the most important line in the file.
 * `notify-admin` sends `system.runner_failure` and the three `escalation.*` events with
 * `shouldSend = true` — deliberately ungated, with its own comment: "a dead escalation/monitor
 * runner is maximally critical — always loud, not gated by a per-admin toggle". Routing those
 * through a preferences table would let a switch silence the alarm that says the SOS ladder is
 * broken. They stay loud here, and gate 1 still applies because an unconfigured transport cannot
 * physically send.
 *
 * PURE FIRST, I/O SECOND. `planNotifications` is a function of its arguments: same event, same
 * table contents, same decisions. Transports and storage are injected into
 * `dispatchNotifications`. That is what lets the contract tests assert what WOULD be sent to
 * whom, per channel, without a Twilio account.
 */

export const NOTIFY_EVENTS = [
  // ── the eight this router was built for ──
  "sale.paid",
  "lead.new",
  "payment.failed",
  "subscription.cancelled",
  "sos.opened",
  "sos.unassigned",
  "device.offline",
  "isabella.down",
  // ── the eleven `notify-admin` already sends, so its WhatsApp path can move here whole ──
  "partner.joined",
  "hot.sales",
  "ev07b.alert",
  "shift.no_show",
  "shift.no_coverage",
  "shift.disconnected",
  // ── the swap flow (rota brief §3). Who answers an alert at three in the morning changes ──
  "shift.swap_requested",
  "shift.swap_accepted",
  "shift.swap_approved",
  "system.runner_failure",
  "escalation.call_failed",
  "escalation.no_emergency_contacts",
  "escalation.contacts_not_notified",
  "test",
] as const;

export type NotifyEventType = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_CHANNELS = ["sms", "whatsapp", "push", "email"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/**
 * The events no switch may silence.
 *
 * Each one says the SAFETY MACHINERY ITSELF has failed: the escalation runner is dead, a rung of
 * the ladder could not reach a human, a member has no emergency contacts at all, or contacts
 * exist and none was reached. `notify-admin` sends all four unconditionally today and this keeps
 * that exactly. They are still subject to gate 1 — an unconfigured transport cannot send — but
 * no route and no preference can turn them off.
 */
export const ALWAYS_LOUD: readonly NotifyEventType[] = [
  "system.runner_failure",
  "escalation.call_failed",
  "escalation.no_emergency_contacts",
  "escalation.contacts_not_notified",
];

export function isAlwaysLoud(type: NotifyEventType): boolean {
  return ALWAYS_LOUD.includes(type);
}

export interface NotifyEvent {
  type: NotifyEventType;
  /** One line. The push title, the email subject, the first line of an SMS. */
  title: string;
  /** What happened, in a sentence a person reads on a phone. */
  body: string;
  /** In-app path the notification opens — `/admin/members/…`. Not an absolute URL. */
  link?: string;
  entity?: { type: string; id: string };
  /**
   * Overrides the derived key. Callers normally let it derive from the entity: a webhook that
   * retries must not buzz the same phone twice for one sale.
   */
  idempotencyKey?: string;
  /**
   * Set when something ELSE has already written the bell rows for this event, so the router
   * does not write a second set. `lead.new` is exactly that case: the AFTER INSERT trigger on
   * `leads` (20260908130000) raises one bell row per active staff member, which is broader
   * coverage than this router's audience and is proven by scripts/rls/wiring.sql.
   */
  bellWrittenElsewhere?: boolean;
}

export interface Audience {
  /** `app_role` values. Empty/absent means "not by role". */
  roles?: string[];
  /** Specific staff ids, in addition to any roles. */
  staffIds?: string[];
}

export interface Recipient {
  staffId: string;
  userId: string | null;
  firstName: string;
  role: string;
  email: string | null;
  /** `staff.personal_mobile` first, then `staff.phone` — the number an operator is reached on. */
  phone: string | null;
  /**
   * `notification_settings.whatsapp_number` when one is configured for this user.
   *
   * Kept SEPARATE from `phone` because `notify-admin` sends to that column today, and "keep its
   * behaviour" means the number Lee has configured there keeps receiving WhatsApp even if it is
   * not the mobile on his staff row.
   */
  whatsappNumber: string | null;
  /** FCM registration tokens, one per device. */
  pushTokens: Array<{ token: string; platform: string }>;
}

export interface Route {
  event_type: string;
  channel: string;
  enabled: boolean;
}

export interface Pref {
  staff_id: string;
  event_type: string;
  channel: string;
  enabled: boolean;
}

/** Which transports have credentials. Gate 1's second half: live ≠ configured. */
export type ChannelConfigured = Record<NotifyChannel, boolean>;
/** Lee's switches. */
export type ChannelFlags = Record<NotifyChannel, boolean>;

export type SkipReason =
  /** `notify_channel_*` is false — Lee has not turned this transport on. */
  | "channel_off"
  /** The company route for this event × channel is off. */
  | "route_off"
  /** This person has it switched off. */
  | "pref_off"
  /** No credentials: no Twilio, no Firebase service account, no RESEND_API_KEY. */
  | "not_configured"
  /** Nobody to send to: no phone, no email, no registered device. */
  | "no_address"
  /** An identical send already succeeded for this event — a retry, not a second notification. */
  | "already_sent";

export interface PlannedSend {
  channel: NotifyChannel;
  staffId: string;
  /** Phone, email address, or the count of devices for push. */
  to: string;
  /** For push only: the tokens this send covers. */
  tokens?: string[];
  send: true;
}

export interface PlannedSkip {
  channel: NotifyChannel;
  staffId: string;
  to: string | null;
  send: false;
  reason: SkipReason;
}

export type Planned = PlannedSend | PlannedSkip;

export interface PlanInput {
  event: NotifyEvent;
  recipients: Recipient[];
  routes: Route[];
  prefs: Pref[];
  flags: ChannelFlags;
  configured: ChannelConfigured;
  /** `${channel}:${recipient}` pairs already sent for this event's idempotency key. */
  alreadySent?: Set<string>;
}

/**
 * The key that makes a retry a no-op.
 *
 * Derived from the ENTITY, because that is what makes two calls the same event: `sale.paid` for
 * order X is one notification however many times Stripe retries the webhook. With no entity
 * there is nothing stable to key on, and this returns null rather than inventing something —
 * an idempotency key that includes a timestamp deduplicates nothing and would be a lie about
 * what the index protects.
 */
export function deriveIdempotencyKey(event: NotifyEvent): string | null {
  if (event.idempotencyKey) return event.idempotencyKey;
  if (event.entity?.type && event.entity?.id) {
    return `${event.type}:${event.entity.type}:${event.entity.id}`;
  }
  return null;
}

/** The address a channel needs for this recipient, or null. */
export function addressFor(channel: NotifyChannel, r: Recipient): string | null {
  switch (channel) {
    case "sms":
      return r.phone?.trim() || null;
    case "whatsapp":
      // The configured WhatsApp number wins: see the field's comment.
      return r.whatsappNumber?.trim() || r.phone?.trim() || null;
    case "email":
      return r.email?.trim() || null;
    case "push":
      return r.pushTokens.length > 0 ? `${r.pushTokens.length} device(s)` : null;
  }
}

/**
 * Every decision, for every recipient, on every channel. Never fewer: a channel missing from
 * this list would be a silence, and silence is the defect.
 */
export function planNotifications(input: PlanInput): Planned[] {
  const { event, recipients, routes, prefs, flags, configured } = input;
  const alreadySent = input.alreadySent ?? new Set<string>();
  const loud = isAlwaysLoud(event.type);

  const routeOn = new Map<string, boolean>(
    routes.map((r) => [`${r.event_type}:${r.channel}`, r.enabled]),
  );
  const prefOn = new Map<string, boolean>(
    prefs.map((p) => [`${p.staff_id}:${p.event_type}:${p.channel}`, p.enabled]),
  );

  const planned: Planned[] = [];

  for (const r of recipients) {
    for (const channel of NOTIFY_CHANNELS) {
      const to = addressFor(channel, r);
      const skip = (reason: SkipReason): PlannedSkip => ({
        channel,
        staffId: r.staffId,
        to,
        send: false,
        reason,
      });

      // GATE 1 — the transport. Applies even to the always-loud events, because a channel with
      // no credentials cannot physically send and pretending otherwise produces a log full of
      // failures instead of one honest skip.
      if (!flags[channel]) {
        planned.push(skip("channel_off"));
        continue;
      }
      if (!configured[channel]) {
        planned.push(skip("not_configured"));
        continue;
      }

      // GATES 2 AND 3 — policy and preference. Bypassed for the four events that say the safety
      // machinery has failed; see ALWAYS_LOUD.
      if (!loud) {
        // An absent route row reads as OFF. A new event type must not start sending on every
        // channel the moment somebody deploys it.
        if (routeOn.get(`${event.type}:${channel}`) !== true) {
          planned.push(skip("route_off"));
          continue;
        }
        if (prefOn.get(`${r.staffId}:${event.type}:${channel}`) !== true) {
          planned.push(skip("pref_off"));
          continue;
        }
      }

      if (!to) {
        planned.push(skip("no_address"));
        continue;
      }

      if (alreadySent.has(`${channel}:${to}`)) {
        planned.push(skip("already_sent"));
        continue;
      }

      planned.push({
        channel,
        staffId: r.staffId,
        to,
        send: true,
        ...(channel === "push" ? { tokens: r.pushTokens.map((t) => t.token) } : {}),
      });
    }
  }

  return planned;
}

/**
 * The request contract, as a function rather than as four `if`s in a serve() handler.
 *
 * WHY IT MOVED HERE. The three guards this replaces were asserted by SOURCE SCAN — "the file
 * contains the string UNKNOWN_EVENT_TYPE" — and mutation showed what that is worth: deleting
 * `!isEventType(event.type)` from the condition left the string in place, in the response body,
 * and the suite stayed green. A validator that returns its refusal is executable, so the tests
 * can hand it a bad request and read the answer.
 */
export type NotifyRequestProblem =
  | { code: "BAD_BODY"; error: string }
  | { code: "UNKNOWN_EVENT_TYPE"; error: string }
  | { code: "MISSING_COPY"; error: string }
  | { code: "NO_AUDIENCE"; error: string };

export type NotifyRequest = { event: NotifyEvent; audience: Audience };

export function isNotifyEventType(value: unknown): value is NotifyEventType {
  return typeof value === "string" && (NOTIFY_EVENTS as readonly string[]).includes(value);
}

export function parseNotifyRequest(
  body: unknown,
): { ok: true; request: NotifyRequest } | { ok: false; problem: NotifyRequestProblem } {
  if (!body || typeof body !== "object") {
    return { ok: false, problem: { code: "BAD_BODY", error: "A JSON body is required" } };
  }

  const { event, audience } = body as { event?: Partial<NotifyEvent>; audience?: Audience };

  if (!event || !isNotifyEventType(event.type)) {
    return {
      ok: false,
      problem: {
        code: "UNKNOWN_EVENT_TYPE",
        error: `event.type must be one of: ${NOTIFY_EVENTS.join(", ")}`,
      },
    };
  }

  if (!event.title?.trim() || !event.body?.trim()) {
    return {
      ok: false,
      problem: {
        code: "MISSING_COPY",
        error: "event.title and event.body are required — a push with no words is a buzz",
      },
    };
  }

  const roles = audience?.roles ?? [];
  const staffIds = audience?.staffIds ?? [];
  if (roles.length === 0 && staffIds.length === 0) {
    return {
      ok: false,
      problem: {
        code: "NO_AUDIENCE",
        error: "audience needs roles or staffIds — a notification to nobody is a silent failure",
      },
    };
  }

  return {
    ok: true,
    request: {
      event: {
        type: event.type,
        title: event.title.trim(),
        body: event.body.trim(),
        link: event.link,
        entity: event.entity,
        idempotencyKey: event.idempotencyKey,
        bellWrittenElsewhere: event.bellWrittenElsewhere,
      },
      audience: { roles, staffIds },
    },
  };
}

// ── the I/O half, with both sides injected ─────────────────────────────────

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface PushTokenResult {
  token: string;
  ok: boolean;
  /** True when FCM says the token is dead and it should be pruned. */
  invalid?: boolean;
  error?: string;
}

export interface Transports {
  sms(to: string, text: string): Promise<SendResult>;
  whatsapp(to: string, text: string): Promise<SendResult>;
  email(to: string, subject: string, html: string): Promise<SendResult>;
  push(tokens: string[], event: NotifyEvent): Promise<PushTokenResult[]>;
}

export interface LogRow {
  admin_user_id: string | null;
  event_type: string;
  channel: string;
  recipient: string | null;
  message: string;
  status: "sent" | "failed" | "skipped" | "pending";
  entity_type?: string | null;
  entity_id?: string | null;
  idempotency_key?: string | null;
  provider_message_id?: string | null;
  error?: string | null;
}

export interface Store {
  recipients(audience: Audience): Promise<Recipient[]>;
  routes(): Promise<Route[]>;
  prefs(staffIds: string[], eventType: string): Promise<Pref[]>;
  flags(): Promise<ChannelFlags>;
  /** `${channel}:${recipient}` for every SENT row already carrying this key. */
  alreadySent(idempotencyKey: string | null): Promise<Set<string>>;
  log(rows: LogRow[]): Promise<void>;
  pruneToken(token: string): Promise<void>;
}

export interface DispatchOutcome {
  channel: NotifyChannel | "bell";
  staffId: string;
  to: string | null;
  status: "sent" | "failed" | "skipped";
  reason?: SkipReason;
  error?: string;
}

export interface DispatchResult {
  eventType: NotifyEventType;
  idempotencyKey: string | null;
  recipients: number;
  outcomes: DispatchOutcome[];
  /** Tokens FCM rejected and this run removed. */
  prunedTokens: string[];
}

/** The plain-text body a phone shows: title, then the sentence, then the link if there is one. */
export function textFor(event: NotifyEvent, siteUrl?: string): string {
  const link = event.link && siteUrl ? `\n${siteUrl.replace(/\/+$/, "")}${event.link}` : "";
  return `${event.title}\n${event.body}${link}`;
}

/** Minimal, plain email. A payment notification that looks like marketing gets filed as such. */
export function emailFor(event: NotifyEvent, siteUrl?: string): { subject: string; html: string } {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const url = event.link && siteUrl ? `${siteUrl.replace(/\/+$/, "")}${event.link}` : null;
  return {
    subject: `${event.title} — ICE Alarm España`,
    html: [
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">',
      `<p style="font-weight:600;margin:0 0 8px">${esc(event.title)}</p>`,
      `<p style="margin:0 0 12px">${esc(event.body)}</p>`,
      url ? `<p style="margin:0"><a href="${esc(url)}">${esc(url)}</a></p>` : "",
      "</div>",
    ].join(""),
  };
}

/**
 * Plan, send, log — and log the skips too.
 *
 * EVERY DECISION BECOMES A ROW. A skip is `status = 'skipped'` with the reason in `error`, which
 * is what makes "why did nobody get this" answerable from the table instead of from Deno logs
 * nobody keeps. The bell rows are written first and separately: the bell is in-app, costs
 * nothing, and is not one of the four gated channels — it is how a notification survives a phone
 * being in a drawer.
 */
export async function dispatchNotifications(
  event: NotifyEvent,
  audience: Audience,
  deps: { transports: Transports; store: Store; configured: ChannelConfigured; siteUrl?: string },
): Promise<DispatchResult> {
  const { store, transports, configured, siteUrl } = deps;

  const recipients = await store.recipients(audience);
  const idempotencyKey = deriveIdempotencyKey(event);

  const [routes, flags, alreadySent] = await Promise.all([
    store.routes(),
    store.flags(),
    store.alreadySent(idempotencyKey),
  ]);
  const prefs = await store.prefs(recipients.map((r) => r.staffId), event.type);

  const planned = planNotifications({
    event,
    recipients,
    routes,
    prefs,
    flags,
    configured,
    alreadySent,
  });

  const outcomes: DispatchOutcome[] = [];
  const rows: LogRow[] = [];
  const prunedTokens: string[] = [];

  const base = {
    event_type: event.type,
    message: `${event.title} — ${event.body}`,
    entity_type: event.entity?.type ?? null,
    entity_id: event.entity?.id ?? null,
    idempotency_key: idempotencyKey,
  };

  // ── the bell ────────────────────────────────────────────────────────────
  if (!event.bellWrittenElsewhere) {
    for (const r of recipients) {
      rows.push({
        ...base,
        admin_user_id: r.userId,
        channel: "bell",
        recipient: r.userId,
        // The bell is read in-app and needs no idempotency key of its own: a second bell row is
        // visible and harmless, where a second SMS costs money and trust. Keyed anyway, so a
        // reader can tie a bell row to the sends that went with it.
        status: "pending",
      });
      outcomes.push({ channel: "bell", staffId: r.staffId, to: r.userId, status: "sent" });
    }
  }

  // ── the four channels ───────────────────────────────────────────────────
  for (const p of planned) {
    if (!p.send) {
      rows.push({
        ...base,
        admin_user_id: recipients.find((r) => r.staffId === p.staffId)?.userId ?? null,
        channel: p.channel,
        recipient: p.to,
        status: "skipped",
        error: p.reason,
      });
      outcomes.push({
        channel: p.channel,
        staffId: p.staffId,
        to: p.to,
        status: "skipped",
        reason: p.reason,
      });
      continue;
    }

    const userId = recipients.find((r) => r.staffId === p.staffId)?.userId ?? null;
    const text = textFor(event, siteUrl);

    if (p.channel === "push") {
      const results = await transports.push(p.tokens ?? [], event);
      for (const result of results) {
        if (result.invalid) {
          await store.pruneToken(result.token);
          prunedTokens.push(result.token);
        }
        rows.push({
          ...base,
          admin_user_id: userId,
          channel: "push",
          // The token, not the device count: "sent, but where?" has to be answerable, and a
          // token is the only identifier a device has.
          recipient: result.token,
          status: result.ok ? "sent" : "failed",
          error: result.ok ? null : (result.error ?? "push failed"),
        });
        outcomes.push({
          channel: "push",
          staffId: p.staffId,
          to: result.token,
          status: result.ok ? "sent" : "failed",
          error: result.error,
        });
      }
      continue;
    }

    let result: SendResult;
    if (p.channel === "sms") {
      result = await transports.sms(p.to, text);
    } else if (p.channel === "whatsapp") {
      result = await transports.whatsapp(p.to, text);
    } else {
      const mail = emailFor(event, siteUrl);
      result = await transports.email(p.to, mail.subject, mail.html);
    }

    rows.push({
      ...base,
      admin_user_id: userId,
      channel: p.channel,
      recipient: p.to,
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.providerMessageId ?? null,
      error: result.ok ? null : (result.error ?? `${p.channel} failed`),
    });
    outcomes.push({
      channel: p.channel,
      staffId: p.staffId,
      to: p.to,
      status: result.ok ? "sent" : "failed",
      error: result.error,
    });
  }

  // ONE write, at the end. Per-row inserts would leave a half-logged dispatch if the connection
  // dropped mid-loop, and the log is the only evidence any of this happened.
  await store.log(rows);

  return {
    eventType: event.type,
    idempotencyKey,
    recipients: recipients.length,
    outcomes,
    prunedTokens,
  };
}
