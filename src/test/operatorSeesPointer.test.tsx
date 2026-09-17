/**
 * "WHAT AN OPERATOR SEES" ON HOME — a pointer, and the test that keeps it one.
 *
 * The Medical information page carries the best sentence in the product: *"This is exactly what
 * an operator sees the moment you press your pendant."* It sits two clicks away under My Account,
 * and a member who has never gone looking has no idea it exists — or that we hold anything at all.
 * That sentence is what turns a form into a reason to fill it in.
 *
 * ── THE ASSERTION THIS FILE EXISTS FOR ──────────────────────────────────────
 *
 * Not that the line renders. That the CONTENT does not. Home is special-category data's worst
 * room: the page most likely to be read over a member's shoulder or propped on a kitchen table,
 * the page an admin previews, and the page a staff member opens with `?memberId=`. So the
 * absence is asserted against the ACTUAL `medical_information` and `member_access` column names,
 * from `medicalFields.ts` rather than from a list typed here — which means a column added by a
 * future migration is covered the day it is added, and "improving" this pointer into a summary
 * fails a test rather than shipping.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MEDICAL_FIELDS, MEMBER_ACCESS_FIELDS } from "@/lib/medicalFields";

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

import { OperatorSeesPointer } from "@/components/client/OperatorSeesPointer";

afterEach(() => cleanup());

const ACTIVE = { status: "active" } as const;

describe("when it is true, it is said", () => {
  it("renders for a member with an active membership and points at the medical page", () => {
    render(<OperatorSeesPointer latestSubscription={ACTIVE} />);
    expect(screen.getByTestId("operator-sees-pointer")).toBeTruthy();
    expect(screen.getByTestId("operator-sees-action").getAttribute("href")).toBe(
      "/dashboard/medical",
    );
  });

  it("is NOT gated on the record having anything in it", () => {
    /*
      An operator sees the record either way, and a member with an empty one is precisely who
      needs to know that. The component is not even given the medical row — it cannot gate on it,
      which is the strongest form of this assertion.
    */
    const props = OperatorSeesPointer.length;
    expect(props).toBe(1); // one props object, and its keys are the two below
    render(<OperatorSeesPointer latestSubscription={ACTIVE} />);
    expect(screen.getByTestId("operator-sees-pointer")).toBeTruthy();
  });

  it("renders for every membership condition except the one where it is not yet true", () => {
    const statuses = ["active", "past_due", "paused", "suspended", "cancelled", "expired"] as const;
    for (const status of statuses) {
      cleanup();
      render(<OperatorSeesPointer latestSubscription={{ status }} />);
      expect(screen.queryByTestId("operator-sees-pointer"), status).toBeTruthy();
    }
  });

  it("renders while the subscription read is still unknown", () => {
    // The claim is about how the service works, not about the state of one query. Going silent
    // because a read failed would hide a true sentence.
    render(<OperatorSeesPointer latestSubscription={undefined} />);
    expect(screen.getByTestId("operator-sees-pointer")).toBeTruthy();
  });

  it("renders for a LEGACY member, who is monitored and has no subscription row", () => {
    // `membershipCondition` answers `never_joined` from the subscription alone for these people —
    // members since 2014, billed outside Stripe. The member row is what settles it.
    render(
      <OperatorSeesPointer
        latestSubscription={null}
        member={{ status: "active", billing_source: "legacy" }}
      />,
    );
    expect(screen.getByTestId("operator-sees-pointer")).toBeTruthy();
  });
});

