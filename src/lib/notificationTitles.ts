/**
 * WHAT A NOTIFICATION IS CALLED, WHERE A PERSON READS IT.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * `notification_log` has no `title` column. It has `event_type` and `message`. `useNotifications`
 * mapped the row like this:
 *
 *     title: (row.event_type as string) ?? "Notification",
 *
 * so the title of every notification, of every type, on both surfaces that render one, was the
 * raw routing key: **`shift.no_show`**. Sixty-five of those stacked in one bell is what sent
 * somebody looking, but the bell has been doing it since it was built, for `sale.paid` and
 * `escalation.call_failed` alike. A key is not a sentence; it is an identifier that leaked
 * through the layer that was supposed to translate it.
 *
 * ── WHY THIS IS NOT A NEW LIST ──────────────────────────────────────────────
 *
 * `notifyMatrix.ts` already holds `EVENT_SPECS`: every event the router can emit, with a `label`
 * (what happened) and a `detail` (in the words somebody would use about it), written for the
 * notifications settings screen. A second list of titles would be a second opinion about what
 * `shift.no_show` is called, and the two would disagree within a month — the screen would say
 * "Somebody has not signed in for their shift" and the bell something else.
 *
 * So this module is an ACCESSOR over that list, not a copy. It follows that coverage is a
 * COMPILE-TIME property rather than a test: `notifyMatrix.ts` carries a ratchet
 * (`_everyEventHasASpec`) that fails the build when an event is added to `NOTIFY_EVENTS` without
 * a spec — so every event the router emits has a title here, necessarily, and a new event cannot
 * arrive untitled.
 *
 * ── AND WHY THE RAW KEY IS STILL UNREACHABLE FOR AN UNKNOWN TYPE ────────────
 *
 * Rows already in the table predate any of this and can carry a type no longer in the list
 * (`notification_log` keeps history; `NOTIFY_EVENTS` is today's registry). `humaniseEventType`
 * turns whatever it finds into a sentence, so a three-year-old row reads as "Shift · no show"
 * rather than `shift.no_show`. There is no path through this module that returns a key.
 */

import { EVENT_SPECS, type NotifyEventType } from "@/lib/notifyMatrix";

/** Translator shape — `t` from react-i18next, without importing it into a pure module. */
type Translate = (key: string, fallback: string) => string;

const SPEC_BY_EVENT = new Map(EVENT_SPECS.map((spec) => [spec.event as string, spec]));

/**
 * `shift.no_show` → `shift_no_show`.
 *
 * i18next reads a dot as a level of nesting, so the raw event type as a key would ask for
 * `notifications.event.shift` → `no_show`, which is a different (and absent) place in the file.
 */
export function notificationEventKey(eventType: string): string {
  return eventType.replace(/\./g, "_");
}

/**
 * A readable sentence for a type with no spec — the fallback that keeps a key off the screen.
 *
 * `shift.no_show` → `Shift · No show`. The domain is kept rather than dropped: "No show" alone
 * loses which part of the platform is talking, and these rows are read in a list where that is
 * the difference between an operator and a member.
 */
export function humaniseEventType(eventType: string): string {
  const words = (part: string) => part.replace(/[_-]+/g, " ").trim();
  const sentence = (part: string) =>
    part.length === 0 ? part : part[0].toUpperCase() + part.slice(1).toLowerCase();

  const parts = eventType.split(".").map(words).filter(Boolean);
  if (parts.length === 0) return "Notification";
  return parts.map(sentence).join(" · ");
}

/** What this notification is called. Never the raw key. */
export function notificationTitle(eventType: string, t: Translate): string {
  const spec = SPEC_BY_EVENT.get(eventType);
  const fallback = spec ? spec.label : humaniseEventType(eventType);
  return t(`notifications.event.${notificationEventKey(eventType)}.title`, fallback);
}

/**
 * The line under the title.
 *
 * THE STORED MESSAGE ALREADY CONTAINS A TITLE. `notify-staff` composes it as
 * `${event.title} — ${event.body}` (planNotifications), so rendering the mapped title above the
 * whole message printed the event's name twice, once in each of two different wordings. The
 * first segment is dropped for that reason — and only the FIRST, because a body may legitimately
 * contain a dash of its own.
 *
 * A pre-migration row is shaped `[sms] Title — Body` (the runtime's fallback insert moves the
 * channel into the text when `channel` has no column yet). The marker is kept: a reader looking
 * at an old row still needs to know whether it was a bell entry or an SMS attempt.
 *
 * An empty message falls back to the spec's `detail` — what this kind of event means — rather
 * than to blank space.
 */
export function notificationBody(message: string | null | undefined, eventType: string, t: Translate): string {
  const raw = (message ?? "").trim();

  if (raw.length > 0) {
    const channel = raw.match(/^\[[a-z]+\]\s*/i)?.[0] ?? "";
    const rest = raw.slice(channel.length);
    const separator = rest.indexOf(" — ");
    const body = separator === -1 ? rest : rest.slice(separator + 3);
    const trimmed = body.trim();
    // A message that is ONLY a title leaves nothing under it; keep what there is rather than
    // rendering an empty line.
    if (trimmed.length > 0) return `${channel}${trimmed}`;
    return raw;
  }

  const spec = SPEC_BY_EVENT.get(eventType);
  if (!spec) return "";
  return t(`notifications.event.${notificationEventKey(eventType)}.body`, spec.detail);
}

/** Every event type that has a title here — the i18n test walks this. */
export const TITLED_EVENT_TYPES: readonly NotifyEventType[] = EVENT_SPECS.map((s) => s.event);
