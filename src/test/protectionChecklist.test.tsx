/**
 * "YOUR PROTECTION" — the three parts of the only question Home exists to answer.
 *
 * WP4: *"Home: … 'Your protection' checklist (Membership / Pendant / Emergency contacts, each
 * with state and one action) … No stat tiles for a member with no device."*
 *
 * Home had a Subscription card and an Emergency-contacts card, each a small dashboard of its
 * own: a plan name, a renewal date, an amount, two contact names with ordinal badges. All true,
 * and none of it the question a member opens this page to ask — **"if I press it, will somebody
 * come?"**
 *
 * The load-bearing assertions here are the ones about the two states that are NOT failures and
 * the one that is not a state at all:
 *
 *   `in_progress`    a pendant that has been sent but not tested. Telling a member "action
 *                    needed" about something WE owe them blames them for our queue
 *   `not_included`   a phone-only member has no pendant, by choice. Marking that as a fault
 *                    marks a legitimate plan as broken every time they open the page
 *   `unknown`        a failed read. Never `ok` (a false all-clear on a life-safety page) and
 *                    never `action_needed` (a false alarm, which is how a member learns to
 *                    ignore the whole checklist)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PROTECTION_RUNG_ORDER,
  isFullyProtected,
  isProtectionGap,
  protectionChecklist,
  type ProtectionInput,
  type ProtectionState,
} from "@/lib/protectionChecklist";
import { supportActionPath } from "@/lib/supportActions";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
/**
 * The i18n stub INTERPOLATES, which it did not have to before.
 *
 * It used to be `t: (key, fallback) => fallback ?? key`, which was enough while every sentence in
 * this card was a fixed string. The pendant rung now says "Last tested {{date}}.", and a stub that
 * ignores the third argument would render those four braces to the assertions below and let a
 * broken interpolation pass as a rendered date. This substitutes the same way i18next does, and
 * leaves an unknown placeholder visible rather than blanking it.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, opts?: Record<string, unknown>) => {
      const text = fallback ?? _k;
      if (!opts) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
        name in opts ? String(opts[name]) : whole,
      );
    },
    i18n: { language: "en" },
  }),
}));

import { ProtectionChecklist } from "@/components/client/ProtectionChecklist";

afterEach(() => cleanup());

/**
 * Rendered inside a QueryClientProvider, because the card reads ONE thing for itself.
 *
 * `usePendantTestReminderDays` fetches `system_settings.pendant_test_reminder_days` — a property
 * of the company, not of the member, so it does not belong in `input` and is not something each
 * page rendering this card should have to remember to pass. The cost is this wrapper; the benefit
 * is that a second surface showing "Your protection" cannot silently get the built-in 90 because
 * somebody forgot a prop.
 *
 * `retry: false` and no network: the query fails immediately against the mocked client and the
 * hook falls back to its default, which is the behaviour a member with an unreadable setting
 * gets and therefore the right one to render the assertions below against.
 */
function renderChecklist(input: ProtectionInput) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProtectionChecklist input={input} />
    </QueryClientProvider>,
  );
}

/** A member for whom everything works. Each test breaks exactly one thing. */
const READY: ProtectionInput = {
  latestSubscription: { status: "active" },
  hasPendant: true,
  device: { is_online: true },
  readiness: { emergency_contact_count: 2, device_tested_at: "2026-09-01T10:00:00Z" },
};

const rung = (input: ProtectionInput, id: string) =>
  protectionChecklist(input).find((r) => r.id === id)!;

const stateOf = (input: ProtectionInput, id: string): ProtectionState => rung(input, id).state;

describe("the shape of the checklist", () => {
  it("is the brief's three rungs, in the brief's order", () => {
    expect(PROTECTION_RUNG_ORDER).toEqual(["membership", "pendant", "contacts"]);
    expect(protectionChecklist(READY).map((r) => r.id)).toEqual([
      "membership",
      "pendant",
      "contacts",
    ]);
  });

  it("a member for whom everything works is fully protected", () => {
    expect(protectionChecklist(READY).map((r) => r.state)).toEqual(["ok", "ok", "ok"]);
    expect(isFullyProtected(protectionChecklist(READY))).toBe(true);
  });

  it("`isFullyProtected` is false for an empty list — vacuous truth is a false all-clear", () => {
    expect(isFullyProtected([])).toBe(false);
  });

  it("every rung offers exactly one action, or none, never two", () => {
    for (const r of protectionChecklist(READY)) {
      expect(r.action === null || typeof r.action.kind === "string").toBe(true);
    }
  });
});

