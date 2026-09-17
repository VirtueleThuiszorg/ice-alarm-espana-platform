/**
 * THE 24-HOUR NUMBER MUST NOT BE BEHIND THE HAMBURGER.
 *
 * `ClientLayout` renders the number once, at the bottom of `SidebarContent` — and that component
 * is used TWICE: as the desktop rail, and as the contents of the mobile `Sheet`. Below 768px the
 * rail is `hidden`, so the only copy of the number on a phone was inside a sheet that does not
 * exist until somebody presses a glyph in the corner.
 *
 * The A/A control one element away already had this argument won, in a comment in the same file:
 * *"A member who cannot read the screen cannot reliably find a control hidden behind a hamburger
 * — the one thing that fixes the problem must not be gated on solving it first."* It is right
 * about a font-size toggle. It is not less right about the emergency line.
 *
 * ── WHAT IS HERE AND WHAT IS NEXT DOOR ──────────────────────────────────────
 *
 * These are claims about the FILE: that the control exists outside the Sheet, that it cannot
 * become a dead one, and that nothing this change added displaced the two controls the brief
 * protects. Everything about SPACE — does a phone number fit beside an A/A control at 360px, and
 * what happens at the large text size — is measured in a real browser in
 * `e2e/memberEmergencyOneTap.spec.ts`, because it is a question jsdom cannot be asked.
 *
 * Source-read for the same reason `memberSidebarD12.test.tsx` is: `ClientLayout` needs an
 * authenticated member, a readiness view, unread counts, a bell, a chat button and a language
 * modal before it renders anything at all, and mocking six things to find out where a link sits
 * tests the mocks.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LAYOUT_PATH = "src/components/layout/ClientLayout.tsx";
const LAYOUT = readFileSync(join(ROOT, LAYOUT_PATH), "utf8");

/** Comments stripped — these are claims about code, and the comments quote what was replaced. */
const CODE = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The mobile top bar, sliced out by its own class string.
 *
 * Sliced rather than searched whole-file, so an assertion here cannot be satisfied by the
 * SIDEBAR's copy of the number — which is exactly the thing that was already there and already
 * unreachable on a phone.
 */
const BAR = (() => {
  const start = CODE.indexOf('<div className="md:hidden fixed top-0');
  const end = CODE.indexOf("{/* Mobile Sheet */}", start);
  expect(start, "the mobile top bar moved — this file's slice needs updating").toBeGreaterThan(-1);
  return CODE.slice(start, end > start ? end : undefined);
})();

/** `SidebarContent`, which is what the Sheet renders. Everything in here is behind a tap. */
const SIDEBAR_CONTENT = (() => {
  const start = CODE.indexOf("const SidebarContent = ");
  const end = CODE.indexOf("return (", start);
  return CODE.slice(start, end);
})();

describe("the control is in the bar, not in the menu", () => {
  it("the mobile bar carries a tel: link of its own", () => {
    expect(BAR).toContain('data-testid="mobile-emergency-number"');
    expect(BAR).toMatch(/<a\s+href=\{phoneHref\}/);
  });

  it("and it is NOT inside SidebarContent, which is what the Sheet renders", () => {
    /*
      The negative is the whole point of the change. `SidebarContent` keeps its own block — that
      is the desktop rail's, and the brief says leave it exactly as it is — so this asserts the
      NEW id is absent from it rather than that the sidebar has no number.
    */
    expect(SIDEBAR_CONTENT).not.toContain("mobile-emergency-number");
    expect(SIDEBAR_CONTENT).toContain('data-testid="sidebar-emergency-number"');
  });

  it("the desktop header does not grow a third copy — one control per viewport", () => {
    const header = CODE.slice(
      CODE.indexOf('<header className="hidden md:flex'),
      CODE.indexOf("</header>"),
    );
    expect(header).not.toContain("emergency-number");
    expect(header).not.toContain("telHref");
  });
});

describe("it cannot become a dead control", () => {
  it("renders nothing at all when no number is configured", () => {
    // WP1b: show nothing, never a fake number — and never a `tel:` that dials nothing. There
    // are now two of these in the file, the sidebar's and the bar's, so this counts them.
    expect((CODE.match(/\{phoneHref && \(/g) ?? [])).toHaveLength(2);
    expect(CODE).toMatch(/const phoneHref = telHref\(companySettings\.emergency_phone\)/);
  });

  it("dials the configured number rather than one written into the component", () => {
    /*
      PENDING_FOR_LEE S16 is about the number being STORED as `+34 950 473 199`. The fix for a
      badly stored number is the row, never a component that patches it on the way out — a
      second opinion about what the company's number is, in a file nobody looks at.
    */
    expect(BAR).toContain("{companySettings.emergency_phone}");
    expect(BAR).not.toMatch(/\+?34/);
    expect(BAR).not.toMatch(/tel:["'`]/);
  });

  it("says what it is to a screen reader, digits or no digits", () => {
    // Below 420px at the large text size only the handset shows. Without this the link would be
    // announced as nothing at all in exactly the case where the member cannot read it either.
    expect(BAR).toMatch(/aria-label=\{t\("dashboard\.callTwentyFourHour"/);
  });

  it("is big enough to hit — R11", () => {
    expect(BAR).toContain("touch-target");
  });

  it("is ink, not the colour reserved for an alarm in progress", () => {
    // R2, and the same choice the sidebar block made: `alert-sos` belongs to alerts.
    expect(BAR).toContain("bg-foreground");
    expect(BAR).not.toContain("alert-sos");
  });
});

describe("the two things this change may not displace", () => {
  it("the A/A is still in the mobile bar", () => {
    // The comment quoted at the top of this file is the reason, and it is still in the source.
    expect(BAR).toContain("<TextSizeControl");
    expect(LAYOUT).toContain("cannot reliably find a control hidden behind a hamburger");
  });

  it("the readiness notice still sits directly under the header — D10", () => {
    /*
      Asserted as ORDER rather than as presence: the failure this guards against is somebody
      inserting a call strip between the header and the notice, which leaves both in the file.
    */
    const main = CODE.indexOf("<main className=");
    const notice = CODE.indexOf('<MemberReadinessNotice memberId={memberId} variant="bar"');
    const header = CODE.indexOf('<header className="hidden md:flex');
    expect(notice).toBeGreaterThan(header);
    expect(notice).toBeLessThan(main);
    // …and nothing was added between them.
    expect(CODE.slice(CODE.indexOf("</header>"), notice)).not.toContain("phoneHref");
  });

  it("the logo lost its WORDMARK on mobile, and only there", () => {
    /*
      The trade this change actually made, pinned so it is visible in review rather than
      discovered in a screenshot: ~120px of "ICE Alarm España" at 390px wide buys the digits.
      The mark itself stays, and the sidebar's lockup is untouched.
    */
    expect(BAR).toContain('<Logo variant="sidebar" size="sm" showText={false} />');
    expect(SIDEBAR_CONTENT).toContain("showText={isMobile || !collapsed}");
  });
});
