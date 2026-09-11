/**
 * WP4 M23 + WP6 G7a — what a conversation row says about itself.
 *
 * TWO THINGS, ONE FIX.
 *
 * 1. **The preview rendered the word "undefined".** Every list built it as
 *    `lastMsg?.content?.substring(0, n) + (… ? "..." : "") || ""`. With no message row that is
 *    `undefined + ""`, which is the STRING `"undefined"` — truthy, so the `|| ""` never fired.
 *    `MessagesPanel`'s variant produced `"undefined..."`. It was invisible while every
 *    conversation had messages, and WP6 G7 made it visible: Isabella creates a `conversations`
 *    row per chat session and writes her turns to `conversation_messages`, so there is now an
 *    empty-`messages` conversation for every member who has used the chat widget.
 *
 * 2. **The dashboard card showed a number.** M23 asks for the last thread. "2 unread messages"
 *    tells a member how much is waiting and nothing about what it is.
 *
 * The first assertion below is the one that would have caught the live defect, and it is written
 * as the string it must never produce.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { stripComments } from "./helpers/stripComments";
import { conversationPreview, previewText } from "@/lib/conversationPreview";

const ROOT = process.cwd();

// ── the doubles ─────────────────────────────────────────────────────────────────────────────
let conversationRow: Record<string, unknown> | null = null;
let messageRow: Record<string, unknown> | null = null;
let turnRow: Record<string, unknown> | null = null;
let turnFails = false;
let tablesQueried: string[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      tablesQueried.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = () => {
        if (table === "conversation_messages" && turnFails) {
          return Promise.resolve({ data: null, error: new Error("boom") });
        }
        return Promise.resolve({
          data:
            table === "conversations" ? conversationRow
            : table === "messages" ? messageRow
            : turnRow,
          error: null,
        });
      };
      return chain;
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));

afterEach(() => {
  cleanup();
  tablesQueried = [];
  turnFails = false;
});

// ── 1. the string that must never appear ────────────────────────────────────────────────────
describe("the preview text", () => {
  it("IS NOT THE WORD \"undefined\" when there is nothing to preview", () => {
    expect(previewText(undefined)).toBe("");
    expect(previewText(null)).toBe("");
    expect(previewText("")).toBe("");
    expect(conversationPreview(null, null).text).toBe("");
    expect(conversationPreview(null, null).text).not.toContain("undefined");
  });

  it("does not append an ellipsis to something that was not truncated", () => {
    // `MessagesPanel` appended "..." unconditionally, so every short message ended in one.
    expect(previewText("Thank you")).toBe("Thank you");
  });

  it("truncates a long message and says so", () => {
    const long = "a".repeat(200);
    const out = previewText(long, 80);
    expect(out).toHaveLength(81);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses the newlines a multi-line message would otherwise put in a one-line row", () => {
    expect(previewText("first line\n\nsecond line")).toBe("first line second line");
  });
});

// ── 2. Isabella as a fallback ───────────────────────────────────────────────────────────────
describe("which of the two sources the row shows", () => {
  const msg = { content: "We have posted your pendant", created_at: "2026-09-07T10:00:00Z" };
  const turn = { content: "Is there anything else?", created_at: "2026-09-07T09:00:00Z" };

  it("uses the ordinary message when there is one", () => {
    const p = conversationPreview(msg, turn);
    expect(p.source).toBe("message");
    expect(p.text).toBe("We have posted your pendant");
  });

  it("falls back to Isabella when the thread has no messages at all", () => {
    const p = conversationPreview(null, turn);
    expect(p.source).toBe("isabella");
    expect(p.text).toBe("Is there anything else?");
  });

  it("prefers whichever is NEWER when both exist", () => {
    const newerTurn = { ...turn, created_at: "2026-09-07T11:00:00Z" };
    expect(conversationPreview(msg, newerTurn).source).toBe("isabella");
  });

  it("says `none` rather than inventing a source", () => {
    expect(conversationPreview(null, null).source).toBe("none");
  });
});

// ── 3. the dashboard card's hook ────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

async function renderProbe() {
  const { useMemberLastThread } = await import("@/hooks/useMemberLastThread");
  function Probe() {
    const { data, isLoading } = useMemberLastThread();
    if (isLoading) return <p>loading</p>;
    if (!data) return <p>no thread</p>;
    return (
      <div>
        <p>{data.subject ?? "(no subject)"}</p>
        <p>{data.preview.text}</p>
        <p>{data.preview.source}</p>
      </div>
    );
  }
  render(<Probe />, { wrapper });
}

describe("the member's last thread", () => {
  it("is the newest message in their newest conversation", async () => {
    conversationRow = { id: "c1", subject: "Pendant question", last_message_at: "2026-09-07T10:00:00Z" };
    messageRow = { content: "We have posted your pendant", created_at: "2026-09-07T10:00:00Z", sender_type: "staff" };
    turnRow = null;
    await renderProbe();
    expect(await screen.findByText("Pendant question")).toBeInTheDocument();
    expect(screen.getByText("We have posted your pendant")).toBeInTheDocument();
  });

  it("shows Isabella's last turn when the thread has no messages", async () => {
    conversationRow = { id: "c1", subject: null, last_message_at: "2026-09-07T10:00:00Z" };
    messageRow = null;
    turnRow = { content: "I have noted that for you", created_at: "2026-09-07T10:00:00Z" };
    await renderProbe();
    expect(await screen.findByText("I have noted that for you")).toBeInTheDocument();
    expect(screen.getByText("isabella")).toBeInTheDocument();
  });

  it("does NOT read conversation_messages when there is an ordinary message to show", async () => {
    conversationRow = { id: "c1", subject: "s", last_message_at: "2026-09-07T10:00:00Z" };
    messageRow = { content: "hello", created_at: "2026-09-07T10:00:00Z", sender_type: "staff" };
    turnRow = null;
    await renderProbe();
    await screen.findByText("hello");
    expect(tablesQueried).not.toContain("conversation_messages");
  });

  it("is nothing at all when the member has no conversation", async () => {
    conversationRow = null;
    messageRow = null;
    turnRow = null;
    await renderProbe();
    expect(await screen.findByText("no thread")).toBeInTheDocument();
  });

  it("is nothing when the conversation exists but is genuinely empty", async () => {
    conversationRow = { id: "c1", subject: "s", last_message_at: null };
    messageRow = null;
    turnRow = null;
    await renderProbe();
    expect(await screen.findByText("no thread")).toBeInTheDocument();
  });
});

describe("the Isabella fallback read", () => {
  it("is null when it fails, so ONE unreadable row cannot empty the whole list", async () => {
    // Every caller is inside a per-row map. A throw here would take the list with it, and the
    // caller already handles "no preview" — which is the same outcome.
    const { fetchLastIsabellaTurn } = await import("@/lib/lastIsabellaTurn");
    turnFails = true;
    await expect(fetchLastIsabellaTurn("c1")).resolves.toBeNull();
  });
});

// ── 4. no list may build a preview by hand again ────────────────────────────────────────────
describe("every conversation list, in source", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p, out); continue; }
      if (/\.tsx?$/.test(name) && !p.includes(join("src", "test"))) out.push(p);
    }
    return out;
  };

  it("nobody concatenates a preview out of a possibly-undefined substring", () => {
    // The exact shape of the live defect: `?.substring(...) + (...)`. One `previewText()` now.
    const offenders = walk(join(ROOT, "src")).filter((p) =>
      /\?\.substring\([^)]*\)\s*\+/.test(stripComments(readFileSync(p, "utf8"))),
    );
    expect(offenders).toEqual([]);
  });

  const LISTS = [
    "src/pages/client/MessagesPage.tsx",
    "src/pages/client/SupportPage.tsx",
    "src/pages/call-centre/MessagesPage.tsx",
    "src/pages/admin/MessagesPage.tsx",
    "src/components/call-centre/MessagesPanel.tsx",
  ];

  it("the five lists go through the shared preview", () => {
    /*
      THE INTENT IS UNCHANGED; WHERE IT IS SATISFIED MOVED.

      This used to require every one of the five to call `conversationPreview(`
      and `fetchLastIsabellaTurn(` itself. They now go through
      `fetchConversationSummaries`, which calls the preview in ONE place and gets
      Isabella's last turn from the `conversation_summaries` view — that is what
      removed the per-row query each list was issuing (66 requests to render the
      member's Messages page).

      So the assertion is the same rule expressed against the new shape: a list
      either calls the shared preview directly, or reaches it through the shared
      fetcher. What is still forbidden is a list building a preview by hand,
      which the test above enforces for the whole tree.
    */
    for (const file of LISTS) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      const viaFetcher = src.includes("fetchConversationSummaries(");
      const viaDirectCall = src.includes("conversationPreview(");
      expect(
        viaFetcher || viaDirectCall,
        `${file} builds a conversation list without the shared preview`,
      ).toBe(true);
    }
  });

  it("no list fetches a preview or an unread count PER ROW any more", () => {
    /*
      The defect this whole change removed, pinned by its shape rather than by a
      number. Each of these lists mapped over the conversations and awaited a
      Supabase call inside the map — one for the last message, one for the count,
      and a third for Isabella when the thread had none.

      `conversation_summaries` (migration 20260911190000) does that work in the
      database with a LATERAL and a LIMIT 1, so the list costs one round trip
      whatever its length. A `supabase` call inside a per-row `map` is the
      signature of the regression coming back.
    */
    for (const file of LISTS) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      expect(
        src,
        `${file} awaits a Supabase call inside a per-row map — that is the N+1 again`,
      ).not.toMatch(/\.map\(\s*async[^)]*\)?[\s\S]{0,600}?await\s+supabase/);
    }
  });

  it("the shared fetcher is the only client of the view", () => {
    // Five lists reading the view directly would be five places to keep in step.
    const readers = walk(join(ROOT, "src")).filter((p) =>
      stripComments(readFileSync(p, "utf8")).includes('from("conversation_summaries")'),
    );
    expect(readers.map((p) => p.slice(p.indexOf("src/")))).toEqual([
      "src/lib/conversationSummaries.ts",
    ]);
  });

  it("the dashboard card shows the thread, not only a count", () => {
    const src = stripComments(readFileSync(join(ROOT, "src/pages/client/ClientDashboard.tsx"), "utf8"));
    expect(src).toContain("useMemberLastThread(");
    expect(src).toContain("lastThread.preview.text");
  });
});
