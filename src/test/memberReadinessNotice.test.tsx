/**
 * The member-facing readiness notice — tone, truthfulness and placement.
 *
 * MOVED INTO THE HEADER (R3, D10: "never a standalone banner"). It was a full-width
 * three-paragraph bar in the content column; that shape has a cost R3 is answering — an amber
 * block above the page reads as an interruption to be got past, and the member who gets past it
 * once gets past it every time.
 *
 * The CONTRACT is unchanged and these tests are the same tests: settled-zero only, never while
 * loading, never on a failed read, never dismissible, amber not red. What changed is where it
 * renders and that it is now one sentence.
 *
 * The contract in ICE_OPERATOR_CARD_SPEC.md §5.1 is UNCHANGED: render only on a settled zero,
 * never while loading, never on a failed read, never dismissible. What changed is register and
 * location — see spec §6, the member-surface section.
 *
 * Negative-first, as with the operator card: the load-bearing assertions are the ABSENCES. A bar
 * that renders whenever it does not yet know is a bar members are trained to dismiss, and then
 * it is also dismissed on the one member for whom it is true.
 *
 * NOTE ON "REWRITE THE EXISTING TESTS": there were none. The banner shipped in #161 with no test
 * of its own — the tests that exist (operatorCardNoContacts.test.tsx) cover the OPERATOR surface
 * and are deliberately untouched here. So this file is new, and that gap is the finding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

type Result = { data: unknown; error: unknown };
let readinessResult: Promise<Result>;
const queried: string[] = [];

function builder(table: string) {
  queried.push(table);
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => readinessResult;
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

vi.mock("react-router-dom", () => ({
  // Forwards every prop, not just `to` and `children`. A mock that drops `data-testid` makes
  // an assertion about the link unreachable and looks like the component's fault.
  NavLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));


vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

const BAR = "member-readiness-notice";

async function renderBar(memberId: string | null = "m-1", variant: "header" | "bar" = "bar") {
  const { MemberReadinessNotice } = await import("@/components/client/MemberReadinessNotice");
  return render(<MemberReadinessNotice memberId={memberId} variant={variant} />);
}

/**
 * The view's row, in the three shapes that matter since D4. Readiness is TWO conditions now, so
 * `{monitoring_ready: false}` on its own is no longer a fixture — it does not say WHICH, and
 * the bar's whole job here is to say which.
 */
const VIEW = {
  /** Nobody to call. A pendant that has been tested. */
  noContacts: { monitoring_ready: false, emergency_contact_count: 0, device_tested_at: "2026-09-01T09:00:00Z" },
  /** Somebody to call, but nobody has ever pressed the pendant. */
  untested: { monitoring_ready: false, emergency_contact_count: 2, device_tested_at: null },
  /** Neither. */
  both: { monitoring_ready: false, emergency_contact_count: 0, device_tested_at: null },
  /** Ready. */
  ready: { monitoring_ready: true, emergency_contact_count: 1, device_tested_at: "2026-09-01T09:00:00Z" },
};

beforeEach(() => {
  queried.length = 0;
  readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
});
afterEach(() => cleanup());

describe("readiness bar — the absences that stop it crying wolf", () => {
  it("is ABSENT while the read is still in flight", async () => {
    let release: (v: Result) => void = () => {};
    readinessResult = new Promise<Result>((res) => { release = res; });

    await renderBar();
    expect(screen.queryByTestId(BAR)).toBeNull(); // <-- load-bearing

    release({ data: VIEW.noContacts, error: null });
    await waitFor(() => expect(screen.queryByTestId(BAR)).not.toBeNull());
  });

  it("is ABSENT for a member who already has a contact", async () => {
    readinessResult = Promise.resolve({ data: VIEW.ready, error: null });
    await renderBar();
    await waitFor(() => expect(queried).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(BAR)).toBeNull();
  });

  it("is ABSENT when the read FAILED — unknown is not a false alarm", async () => {
    readinessResult = Promise.resolve({ data: null, error: { message: "boom" } });
    await renderBar();
    await waitFor(() => expect(queried).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(BAR)).toBeNull();
  });

  it("is ABSENT when there is no member id to read for", async () => {
    await renderBar(null);
    expect(screen.queryByTestId(BAR)).toBeNull();
    expect(queried).toHaveLength(0);
  });

  it("is PRESENT on a settled zero", async () => {
    await renderBar();
    expect(await screen.findByTestId(BAR)).toBeTruthy();
  });
});

