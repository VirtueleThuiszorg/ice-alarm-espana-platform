/**
 * THE MEMBERSHIP PAGE'S EMPTY STATE — WP4 4d, R6 and R8.
 *
 * The page said `subscription.contactSupport` — *"contact support to change"* — to everybody who
 * reached the empty branch. R6 forbids that sentence in as many words and R8 contradicts it
 * ("'No active subscription' shows the plans"). But R8 taken literally is wrong for six of the
 * seven `subscription_status` values, and DANGEROUS for one:
 *
 *   a member in arrears, shown the plans and sent to `/join`, comes out with a SECOND member
 *   record — `submit_registration_atomic` INSERTs unconditionally — which on a life-safety
 *   product means an operator with an SOS on screen can open the wrong one.
 *
 * So the load-bearing assertions here are ABSENCES, as with the readiness notice: which
 * conditions do NOT show the plans, which route does NOT exist, and which sentence is gone.
 *
 * The completeness assertion is measured against the MIGRATIONS, not against the generated
 * types and not against the hand-written union — the lesson of the medical-fields work, where
 * four copies of one table's shape disagreed and each was checked against another copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  MEMBERSHIP_CONDITIONS,
  hasPlatformBilling,
  STATUS_CONDITION,
  membershipCondition,
  membershipConditionSpec,
  type MembershipCondition,
} from "@/lib/membershipCondition";
import { SUPPORT_ACTIONS, supportActionPath, supportActionSpec } from "@/lib/supportActions";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      const vars = (typeof fallback === "string" ? opts : fallback) ?? {};
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

// The plans card reads DB-backed pricing. Hydration is somebody else's test; here it must simply
// not be loading, so the numbers render rather than the "—" placeholder — and the helpers then
// return DEFAULT_PRICING_CONFIG, which a seed-parity test locks to the migration seed.
vi.mock("@/hooks/usePricing", () => ({
  usePricing: () => ({ config: null, isLoading: false, error: null }),
}));

// Only the HOOK is replaced. `formatRegistrationFeeDisplay` comes from the same module and is
// left real, so the discount/waiver rendering under test is the shipped one rather than a stub.
vi.mock("@/hooks/usePricingSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/usePricingSettings")>()),
  usePricingSettings: () => ({
    registrationFeeEnabled: true,
    registrationFeeDiscount: 0,
    registrationFeeBase: 59.99,
    registrationFeeFinal: 59.99,
    testModeEnabled: false,
    activeGateway: "stripe" as const,
    isLoading: false,
  }),
}));

import { MembershipConditionCard } from "@/components/client/MembershipConditionCard";

beforeEach(() => navigate.mockReset());
afterEach(() => cleanup());

// ── the seven statuses, read from the schema ────────────────────────────────
function statusesFromMigrations(): string[] {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const values = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    const created = sql.match(
      /CREATE\s+TYPE\s+(?:public\.)?subscription_status\s+AS\s+ENUM\s*\(([^)]*)\)/i,
    );
    if (created) {
      for (const m of created[1].matchAll(/'([^']+)'/g)) values.add(m[1]);
    }
    for (const m of sql.matchAll(
      /ALTER\s+TYPE\s+(?:public\.)?subscription_status\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi,
    )) {
      values.add(m[1]);
    }
  }
  return [...values].sort();
}

describe("membershipCondition — every status the schema can hold", () => {
  it("finds the statuses in the migrations at all (a floor, so a broken parse cannot pass)", () => {
    // Without this, a regex that matched nothing would make every completeness assertion below
    // vacuously true. The medical-fields work shipped exactly that bug once.
    expect(statusesFromMigrations().length).toBeGreaterThanOrEqual(7);
  });

  it("maps every status the migrations define — no status falls through", () => {
    for (const status of statusesFromMigrations()) {
      expect(Object.keys(STATUS_CONDITION)).toContain(status);
    }
  });

  it("maps every status to a condition that has copy", () => {
    for (const condition of Object.values(STATUS_CONDITION)) {
      expect(() => membershipConditionSpec(condition)).not.toThrow();
    }
  });

  it("gives every condition in the union a spec, and each exactly once", () => {
    const keys = MEMBERSHIP_CONDITIONS.map((c) => c.condition);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("membershipCondition — the three answers that are not a status", () => {
  it("no subscription row at all is `never_joined`", () => {
    expect(membershipCondition(null)).toBe("never_joined");
  });

  it("a FAILED or unfinished read is `unknown`, never `never_joined`", () => {
    // The whole point. `undefined` folded into `never_joined` invites a member whose query
    // failed to sign up a second time.
    expect(membershipCondition(undefined)).toBe("unknown");
  });

  it("a row with a NULL status is `unknown` — the column is nullable, so this is real data", () => {
    expect(membershipCondition({ status: null })).toBe("unknown");
  });

  it("an active row is `active`", () => {
    expect(membershipCondition({ status: "active" })).toBe("active");
  });
});

describe("R8 — the plans are shown to exactly one of them", () => {
  it("only `never_joined` shows the plans", () => {
    const showing = MEMBERSHIP_CONDITIONS.filter((c) => c.showsPlans).map((c) => c.condition);
    expect(showing).toEqual(["never_joined"]);
  });

  it("a member IN ARREARS is not shown the plans — they would pay twice", () => {
    expect(membershipConditionSpec("in_arrears").showsPlans).toBe(false);
  });

  it("a PAUSED, SUSPENDED, ENDED or AWAITING-PAYMENT member is not shown the plans either", () => {
    for (const c of ["paused", "suspended", "ended", "awaiting_payment"] as MembershipCondition[]) {
      expect(membershipConditionSpec(c).showsPlans).toBe(false);
    }
  });

  it("and a member whose read FAILED is not invited to join again", () => {
    expect(membershipConditionSpec("unknown").showsPlans).toBe(false);
  });
});

describe("what the copy is and is not allowed to say", () => {
  it("exactly three conditions claim somebody is monitoring, and all three are true", () => {
    // `active`, `legacy_billing` and `switching_to_stripe`, and nothing else. Named as a closed
    // list rather than a count, because the failure this guards against is a condition added
    // later inheriting "yes, you are covered" from nobody having thought about it.
    //
    // `switching_to_stripe` joined the list on 2026-09-11 and is the one worth being sure of: a
    // member mid-migration has an unpaid Stripe link and no subscription row, and it would be
    // easy to read that as "not paying". They are wearing the pendant and the alarm has not
    // changed — which is also the first sentence of their copy.
    const monitored = MEMBERSHIP_CONDITIONS.filter((c) => c.monitored).map((c) => c.condition);
    expect([...monitored].sort()).toEqual(["active", "legacy_billing", "switching_to_stripe"]);
  });

  it("a member mid-migration is monitored, is not shown the plans, and is offered a human", () => {
    const spec = membershipConditionSpec("switching_to_stripe");
    expect(spec.monitored).toBe(true);
    // Showing prices to somebody who already has an unpaid link out is inviting a second payment.
    expect(spec.showsPlans).toBe(false);
    /* NO action of its own, like `active` — the page renders `SwitchToStripeCard`, which
       carries the member's live link or, once Stripe has expired it, the route to a person.
       A second button beside it would be two actions for one job on one screen. */
    expect(spec.action).toBeNull();
    // The alarm, first. A message about money from the company holding your emergency button
    // reads as a threat to the button unless it says otherwise.
    expect(spec.body.fallback.toLowerCase()).toContain("alarm has not changed");
  });

  it("a legacy member is monitored, is not shown the plans, and is not treated as new", () => {
    // The state exists because `inactive` was wrong about the person: these members wear the
    // pendant tonight and pay outside Stripe. Showing them the plans would invite a second
    // payment; telling them nobody is watching would be false.
    const spec = membershipConditionSpec("legacy_billing");
    expect(spec.monitored).toBe(true);
    expect(spec.showsPlans).toBe(false);
    expect(spec.title.fallback).toContain("active");
  });

  it("a legacy member is only legacy when BOTH columns say so", () => {
    // status alone would catch every active Stripe member; billing_source alone would catch a
    // member the import left pending_review, who is NOT yet monitored.
    expect(membershipCondition(null, { status: "active", billing_source: "legacy" }))
      .toBe("legacy_billing");
    expect(membershipCondition(null, { status: "pending_review", billing_source: "legacy" }))
      .toBe("never_joined");
    expect(membershipCondition(null, { status: "active", billing_source: "stripe" }))
      .toBe("never_joined");
  });

  it("renewal and dunning fire for stripe and for nobody else", () => {
    // This is why billing_source exists rather than another status value: a legacy member IS
    // active, so anything keyed on status alone would start chasing them for a card we have
    // never held.
    expect(hasPlatformBilling({ status: "active", billing_source: "stripe" })).toBe(true);
    expect(hasPlatformBilling({ status: "active", billing_source: "legacy" })).toBe(false);
    expect(hasPlatformBilling({ status: "active", billing_source: "none" })).toBe(false);
    expect(hasPlatformBilling(null)).toBe(false);
    expect(hasPlatformBilling(undefined)).toBe(false);
  });

  it("never says 'contact support to change' — R6 bans the sentence", () => {
    for (const c of MEMBERSHIP_CONDITIONS) {
      expect(c.body.fallback.toLowerCase()).not.toContain("contact support");
      expect(c.title.fallback.toLowerCase()).not.toContain("contact support");
    }
  });

  it("the arrears copy tells the member NOT to sign up again", () => {
    expect(membershipConditionSpec("in_arrears").body.fallback.toLowerCase()).toContain(
      "not sign up again",
    );
  });

  it("every action names a support route that exists", () => {
    const known = SUPPORT_ACTIONS.map((a) => a.key);
    for (const c of MEMBERSHIP_CONDITIONS) {
      if (c.action) expect(known).toContain(c.action);
    }
  });

  it("`active` offers no empty-state action — the page renders the record instead", () => {
    expect(membershipConditionSpec("active").action).toBeNull();
  });

  it("every other condition offers a route to a human", () => {
    /*
      TWO EXCEPTIONS, AND BOTH FOR THE SAME REASON: the page renders the thing itself, so the
      card would be a second button for one job.

        `active`              the record is on the page — the plan, the renewal date, the
                              payment method.
        `switching_to_stripe` SwitchToStripeCard is on the page, carrying the member's own live
                              link or, once Stripe has expired it, the route to a person. R1
                              allows one red button per surface and that card owns it.
    */
    const rendersItsOwnAction = ["active", "switching_to_stripe"];
    for (const c of MEMBERSHIP_CONDITIONS) {
      if (!rendersItsOwnAction.includes(c.condition)) expect(c.action, c.condition).not.toBeNull();
    }
  });

  it("and the two that carry no action are exactly those two", () => {
    const actionless = MEMBERSHIP_CONDITIONS.filter((c) => c.action === null).map((c) => c.condition);
    expect([...actionless].sort()).toEqual(["active", "switching_to_stripe"]);
  });
});

