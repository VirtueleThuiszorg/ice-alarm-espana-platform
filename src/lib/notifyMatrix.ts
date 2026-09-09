/**
 * THE NOTIFICATIONS SCREEN'S RULES, as functions rather than as JSX.
 *
 * A switch that changes nothing is worse than no switch: somebody turns SMS on for paid sales,
 * nothing arrives, and the conclusion is that notifications are broken. There are three
 * different reasons a cell can be dark, and the screen has to tell them apart:
 *
 *   1. YOU turned the channel off        → `notify_channel_*` in system_settings. Fixable here.
 *   2. the channel has no credentials    → no Twilio, no Firebase service account, no Resend
 *                                          key. Not fixable here, and the screen says where.
 *   3. this event is not routed to it    → `notification_routes`. That IS the switch.
 *
 * And a fourth state that is not "off" at all: the four events which say the SAFETY MACHINERY
 * HAS FAILED are sent regardless of every row in both tables (`ALWAYS_LOUD` in
 * _shared/notify-staff.ts). Rendering them as switches would be a lie about what a switch does,
 * so they render as always-on, with the reason.
 *
 * All of it is pure so the screen's claims are testable without a database: the failure mode
 * here is a UI that says "on" over a router that will not send.
 */

import {
  ALWAYS_LOUD,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  type NotifyChannel,
  type NotifyEventType,
} from "../../supabase/functions/_shared/notify-staff";

export { ALWAYS_LOUD, NOTIFY_CHANNELS, NOTIFY_EVENTS };
export type { NotifyChannel, NotifyEventType };

export interface EventSpec {
  event: NotifyEventType;
  group: "money" | "people" | "alerts" | "shifts" | "safety" | "system";
  label: string;
  /** What actually happened, in the words somebody would use about it. */
  detail: string;
}

/**
 * Every event, with the words a person reads. Grouped because nineteen rows in one list is a
 * wall, and the groups are the questions somebody actually has ("what do I hear about money?").
 */
export const EVENT_SPECS: readonly EventSpec[] = [
  // ── money ────────────────────────────────────────────────────────────────
  { event: "sale.paid", group: "money", label: "A sale is paid", detail: "The payment webhook activated a member. The number the business runs on." },
  { event: "payment.failed", group: "money", label: "A payment failed", detail: "A card was declined. Monitoring continues — the member is not cut off — but somebody has to call them." },
  { event: "subscription.cancelled", group: "money", label: "A subscription was cancelled", detail: "Somebody stopped paying." },
  { event: "hot.sales", group: "money", label: "A sales opportunity needs attention", detail: "Raised from the admin dashboard." },

  // ── people ───────────────────────────────────────────────────────────────
  { event: "lead.new", group: "people", label: "A new enquiry arrives", detail: "From the contact form, the join wizard or a partner referral. The contact page promises a reply within 24 hours." },
  { event: "partner.joined", group: "people", label: "A partner signed up", detail: "A new partner registration needs a welcome call and setup." },

  // ── alerts ───────────────────────────────────────────────────────────────
  { event: "sos.opened", group: "alerts", label: "An alert was raised", detail: "This notifies ABOUT an alert. It is not the SOS path and cannot change who is called." },
  { event: "sos.unassigned", group: "alerts", label: "An alert nobody has picked up", detail: "An open alert with no operator on it." },
  { event: "device.offline", group: "alerts", label: "A pendant stopped checking in", detail: "The device has missed its check-in window." },
  { event: "ev07b.alert", group: "alerts", label: "A device alert (EV-07B)", detail: "SOS button, fall, low battery, geofence or offline, from the pendant itself." },

  // ── shifts ───────────────────────────────────────────────────────────────
  { event: "shift.no_show", group: "shifts", label: "Somebody has not signed in for their shift", detail: "Their shift started and they are not on duty." },
  { event: "shift.no_coverage", group: "shifts", label: "Nobody is on duty", detail: "No operator is signed in. Immediate cover is needed." },
  { event: "shift.disconnected", group: "shifts", label: "An operator lost connection mid-shift", detail: "They were on duty and their heartbeat stopped." },

  // ── the safety machinery itself ───────────────────────────────────────────
  { event: "system.runner_failure", group: "safety", label: "A safety runner has failed", detail: "The escalation or monitoring runner is not running. The SOS ladder may be down." },
  { event: "escalation.call_failed", group: "safety", label: "An escalation call did not connect", detail: "A rung of the SOS ladder did not reach a human." },
  { event: "escalation.no_emergency_contacts", group: "safety", label: "A member has no emergency contacts", detail: "Nobody can be called for them. The last rung can never be served." },
  { event: "escalation.contacts_not_notified", group: "safety", label: "No emergency contact was reached", detail: "Contacts exist and none of them answered." },

  // ── system ───────────────────────────────────────────────────────────────
  { event: "isabella.down", group: "system", label: "Isabella is failing", detail: "A run failed — usually the Anthropic balance or API key. She is answering nobody until it clears." },
  { event: "test", group: "system", label: "A test notification", detail: 'Sent only by the "send a test" button, to you.' },
] as const;

