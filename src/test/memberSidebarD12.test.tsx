/**
 * THE MEMBER SIDEBAR — D12, and a control that did nothing at all.
 *
 * `MEMBER_UX_RULES` records D12 as a decision of 5 September 2026:
 *
 *   *"sidebar: active item is a dark fill, NOT red; the red 'Contact' button becomes an Ink
 *   block SHOWING THE 24-HOUR NUMBER."*
 *
 * Neither half had been done, and the second was worse than a styling miss. The block was a
 * full-width `<Button size="lg">` in `bg-alert-sos`, labelled "Contact ICE Alarm España", on
 * every page of the member portal — **with no `onClick`, no `href` and no `asChild`.** A member
 * who pressed the biggest, reddest control on their own alarm account got nothing.
 *
 * On a life-safety product that is the worst kind of dead control: it is exactly the button
 * somebody reaches for when they are frightened, and its colour promised an emergency response.
 * `pageAudit`'s no-op heuristic covers PUBLIC pages, so it never looked at this one.
 *
 * WHY THE ASSERTIONS ARE MOSTLY SOURCE-READ. `ClientLayout` needs an authenticated member, a
 * readiness view, unread counts, a notification bell, a chat button and a language modal before
 * it renders, and mocking eight things to count a colour tests the mocks. What matters here —
 * that the control HAS a destination, that the destination is the configured number, that the
 * number is SHOWN rather than hidden behind a word, and that no brand red is left marking the
 * current page — is all checkable in the file, and the failure mode of each is invisible from a
 * screenshot anyway.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LAYOUT = "src/components/layout/ClientLayout.tsx";

/** Comments removed, because these are claims about CODE. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the 24-hour number block", () => {
  it("HAS A DESTINATION — the old one had none", () => {
    /*
      THE DEFECT, DIRECTLY. A `<Button>` with no `onClick`, no `href` and no `asChild` renders a
      `<button type="button">` that does nothing when pressed. This asserts the replacement is
      an anchor with a `tel:` href, which is the only shape that both dials and reads as a
      phone number to a screen reader.
    */
    const src = code(LAYOUT);
    expect(src).toMatch(/<a\s+href=\{phoneHref\}/);
    expect(src).toContain('data-testid="sidebar-emergency-number"');
  });

  it("SHOWS the number rather than hiding it behind the word 'Contact'", () => {
    /*
      D12 says "showing the 24-hour number", and the reason is practical rather than aesthetic:
      a member who can READ the number can write it on a pad by the phone, which is the thing
      we actually want. A button labelled "Contact" cannot be copied down.
    */
    const src = code(LAYOUT);
    expect(src).toContain("{companySettings.emergency_phone}");
  });

  it("is INK, not the colour reserved for an alarm in progress", () => {
    /*
      `bg-alert-sos` is what this product paints an alert with. Spending it on a permanent piece
      of furniture is what makes it stop meaning anything the day it appears on a real one — R2
      in one class name.
    */
    const src = code(LAYOUT);
    expect(src).toContain("bg-foreground");
    expect(src, "alert-sos belongs to alerts").not.toContain("bg-alert-sos");
  });

  it("is OMITTED ENTIRELY when no number is configured", () => {
    /*
      WP1b: show nothing, never a fake number. A block reading "24-hour line" over nothing at
      all is worse than no block — and it is what the old button effectively was for every
      member, all the time, since it went nowhere.
    */
    const src = code(LAYOUT);
    expect(src).toMatch(/\{phoneHref && \(/);
    // …and the href comes from the shared helper, which returns null for an unset setting
    // rather than building `tel:null`.
    expect(src).toMatch(/const phoneHref = telHref\(companySettings\.emergency_phone\)/);
  });

  it("carries the number in its accessible name when the rail is collapsed", () => {
    // Collapsed, the label and the number are both hidden and only the icon shows. Without this
    // a screen-reader user gets a link called nothing at all.
    const src = code(LAYOUT);
    expect(src).toMatch(/sr-only[\s\S]{0,200}callTwentyFourHour/);
  });
});