describe("the pendant — the rung with all the interesting states", () => {
  it("tested and checking in is `ok`", () => {
    expect(stateOf(READY, "pendant")).toBe("ok");
  });

  it("SENT BUT NOT TESTED is `in_progress`, not `action_needed`", () => {
    // We owe them the test call. "Action needed" would blame the member for our queue.
    const input = { ...READY, readiness: { ...READY.readiness!, device_tested_at: null } };
    expect(stateOf(input, "pendant")).toBe("in_progress");
    expect(isProtectionGap("in_progress")).toBe(false);
  });

  it("not sent at all is `action_needed`, and points at the pendant page", () => {
    const input = {
      ...READY,
      device: null,
      readiness: { ...READY.readiness!, device_tested_at: null },
    };
    expect(stateOf(input, "pendant")).toBe("action_needed");
    expect(rung(input, "pendant").action).toMatchObject({ kind: "route", to: "/dashboard/device" });
  });

  it("PHONE-ONLY is `not_included` — a plan, not a fault", () => {
    const input = { ...READY, hasPendant: false };
    expect(stateOf(input, "pendant")).toBe("not_included");
    // Offered, not demanded: the action adds one rather than telling them to fix something.
    expect(rung(input, "pendant").action).toMatchObject({ kind: "support", action: "add_pendant" });
  });

  it("phone-only wins over the tested check — it must not read as a missing pendant", () => {
    const input = {
      ...READY,
      hasPendant: false,
      device: null,
      readiness: { emergency_contact_count: 2, device_tested_at: null },
    };
    expect(stateOf(input, "pendant")).toBe("not_included");
  });

  it("tested but OFFLINE is `action_needed` — the test proved it worked, not that it works", () => {
    const input = { ...READY, device: { is_online: false } };
    expect(stateOf(input, "pendant")).toBe("action_needed");
    expect(rung(input, "pendant").action).toMatchObject({ kind: "support", action: "report_issue" });
  });

  it("tested with `is_online` NULL is still `ok` — unknown connectivity is not an outage", () => {
    // `is_online` is nullable. A null is "we have not heard yet", and turning that into "your
    // pendant has stopped checking in" is a false alarm on the loudest rung.
    const input = { ...READY, device: { is_online: null } };
    expect(stateOf(input, "pendant")).toBe("ok");
  });

  it("a FAILED readiness read is `unknown`, and offers no action", () => {
    for (const readiness of [null, undefined]) {
      const input = { ...READY, readiness };
      expect(stateOf(input, "pendant")).toBe("unknown");
      expect(rung(input, "pendant").action).toBeNull();
    }
  });
});

