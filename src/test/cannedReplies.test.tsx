/**
 * CANNED REPLIES — WP6 G5. What the picker must get right, and the one it exists to get right.
 *
 * `20260907100400`'s UNIQUE (shortcut, locale) carries the rule in its own comment: *"the
 * language is chosen from the member's preference rather than from the operator's."* The natural
 * implementation reads `i18n.language`, which in a call centre is whatever the last person left
 * the browser on — so a Dutch member would be sent a Spanish script by an operator who never saw
 * a language named anywhere. Most of what follows is that one rule, asserted from four angles:
 * the resolver, the query, the header, and a source scan of every call site.
 *
 * The other half is what must NOT happen: no substituting another language when the member's has
 * no rows (an operator cannot see a fallback, and sends it), and no picker on an internal note
 * (a script chosen with the toggle still on reaches nobody at all).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { stripComments } from "./helpers/stripComments";

import {
  cannedReplyLanguage,
  cannedReplyLanguageSpec,
  languageIsRecorded,
  matchesCannedReply,
  withCannedReply,
  type CannedReply,
} from "@/lib/cannedReplies";

// ── the supabase double: record every filter, so the query can be asserted ──────────────────
type Call = { table: string; eqs: [string, unknown][] };
let calls: Call[] = [];
let rows: CannedReply[] = [];
let failNext = false;

function builder(table: string) {
  const call: Call = { table, eqs: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    call.eqs.push([col, val]);
    return chain;
  };
  const resolve = () =>
    failNext ? { data: null, error: new Error("nope") } : { data: rows, error: null };
  let orderCalls = 0;
  chain.order = () => {
    orderCalls += 1;
    // The hook orders twice (category, then shortcut); only the last is awaited.
    return orderCalls >= 2 ? Promise.resolve(resolve()) : chain;
  };
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

// A `t` that INTERPOLATES. The component names the language inside the sentence, and a mock that
// returned the raw fallback would let `{{language}}` ship while every assertion still passed.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : _k;
      const vars = (typeof fallback === "string" ? opts : fallback) ?? {};
      return text.replace(/\{\{(\w+)\}\}/g, (m, name) =>
        name in vars ? String(vars[name as string]) : m,
      );
    },
    i18n: { language: "es" },
  }),
}));

const reply = (over: Partial<CannedReply> = {}): CannedReply =>
  ({
    id: "r1",
    shortcut: "/wait",
    locale: "en",
    title: "Please hold",
    body: "One moment while I check that for you.",
    category: "general",
    is_active: true,
    created_by: null,
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
    ...over,
  }) as CannedReply;

beforeEach(() => {
  calls = [];
  rows = [];
  failNext = false;
});
afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

// ── 1. the resolver ─────────────────────────────────────────────────────────────────────────
describe("which language a canned reply is in", () => {
  it("is the member's, for each language the column can hold", () => {
    expect(cannedReplyLanguage("en")).toBe("en");
    expect(cannedReplyLanguage("es")).toBe("es");
    expect(cannedReplyLanguage("nl")).toBe("nl");
  });

  it("falls back to English only when the value is absent or not a language we have", () => {
    expect(cannedReplyLanguage(null)).toBe("en");
    expect(cannedReplyLanguage(undefined)).toBe("en");
    expect(cannedReplyLanguage("de")).toBe("en");
  });

  it("says whether the language was RECORDED, so a default is never shown as a choice", () => {
    expect(languageIsRecorded("es")).toBe(true);
    expect(languageIsRecorded("en-GB")).toBe(true);
    expect(languageIsRecorded(null)).toBe(false);
    expect(languageIsRecorded("")).toBe(false);
    expect(languageIsRecorded("de")).toBe(false);
  });

  it("labels the language with its endonym", () => {
    expect(cannedReplyLanguageSpec("es").label).toBe("Español");
    expect(cannedReplyLanguageSpec(null).label).toBe("English");
  });
});

// ── 2. inserting into the composer ──────────────────────────────────────────────────────────
describe("inserting a reply into what the operator has already typed", () => {
  it("keeps what they typed and appends the body", () => {
    const out = withCannedReply("Hola Ana,", "One moment.");
    expect(out).toBe("Hola Ana,\n\nOne moment.");
  });

  it("does not leave a blank line in front of a reply typed into an empty box", () => {
    expect(withCannedReply("", "One moment.")).toBe("One moment.");
    expect(withCannedReply("   \n", "One moment.")).toBe("One moment.");
  });
});

// ── 3. the search box ───────────────────────────────────────────────────────────────────────
describe("searching the replies", () => {
  const r = reply({ shortcut: "/wait", title: "Please hold", body: "Un momento", category: "general" });

  it("an empty query matches everything", () => {
    expect(matchesCannedReply(r, "")).toBe(true);
    expect(matchesCannedReply(r, "   ")).toBe(true);
  });

  it("matches shortcut, title, body and category, case-insensitively", () => {
    expect(matchesCannedReply(r, "WAIT")).toBe(true);
    expect(matchesCannedReply(r, "hold")).toBe(true);
    expect(matchesCannedReply(r, "momento")).toBe(true);
    expect(matchesCannedReply(r, "GENERAL")).toBe(true);
  });

  it("does not match something absent, and survives a null category", () => {
    expect(matchesCannedReply(r, "invoice")).toBe(false);
    expect(matchesCannedReply(reply({ category: null }), "general")).toBe(false);
  });
});

// ── 4. the query ────────────────────────────────────────────────────────────────────────────
describe("the query the picker runs", () => {
  it("asks for the MEMBER's language and only the active replies", async () => {
    const { useCannedReplies } = await import("@/hooks/useCannedReplies");
    const { result } = renderHook(() => useCannedReplies("nl"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = calls.find((c) => c.table === "canned_replies");
    expect(call).toBeTruthy();
    expect(call!.eqs).toContainEqual(["locale", "nl"]);
    expect(call!.eqs).toContainEqual(["is_active", true]);
  });

  it("runs no query at all while the composer is on an internal note", async () => {
    const { useCannedReplies } = await import("@/hooks/useCannedReplies");
    renderHook(() => useCannedReplies("es", false), { wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.filter((c) => c.table === "canned_replies")).toHaveLength(0);
  });
});

// ── 5. the picker ───────────────────────────────────────────────────────────────────────────
async function renderPicker(props: Partial<{
  preferredLanguage: string | null;
  isInternalNote: boolean;
  onInsert: (b: string) => void;
}> = {}) {
  const { CannedReplyPicker } = await import("@/components/messaging/CannedReplyPicker");
  const onInsert = props.onInsert ?? vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CannedReplyPicker
        preferredLanguage={props.preferredLanguage ?? null}
        isInternalNote={props.isInternalNote}
        onInsert={onInsert}
      />
    </QueryClientProvider>,
  );
  return { onInsert };
}

describe("the picker an operator sees", () => {
  it("names the member's language on the trigger, before it is opened", async () => {
    await renderPicker({ preferredLanguage: "es" });
    expect(screen.getByRole("button", { name: /Quick replies/i })).toHaveTextContent("Español");
  });

  it("inserts the BODY of the reply that was clicked, and closes", async () => {
    rows = [reply({ id: "a", shortcut: "/hold", title: "Please hold", body: "Un momento, por favor." })];
    const { onInsert } = await renderPicker({ preferredLanguage: "es" });

    fireEvent.click(screen.getByRole("button", { name: /Quick replies/i }));
    const item = await screen.findByRole("button", { name: /Please hold/i });
    fireEvent.click(item);

    expect(onInsert).toHaveBeenCalledWith("Un momento, por favor.");
    await waitFor(() => expect(screen.queryByText(/Search replies/i)).toBeNull());
  });

  it("says the language was never recorded rather than passing the default off as a choice", async () => {
    rows = [reply()];
    await renderPicker({ preferredLanguage: null });
    fireEvent.click(screen.getByRole("button", { name: /Quick replies/i }));

    expect(await screen.findByText(/No language recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No language recorded/i)).toHaveTextContent("English");
  });

  it("does not say that when the member HAS a recorded language", async () => {
    rows = [reply()];
    await renderPicker({ preferredLanguage: "es" });
    fireEvent.click(screen.getByRole("button", { name: /Quick replies/i }));

    await screen.findByText(/Quick replies in Español/i);
    expect(screen.queryByText(/No language recorded/i)).toBeNull();
  });

  it("offers NOTHING from another language when the member's has no rows", async () => {
    // The rows that exist are English; the member is Dutch. A fallback would be invisible at the
    // moment it matters — the operator would send Dutch-labelled English and never know.
    rows = [];
    await renderPicker({ preferredLanguage: "nl" });
    fireEvent.click(screen.getByRole("button", { name: /Quick replies/i }));

    const empty = await screen.findByText(/No quick replies in Nederlands yet/i);
    expect(empty).toBeInTheDocument();
    expect(screen.queryByText(/One moment while I check/i)).toBeNull();
  });

  it("says a load FAILED rather than showing an empty list, which reads as 'none exist'", async () => {
    failNext = true;
    await renderPicker({ preferredLanguage: "es" });
    fireEvent.click(screen.getByRole("button", { name: /Quick replies/i }));

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("is disabled on an internal note, and says why", async () => {
    rows = [reply()];
    await renderPicker({ preferredLanguage: "es", isInternalNote: true });
    const trigger = screen.getByRole("button", { name: /Quick replies/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("title", expect.stringMatching(/internal note/i));
  });
});

// ── 6. every call site, in source ───────────────────────────────────────────────────────────
describe("no surface may resolve the language from anywhere but the member", () => {
  const SRC = join(process.cwd(), "src");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry) && !full.includes(`${join("src", "test")}`)) out.push(full);
    }
    return out;
  }

  const sites = walk(SRC)
    .flatMap((file) => {
      const src = stripComments(readFileSync(file, "utf8"));
      return [...src.matchAll(/preferredLanguage=\{([^}]*)\}/g)].map((m) => ({
        file,
        expr: m[1].trim(),
      }));
    });

  it("finds the call sites at all — an assertion over an empty list proves nothing", () => {
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });

  it("every one of them reads `preferred_language` off the member", () => {
    for (const site of sites) {
      expect(site.expr, `${site.file}: ${site.expr}`).toContain("preferred_language");
      expect(site.expr, `${site.file}: ${site.expr}`).not.toMatch(/i18n|useTranslation|(?<!preferred_)language/);
    }
  });

  it("all three staff composers offer the picker", () => {
    const composers = [
      "src/pages/call-centre/MessagesPage.tsx",
      "src/pages/admin/MessagesPage.tsx",
      "src/components/call-centre/MessagesPanel.tsx",
    ];
    for (const file of composers) {
      const src = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
      expect(src, file).toContain("<CannedReplyPicker");
    }
  });
});
