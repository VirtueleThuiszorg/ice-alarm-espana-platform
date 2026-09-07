/**
 * The member-facing readiness bar — tone, truthfulness and placement.
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
  NavLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/useCompanySettings", () => ({
  useCompanySettings: () => ({ settings: { emergency_phone: "+34 900 123 456" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

const BAR = "member-readiness-bar";

async function renderBar(memberId: string | null = "m-1") {
  const { MonitoringReadinessBar } = await import("@/components/client/MonitoringReadinessBar");
  return render(<MonitoringReadinessBar memberId={memberId} />);
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
    const heading = bar.querySelector("p")!.textContent ?? "";
    // The operator card's version IS uppercase, deliberately. This reader is an elderly person
    // at home who has just bought an alarm; capitals read as reproach, not as a task.
    expect(heading).not.toBe(heading.toUpperCase());
    expect(bar.className).not.toMatch(/uppercase/);
  });

  it("uses no alarm-red destructive styling", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(bar.className).not.toMatch(/destructive/);
  });

  it("leads with what still WORKS before what is missing", async () => {
    readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
    await renderBar();
    const text = (await screen.findByTestId(BAR)).textContent ?? "";
    expect(text).toMatch(/alarm works/i);
    expect(text.indexOf("alarm works")).toBeLessThan(text.indexOf("no one to contact"));
  });

  it("names the task rather than the deficiency, in the heading", async () => {
    await renderBar();
    const heading = (await screen.findByTestId(BAR)).querySelector("p")!.textContent ?? "";
    expect(heading).toMatch(/still need your emergency contacts/i);
    expect(heading).not.toMatch(/nobody to call/i);
  });
});

describe("readiness bar — D4: it names WHICH of the two conditions is missing", () => {
  it("names the contacts when that is what is missing, and offers the button", async () => {
    readinessResult = Promise.resolve({ data: VIEW.noContacts, error: null });
    await renderBar();
    expect(await screen.findByTestId("member-readiness-contacts")).toBeTruthy();
    expect(screen.getByRole("link", { name: /add your emergency contacts/i })).toBeTruthy();
  });

  it("names the pendant test when THAT is what is missing", async () => {
    readinessResult = Promise.resolve({ data: VIEW.untested, error: null });
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(screen.getByTestId("member-readiness-pendant")).toBeTruthy();
    expect(bar.textContent).toMatch(/test your pendant/i);
    // It must not tell a member with two contacts on file that we have nobody to call.
    expect(bar.textContent).not.toMatch(/no one to contact/i);
  });

  it("offers the member NOTHING TO PRESS for an untested pendant — Q1 is operator-only", async () => {
    // Lee's Q1 ruling, 2026-09-07: operator-confirmed only, no member self-report. A button
    // here would be either a lie about what it does or a hole in that ruling.
    readinessResult = Promise.resolve({ data: VIEW.untested, error: null });
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(bar.querySelector("a[href='/dashboard/contacts']")).toBeNull();
    expect(bar.querySelector("button")).toBeNull();
    // The phone number IS the action, and it is still a real link.
    expect(bar.querySelector("a[href^='tel:']")).not.toBeNull();
  });

  it("names both when both are missing, and still offers the half they can act on", async () => {
    readinessResult = Promise.resolve({ data: VIEW.both, error: null });
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    expect(screen.getByTestId("member-readiness-both")).toBeTruthy();
    expect(bar.textContent).toMatch(/no one to contact/i);
    expect(bar.textContent).toMatch(/pendant/i);
    expect(screen.getByRole("link", { name: /add your emergency contacts/i })).toBeTruthy();
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

  it("offers the phone as a real tel: link", async () => {
    await renderBar();
    const bar = await screen.findByTestId(BAR);
    const tel = bar.querySelector('a[href^="tel:"]');
    expect(tel).not.toBeNull();
    expect(tel!.getAttribute("href")).toBe("tel:+34900123456");
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

describe("readiness bar — placement", () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("node:fs") as typeof import("node:fs")).readFileSync(p, "utf8");

  it("lives in the member LAYOUT, so it persists across every member page", () => {
    const layout = read("src/components/layout/ClientLayout.tsx");
    expect(layout).toContain("<MonitoringReadinessBar memberId={memberId} />");
  });

  it("sits below both headers and above <main>, so it cannot overlap the mobile nav", () => {
    const layout = read("src/components/layout/ClientLayout.tsx");
    const bar = layout.indexOf("<MonitoringReadinessBar");
    const header = layout.indexOf('<header className="hidden md:flex sticky');
    const main = layout.indexOf('<main className="p-4 md:p-6">');
    expect(header).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(header); // after the desktop header
    expect(bar).toBeLessThan(main);      // before the page content
  });

  it("is NOT fixed or sticky, so it never covers content or needs an offset", () => {
    const src = read("src/components/client/MonitoringReadinessBar.tsx");
    expect(src).not.toMatch(/className="[^"]*\b(fixed|sticky)\b/);
  });

  it("no longer lives on the dashboard, and the dashboard no longer reads readiness", () => {
    // The read MOVED with the bar. If it were left behind, the page would perform a second
    // read of the same fact — which the spec forbids.
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).not.toContain("member_monitoring_readiness");
    expect(dash).not.toContain("client-not-monitoring-ready");
  });

  it("the welcome heading stays in the page content, not the bar", () => {
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).toMatch(/welcomeBack|Welcome back/i);
    const bar = read("src/components/client/MonitoringReadinessBar.tsx");
    expect(bar).not.toMatch(/welcomeBack|Welcome back/i);
  });
});