describe("the card renders the condition it is given", () => {
  it("says nobody is monitoring, for every condition except active", () => {
    for (const c of MEMBERSHIP_CONDITIONS) {
      cleanup();
      render(<MembershipConditionCard condition={c.condition} />);
      if (c.monitored) {
        expect(screen.queryByTestId("membership-not-monitored")).toBeNull();
      } else {
        expect(screen.getByTestId("membership-not-monitored").textContent).toMatch(
          /no operator will answer/i,
        );
      }
    }
  });

  it("shows the plans for a member who never joined", () => {
    render(<MembershipConditionCard condition="never_joined" />);
    expect(screen.getByTestId("membership-plans")).toBeTruthy();
    expect(screen.getByTestId("membership-plan-single")).toBeTruthy();
    expect(screen.getByTestId("membership-plan-couple")).toBeTruthy();
  });

  it("does NOT show the plans to a member in arrears", () => {
    render(<MembershipConditionCard condition="in_arrears" />);
    expect(screen.queryByTestId("membership-plans")).toBeNull();
  });

  it("offers no route to /join from anywhere on it — that would duplicate the member", () => {
    for (const c of MEMBERSHIP_CONDITIONS) {
      cleanup();
      const { container } = render(<MembershipConditionCard condition={c.condition} />);
      expect(container.innerHTML).not.toContain("/join");
    }
  });

  it("its action navigates to the support route the spec names", () => {
    render(<MembershipConditionCard condition="never_joined" />);
    fireEvent.click(screen.getByTestId("membership-condition-action"));
    expect(navigate).toHaveBeenCalledWith(supportActionPath("start_membership"));
  });

  it("R1 — at most one red button on it", () => {
    for (const c of MEMBERSHIP_CONDITIONS) {
      cleanup();
      const { container } = render(<MembershipConditionCard condition={c.condition} />);
      const red = [...container.querySelectorAll("button")].filter((b) =>
        b.className.split(/\s+/).includes("bg-primary"),
      );
      expect(red.length).toBeLessThanOrEqual(1);
    }
  });

  it("R2 — the status notice is amber, not brand red or destructive", () => {
    render(<MembershipConditionCard condition="paused" />);
    const notice = screen.getByTestId("membership-not-monitored");
    expect(notice.className).toContain("#FEF8E6");
    expect(notice.className).not.toContain("destructive");
    expect(notice.className).not.toContain("bg-primary");
  });

  it("the price shown is the real one, not a placeholder", () => {
    render(<MembershipConditionCard condition="never_joined" />);
    // €27.49 = 24.99 net + 10% subscription tax, from DEFAULT_PRICING_CONFIG (== the seed).
    expect(screen.getByTestId("membership-plan-single").textContent).toMatch(/27[.,]49/);
  });

  it("does not render the price with a doubled slash", () => {
    // `subscription.mo` is the string "/mo". The page put a literal "/" in front of it, so an
    // active member's amount read "€24.99//mo". Found while writing the plans card, which was
    // about to copy the same mistake.
    render(<MembershipConditionCard condition="never_joined" />);
    expect(screen.getByTestId("membership-plan-single").textContent).not.toContain("//");
  });

  it("and the one-off costs are on it — a monthly price alone understates joining by ~€200", () => {
    render(<MembershipConditionCard condition="never_joined" />);
    // `toBeVisible`, not `textContent`. A mutation that put `hidden` on the row survived a
    // textContent assertion: the string was still in the DOM and no longer on the screen, and
    // "the member was told what it costs" is a claim about the screen.
    expect(screen.getByText(/151[.,]25/)).toBeVisible(); // the pendant, 125.00 net + 21%
    expect(screen.getByText(/14[.,]99/)).toBeVisible(); // delivery
    expect(screen.getByText(/59[.,]99/)).toBeVisible(); // setting them up
  });
});