/**
 * THE RATCHET. An event added to `NOTIFY_EVENTS` stops the build until it has a row above.
 *
 * Without it, a new event type would simply be absent from this screen — routed to nothing,
 * switchable by nobody, and silent in exactly the way the router was built to prevent.
 */
type Specified = (typeof EVENT_SPECS)[number]["event"];
type Unspecified = Exclude<NotifyEventType, Specified>;
const _everyEventHasASpec: Unspecified extends never ? true : never = true;
void _everyEventHasASpec;

export const GROUP_LABELS: Record<EventSpec["group"], string> = {
  money: "Money",
  people: "People",
  alerts: "Alerts",
  shifts: "Shifts and cover",
  safety: "The safety machinery itself",
  system: "System",
};

export const GROUP_ORDER: ReadonlyArray<EventSpec["group"]> = [
  "money",
  "people",
  "alerts",
  "shifts",
  "safety",
  "system",
];

export function specsByGroup(group: EventSpec["group"]): EventSpec[] {
  return EVENT_SPECS.filter((s) => s.group === group);
}

export function isAlwaysOn(event: NotifyEventType): boolean {
  return (ALWAYS_LOUD as readonly string[]).includes(event);
}

// ── channel liveness ────────────────────────────────────────────────────────

export const CHANNEL_LABELS: Record<NotifyChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
  email: "Email",
};

export type LivenessReason =
  /** `notify_channel_*` is false. The one reason fixable on this screen. */
  | "switch_off"
  /** No credentials. Named, with where they go. */
  | "no_credentials"
  /**
   * The switch is on and the credentials live in Edge secrets the browser cannot read. Not a
   * failure — an honest "not proven from here", answered by the test button, which asks the
   * function that would do the sending.
   */
  | "unproven";

export interface ChannelLiveness {
  channel: NotifyChannel;
  live: boolean;
  reason?: LivenessReason;
  /** What to do about it, in one line. */
  detail?: string;
}

export interface LivenessInput {
  /** `system_settings.notify_channel_*`. */
  flags: Partial<Record<NotifyChannel, boolean>>;
  /**
   * Credentials the browser CAN see: the Twilio account and numbers in `system_settings`, and
   * the email provider in `email_settings`. Absent means unknown, not false.
   */
  visible?: {
    twilioAccount?: boolean;
    smsNumber?: boolean;
    whatsappNumber?: boolean;
    emailProvider?: string | null;
  };
  /**
   * The authoritative answer, from a notify-staff response. The secrets that decide push and
   * email live in Edge secrets, so only the function that sends can say — and when it has said,
   * that overrides every guess here.
   */
  proven?: Partial<Record<NotifyChannel, boolean>>;
}

const CREDENTIAL_HOMES: Record<NotifyChannel, string> = {
  sms: "Settings → Communications needs a Twilio account and an SMS number.",
  whatsapp: "Settings → Communications needs a Twilio account and a WhatsApp number.",
  push: "The FIREBASE_SERVICE_ACCOUNT Edge secret is not set.",
  email: "The email provider's key (RESEND_API_KEY or the Gmail app password) is not set.",
};

/**
 * Is this channel live, and if not, WHICH of the three reasons?
 *
 * Reported switch-first, because that is the order of the fix: telling somebody their Twilio
 * number is missing when they have the channel switched off sends them to the wrong screen.
 */
export function channelLiveness(channel: NotifyChannel, input: LivenessInput): ChannelLiveness {
  if (input.flags[channel] !== true) {
    return {
      channel,
      live: false,
      reason: "switch_off",
      detail: "You have this channel switched off for everybody.",
    };
  }

  // The function that would send has spoken. Nothing here outranks that.
  const proven = input.proven?.[channel];
  if (proven === true) return { channel, live: true };
  if (proven === false) {
    return { channel, live: false, reason: "no_credentials", detail: CREDENTIAL_HOMES[channel] };
  }

  const visible = input.visible ?? {};
  if (channel === "sms" || channel === "whatsapp") {
    const number = channel === "sms" ? visible.smsNumber : visible.whatsappNumber;
    if (visible.twilioAccount === false || number === false) {
      return { channel, live: false, reason: "no_credentials", detail: CREDENTIAL_HOMES[channel] };
    }
    if (visible.twilioAccount === true && number === true) return { channel, live: true };
  }

  return {
    channel,
    live: false,
    reason: "unproven",
    detail: "Switched on. Its credentials are server-side — send a test notification to prove it.",
  };
}

