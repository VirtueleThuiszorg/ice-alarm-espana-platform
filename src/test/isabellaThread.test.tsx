/**
 * WP6 G7 — Isabella's calls and chats appear in the thread they already belong to.
 *
 * The schema was never the problem. `20260907100400` checked the `conversation_messages →
 * conversations` join and found it already there, a NOT NULL FK since `20260204172318`. What was
 * missing is that **no screen read it**: every thread on every surface renders `messages` and
 * only `messages`, while Isabella writes to `conversation_messages` and `conversation_calls`.
 *
 * And `useAIChat` creates a `conversations` row for a chat session with the member's id on it —
 * so a member's conversation with Isabella was already showing in the operator's list, named
 * after the member, **empty**. An operator opens it, sees nothing, closes it.
 *
 * The grouping is where this can go quietly wrong, so most of what follows is about turns that
 * must NOT be dropped: a transcript whose call row never wrote (voice-handler writes it inside a
 * try/catch that swallows the error), and a voice turn with no call sid at all.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/stripComments";
import {
  episodeDuration,
  groupIsabellaEpisodes,
  mergeThread,
  turnCallSid,
  type ConversationCall,
  type ConversationTurn,
} from "@/lib/isabellaThread";
import { IsabellaEpisodeCard } from "@/components/messaging/IsabellaEpisodeCard";

// A `t` that interpolates, as `cannedReplies.test.tsx` does. Without an i18next instance the
// real hook returns the default string with `{{minutes}}` still in it, and a test that did not
// interpolate would let that ship.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : _k;
      const vars = (typeof fallback === "string" ? opts : fallback) ?? {};
      return text.replace(/\{\{(\w+)\}\}/g, (m, name) => (name in vars ? String(vars[name as string]) : m));
    },
    i18n: { language: "en" },
  }),
}));

const CONV = "conv-1";

const turn = (over: Partial<ConversationTurn>): ConversationTurn =>
  ({
    id: "t1",
    conversation_id: CONV,
    channel: "voice",
    role: "user",
    content: "hello",
    created_at: "2026-09-07T10:00:00Z",
    meta: null,
    ...over,
  }) as ConversationTurn;

const call = (over: Partial<ConversationCall>): ConversationCall =>
  ({
    id: "call-1",
    conversation_id: CONV,
    call_sid: "CA1",
    created_at: "2026-09-07T10:00:00Z",
    started_at: "2026-09-07T10:00:00Z",
    ended_at: "2026-09-07T10:03:30Z",
    status: "completed",
    direction: "inbound",
    from_number: "+34600111222",
    to_number: "+34950473199",
    recording_url: null,
    ...over,
  }) as ConversationCall;

afterEach(cleanup);

describe("grouping Isabella's turns into episodes", () => {
  it("puts a call's turns on that call, by the sid voice-handler writes into meta", () => {
    const episodes = groupIsabellaEpisodes(
      CONV,
      [call({})],
      [
        turn({ id: "a", meta: { callSid: "CA1" }, role: "assistant", content: "Hola, soy Isabel" }),
        turn({ id: "b", meta: { callSid: "CA1" }, content: "my pendant is beeping" }),
      ],
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ id: "call-1", channel: "voice", status: "completed" });
    expect(episodes[0].turns.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps a call that has no transcript, rather than hiding the call", () => {
    const episodes = groupIsabellaEpisodes(CONV, [call({})], []);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].turns).toEqual([]);
  });

  it("KEEPS a transcript whose call row never wrote — that write is best-effort", () => {
    const episodes = groupIsabellaEpisodes(CONV, [], [
      turn({ id: "a", meta: { callSid: "CA9" }, content: "I fell yesterday" }),
    ]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].turns[0].content).toBe("I fell yesterday");
  });

  it("keeps a voice turn with no call sid at all", () => {
    const episodes = groupIsabellaEpisodes(CONV, [], [turn({ id: "a", meta: null })]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].channel).toBe("voice");
  });

  it("makes ONE chat episode, because a chat session is one conversation", () => {
    const episodes = groupIsabellaEpisodes(CONV, [], [
      turn({ id: "a", channel: "chat", created_at: "2026-09-07T09:00:00Z" }),
      turn({ id: "b", channel: "chat", role: "assistant", created_at: "2026-09-07T09:01:00Z" }),
    ]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ channel: "chat", id: `chat:${CONV}` });
    expect(episodes[0].turns).toHaveLength(2);
  });

  it("orders episodes oldest first", () => {
    const episodes = groupIsabellaEpisodes(
      CONV,
      [
        call({ id: "late", call_sid: "CB", started_at: "2026-09-07T12:00:00Z" }),
        call({ id: "early", call_sid: "CA", started_at: "2026-09-07T08:00:00Z" }),
      ],
      [],
    );
    expect(episodes.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("reads the sid only when it is really there", () => {
    expect(turnCallSid(turn({ meta: { callSid: "CA1" } }))).toBe("CA1");
    expect(turnCallSid(turn({ meta: null }))).toBeNull();
    expect(turnCallSid(turn({ meta: { callSid: 42 } }))).toBeNull();
    expect(turnCallSid(turn({ meta: { callSid: "" } }))).toBeNull();
  });
});

describe("one timeline out of two sources", () => {
  const messages = [
    { id: "m1", created_at: "2026-09-07T09:00:00Z" },
    { id: "m2", created_at: "2026-09-07T11:00:00Z" },
  ];

  it("interleaves the call between the messages either side of it", () => {
    const episodes = groupIsabellaEpisodes(CONV, [call({ started_at: "2026-09-07T10:00:00Z" })], []);
    const items = mergeThread(messages, episodes);
    expect(items.map((i) => (i.kind === "message" ? i.message.id : "isabella"))).toEqual([
      "m1", "isabella", "m2",
    ]);
  });

  it("keeps every message even when there is nothing from Isabella", () => {
    expect(mergeThread(messages, [])).toHaveLength(2);
  });
});

describe("how long the call was", () => {
  it("is measured, not guessed", () => {
    expect(episodeDuration(groupIsabellaEpisodes(CONV, [call({})], [])[0])).toEqual({
      minutes: 3, seconds: 30,
    });
  });

  it("is null while the call has not ended — a running call has no duration to show", () => {
    const running = groupIsabellaEpisodes(CONV, [call({ ended_at: null })], [])[0];
    expect(episodeDuration(running)).toBeNull();
  });
});

describe("the card", () => {
  const withTurns = () =>
    groupIsabellaEpisodes(CONV, [call({})], [
      turn({ id: "a", meta: { callSid: "CA1" }, role: "assistant", content: "Soy Isabel" }),
      turn({ id: "b", meta: { callSid: "CA1" }, role: "user", content: "my pendant is beeping" }),
    ])[0];

  it("says what it is, when, how long and how many turns — without opening it", () => {
    render(<IsabellaEpisodeCard episode={withTurns()} viewer="staff" />);
    expect(screen.getByText(/Call with Isabella/i)).toBeInTheDocument();
    expect(screen.getByText(/3m 30s/)).toBeInTheDocument();
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
  });

  it("keeps the transcript closed until it is asked for", () => {
    render(<IsabellaEpisodeCard episode={withTurns()} viewer="staff" />);
    expect(screen.queryByText(/my pendant is beeping/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show transcript/i }));
    expect(screen.getByText(/my pendant is beeping/)).toBeInTheDocument();
  });

  it("names the human side for whoever is reading", () => {
    const { unmount } = render(<IsabellaEpisodeCard episode={withTurns()} viewer="member" />);
    fireEvent.click(screen.getByRole("button", { name: /Show transcript/i }));
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Isabella")).toBeInTheDocument();
    unmount();

    render(<IsabellaEpisodeCard episode={withTurns()} viewer="staff" />);
    fireEvent.click(screen.getByRole("button", { name: /Show transcript/i }));
    expect(screen.getByText("Caller")).toBeInTheDocument();
  });

  it("shows Twilio's own status word, not one of ours", () => {
    const episode = groupIsabellaEpisodes(CONV, [call({ status: "no-answer" })], [])[0];
    render(<IsabellaEpisodeCard episode={episode} viewer="staff" />);
    expect(screen.getByText("no-answer")).toBeInTheDocument();
  });

  it("says a call had no transcript instead of offering an empty expander", () => {
    const episode = groupIsabellaEpisodes(CONV, [call({})], [])[0];
    render(<IsabellaEpisodeCard episode={episode} viewer="staff" />);
    expect(screen.getByText(/No transcript was recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /transcript/i })).toBeNull();
  });
});

describe("every thread renders it", () => {
  const THREADS = [
    "src/pages/client/MessagesPage.tsx",
    "src/pages/call-centre/MessagesPage.tsx",
    "src/pages/admin/MessagesPage.tsx",
  ];

  it("all three surfaces merge Isabella into the thread, through the one helper", () => {
    for (const file of THREADS) {
      const src = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
      expect(src, file).toContain("mergeThread(");
      expect(src, file).toContain("<IsabellaEpisodeCard");
    }
  });

  it("none of them reads conversation_messages for itself", () => {
    // One hook, one grouping. Three pages each deciding what an episode is would drift, which is
    // what happened with `sender_type` (G4).
    for (const file of THREADS) {
      const src = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
      expect(src, file).not.toContain('from("conversation_messages")');
      expect(src, file).not.toContain('from("conversation_calls")');
    }
  });
});