describe("WHEN it was tested, which the member could not see at all", () => {
  /*
    `device_tested_at` was read on the dashboard, handed to this module, and used as a NULL CHECK
    — `const tested = input.readiness?.device_tested_at != null`. The date itself was thrown away
    and printed nowhere in the member portal. So somebody who tested their pendant on the day it
    arrived fourteen months ago read "Your pendant is tested and checking in", which is true about
    the DEVICE and silent about the habit our own knowledge base asks them to keep.

    Every test below pins `nowMs`. The boundary is the point of several of them, and a suite whose
    answers drift with the wall clock is a suite that starts failing on a date nobody chose.
  */
  const NOW = Date.parse("2026-09-17T09:00:00Z");
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

  const tested = (n: number, extra: Partial<ProtectionInput> = {}): ProtectionInput => ({
    ...READY,
    readiness: { emergency_contact_count: 2, device_tested_at: daysAgo(n) },
    nowMs: NOW,
    ...extra,
  });

  it("a recent test shows the DATE, and the action is still 'See your pendant'", () => {
    const r = rung(tested(10), "pendant");
    expect(r.state).toBe("ok");
    expect(r.headline.key).toBe("protection.pendant.ok");
    expect(r.headline.fallback).toContain("{{date}}");
    expect(r.headlineDate).toBe(daysAgo(10));
    expect(r.action).toMatchObject({ kind: "route", to: "/dashboard/device" });
    expect(r.action?.label.fallback).toBe("See your pendant");
  });

  it("an OLD test changes the sentence and the button — and STAYS `ok`", () => {
    /*
      THE REGRESSION THAT MATTERS, and the reason it is asserted explicitly rather than implied by
      the headline. `action_needed` is the state that tells a member something is WRONG with their
      alarm. Nothing is: the pendant is online, the membership is active, an operator is watching.
      A member told their alarm needs attention when it does not is a member who learns to ignore
      the one time it does — which is the same argument this file already makes for a pendant in
      transit, applied to a lapsed habit.
    */
    const r = rung(tested(200), "pendant");
    expect(r.state).toBe("ok");
    expect(r.headline.key).toBe("protection.pendant.stale");
    expect(r.headline.fallback).toContain("It has been a while");
    expect(r.headlineDate).toBe(daysAgo(200));
    expect(r.action).toMatchObject({ kind: "route", to: "/dashboard/support" });
    expect(r.action?.label.fallback).toBe("Arrange a test");
  });

  it("and the stale rung is not a gap, so nothing treats it as a task", () => {
    expect(isProtectionGap(stateOf(tested(200), "pendant"))).toBe(false);
    expect(isFullyProtected(protectionChecklist(tested(200)))).toBe(true);
  });

  it("no sixth state was invented for it", () => {
    // Five states, their TONE map and their tests stay as they are: this is a headline-and-action
    // change inside the existing `ok` branch, not a new rung condition.
    const states = new Set(
      [tested(10), tested(200), { ...READY, hasPendant: false }, { ...READY, readiness: null }]
        .flatMap((i) => protectionChecklist(i as ProtectionInput))
        .map((r) => r.state),
    );
    for (const state of states) {
      expect(["ok", "in_progress", "action_needed", "not_included", "unknown"]).toContain(state);
    }
  });

  it("EXACTLY at the threshold it is stale — the boundary, chosen and pinned", () => {
    /*
      The setting is the INTERVAL BETWEEN TESTS, so once a whole interval has elapsed the next one
      is due: at 89 days a 90-day threshold says nothing, at 90 days it prompts. That is also how
      the sentence reads to a member — "it has been 90 days" is the moment you would say it, not
      the day after.

      Deliberately the opposite edge to `_shared/presence.ts`, where a heartbeat is still FRESH at
      exactly its threshold. That one is a tolerance for lateness and its generous edge belongs on
      the side that avoids calling a present operator absent; this one is a schedule, and its
      generous edge belongs on the side that gets the pendant tested.
    */
    expect(rung(tested(89), "pendant").headline.key).toBe("protection.pendant.ok");
    expect(rung(tested(90), "pendant").headline.key).toBe("protection.pendant.stale");
    expect(rung(tested(91), "pendant").headline.key).toBe("protection.pendant.stale");
  });

  it("NEVER TESTED is not a stale test — it is a different sentence", () => {
    // "It has been a while" is false about something that has not happened. The two branches that
    // were already here are what a member with no test sees, unchanged.
    const awaiting: ProtectionInput = {
      ...READY,
      readiness: { emergency_contact_count: 2, device_tested_at: null },
      nowMs: NOW,
    };
    expect(stateOf(awaiting, "pendant")).toBe("in_progress");
    expect(rung(awaiting, "pendant").headline.key).toBe("protection.pendant.awaitingTest");

    const notSent = { ...awaiting, device: null };
    expect(stateOf(notSent, "pendant")).toBe("action_needed");
    expect(rung(notSent, "pendant").headline.key).toBe("protection.pendant.notSent");

    for (const input of [awaiting, notSent]) {
      expect(rung(input, "pendant").headline.fallback).not.toContain("a while");
      expect(rung(input, "pendant").headlineDate ?? null).toBeNull();
    }
  });

  it("UNREADABLE is not stale either — a failed read stays `unknown`", () => {
    // Same rule as `membershipCondition`'s unknown and the emergency-contact banner: a network
    // error must never render as a fact about the member's pendant.
    for (const readiness of [null, undefined]) {
      const r = rung({ ...READY, readiness, nowMs: NOW }, "pendant");
      expect(r.state).toBe("unknown");
      expect(r.headline.key).toBe("protection.pendant.unknown");
      expect(r.action).toBeNull();
    }
  });

  it("a missing threshold falls back to 90 — it does not switch staleness off", () => {
    /*
      The bad direction is unmistakable: "we could not read the setting" must not become "your
      fourteen-month-old test is current". Both the absent field and an unusable value land on 90.
    */
    for (const testReminderDays of [undefined, null, 0, -30, Number.NaN]) {
      const r = rung(tested(200, { testReminderDays }), "pendant");
      expect(r.headline.key, String(testReminderDays)).toBe("protection.pendant.stale");
    }
    // …and a threshold that IS readable is the one that decides.
    expect(rung(tested(45, { testReminderDays: 30 }), "pendant").headline.key).toBe(
      "protection.pendant.stale",
    );
    expect(rung(tested(45, { testReminderDays: 90 }), "pendant").headline.key).toBe(
      "protection.pendant.ok",
    );
  });

  it("an OFFLINE pendant wins over any test age — the precedence, asserted", () => {
    /*
      A pendant that has stopped checking in is a fault whatever the age of its last test, and the
      stale branch is not a fault at all. Ordered the other way round, the member who most needs
      "your pendant has stopped checking in" would be shown "it has been a while" instead.
    */
    const r = rung(tested(400, { device: { is_online: false } }), "pendant");
    expect(r.state).toBe("action_needed");
    expect(r.headline.key).toBe("protection.pendant.offline");
    expect(r.action).toMatchObject({ kind: "support", action: "report_issue" });
  });

  it("phone-only still wins too — there is no pendant to have tested", () => {
    expect(stateOf(tested(400, { hasPendant: false }), "pendant")).toBe("not_included");
  });

  it("renders the date in the reader's language, not an ISO string", () => {
    renderChecklist(tested(10));
    const rendered = screen.getByTestId("protection-rung-pendant").textContent ?? "";
    expect(rendered).toContain("7 September");
    expect(rendered).not.toContain("2026-09-07");
    expect(rendered).not.toContain("{{date}}");
    expect(rendered).not.toContain("Invalid Date");
  });

  it("an unreadable timestamp renders the sentence without a date, never 'Invalid Date'", () => {
    // `format` prints those two words, in the member's own language, on the page about their
    // alarm. The rung is still `ok` — a date we cannot parse is not evidence of anything.
    const broken: ProtectionInput = {
      ...READY,
      readiness: { emergency_contact_count: 2, device_tested_at: "not a date" },
      nowMs: NOW,
    };
    expect(stateOf(broken, "pendant")).toBe("ok");
    renderChecklist(broken);
    const rendered = screen.getByTestId("protection-rung-pendant").textContent ?? "";
    expect(rendered).not.toContain("Invalid Date");
    expect(rendered).toContain("Your pendant is tested and checking in.");
  });
});

