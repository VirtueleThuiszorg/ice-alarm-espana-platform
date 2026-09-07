/**
 * The operator alert card must be LOUD when a member has no emergency contacts.
 *
 * It used to render that state as `text-xs text-zinc-500` — 12px grey-on-dark, 3.2:1 contrast
 * by the WCAG 2.1 formula, buried inside the contacts panel below the member dial button.
 * Effectively invisible to an operator under stress: GOALS.md G3 unmet on the emergency path.
 * READINESS_MODEL.md §1-E, §4-A; contract in ICE_OPERATOR_CARD_SPEC.md §5.1 (PR #154).
 *
 * Tested by RENDERING, not by reading the source, because the load-bearing requirement is
 * *when* the banner appears and no source grep can prove that. Written negative-first: the
 * two assertions that matter most are ABSENCES — no banner while the query is in flight, and
 * no banner for a member who has contacts. A banner that merely renders is easy; a banner
 * that renders only when true is the actual requirement, and the flash-on-every-alert failure
 * mode would be worse than the grey line it replaces (an operator learns to dismiss it, and
 * then dismisses it on the one member for whom it is true).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

// ── the supabase stub ──────────────────────────────────────────────────────
// Only `emergency_contacts` varies per test; the panel's other reads resolve empty. A
// deferred promise lets a test hold the contacts query in flight and assert the loading state.

type Rows = { data: unknown; error: unknown };
let contactsResult: Promise<Rows>;
/** The readiness view's row, for the pendant condition. Defaults to a tested pendant so the
 *  contacts assertions below are never confounded by a second banner appearing. */
let readinessResult: Promise<Rows> | Rows = {
  data: { device_tested_at: "2026-09-01T09:00:00Z" },
  error: null,
};
/** Which tables the panel actually read, so "it added no read for the contacts fact" is
 *  provable from behaviour rather than from a grep for a table name. */
let tablesRead: string[] = [];

function tableStub(result: Promise<Rows> | Rows) {
  const p = result instanceof Promise ? result : Promise.resolve(result);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order", "limit", "gte", "lte", "neq"]) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => p;
  chain.single = () => p;
  // Awaiting the builder itself is what the contacts/previous-alerts reads do.
  chain.then = (res: (v: Rows) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      tablesRead.push(table);
      if (table === "emergency_contacts") return tableStub(contactsResult);
      if (table === "member_monitoring_readiness") return tableStub(readinessResult);
      return tableStub({ data: null, error: null });
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Render the inline English default, which is what the operator sees.
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "en" },
  }),
}));

const BANNER = "sos-no-emergency-contacts";

const CONTACT = {
  id: "c1",
  contact_name: "Ana García",
  relationship: "Daughter",
  phone: "+34600000001",
  email: null,
  speaks_spanish: true,
  is_primary: true,
  priority_order: 1,
  notes: null,
};

async function renderPanel() {
  const { SOSActionPanel } = await import("@/components/call-centre/sos/SOSActionPanel");
  return render(
    <SOSActionPanel
      alertId="a1"
      memberId="m1"
      conferenceId={null}
      isInConference={false}
      onJoinConference={() => {}}
      onAddToCall={() => {}}
      onCallPrivately={() => {}}
      privateCall={null}
      onBridgeToConference={() => {}}
      onEndPrivateCall={() => {}}
      doctorPhone={null}
    />,
  );
}

beforeEach(() => {
  contactsResult = Promise.resolve({ data: [], error: null });
  tablesRead = [];
  readinessResult = { data: { device_tested_at: "2026-09-01T09:00:00Z" }, error: null };
});
afterEach(() => cleanup());

