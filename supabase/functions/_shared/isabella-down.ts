/**
 * "Isabella is down" — the notification the 8 September outage did not produce.
 *
 * WHAT HAPPENED. The Anthropic balance hit zero. Every Isabella run failed, all day. Each
 * failure was recorded faithfully in `ai_runs.error_message` and TOLD NOBODY, while the admin
 * dashboard went on saying ACTIVE. The health pill added since makes it visible — but a pill is
 * a reader, not a notifier: it says so only to somebody who happens to open that page.
 *
 * WHERE IT FIRES FROM: the place that records the failure, which is the only place that knows.
 * Not from the pill, and not from a cron sweep of `ai_runs`: a sweep is a second thing to
 * monitor, and the last time this codebase scheduled one it spent months throwing
 * "unrecognized configuration parameter" on every fire.
 *
 * ONE PER HOUR, and the hour is not arbitrary. `src/lib/isabellaHealth.ts` calls the assistant
 * FAILING when there is at least one failed run in the last hour (`ERROR_WINDOW_MS`), so an
 * hourly key is exactly "the pill has turned red and stayed red" — pinned by a test that reads
 * that constant, so the two cannot drift apart. Without it, the 8 September outage would have
 * sent one WhatsApp per failed run for a day.
 */

const HOUR_MS = 60 * 60 * 1000;

/** `isabella.down:hour:2026-09-09T14` — stable for every failure inside one clock hour. */
export function hourlyKey(at: Date): string {
  return `isabella.down:hour:${at.toISOString().slice(0, 13)}`;
}

/**
 * How long the window is, in this file's own terms, so the mirror test has something to compare
 * `ERROR_WINDOW_MS` against.
 */
export const DEDUPE_WINDOW_MS = HOUR_MS;

/** First line of the error, trimmed — a title is one line and an API error can be a paragraph. */
export function summarise(errorMessage: string, limit = 160): string {
  const firstLine = errorMessage.split("\n")[0].trim();
  return firstLine.length > limit ? `${firstLine.slice(0, limit - 1)}…` : firstLine;
}

export interface IsabellaDownEvent {
  type: "isabella.down";
  title: string;
  body: string;
  link: string;
  idempotencyKey: string;
}

export function isabellaDownEvent(errorMessage: string, at: Date): IsabellaDownEvent {
  const detail = summarise(errorMessage) || "no error message recorded";
  return {
    type: "isabella.down",
    title: "Isabella is failing",
    // The likeliest cause named, because it was the actual cause and it is the one fixable in
    // two minutes by somebody holding a phone.
    body: `An Isabella run failed: ${detail}. Check the Anthropic balance and API key — the assistant is answering nobody until this clears.`,
    link: "/admin/isabella",
    idempotencyKey: hourlyKey(at),
  };
}

export interface ReportDeps {
  /** POST the event to the notify-staff function. Injected so the tests need no network. */
  post: (body: unknown) => Promise<{ ok: boolean; status: number }>;
  now?: () => Date;
}

/**
 * Raise it, and never let raising it break the caller.
 *
 * The caller is Isabella's own failure path. An exception here would replace a handled AI error
 * with an unhandled one — turning a degraded assistant into a 500 for the member who was
 * talking to her. So every outcome is a returned string, and nothing throws.
 */
export async function reportIsabellaDown(
  errorMessage: string,
  deps: ReportDeps,
): Promise<"sent" | "failed" | "errored"> {
  const at = (deps.now ?? (() => new Date()))();
  const event = isabellaDownEvent(errorMessage, at);
  try {
    const response = await deps.post({
      event,
      // super_admin AND admin: the brief's audience for the events that are not everybody's
      // business. An operator cannot top up an Anthropic balance.
      audience: { roles: ["super_admin", "admin"] },
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "errored";
  }
}