describe("readiness bar — register: a task, not an emergency", () => {
  it("does not shout at the member in capitals", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    const text = bar.textContent ?? "";
    // The operator card's version IS uppercase, deliberately. This reader is an elderly person
    // at home who has just bought an alarm; capitals read as reproach, not as a task.
    expect(text).not.toBe(text.toUpperCase());
    expect(bar.className).not.toMatch(/uppercase/);
  });

  it("uses no alarm-red destructive styling", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(bar.className).not.toMatch(/destructive/);
  });

  it("names the TASK rather than the deficiency", async () => {
    // "We still need your emergency contacts" is a thing to do. "Nobody can be called for you"
    // is a verdict on the reader, and the operator card's version of this fact — which IS a
    // verdict, addressed to a professional mid-alert — is the one that gets to say it that way.
    readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
    const text = ((await renderBar(), await screen.findByTestId(BAR)).textContent ?? "");
    expect(text).toMatch(/still need your emergency contacts/i);
    expect(text).not.toMatch(/nobody to call|no one can be called/i);
  });

  it("is ONE sentence — R3 — and the reassurance moved with the detail", async () => {
    /*
      The old bar led with "Your alarm works and an operator will always answer it", which is
      the right thing to say first and which ICE_OPERATOR_CARD_SPEC §5.2 records as a rule. R3
      asks for one sentence in the header, so the long body is gone and that reassurance now
      lives on the contacts page, where the member lands.

      THE TWO RULES ARE IN TENSION AND THIS IS THE HONEST READING OF IT. The better answer is a
      single sentence that leads with what works — "Your alarm works — we just need someone to
      contact" — which needs three new strings in three languages. Deferred to the next locale
      pass rather than opened as a fourth concurrent PR on locale JSON, and recorded in
      PENDING_FOR_LEE.md with the exact wording. Nothing is frightening in the meantime: the
      current sentence is a task, not an alarm.
    */
    readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
    await renderBar();
    const notice = await screen.findByTestId(BAR);
    expect(notice.textContent).not.toMatch(/operator will always answer/i);
    // One sentence, not a paragraph stack.
    expect(notice.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("readiness bar — D4: it names WHICH of the two conditions is missing", () => {
  it("names the contacts when that is what is missing, and offers the button", async () => {
    readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
    await renderBar();
    expect(await screen.findByTestId(BAR)).toBeTruthy();
    expect(screen.getByRole("link", { name: /add your emergency contacts/i })).toBeTruthy();
  });

  it("names the pendant test when THAT is what is missing", async () => {
    readinessResult = Promise.resolve({ data: VIEW.untested, error: null });
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(screen.getByTestId(BAR)).toBeTruthy();
    expect(bar.textContent).toMatch(/test your pendant/i);
    // It must not tell a member with two contacts on file that we have nobody to call.
    expect(bar.textContent).not.toMatch(/no one to contact/i);
  });

  it("offers no way to SELF-REPORT a test, but does offer a route to a human", async () => {
    /*
      Q1 (Lee, 2026-09-07): operator-confirmed only. A control here that looked like "mark it
      tested" would be either a lie or a hole in that ruling.

      But the old bar's body said "we will call you", and that body is gone with R3's one
      sentence — so the link points at Support, where the phone number is. A notice with nothing
      to do on the one gap a member cannot fix themselves is a dead end.
    */
    readinessResult = Promise.resolve({ data: VIEW.untested, error: null });
    await renderBar();
    const notice = await screen.findByTestId(BAR);
    expect(notice.dataset.gap).toBe("pendant");
    expect(notice.textContent).toMatch(/test your pendant/i);
    expect(notice.querySelector("a[href='/dashboard/support']")).not.toBeNull();
    expect(notice.querySelector("a[href='/dashboard/contacts']")).toBeNull();
    expect(notice.querySelector("button")).toBeNull();
  });

  it("for a member missing BOTH, names the half they can act on today", async () => {
    // R3 allows one sentence, so a member missing both cannot be told about both. The contacts
    // half is the one they can do now; once it is done the sentence becomes the pendant one.
    // Progressive, rather than a list they cannot finish.
    readinessResult = Promise.resolve({ data: VIEW.both, error: null });
    await renderBar();
    const notice = await screen.findByTestId(BAR);
    expect(notice.dataset.gap).toBe("both");
    expect(notice.textContent).toMatch(/still need your emergency contacts/i);
    expect(notice.querySelector("a[href='/dashboard/contacts']")).not.toBeNull();
  });

  it("is ABSENT when the view says ready even if the two columns are missing", async () => {
    // `monitoring_ready` is the authority on WHETHER. If the view says ready and the columns
    // were not projected, the member must not be shown a warning the view says is unwarranted.
    readinessResult = Promise.resolve({ data: { monitoring_ready: true }, error: null });
    await renderBar();
    await waitFor(() => expect(queried).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(BAR)).toBeNull();
  });

  it("is ABSENT when the row cannot be read into a condition at all", async () => {
    // A row with no counts is "we do not know", which is neither ready nor unready. Rendering
    // the bar there is the false alarm that teaches members to ignore it.
    readinessResult = Promise.resolve({ data: { monitoring_ready: false }, error: null });
    await renderBar();
    await waitFor(() => expect(queried).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(BAR)).toBeNull();
  });
});

describe("readiness bar — it offers only routes that exist", () => {
  it("promises NO emailed link — no such email is sent", async () => {
    await renderBar();
    const text = (await screen.findByTestId(BAR)).textContent ?? "";
    expect(text).not.toMatch(/email/i);
    expect(text).not.toMatch(/we (have )?emailed|link we sent/i);
  });

  it("offers the in-app action, pointing at the contacts page", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    const link = bar.querySelector('a[href="/dashboard/contacts"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toMatch(/add your emergency contacts/i);
  });

  it("always offers a link, and it is a real route rather than a dead end", async () => {
    // The phone number was in the body text, which R3's one sentence does not have. Support is
    // where the number lives, and the contacts page is where a member fixes the other half.
    for (const [row, href] of [
      [VIEW.noContacts, "/dashboard/contacts"],
      [VIEW.untested, "/dashboard/support"],
      [VIEW.both, "/dashboard/contacts"],
    ] as const) {
      readinessResult = Promise.resolve({ data: row, error: null });
      const view = await renderBar();
      const link = await screen.findByTestId("member-readiness-action");
      expect(link.getAttribute("href")).toBe(href);
      view.unmount();
    }
  });
});

describe("readiness bar — the constraints that did not change", () => {
  it("is not colour alone — an icon and full sentences carry the meaning", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(bar.querySelector("svg")).toBeTruthy();
    expect((bar.textContent ?? "").length).toBeGreaterThan(60);
  });

  it("is announced to assistive tech", async () => {
    await renderBar();
    expect((await screen.findByTestId(BAR)).getAttribute("role")).toBe("status");
  });

  it("offers no way to dismiss or collapse it", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    // The ONLY button-ish element is the action link; nothing closes it.
    expect(bar.querySelector("button")).toBeNull();
    expect(bar.textContent).not.toMatch(/dismiss|close|hide|not now|later/i);
  });

  it("performs exactly ONE read, of the readiness view", async () => {
    await renderBar();
    await waitFor(() => expect(queried.length).toBeGreaterThan(0));
    expect(queried).toEqual(["member_monitoring_readiness"]);
  });
});

describe("placement — R3 and D10, and the standalone banner is gone", () => {
  const layout = () => read("src/components/layout/ClientLayout.tsx");

  it("the desktop copy is in the header's LEFT slot, which R3 reserves for it", () => {
    // The slot stood empty after the unwired search input was removed. D10: "left of Assistant
    // / bell / language / name."
    const src = layout();
    const header = src.slice(src.indexOf("<header"), src.indexOf("</header>"));
    expect(header).toContain('<MemberReadinessNotice memberId={memberId} variant="header" />');
    // Before the Assistant / bell / language / name group, not after it.
    expect(header.indexOf("MemberReadinessNotice")).toBeLessThan(header.indexOf("MemberChatButton"));
  });

  it("the mobile copy is md:hidden layout chrome, not page content", () => {
    // A 64px phone header has a logo and a menu button in it; there is no room for a sentence,
    // and truncating a life-safety sentence to make one is the wrong trade.
    const src = layout();
    expect(src).toContain('<MemberReadinessNotice memberId={memberId} variant="bar" className="md:hidden" />');
    // Still above <main>, so it cannot overlap the content or the mobile nav.
    expect(src.indexOf('variant="bar"')).toBeLessThan(src.indexOf("<main"));
  });

  it("the standalone banner is DELETED, not merely unmounted", () => {
    // D10: "Never a standalone banner." A component left in the tree is a component somebody
    // mounts again.
    expect(existsSync("src/components/client/MonitoringReadinessBar.tsx")).toBe(false);
    expect(layout()).not.toContain("MonitoringReadinessBar");
  });

  it("is neither fixed nor sticky, in either variant", async () => {
    /*
      Asserted on the RENDERED className, not on the source: the component's own comment
      explains why the mobile copy sits beneath the FIXED header, and a grep for "fixed" matches
      the explanation. That mistake has already cost two tests in this session.
    */
    for (const variant of ["header", "bar"] as const) {
      readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
      const view = await renderBar("m-1", variant);
      const notice = await screen.findByTestId(BAR);
      expect(notice.className).not.toMatch(/\bfixed\b|\bsticky\b/);
      view.unmount();
    }
  });

  it("the dashboard carries no readiness NOTICE, and no announcement", () => {
    /*
      D10: "Company announcements go in the bell, never in page content." The announcement was a
      permanent card with one hardcoded string — the same sentence every day, for every member,
      forever.

      THIS ASSERTION WAS ORIGINALLY `not.toContain("member_monitoring_readiness")` and that was
      too wide, which showed up the moment WP4's "Your protection" checklist landed. What D10
      forbids in page content is the NOTICE — the amber prompt that now lives in the header on
      every page. The brief asks, in the same breath, for Home to carry a checklist of
      Membership / Pendant / Emergency contacts "each with state and one action", and that
      checklist cannot exist without reading the readiness view.

      So the guard is on the notice, not on the read: no bar, no second copy of the header
      notice, no announcement. Narrowed deliberately, with the reason, rather than deleted.
    */
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).not.toContain("MonitoringReadinessBar");
    expect(dash).not.toContain("MemberReadinessNotice");
    expect(dash).not.toContain("dashboard.announcementText");
    expect(dash).not.toContain("serviceAnnouncement");
  });

  it("and if it reads the readiness view at all, it is the checklist doing it", () => {
    // The narrowing above must not become a licence to render readiness prose on Home again.
    const dash = read("src/pages/client/ClientDashboard.tsx");
    if (dash.includes("member_monitoring_readiness")) {
      expect(dash).toContain("<ProtectionChecklist");
    }
  });
});
