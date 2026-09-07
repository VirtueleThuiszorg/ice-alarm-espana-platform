/**
 * WHAT A CONVERSATION ROW SAYS ABOUT ITSELF — WP4 M23 and WP6 G7a.
 *
 * Two things brought this together.
 *
 * ── 1. THE PREVIEW SAID "undefined" ────────────────────────────────────────────────────────
 *
 * Every conversation list built its preview like this:
 *
 *     lastMsg?.content?.substring(0, 60) + (lastMsg?.content && … ? "..." : "") || ""
 *
 * With no message row, `lastMsg?.content?.substring(...)` is `undefined` and the second term is
 * `""`. `undefined + ""` is the STRING `"undefined"`, which is truthy, so `|| ""` never fires
 * and the row renders the word **undefined**.
 *
 * That was invisible while every conversation had messages. WP6 G7 made it visible: Isabella
 * creates a `conversations` row per chat session and writes her turns to `conversation_messages`,
 * so an Isabella-only conversation has no `messages` at all — and there is one of those for
 * every member who has ever used the chat widget.
 *
 * ── 2. THE MEMBER'S DASHBOARD SHOWED A NUMBER ──────────────────────────────────────────────
 *
 * M23: *"Messages' last thread"*. The card said "2 unread messages", which tells a member how
 * much is waiting and nothing about what it is. The same preview text answers both.
 *
 * ── WHY ISABELLA IS A FALLBACK AND NOT A MERGE ─────────────────────────────────────────────
 *
 * The newest of the two wins, so a chat that ended before a staff reply does not overwrite it.
 * Isabella's turns are not otherwise interleaved into the preview: the card has one line, and a
 * transcript's last line is often "Is there anything else?", which is not what the thread is
 * about.
 */

export interface PreviewMessage {
  content: string | null;
  created_at: string | null;
}

export type PreviewSource = "message" | "isabella" | "none";

export interface ConversationPreview {
  text: string;
  at: string | null;
  source: PreviewSource;
}

const DEFAULT_LENGTH = 80;

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Truncated with an ellipsis, and never the string "undefined". */
export function previewText(content: string | null | undefined, maxLength = DEFAULT_LENGTH): string {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function conversationPreview(
  lastMessage: PreviewMessage | null | undefined,
  lastIsabellaTurn: PreviewMessage | null | undefined,
  maxLength = DEFAULT_LENGTH,
): ConversationPreview {
  const message = previewText(lastMessage?.content, maxLength);
  const turn = previewText(lastIsabellaTurn?.content, maxLength);

  if (message && turn) {
    return time(lastIsabellaTurn?.created_at) > time(lastMessage?.created_at)
      ? { text: turn, at: lastIsabellaTurn?.created_at ?? null, source: "isabella" }
      : { text: message, at: lastMessage?.created_at ?? null, source: "message" };
  }
  if (message) return { text: message, at: lastMessage?.created_at ?? null, source: "message" };
  if (turn) return { text: turn, at: lastIsabellaTurn?.created_at ?? null, source: "isabella" };
  return { text: "", at: null, source: "none" };
}