export function livenessFor(input: LivenessInput): Record<NotifyChannel, ChannelLiveness> {
  return Object.fromEntries(
    NOTIFY_CHANNELS.map((c) => [c, channelLiveness(c, input)]),
  ) as Record<NotifyChannel, ChannelLiveness>;
}

// ── one cell ────────────────────────────────────────────────────────────────

export type CellState =
  /** Routed on, and the channel can send. */
  | "on"
  /** Routed off. The switch is the fix, and it is right here. */
  | "off"
  /** Sent regardless — one of the four that say the safety machinery has failed. */
  | "always_on"
  /** Routed on, but the channel cannot send. The switch is not the problem. */
  | "on_but_dead"
  /** Routed off AND the channel cannot send. Turning it on would change nothing today. */
  | "off_and_dead";

export interface RouteRow {
  event_type: string;
  channel: string;
  enabled: boolean;
}

/** An ABSENT route row reads as OFF — the router's rule, applied identically here. */
export function routeEnabled(routes: RouteRow[], event: string, channel: string): boolean {
  return routes.some((r) => r.event_type === event && r.channel === channel && r.enabled === true);
}

export function cellState(
  event: NotifyEventType,
  channel: NotifyChannel,
  routes: RouteRow[],
  liveness: Record<NotifyChannel, ChannelLiveness>,
): CellState {
  const live = liveness[channel]?.live === true;
  // The four bypass both tables, but NOT the channel: an unconfigured transport cannot
  // physically send, and saying "always on" over a dead channel would be the worst lie on this
  // screen — it is the alarm that says the SOS ladder is broken.
  if (isAlwaysOn(event)) return live ? "always_on" : "on_but_dead";

  const routed = routeEnabled(routes, event, channel);
  if (routed) return live ? "on" : "on_but_dead";
  return live ? "off" : "off_and_dead";
}

/** Is this cell's switch editable? The four are not, and neither is a cell nobody may edit. */
export function isCellEditable(event: NotifyEventType, canEdit: boolean): boolean {
  return canEdit && !isAlwaysOn(event);
}

// ── per-staff preferences ───────────────────────────────────────────────────

export interface PrefRow {
  staff_id: string;
  event_type: string;
  channel: string;
  enabled: boolean;
}

/** An ABSENT preference row reads as OFF, exactly as the router reads it. */
export function prefEnabled(prefs: PrefRow[], staffId: string, event: string, channel: string): boolean {
  return prefs.some(
    (p) => p.staff_id === staffId && p.event_type === event && p.channel === channel && p.enabled === true,
  );
}

/**
 * WOULD THIS PERSON ACTUALLY BE TOLD? The whole point of showing a per-staff matrix: their
 * switch, the company route, the transport — all three, in the router's own order.
 *
 * Kept identical to `planNotifications`' gate order on purpose. A screen that answers this
 * question differently from the router is worse than no screen.
 */
export function wouldReach(
  event: NotifyEventType,
  channel: NotifyChannel,
  input: {
    routes: RouteRow[];
    prefs: PrefRow[];
    staffId: string;
    liveness: Record<NotifyChannel, ChannelLiveness>;
  },
): { reach: boolean; blockedBy?: "channel" | "route" | "pref" } {
  if (input.liveness[channel]?.live !== true) return { reach: false, blockedBy: "channel" };
  if (isAlwaysOn(event)) return { reach: true };
  if (!routeEnabled(input.routes, event, channel)) return { reach: false, blockedBy: "route" };
  if (!prefEnabled(input.prefs, input.staffId, event, channel)) return { reach: false, blockedBy: "pref" };
  return { reach: true };
}

// ── which of the four things the screen shows ───────────────────────────────

export type MatrixView = "loading" | "error" | "schema_missing" | "ready";

/**
 * WHAT THE SCREEN RENDERS, decided here rather than in a chain of early returns in the
 * component — so the decision can be tested, and so the two states that must never be confused
 * cannot be.
 *
 * "NOTHING IS ROUTED ANYWHERE" IS A TRUE AND FRIGHTENING STATEMENT. It must not be what a
 * missing table looks like, and it must not be what a failed read looks like either. An empty
 * grid rendered for either would tell an admin their notifications are all off, and the honest
 * answers ("this migration has not been applied" / "this could not be read") are both
 * actionable where the empty grid is not.
 *
 * `error` outranks `schema_missing`: a read that failed for some other reason tells us nothing
 * about whether the tables exist.
 */
export function matrixView(state: {
  isLoading: boolean;
  error: unknown;
  schemaMissing: boolean;
}): MatrixView {
  if (state.isLoading) return "loading";
  if (state.error) return "error";
  if (state.schemaMissing) return "schema_missing";
  return "ready";
}