describe("operator card — NO EMERGENCY CONTACTS is loud", () => {
  it("shows the banner for a member with ZERO contacts", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/no emergency contacts/i);
  });

  it("says what to do instead — the member, and 112", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    // A banner that reports a problem without an action spends attention and returns nothing.
    expect(banner.textContent).toMatch(/112/);
    expect(banner.textContent).toMatch(/speak to the member/i);
  });

  it("tells the operator that level 5 will do nothing (true and non-obvious)", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    expect(banner.textContent).toMatch(/level 5/i);
  });

  it("does NOT rely on colour alone — icon plus text (G3)", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    expect(banner.querySelector("svg")).toBeTruthy();
    // Meaning survives with every colour class stripped.
    const withoutColour = (banner.textContent ?? "").trim();
    expect(withoutColour.length).toBeGreaterThan(40);
  });

  it("is announced to assistive tech", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it("offers no way to dismiss or collapse it", async () => {
    await renderPanel();
    const banner = await screen.findByTestId(BANNER);
    expect(banner.querySelector("button")).toBeNull();
  });
});

describe("operator card — the banner does NOT cry wolf", () => {
  it("is ABSENT while the contacts query is still in flight", async () => {
    // `contacts` is [] during loading too, so this is the flash-on-every-alert failure mode.
    let release: (v: Rows) => void = () => {};
    contactsResult = new Promise<Rows>((res) => {
      release = res;
    });

    await renderPanel();
    expect(screen.queryByTestId(BANNER)).toBeNull(); // <-- the load-bearing absence
    expect(screen.queryByText(/loading emergency contacts/i)).toBeTruthy();

    release({ data: [], error: null });
    await waitFor(() => expect(screen.queryByTestId(BANNER)).not.toBeNull());
  });

  it("is ABSENT for a member who HAS a contact", async () => {
    contactsResult = Promise.resolve({ data: [CONTACT], error: null });
    await renderPanel();
    await waitFor(() => expect(screen.queryByText("Ana García")).not.toBeNull());
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });

  it("is ABSENT when the contacts read FAILED — unreadable is not empty", async () => {
    // The same conflation emergency-contact-notify had: a failed read must never settle into
    // "this member has no contacts". ICE_OPERATOR_CARD_SPEC.md §5.1.3.
    contactsResult = Promise.resolve({ data: null, error: { message: "boom" } });
    await renderPanel();
    await waitFor(() => expect(screen.queryByText(/loading emergency contacts/i)).not.toBeNull());
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });
});

describe("operator card — D4: the pendant has never been tested", () => {
  const UNTESTED = "sos-pendant-untested";

  it("shows the banner on a settled `never tested`", async () => {
    readinessResult = { data: { device_tested_at: null }, error: null };
    contactsResult = Promise.resolve({ data: [CONTACT], error: null });
    await renderPanel();
    const banner = await screen.findByTestId(UNTESTED);
    // The advice is the point: this may be the first operator voice they have ever heard from
    // the pendant, so the operator says who they are before anything else.
    expect(banner.textContent).toMatch(/say who you are/i);
  });

  it("is ABSENT for a member whose pendant HAS been tested", async () => {
    readinessResult = { data: { device_tested_at: "2026-09-01T09:00:00Z" }, error: null };
    await renderPanel();
    await waitFor(() => expect(tablesRead).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(UNTESTED)).toBeNull();
  });

  it("is ABSENT while the read is in flight — the strictest case on this screen", async () => {
    // An alarm is already firing. A banner that appears on every load until the read lands is
    // one an operator learns to look past, and the one they look past is the red one beside it.
    let release: (v: Rows) => void = () => {};
    readinessResult = new Promise<Rows>((res) => { release = res; });
    await renderPanel();
    expect(screen.queryByTestId(UNTESTED)).toBeNull(); // <-- load-bearing
    release({ data: { device_tested_at: null }, error: null });
    await waitFor(() => expect(screen.queryByTestId(UNTESTED)).not.toBeNull());
  });

  it("is ABSENT when the read FAILED — unknown is not `never tested`", async () => {
    readinessResult = { data: null, error: { message: "timeout" } };
    await renderPanel();
    await waitFor(() => expect(tablesRead).toContain("member_monitoring_readiness"));
    expect(screen.queryByTestId(UNTESTED)).toBeNull();
  });

  it("does NOT touch the contacts banner, even when its own read fails", async () => {
    // The contract that mattered enough to narrow the old rule rather than delete it: the
    // contacts banner derives from `contacts` and nothing else, so this read failing must
    // leave it behaving exactly as it does today.
    readinessResult = { data: null, error: { message: "timeout" } };
    contactsResult = Promise.resolve({ data: [], error: null });
    await renderPanel();
    expect(await screen.findByTestId(BANNER)).toBeTruthy();
  });

  it("is not the same red as the contacts banner", async () => {
    // Two red banners is one red banner, and the one that gets diluted is the one about there
    // being nobody to call.
    readinessResult = { data: { device_tested_at: null }, error: null };
    contactsResult = Promise.resolve({ data: [], error: null });
    await renderPanel();
    const contacts = await screen.findByTestId(BANNER);
    const pendant = await screen.findByTestId(UNTESTED);
    expect(contacts.className).toMatch(/red/);
    expect(pendant.className).not.toMatch(/red/);
    // Not colour alone, either: an icon and a full uppercase heading carry it too.
    expect(pendant.querySelector("svg")).not.toBeNull();
  });

  it("is a status, not an alert — the red banner keeps the interrupting role", async () => {
    readinessResult = { data: { device_tested_at: null }, error: null };
    contactsResult = Promise.resolve({ data: [], error: null });
    await renderPanel();
    expect((await screen.findByTestId(BANNER)).getAttribute("role")).toBe("alert");
    expect((await screen.findByTestId(UNTESTED)).getAttribute("role")).toBe("status");
  });
});