describe("the active nav item — D12's other half", () => {
  it("no brand red marks the current page any more", () => {
    /*
      `--sidebar-primary` is `350 85% 42%`: the brand red. The active item, the active group
      heading and the active group icon were all painted with it, so the member's current page
      was marked in the alert colour on every page, permanently.
    */
    const src = code(LAYOUT);
    expect(src, "bg-sidebar-primary is the brand red").not.toContain("bg-sidebar-primary");
    expect(src, "…and so is text-sidebar-primary").not.toContain("text-sidebar-primary");
  });

  it("the active item is a dark fill", () => {
    const src = code(LAYOUT);
    expect(src).toMatch(/\? "bg-sidebar-accent text-sidebar-foreground/);
  });

  it("the STAFF sidebars keep theirs — D12 is a member-surface decision", () => {
    /*
      This is why the fix is a class in `ClientLayout` and not a change to the shared
      `--sidebar-primary` token. `ICE_OPERATOR_CARD_SPEC` governs the operator and admin
      surfaces and they have their own density and their own conventions; quietly repainting
      them from a member-portal brief would be exactly the kind of unrecorded drift
      MEMBER_UX_RULES R11 warns about.
    */
    for (const file of [
      "src/components/layout/AdminSidebar.tsx",
      "src/components/layout/CallCentreSidebar.tsx",
    ]) {
      expect(code(file), `${file} is not this brief's to change`).toContain("bg-sidebar-primary");
    }
  });
});

describe("the rest of the portal nav, walked", () => {
  /*
    Concern 6 of the brief asks for the nav to be WALKED and the remaining deviations LISTED
    rather than restyled silently. The listing lives in MEMBER_UX_AUDIT.md; these are the two
    machine-checkable parts of it, so the list cannot rot into a claim nobody re-reads.
  */
  const PORTAL_PAGES = [
    "src/pages/client/ClientDashboard.tsx",
    "src/pages/client/DevicePage.tsx",
    "src/pages/client/ProfilePage.tsx",
    "src/pages/client/EmergencyContactsPage.tsx",
    "src/pages/client/MedicalInfoPage.tsx",
    "src/pages/client/MessagesPage.tsx",
    "src/pages/client/SubscriptionPage.tsx",
    "src/pages/client/SupportPage.tsx",
    "src/pages/client/AlertHistoryPage.tsx",
  ];

  it("every page in the nav is composed from PageHeader — R5", () => {
    // *"Every page is composed from PageHeader, Card, EmptyState — delete every hand-rolled
    // header."* A page that grows a second `<h1>` breaks the heading order a screen reader
    // announces, which is why `PageHeader` takes an `as` prop instead.
    for (const page of PORTAL_PAGES) {
      expect(code(page), `${page} must use PageHeader`).toContain("<PageHeader");
      expect(code(page), `${page} hand-rolls an <h1>`).not.toMatch(/<h1[\s>]/);
    }
  });

  it("the raw-hex list is EXACT — one entry, and it is on the way out", () => {
    /*
      Pinned in both directions, in the style of `localeParse`'s IDENTICAL_TO_EN_BY_DESIGN: a
      new raw hex on the member surface fails here, and so does leaving a stale entry behind
      after it is fixed.

      `SupportPage` is the one that remains: `bg-[#25D366]` and `text-[#25D366]`, WhatsApp's
      brand green, outside the token system and — as white-on-green — 2.1:1, below WCAG AA for
      text of any size. `DevicePage` carried the same two and lost them; this page's Help tab is
      a bigger change than a nav walk should make silently, so it is listed in
      MEMBER_UX_AUDIT.md and left for its own PR.
    */
    const offenders = PORTAL_PAGES.filter((p) => /(?:bg|text|border|from|to|via)-\[#/.test(code(p)));
    expect(offenders).toEqual(["src/pages/client/SupportPage.tsx"]);
  });

  it("and the layout itself has none", () => {
    expect(code(LAYOUT)).not.toMatch(/(?:bg|text|border)-\[#/);
  });
});