describe("supportActions — one list, and nothing may drift from it", () => {
  it("has unique keys", () => {
    const keys = SUPPORT_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("builds the path SupportPage reads", () => {
    expect(supportActionPath("report_issue")).toBe("/dashboard/support?action=report_issue");
  });

  it("returns null for a value it does not carry, rather than a plausible-looking spec", () => {
    expect(supportActionSpec("report-issue")).toBeNull();
    expect(supportActionSpec("")).toBeNull();
    expect(supportActionSpec(null)).toBeNull();
  });

  it("no page anywhere hand-builds an ?action= URL", () => {
    // THE POINT OF THE MODULE. A hand-typed `?action=reportIssue` does not fail — the lookup
    // misses and the dialog opens titled "Support Request", so a member sends a message that
    // looks fine and reaches staff with the wrong subject.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const rel = path.relative(process.cwd(), full);
          if (rel.endsWith("src/lib/supportActions.ts") || rel.includes("src/test/")) continue;
          if (/support\?action=/.test(readFileSync(full, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });

  it("SupportPage no longer keeps its own copy of the subject map", () => {
    const page = read("src/pages/client/SupportPage.tsx");
    expect(page).toContain("supportActionSpec");
    expect(page).not.toMatch(/const\s+subjectMap/);
  });

  it("SupportPage still opens a request for an unrecognised value", () => {
    // Deliberate: a member following a year-old link gets a conversation, not a dead page. The
    // ratchet is on what this codebase can EMIT, which is the half that drifts.
    expect(read("src/pages/client/SupportPage.tsx")).toContain("support.generalEnquirySubject");
  });
});

describe("the page itself", () => {
  const page = () => read("src/pages/client/SubscriptionPage.tsx");

  it("the banned sentence is gone", () => {
    // Asserted on the CALL, not on the string: the comment that explains why the key was removed
    // names it, and an assertion that a word is absent from a file matches the prose explaining
    // its absence. That slip has been made three times on this codebase already.
    expect(page()).not.toMatch(/t\(\s*"subscription\.contactSupport"/);
  });

  it("routes the empty branch through the condition card rather than one hard-coded message", () => {
    expect(page()).toContain("MembershipConditionCard");
    expect(page()).toContain("membershipCondition(");
  });

  it("passes `undefined` through as `undefined` — it must not coalesce a failed read to null", () => {
    // `subscriptions ?? null` here would turn a failed read into "never joined" and undo the
    // whole distinction. Asserted on the source because the bug is a single `??`.
    expect(page()).toMatch(/subscriptions === undefined \? undefined : subscriptions\.latest/);
    expect(page()).not.toMatch(/membershipCondition\(subscriptions \?\? null\)/);
  });

  it("tells the member who pays, and does not invent a name it cannot read", () => {
    const src = page();
    expect(src).toContain("subscription-who-pays");
    // `payers` grants SELECT to staff and to the payer only. A join here would need a new RLS
    // policy on the table whose design note says being a payer grants no access to anything.
    expect(src).not.toMatch(/from\("payers"\)/);
  });

  it("does not put a literal slash in front of the /mo string either", () => {
    expect(page()).not.toMatch(/\/\{subscription\.billing_frequency/);
  });

  it("offers the two actions WP4 names, and neither is the page's red button", () => {
    const src = page();
    expect(src).toContain("subscription-add-pendant");
    expect(src).toContain("subscription-change-to-couple");
    for (const testid of ["subscription-add-pendant", "subscription-change-to-couple"]) {
      const at = src.indexOf(testid);
      // the `variant="outline"` sits in the same JSX element, immediately above the testid
      expect(src.slice(Math.max(0, at - 200), at)).toContain('variant="outline"');
    }
  });
});