describe("and when it is not true, it is not said", () => {
  it("renders NOTHING for never_joined", () => {
    // "If you press your pendant" is not yet true for somebody who has not joined, and a sentence
    // about a service they have not bought is an advertisement dressed as reassurance.
    const { container } = render(<OperatorSeesPointer latestSubscription={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("NO MEDICAL CONTENT — the point of the brief", () => {
  const COLUMNS = [
    ...MEDICAL_FIELDS.map((f) => f.column),
    ...MEMBER_ACCESS_FIELDS.map((f) => f.column),
  ];

  it("the component names no medical column, and the list is the real one", () => {
    // Sanity first: an empty list would make every assertion below pass vacuously.
    expect(COLUMNS.length).toBeGreaterThanOrEqual(16);
    expect(COLUMNS).toContain("medical_conditions");
    expect(COLUMNS).toContain("key_safe_code");

    const src = read("src/components/client/OperatorSeesPointer.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const column of COLUMNS) {
      expect(src, `${column} must not appear in the pointer`).not.toContain(column);
    }
  });

  it("nothing it RENDERS carries a field name or a value either", () => {
    const { container } = render(<OperatorSeesPointer latestSubscription={ACTIVE} />);
    const html = container.innerHTML.toLowerCase();
    for (const column of COLUMNS) {
      expect(html, column).not.toContain(column);
      // …and the human label too: "Allergies" on Home is the same disclosure as `allergies`.
      expect(html, column).not.toContain(column.replace(/_/g, " "));
    }
  });

  it("the DASHBOARD does not read the medical row to render it", () => {
    /*
      The read is the disclosure. A count, a percentage or "4 of 17 fields filled" all require
      fetching special-category data onto the page most likely to be read by somebody else — and
      a completeness score reframes a safety record as a chore with a progress bar, which the
      header's "Complete my details" already owns.
    */
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).not.toMatch(/from\("medical_information"\)/);
    expect(dash).not.toMatch(/from\("member_access"\)/);
    expect(dash).not.toContain("useMedical");
  });

  it("no completeness score of any kind", () => {
    /*
      Against the CODE, not the file. The component's own comment quotes "4 of 17 fields filled"
      in order to rule it out, and a check that cannot tell an example from an implementation
      fails on the explanation of why the thing is absent.
    */
    const code = read("src/components/client/OperatorSeesPointer.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bpercent|\bcomplete(ness|d)?Count|\d+ of \d+/i);
    // …and the explanation is still there for the next reader.
    expect(read("src/components/client/OperatorSeesPointer.tsx")).toContain("progress bar");
  });
});

describe("the style rules it has to keep", () => {
  const src = read("src/components/client/OperatorSeesPointer.tsx");

  it("R2 — no red. Nothing here is a warning", () => {
    expect(src).not.toContain("bg-destructive");
    expect(src).not.toContain("alert-sos");
    expect(src).not.toContain("text-destructive");
  });

  it("R1 — an outline control, never the page's primary button", () => {
    expect(src).toContain('variant="outline"');
    expect(src).not.toMatch(/variant="default"/);
  });

  it("R10's 16px floor and R11's touch target", () => {
    expect(src).toContain("text-base");
    expect(src).toContain("touch-target");
    // Nothing below the 13px label floor, and no arbitrary px that ignores the A/A control.
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toContain("text-xs");
  });
});

describe("where it sits on the page", () => {
  const dash = read("src/pages/client/ClientDashboard.tsx");

  it("below the protection/messages grid and above Recent activity", () => {
    // Both answer "what happens when I press it", so they belong together — and it is a signpost
    // rather than a rung, so it goes after the checklist rather than inside it.
    const grid = dash.indexOf('<div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">');
    const pointer = dash.indexOf("<OperatorSeesPointer");
    const recent = dash.indexOf('data-testid="recent-activity"');
    expect(grid).toBeGreaterThan(-1);
    expect(pointer).toBeGreaterThan(grid);
    expect(pointer).toBeLessThan(recent);
  });

  it("renders in the admin template preview too", () => {
    // `isTemplatePreview` feeds MOCK data into the same page; the pointer must not blank out
    // there, and must not start reading a member's row to decide.
    expect(dash).toMatch(/<OperatorSeesPointer[\s\S]{0,400}isTemplatePreview/);
  });
});

describe("the sentence, in all three locales", () => {
  it("exists, mentions the operator, and promises no content", () => {
    for (const locale of ["en", "es", "nl"]) {
      const table = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as {
        dashboard: Record<string, string>;
      };
      expect(table.dashboard.operatorSees, locale).toBeTruthy();
      expect(table.dashboard.operatorSeesAction, locale).toBeTruthy();
      // `operador` in Spanish, `operator` in Dutch — the words the Medical page already uses for
      // the person on the other end, so the pointer and its destination say the same thing.
      expect(table.dashboard.operatorSees.toLowerCase(), locale).toMatch(/operator|operador/);
    }
  });
});