describe("the membership rung", () => {
  it("active is `ok`", () => {
    expect(stateOf(READY, "membership")).toBe("ok");
  });

  it("every non-active status is `action_needed`, and says nobody is monitoring", () => {
    for (const status of ["paused", "past_due", "suspended", "cancelled", "expired", "pending"]) {
      const input = { ...READY, latestSubscription: { status } };
      expect(stateOf(input, "membership"), status).toBe("action_needed");
      expect(rung(input, "membership").headline.fallback).toContain("nobody is monitoring");
    }
  });

  it("no subscription at all is `action_needed` too", () => {
    expect(stateOf({ ...READY, latestSubscription: null }, "membership")).toBe("action_needed");
  });

  it("a FAILED read is `unknown`, not `ok` and not `action_needed`", () => {
    const input = { ...READY, latestSubscription: undefined };
    expect(stateOf(input, "membership")).toBe("unknown");
    expect(rung(input, "membership").action).toBeNull();
  });

  it("sends the member to the Membership page rather than repeating the seven conditions", () => {
    const input = { ...READY, latestSubscription: { status: "past_due" } };
    expect(rung(input, "membership").action).toMatchObject({
      kind: "route",
      to: "/dashboard/subscription",
    });
  });
});

describe("the contacts rung", () => {
  it("one or more is `ok`", () => {
    expect(stateOf(READY, "contacts")).toBe("ok");
  });

  it("zero is `action_needed`", () => {
    const input = { ...READY, readiness: { ...READY.readiness!, emergency_contact_count: 0 } };
    expect(stateOf(input, "contacts")).toBe("action_needed");
    expect(rung(input, "contacts").action).toMatchObject({ to: "/dashboard/contacts" });
  });

  it("a NULL count is `unknown` — a null is not a zero", () => {
    const input = {
      ...READY,
      readiness: { emergency_contact_count: null, device_tested_at: "2026-09-01T10:00:00Z" },
    };
    expect(stateOf(input, "contacts")).toBe("unknown");
    expect(rung(input, "contacts").action).toBeNull();
  });

  it("and a failed read is `unknown` rather than 'you have nobody'", () => {
    expect(stateOf({ ...READY, readiness: null }, "contacts")).toBe("unknown");
  });
});

describe("what counts as a gap", () => {
  it("`in_progress` and `unknown` are NOT gaps — neither is a task for anybody", () => {
    expect(isProtectionGap("in_progress")).toBe(false);
    expect(isProtectionGap("unknown")).toBe(false);
  });

  it("`action_needed` and `not_included` are", () => {
    expect(isProtectionGap("action_needed")).toBe(true);
    expect(isProtectionGap("not_included")).toBe(true);
  });

  it("`ok` is not", () => {
    expect(isProtectionGap("ok")).toBe(false);
  });
});