describe("operator card — the banner never blocks the operator", () => {
  it("does not gate JOIN CALL or resolution behind readiness", async () => {
    const src = read("src/components/call-centre/sos/SOSActionPanel.tsx");
    // Whatever else changes, readiness must not become a precondition for working the alert.
    expect(src).not.toMatch(/disabled=\{[^}]*hasNoEmergencyContacts/);
    expect(src).not.toMatch(/hasNoEmergencyContacts\s*&&\s*<Button/);
  });

  it("adds no second query for a fact the panel already has", async () => {
    /*
      THIS RULE WAS NARROWED, DELIBERATELY, AND IT IS STRONGER FOR IT.

      It used to be `expect(src).not.toContain("member_monitoring_readiness")` — a blanket ban
      on the view. That was the right rule for the CONTACTS fact, which the panel already holds
      in `contacts` and must not re-fetch (spec §5.1.4: the card derives, the view serves the
      queue). It was the wrong rule stated too widely: the panel does NOT hold whether a
      pendant has ever been tested, and D4 made that the second half of readiness.

      So the ban is now on the thing it was protecting rather than on a table name:

        1. exactly one read of emergency_contacts, as before
        2. the view read may select `device_tested_at` and NOTHING ELSE — so it cannot become a
           second source of truth for the contacts fact, or for readiness itself
        3. the contacts banner's condition still comes from `contacts` alone (asserted below,
           by rendering with the view read failing)
    */
    const src = read("src/components/call-centre/sos/SOSActionPanel.tsx");
    expect(src.match(/from\("emergency_contacts"\)/g)?.length).toBe(1);
    expect(src.match(/from\("member_monitoring_readiness"\)/g)?.length).toBe(1);

    const view = src.match(/from\("member_monitoring_readiness"\)\s*\n\s*\.select\("([^"]*)"\)/);
    expect(view, "the view read is not in the expected shape").not.toBeNull();
    expect(view![1].trim()).toBe("device_tested_at");

    // And the contacts banner is not keyed on it.
    const bannerCondition = src.match(/const hasNoEmergencyContacts = ([^;]+);/);
    expect(bannerCondition).not.toBeNull();
    expect(bannerCondition![1]).not.toContain("pendantTested");
    expect(bannerCondition![1]).toContain("contacts");
  });

  it("the grey 12px zinc-500 no-contacts line is gone", async () => {
    const src = read("src/components/call-centre/sos/SOSActionPanel.tsx");
    expect(src).not.toContain('text-xs text-zinc-500">{t("sos.action.noContacts"');
  });
});
