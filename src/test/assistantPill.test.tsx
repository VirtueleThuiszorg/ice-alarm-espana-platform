/**
 * THE ASSISTANT PILL, AND THE GREEN DOT THAT MEANT SOMETHING ELSE — R3.
 *
 * *"RIGHT = Assistant outline pill, bell, A/A text size, EN/ES, initials avatar + name + role."*
 *
 * Two things were wrong, and the second is the one that matters.
 *
 * 1. The entry point to the assistant was a bare round avatar with no visible label. An
 *    unlabelled circular image in a header is a photograph, or an account menu, or a decoration
 *    — a member has to press it to find out. The `aria-label` meant a screen reader was better
 *    served than the person looking at the screen.
 *
 * 2. IT CARRIED A PULSING GREEN DOT, hard-coded `bg-green-500`, driven by nothing. The member
 *    surface already uses a small round green dot for exactly ONE thing: `is_online`, the
 *    pendant's connectivity, rendered from real data on the dashboard and the device page. So
 *    the same mark on a header button teaches a member that a green dot means their alarm is
 *    connected, and then shows them one that does not.
 *
 * The load-bearing assertions here are therefore absences: no green dot, no ping animation, no
 * red (R1 rations red to the page's own action), and no initials invented for a member whose
 * name we do not have.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

let avatarUrl: string | null = null;

vi.mock("@/hooks/useAIAgents", () => ({
  useAIAgent: () => ({ data: avatarUrl ? { avatar_url: avatarUrl } : null }),
}));
vi.mock("@/hooks/useMemberProfile", () => ({
  useMemberProfile: () => ({ data: { first_name: "Ana" } }),
}));
vi.mock("./../components/chat/AIChatWidget", () => ({ AIChatWidget: () => null }));
vi.mock("@/components/chat/AIChatWidget", () => ({ AIChatWidget: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

import { MemberChatButton } from "@/components/chat/MemberChatButton";

afterEach(() => {
  cleanup();
  avatarUrl = null;
});

describe("the pill", () => {
  it("says what it is, in words on the screen", () => {
    render(<MemberChatButton memberId="m1" />);
    expect(screen.getByRole("button", { name: /Assistant/ })).toBeVisible();
  });

  it("is an outline pill, not brand red — R1 rations red to the page's action", () => {
    const { container } = render(<MemberChatButton memberId="m1" />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("border");
    expect(button?.className.split(/\s+/)).not.toContain("bg-primary");
  });

  it("is not a bare circle any more", () => {
    const { container } = render(<MemberChatButton memberId="m1" />);
    expect(container.querySelector("button")?.className).not.toMatch(/rounded-full/);
  });

  it("carries NO green dot and NO ping — that mark means `is_online` on this surface", () => {
    const { container } = render(<MemberChatButton memberId="m1" />);
    expect(container.innerHTML).not.toContain("bg-green-500");
    expect(container.innerHTML).not.toContain("animate-ping");
  });

  it("and the source does not keep one for a future re-enable", () => {
    // Asserted on the className strings, not on the file text: the comment explaining why the
    // dot is gone names it, and asserting a word is absent from a file matches the prose about
    // its absence — a slip this codebase has made three times.
    const src = read("src/components/chat/MemberChatButton.tsx");
    const classNames = [...src.matchAll(/className=(?:"([^"]*)"|\{[^}]*"([^"]*)"[^}]*\})/g)]
      .map((m) => m[1] ?? m[2] ?? "")
      .join(" ");
    expect(classNames).not.toContain("bg-green-500");
    expect(classNames).not.toContain("animate-ping");
  });

  it("shows the agent avatar when there is one, with no duplicate announcement", async () => {
    /*
      THE PRELOAD HAS TO BE MADE TO HAPPEN.

      The component only renders the <img> once its own `new Image()` has fired `onload`, which
      jsdom never does. The first version of this test wrote `if (img) expect(...)`, so it asserted
      NOTHING — a mutation setting `alt="AI Help"` sailed through it. A conditional assertion is
      not a weaker assertion, it is the absence of one.
    */
    const realImage = window.Image;
    class LoadingImage {
      onload: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (window as unknown as { Image: unknown }).Image = LoadingImage;

    avatarUrl = "https://example.test/isabella.png";
    const { container } = render(<MemberChatButton memberId="m1" />);

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    // Empty alt: the word "Assistant" is right beside it, and an alt of its own makes a screen
    // reader announce the same thing twice.
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("");
    expect(screen.getByRole("button", { name: /Assistant/ })).toBeVisible();

    (window as unknown as { Image: unknown }).Image = realImage;
  });

  it("falls back to an icon that is hidden from assistive tech", () => {
    const { container } = render(<MemberChatButton memberId="m1" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the header cluster — R3's order and its initials avatar", () => {
  const layout = () => read("src/components/layout/ClientLayout.tsx");

  /**
   * The DESKTOP header block only.
   *
   * A file-wide `indexOf` is wrong here in two ways at once, and both bit on the first run: it
   * matches the `import` line for a component, and it matches the MOBILE header's copy of
   * `<TextSizeControl>`, which sits 2.5kB earlier in the file. Ordering assertions have to be
   * scoped to the thing being ordered.
   */
  function desktopHeader(): string {
    const src = layout();
    const start = src.indexOf('<header className="hidden md:flex');
    expect(start, "the desktop header block moved or was renamed").toBeGreaterThan(-1);
    const end = src.indexOf("</header>", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("keeps R3's order: readiness notice, then Assistant, bell, A/A, EN/ES, name", () => {
    const header = desktopHeader();
    const order = [
      "<MemberReadinessNotice",
      "<MemberChatButton",
      "<NotificationBell",
      "<TextSizeControl",
      "<LanguageSelector",
      "member-account-trigger",
    ];
    const positions = order.map((needle) => {
      const at = header.indexOf(needle);
      expect(at, `${needle} is not in the desktop header`).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("and the readiness notice is the LEFT slot, not part of the right cluster", () => {
    const header = desktopHeader();
    expect(header.indexOf("<MemberReadinessNotice")).toBeLessThan(header.indexOf("Right side"));
  });

  it("derives initials from the NAME, never from the email fallback", () => {
    /*
      `displayName` falls back to the email prefix, so initials taken from it would render a
      plausible "LW" for somebody who never told us their name. A generic icon says "we do not
      know yet", which is true. Invented initials say something false, quietly.
    */
    const src = layout();
    expect(src).toMatch(/memberInfo\?\.first_name && memberInfo\?\.last_name/);
    expect(src).not.toMatch(/displayName\[0\]|displayName\.slice\(0, ?2\)|displayName\.charAt/);
  });

  it("still renders the icon when there is no name to take initials from", () => {
    const src = layout();
    expect(src).toMatch(/initials \? \(/);
    expect(src).toMatch(/<User className="h-4 w-4 text-primary-foreground" \/>/);
  });
});
