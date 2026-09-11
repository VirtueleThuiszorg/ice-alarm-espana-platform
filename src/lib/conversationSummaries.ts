import { supabase } from "@/integrations/supabase/client";
import { conversationPreview, type ConversationPreview } from "./conversationPreview";

/**
 * A CONVERSATION LIST, IN ONE QUERY.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 *
 * Three screens rendered a list of conversations, and all three built it the same
 * way: fetch the conversations, then FOR EVERY ROW fetch the last message, count
 * the unread replies, and — when the thread had no ordinary message — fetch
 * Isabella's last turn as a fallback.
 *
 *   src/pages/client/MessagesPage.tsx
 *   src/pages/client/SupportPage.tsx
 *   src/components/call-centre/MessagesPanel.tsx
 *
 * `lastIsabellaTurn.ts` said it out loud — *"Every conversation list here is
 * already one query per row; this must not become two"* — and it was already two,
 * and three for an Isabella-only thread. Measured, the member's Messages page
 * issued 66 Supabase requests on one load and Support 67, against a budget of six
 * (docs/perf/BASELINE.md).
 *
 * The `conversation_summaries` view (migration 20260911190000) does the per-row
 * work inside the database with a LATERAL and a LIMIT 1, and returns exactly the
 * rows the screen shows. This module is the ONE client that reads it, so the
 * three lists cannot drift apart again.
 *
 * ── WHAT IS NOT IN HERE ─────────────────────────────────────────────────────
 *
 * No state, no subscription, no react-query. Each screen keeps its own realtime
 * channel and its own loading state — this replaces the FETCH, not the screen.
 * Keeping it a plain async function is what let all three adopt it without any of
 * them changing how they re-render.
 */

/** One row of a conversation list, complete. */
export interface ConversationSummary {
  id: string;
  member_id: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  conversation_type: string | null;
  /** Staff-to-staff thread participants, as staff ids. */
  staff_participants: string[] | null;
  language: string | null;
  lead_id: string | null;
  source: string | null;
  last_channel: string | null;
  /** The newer of the last ordinary message and Isabella's last turn. */
  preview: ConversationPreview;
  /** Shorthand every caller already renders. */
  last_message_preview: string;
  /** Staff have replied and the member has not read it. */
  unread_from_staff: number;
  /** A member is waiting on the team. */
  unread_from_member: number;
  /** Anyone other than staff is waiting — `member` OR `system`. */
  unread_not_from_staff: number;
  /** Who spoke last. `waitingOn()` in the staff lists is derived from this. */
  last_message_sender_type: string | null;
  member_first_name: string | null;
  member_last_name: string | null;
  member_email: string | null;
  member_phone: string | null;
  member_preferred_language: string | null;
}

export interface ConversationSummaryOptions {
  /** Restrict to one member's threads. The member portal always passes this. */
  memberId?: string | null;
  /** Restrict to a set of statuses. The call centre passes open + pending. */
  statuses?: string[];
  /** Cap the list. */
  limit?: number;
}

/*
  `select("*")` ON A VIEW IS NOT THE `select("*")` THIS AUDIT IS REMOVING.

  The rule is "ask for the columns the page uses". On a TABLE, `*` breaks it —
  `members` has 40-odd columns and a list needs six. Here the view was defined to
  be exactly the columns these three lists render, and nothing else: the
  projection already happened, in SQL, where it also lets the planner satisfy the
  LATERALs from indexes.

  Naming them again in the client would restate that list in a second place, and
  a concatenated string defeats supabase-js's type inference anyway — the first
  version of this file did that and every field came back as `GenericStringError`.
*/
const COLUMNS = "*";

/**
 * ONE round trip, whatever the list length.
 *
 * Returns `[]` rather than throwing when the read fails: every caller rendered an
 * empty list on error before, and a list screen that throws takes the whole page
 * down with it.
 */
export async function fetchConversationSummaries(
  options: ConversationSummaryOptions = {},
): Promise<ConversationSummary[]> {
  const { memberId, statuses, limit } = options;

  let query = supabase
    .from("conversation_summaries")
    .select(COLUMNS)
    .order("last_message_at", { ascending: false });

  if (memberId) query = query.eq("member_id", memberId);
  if (statuses?.length) query = query.in("status", statuses);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    // `conversationPreview` takes the NEWER of the two and is the one place that
    // decides — the same function all three screens already called, so the text a
    // member sees is unchanged by this.
    const preview = conversationPreview(
      row.last_message_content === null && row.last_message_created_at === null
        ? null
        : { content: row.last_message_content, created_at: row.last_message_created_at },
      row.last_isabella_content === null && row.last_isabella_created_at === null
        ? null
        : { content: row.last_isabella_content, created_at: row.last_isabella_created_at },
    );

    return {
      id: row.id as string,
      member_id: row.member_id,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      assigned_to: row.assigned_to,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      conversation_type: row.conversation_type,
      staff_participants: row.staff_participants,
      language: row.language,
      lead_id: row.lead_id,
      source: row.source,
      last_channel: row.last_channel,
      preview,
      last_message_preview: preview.text,
      unread_from_staff: row.unread_from_staff ?? 0,
      unread_from_member: row.unread_from_member ?? 0,
      unread_not_from_staff: row.unread_not_from_staff ?? 0,
      last_message_sender_type: row.last_message_sender_type,
      member_first_name: row.member_first_name,
      member_last_name: row.member_last_name,
      member_email: row.member_email,
      member_phone: row.member_phone,
      member_preferred_language: row.member_preferred_language,
    };
  });
}
