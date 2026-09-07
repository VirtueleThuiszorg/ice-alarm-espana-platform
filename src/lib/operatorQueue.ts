/**
 * THE OPERATOR'S QUEUE — WP6 G8. *"queue with Open/Waiting/Resolved, priority, assignee."*
 *
 * Most of that already existed on `call-centre/MessagesPage`: statuses, a priority field, an
 * assignee select and filters for mine/unassigned/unread. What was missing is the question an
 * operator actually works from, which none of those answers:
 *
 *   **which of these is waiting on US?**
 *
 * "Open" does not answer it. A conversation stays open after we reply, and an operator scanning
 * a list of open threads cannot tell the ones where the member spoke last — the ones with
 * somebody at the other end waiting — from the ones already answered. On a care service the
 * cost of that is not a slow reply; it is a member who wrote about something that frightened
 * them and got silence.
 *
 * WAITING-ON IS DERIVED, NEVER STORED. A column would be a second source of truth needing a
 * writer on every send path — and there are three of those (G4's whole problem). The last
 * message's `sender_type` already says it.
 *
 * A CONVERSATION WITH NO MESSAGES IS WAITING ON US. That is not a hypothetical either: since
 * WP6 G7, an Isabella-only conversation shows in this list with an empty `messages` table behind
 * it, and it is precisely the one an operator should pick up.
 *
 * ORDERING, and the argument for each step:
 *   1. waiting on us first — everything else is reading, not working
 *   2. then priority, because urgent means urgent
 *   3. then OLDEST first, which is the opposite of the list's default. A queue sorted
 *      newest-first serves whoever wrote most recently and lets the person who has waited
 *      longest sink. That is the failure this ordering exists to prevent.
 *
 * It is offered as a filter tab, not imposed as the list's default sort: an operator scanning
 * for "what just came in" is doing something legitimate too, and silently reversing their list
 * is not an improvement anybody asked for.
 */

export type WaitingOn = "us" | "member" | "nobody";

/** The statuses that mean nobody is waiting: an operator has closed the thread. */
export const SETTLED_STATUSES = ["resolved", "closed"];

export interface QueueConversation {
  id: string;
  status: string | null;
  priority: string | null;
  last_message_at: string | null;
  /** `sender_type` of the newest message, or null when the thread has none. */
  last_message_sender?: string | null;
}

export function waitingOn(conversation: QueueConversation): WaitingOn {
  if (conversation.status && SETTLED_STATUSES.includes(conversation.status)) return "nobody";
  const sender = conversation.last_message_sender;
  // Anything that is not the member speaking last means the ball is with them — including a
  // `staff_internal` note, which is us writing to ourselves and is not a reply to anybody.
  if (!sender) return "us";
  return sender === "member" ? "us" : "member";
}

/** Lowest number sorts first. An unset priority is `normal`, never urgent and never last. */
export const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function priorityRank(priority: string | null | undefined): number {
  return PRIORITY_RANK[priority ?? "normal"] ?? PRIORITY_RANK.normal;
}

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Waiting on us, then priority, then longest-waiting first. */
export function compareQueue(a: QueueConversation, b: QueueConversation): number {
  const waiting = Number(waitingOn(b) === "us") - Number(waitingOn(a) === "us");
  if (waiting !== 0) return waiting;
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) return priority;
  return time(a.last_message_at) - time(b.last_message_at);
}

/** The queue: everything unsettled that is waiting on us, worst-waited first. */
export function operatorQueue<T extends QueueConversation>(conversations: T[]): T[] {
  return conversations.filter((c) => waitingOn(c) === "us").sort(compareQueue);
}
