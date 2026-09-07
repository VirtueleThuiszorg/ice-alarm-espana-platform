import type { Tables } from "@/integrations/supabase/types";

/**
 * ISABELLA'S CALLS AND CHATS, IN THE THREAD THEY ALREADY BELONG TO — WP6 G7.
 *
 * *"Join conversation_messages (Isabella) to conversations so her calls appear as a card in the
 * thread."* `20260907100400` checked the join and found it already there — a NOT NULL FK since
 * `20260204172318`. Nothing was missing in the schema. What was missing is that **no screen ever
 * read it.**
 *
 * ── WHAT THAT LOOKS LIKE TODAY ─────────────────────────────────────────────────────────────
 *
 * Isabella writes to two tables nothing renders:
 *
 *   `conversation_calls`     one row per voice call — direction, started_at, ended_at, status
 *   `conversation_messages`  the turns, `role` + `content`, `channel` of `voice` or `chat`
 *
 * Every thread on every surface — the member's, the call centre's, the admin's — reads
 * `messages` and only `messages`. And `useAIChat` CREATES a conversation row for a chat session
 * (`source: 'chat'`, with the member's id when they are signed in), so:
 *
 *   **a member's conversation with Isabella appears in the operator's list as an EMPTY thread.**
 *
 * Not missing — present, named after the member, and blank. An operator opening it sees nothing
 * and closes it. The whole transcript is one table away.
 *
 * ── EPISODES, NOT MESSAGES ─────────────────────────────────────────────────────────────────
 *
 * Isabella's turns are not interleaved into the thread one bubble at a time. A four-minute call
 * is thirty short turns, and thirty bubbles would bury the two human messages either side of it
 * — the thread would become the transcript rather than containing it. One card per episode,
 * openable, is the shape the brief asks for and the right one.
 *
 * A VOICE episode is a `conversation_calls` row; its turns are the `conversation_messages` whose
 * `meta.callSid` matches. A CHAT episode is the chat turns of the conversation, which is one
 * session because `useAIChat` creates a conversation per session.
 *
 * TURNS WITH NO CALL ARE NOT DROPPED. A voice turn whose `meta.callSid` matches no call row
 * becomes its own episode rather than disappearing. This is not hypothetical: `voice-handler`
 * writes the call record inside a try/catch that swallows the error as best-effort, so a
 * transcript can outlive its header row. Losing a transcript because its header row
 * failed to write is the failure this whole increment is about.
 *
 * NOTHING IS SUMMARISED, SCORED OR INTERPRETED HERE. The card shows what was said, when, and by
 * whom. A generated summary of a care conversation is a clinical judgement wearing a UI, and
 * CLAUDE.md's red lines apply to any code on this path.
 */

export type ConversationCall = Tables<"conversation_calls">;
export type ConversationTurn = Tables<"conversation_messages">;

export type EpisodeChannel = "voice" | "chat";

export interface IsabellaEpisode {
  /** Stable across refetches: the call row's id, or the conversation + channel for chat. */
  id: string;
  channel: EpisodeChannel;
  /** When the episode starts — what the thread is sorted by. */
  startedAt: string | null;
  endedAt: string | null;
  /** `initiated`, `completed`, `no-answer`… straight from Twilio; never reworded. */
  status: string | null;
  direction: string | null;
  turns: ConversationTurn[];
}

export type ThreadItem<TMessage> =
  | { kind: "message"; at: string | null; message: TMessage }
  | { kind: "isabella"; at: string | null; episode: IsabellaEpisode };

/** `meta` is `Json`; the call sid is written by `voice-handler` as `meta.callSid`. */
export function turnCallSid(turn: ConversationTurn): string | null {
  const meta = turn.meta as { callSid?: unknown } | null;
  const sid = meta && typeof meta === "object" ? meta.callSid : null;
  return typeof sid === "string" && sid ? sid : null;
}

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

const byTime = (a: { at: string | null }, b: { at: string | null }) => time(a.at) - time(b.at);

/**
 * Group one conversation's call rows and Isabella turns into episodes, oldest first.
 */
export function groupIsabellaEpisodes(
  conversationId: string,
  calls: ConversationCall[],
  turns: ConversationTurn[],
): IsabellaEpisode[] {
  const bySid = new Map<string, ConversationTurn[]>();
  const chat: ConversationTurn[] = [];
  const orphanVoice: ConversationTurn[] = [];

  for (const turn of [...turns].sort((a, b) => time(a.created_at) - time(b.created_at))) {
    if (turn.channel === "chat") {
      chat.push(turn);
      continue;
    }
    const sid = turnCallSid(turn);
    if (!sid) {
      orphanVoice.push(turn);
      continue;
    }
    const existing = bySid.get(sid);
    if (existing) existing.push(turn);
    else bySid.set(sid, [turn]);
  }

  const episodes: IsabellaEpisode[] = [];

  for (const call of calls) {
    const sid = call.call_sid;
    const callTurns = sid ? (bySid.get(sid) ?? []) : [];
    if (sid) bySid.delete(sid);
    episodes.push({
      id: call.id,
      channel: "voice",
      startedAt: call.started_at ?? call.created_at ?? null,
      endedAt: call.ended_at ?? null,
      status: call.status ?? null,
      direction: call.direction ?? null,
      turns: callTurns,
    });
  }

  // A transcript whose call row never wrote still gets a card, keyed on the sid.
  for (const [sid, callTurns] of bySid) {
    episodes.push({
      id: `sid:${sid}`,
      channel: "voice",
      startedAt: callTurns[0]?.created_at ?? null,
      endedAt: callTurns[callTurns.length - 1]?.created_at ?? null,
      status: null,
      direction: null,
      turns: callTurns,
    });
  }

  if (orphanVoice.length) {
    episodes.push({
      id: `voice:${conversationId}`,
      channel: "voice",
      startedAt: orphanVoice[0]?.created_at ?? null,
      endedAt: orphanVoice[orphanVoice.length - 1]?.created_at ?? null,
      status: null,
      direction: null,
      turns: orphanVoice,
    });
  }

  if (chat.length) {
    episodes.push({
      id: `chat:${conversationId}`,
      channel: "chat",
      startedAt: chat[0]?.created_at ?? null,
      endedAt: chat[chat.length - 1]?.created_at ?? null,
      status: null,
      direction: null,
      turns: chat,
    });
  }

  return episodes.sort((a, b) => time(a.startedAt) - time(b.startedAt));
}

/**
 * One timeline out of two sources, oldest first — so each surface maps over ONE array.
 *
 * The interleave lives here rather than in the three pages that render a thread. The last thing
 * left to those three independently was which `sender_type` an internal note carries; two got it
 * wrong (G4).
 */
export function mergeThread<TMessage extends { created_at?: string | null }>(
  messages: TMessage[],
  episodes: IsabellaEpisode[],
): ThreadItem<TMessage>[] {
  const items: ThreadItem<TMessage>[] = [
    ...messages.map((message) => ({ kind: "message" as const, at: message.created_at ?? null, message })),
    ...episodes.map((episode) => ({ kind: "isabella" as const, at: episode.startedAt, episode })),
  ];
  return items.sort(byTime);
}

/** Whole minutes and seconds, or null when the call has not ended. Never a guessed duration. */
export function episodeDuration(episode: IsabellaEpisode): { minutes: number; seconds: number } | null {
  if (!episode.startedAt || !episode.endedAt) return null;
  const ms = time(episode.endedAt) - time(episode.startedAt);
  if (ms <= 0) return null;
  const total = Math.round(ms / 1000);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
