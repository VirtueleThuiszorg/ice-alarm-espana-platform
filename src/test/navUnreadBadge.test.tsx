/**
 * THE UNREAD COUNT ON THE NAV — WP6.
 *
 * *"read_at, unread count on the nav."* The `read_at` half was already right: members have no
 * UPDATE policy on `messages` by design, and `markMemberConversationRead` routes through
 * `member-self-service`'s `mark_read`, which verifies the conversation belongs to the caller.
 * Both client pages call it. The count existed too — **inline in `ClientDashboard`**, which is
 * why nothing else could reach it and the nav had no badge.
 *
 * WHAT COUNTS AS UNREAD, and the exclusion that matters most:
 *
 *   `sender_type = 'staff'` — since `20260907100400`, `staff_internal` is a legal sender_type.
 *   A member cannot read an internal note (a RESTRICTIVE policy, proven in the RLS harness), so
 *   counting "everything that is not mine" would raise a badge for a message that does not
 *   exist as far as they are concerned: a number they can never make go down.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

type Filter = [string, unknown];
let messageFilters: Filter[] = [];
let conversationRows: { id: string }[] = [];
let unreadCount = 0;

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const filters: Filter[] = [];
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    if (table === "messages") messageFilters = filters;
    return table === "messages"
      ? chain
      : Promise.resolve({ data: conversationRows, error: null });
  };
  chain.in = () => chain;
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ count: unreadCount, error: null }).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));

import { useMemberUnread } from "@/hooks/useMemberUnread";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  messageFilters = [];
  conversationRows = [{ id: "c1" }];
  unreadCount = 3;
});
afterEach(() => cleanup());

describe("what the hook counts", () => {
  it("counts staff messages that are not read", async () => {
    const { result } = renderHook(() => useMemberUnread(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(3));
    expect(messageFilters).toContainEqual(["sender_type", "staff"]);
    expect(messageFilters).toContainEqual(["is_read", false]);
  });

  it("EXCLUDES staff_internal by asking for 'staff', not for 'not mine'", async () => {
    /*
      The load-bearing assertion. A member cannot read an internal note, so a badge raised by one
      is a number they can never clear. Counting `sender_type <> 'member'` would do exactly that.
    */
    const { result } = renderHook(() => useMemberUnread(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(3));
    const senderFilter = messageFilters.find(([col]) => col === "sender_type");
    expect(senderFilter?.[1]).toBe("staff");
    expect(read("src/hooks/useMemberUnread.ts")).not.toMatch(/\.neq\(\s*"sender_type"/);
  });

  it("is zero, without asking about messages at all, when there are no conversations", async () => {
    conversationRows = [];
    const { result } = renderHook(() => useMemberUnread(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(0));
    expect(messageFilters).toEqual([]);
  });
});

describe("the nav badge", () => {
  const layout = () => read("src/components/layout/ClientLayout.tsx");

  it("hangs off the Messages item, from the shared hook", () => {
    const src = layout();
    expect(src).toContain("useMemberUnread");
    expect(src).toMatch(/badge: unreadCount,/);
  });

  it("renders only for a count GREATER than zero", () => {
    // A "0" beside Messages is not information; it is a decoration a member reads and dismisses
    // every time, until they stop reading the number at all.
    expect(layout()).toMatch(/typeof item\.badge === "number" && item\.badge > 0/);
  });

  it("announces a sentence, not a bare number", () => {
    // "3" next to "Messages" tells a screen-reader user nothing about what there are three of.
    // Sliced around the badge rather than matched across the file: a character-distance regex
    // between `aria-hidden` and `{item.badge}` breaks the moment a className grows, which is a
    // test that fails for the wrong reason.
    /*
      Sliced to the whole `hasBadge` branch rather than matched by character distance across the
      file: a distance regex breaks the moment a className grows, and a test that fails for the
      wrong reason teaches people to widen it rather than read it. The window is the branch — the
      visible number, the collapsed dot, and the screen-reader sentence all live inside it.
    */
    const src = layout();
    const start = src.indexOf("{hasBadge && (");
    expect(start, "the badge branch moved or was renamed").toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("</NavLink>", start));

    expect(block).toContain('aria-hidden="true"');
    expect(block).toContain("{item.badge}");
    expect(block).toContain("sr-only");
    expect(block).toContain("navigation.unreadCount");
  });

  it("keeps a signal when the rail is COLLAPSED, where the number cannot fit", () => {
    // The label and the count are both hidden when collapsed. A tooltip alone is not enough:
    // it only exists for somebody who hovers, and a badge is meant to be seen without asking.
    const src = layout();
    expect(src).toMatch(/nav-dot-/);
    expect(src).toMatch(/TooltipContent[\s\S]{0,400}navigation\.unreadCount/);
  });

  it("R1/R2 — Ink, not brand red; red is rationed to the page's one action", () => {
    const src = layout();
    const badgeBlock = src.slice(src.indexOf("nav-badge-"), src.indexOf("nav-badge-") + 400);
    expect(badgeBlock).toContain("bg-foreground");
    expect(badgeBlock).not.toContain("bg-primary");
  });

  it("and the dashboard card uses the same tone, so there is one convention", () => {
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).toMatch(/<Badge className="bg-foreground text-background text-xs">/);
  });
});

describe("one definition of unread", () => {
  it("the dashboard no longer keeps its own query", () => {
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).toContain("useMemberUnread(");
    expect(dash).not.toMatch(/queryKey: \["member-unread-messages"/);
    expect(dash).not.toMatch(/\.eq\("sender_type", "staff"\)/);
  });

  it("mark-as-read still goes through the server, because members cannot UPDATE messages", () => {
    /*
      Not a change here — an assertion that it stays true. The direct client update this replaced
      was silently RLS-denied (PostgREST reports zero rows, not an error), so the badge never
      cleared and nothing looked broken.
    */
    for (const page of ["src/pages/client/MessagesPage.tsx", "src/pages/client/SupportPage.tsx"]) {
      expect(read(page)).toContain("markMemberConversationRead");
    }
    const helper = read("src/utils/notifications.ts");
    expect(helper).toContain('action: "mark_read"');
    expect(helper).not.toMatch(/from\("messages"\)[\s\S]{0,120}\.update\(/);
  });
});
