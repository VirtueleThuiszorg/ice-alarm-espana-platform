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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

import { ProtectionChecklist } from "@/components/client/ProtectionChecklist";

afterEach(() => cleanup());

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
    render(<ProtectionChecklist input={READY} />);
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
    const { container } = render(<ProtectionChecklist input={broken} />);
    expect(container.innerHTML).not.toContain("text-primary-foreground");
    for (const id of PROTECTION_RUNG_ORDER) {
      const el = screen.getByTestId(`protection-rung-${id}`);
      expect(el.innerHTML).not.toContain("bg-destructive");
    }
  });

  it("R1 — every action is an outline button, so Home keeps no red one", () => {
    const { container } = render(<ProtectionChecklist input={READY} />);
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
      const { container } = render(<ProtectionChecklist input={input} />);
      // one icon per rung, always
      expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
      for (const r of protectionChecklist(input)) seen.add(r.headline.fallback);
    }
    // Distinct sentences, not one sentence recoloured.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("a support action becomes the typed support path, not a hand-built URL", () => {
    render(<ProtectionChecklist input={{ ...READY, hasPendant: false }} />);
    expect(screen.getByTestId("protection-action-pendant").getAttribute("href")).toBe(
      supportActionPath("add_pendant"),
    );
  });

  it("renders no action element for a rung that has none", () => {
    render(<ProtectionChecklist input={{ ...READY, readiness: null }} />);
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