describe("how it renders", () => {
  it("shows all three rungs with their state on the element", () => {
    renderChecklist(READY);
    for (const id of PROTECTION_RUNG_ORDER) {
      expect(screen.getByTestId(`protection-rung-${id}`).dataset.state).toBe("ok");
    }
  });

  it("R2 — no rung is brand red; a status uses the alert families", () => {
    const broken: ProtectionInput = {
      latestSubscription: { status: "past_due" },
      hasPendant: true,
      device: null,
      readiness: { emergency_contact_count: 0, device_tested_at: null },
    };
    const { container } = renderChecklist(broken);
    expect(container.innerHTML).not.toContain("text-primary-foreground");
    for (const id of PROTECTION_RUNG_ORDER) {
      const el = screen.getByTestId(`protection-rung-${id}`);
      expect(el.innerHTML).not.toContain("bg-destructive");
    }
  });

  it("R1 — every action is an outline button, so Home keeps no red one", () => {
    const { container } = renderChecklist(READY);
    const red = [...container.querySelectorAll("a,button")].filter((el) =>
      el.className.split(/\s+/).includes("bg-primary"),
    );
    expect(red).toEqual([]);
  });

  it("is not colour alone — every state has its own icon and its own sentence", () => {
    const seen = new Set<string>();
    for (const input of [
      READY,
      { ...READY, hasPendant: false },
      { ...READY, readiness: { ...READY.readiness!, device_tested_at: null } },
      { ...READY, readiness: null },
      { ...READY, latestSubscription: null },
    ] as ProtectionInput[]) {
      cleanup();
      const { container } = renderChecklist(input);
      // one icon per rung, always
      expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
      for (const r of protectionChecklist(input)) seen.add(r.headline.fallback);
    }
    // Distinct sentences, not one sentence recoloured.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("a support action becomes the typed support path, not a hand-built URL", () => {
    renderChecklist({ ...READY, hasPendant: false });
    expect(screen.getByTestId("protection-action-pendant").getAttribute("href")).toBe(
      supportActionPath("add_pendant"),
    );
  });

  it("renders no action element for a rung that has none", () => {
    renderChecklist({ ...READY, readiness: null });
    expect(screen.queryByTestId("protection-action-pendant")).toBeNull();
    expect(screen.queryByTestId("protection-action-contacts")).toBeNull();
  });
});

describe("Home itself", () => {
  const dash = () => read("src/pages/client/ClientDashboard.tsx");

  it("carries the checklist and no longer the two cards it replaced", () => {
    const src = dash();
    expect(src).toContain("<ProtectionChecklist");
    expect(src).not.toContain("dashboard.manageSubscription");
    expect(src).not.toContain("dashboard.updateContacts");
  });

  it("shows NO stat tiles to a member with no device — WP4 says so in as many words", () => {
    // Two of the four tiles are about the pendant: with none they read "0%" and "Offline",
    // which is not a zero, it is a fact about a device that does not exist.
    expect(dash()).toMatch(/!deviceLoading && !displayDevice \? null/);
  });

  it("takes the contact COUNT from the readiness view, not from a `.limit(3)` page of rows", () => {
    const src = dash();
    expect(src).toContain("emergency_contact_count");
    // The old query could never report more than three.
    expect(src).not.toMatch(/displayContacts\?\.length/);
    expect(src).not.toMatch(/from\("emergency_contacts"\)/);
  });

  it("renders an em dash rather than 0 when the count cannot be read", () => {
    expect(dash()).toMatch(/\{contactCount \?\? "—"\}/);
  });

  it("has a recent-activity section whose empty state is the reassuring one", () => {
    expect(dash()).toContain("recent-activity");
    expect(dash()).toContain("dashboard.noAlerts");
  });

  it("no longer contains the dead-end 'contact support to get your device set up' card", () => {
    // R6 bans that sentence, and the pendant rung answers the same question properly.
    expect(dash()).not.toMatch(/t\("dashboard\.contactSupportDevice"\)/);
    for (const l of ["en", "es", "nl"]) {
      const table = JSON.parse(read(`src/i18n/locales/${l}.json`)) as Record<
        string,
        Record<string, unknown>
      >;
      expect(table.dashboard).not.toHaveProperty("contactSupportDevice");
    }
  });

  it("uses ONE definition of the active subscription, shared with the Membership page", () => {
    const src = dash();
    expect(src).toContain("useMemberSubscriptions(");
    expect(src).not.toMatch(/\.eq\("status", "active"\)/);
  });
});
