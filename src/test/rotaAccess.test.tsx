// The supervisor can reach the rota, and does NOT thereby reach the SOS escalation chain.
//
// THE GAP. The database has said for some time that a supervisor runs the rota: RLS grants
// `call_centre_supervisor` manage-all on `staff_shifts`, `staff_holidays` and `staff_shift_swaps`,
// and `generate_rota()` refuses anyone who is not an admin or a supervisor. The only rota screen
// lived under `/admin/*`, whose route guard is admin/super_admin — so Mary could not reach the
// thing she is responsible for while the permission was already hers. Identical in shape to the
// holiday-approvals gap, and fixed the same way: one component, mounted twice, behind a role gate.
//
// THE ONE THING SHE DOES NOT GET is `shift_escalation_chain` — the ladder
// `sos-escalation-runner` reads to decide who is telephoned when an alert goes unanswered. It is
// a separate hand-populated table, it is the SOS path, and widening who may edit it is not what
// "give Mary the rota" asked for. Both halves are asserted here, because the second is the one
// that would be silently lost by a later refactor.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROTA_MANAGER_ROLES, ESCALATION_EDITOR_ROLES } from "@/lib/staffNotify";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Comments are not executed, so no assertion here may be satisfied by one. */
const code = (rel: string) =>
  read(rel)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.trim()))
    .join("\n");

const mockStaffRole = vi.fn<() => string | null>(() => null);

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ staffRole: mockStaffRole(), signOut: vi.fn() }),
}));

// `t` resolves against the real en.json rather than echoing the key, so a sidebar entry whose
// labelKey does not exist in the locale renders as nothing recognisable and the assertion below
// fails — which is the failure a user would actually see (a raw `sidebar.rota` in the nav).
vi.mock("react-i18next", () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), "src/i18n/locales/en.json"), "utf8"));
  const lookup = (key: string) =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => (lookup(key) as string) ?? fallback ?? key,
      i18n: { language: "en" },
    }),
  };
});

// The sidebar subscribes to two realtime channels and counts alerts/messages on mount. None of
// that is what is under test, so it is stubbed down to something that resolves.
vi.mock("@/integrations/supabase/client", () => {
  const query = () => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.then = (resolve: (v: unknown) => unknown) => resolve({ count: 0, data: [], error: null });
    return q;
  };
  const channel = () => {
    const c: Record<string, unknown> = {};
    c.on = () => c;
    c.subscribe = () => c;
    return c;
  };
  return {
    supabase: { from: query, channel, removeChannel: () => {} },
  };
});

// The real rota page pulls in supabase, react-query and a week's worth of queries. What is under
// test here is WHO REACHES IT, so it is stubbed with something identifiable.
vi.mock("@/pages/admin/RotaPage", () => ({
  default: () => <div data-testid="the-one-rota-page">rota</div>,
}));

import CallCentreRotaPage from "@/pages/call-centre/RotaPage";
import { CallCentreSidebar } from "@/components/layout/CallCentreSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const renderAs = (role: string | null) => {
  mockStaffRole.mockReturnValue(role);
  return render(
    <MemoryRouter initialEntries={["/call-centre/rota"]}>
      <CallCentreRotaPage />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  mockStaffRole.mockReset();
  mockStaffRole.mockReturnValue(null);
});

describe("who reaches the rota on the call-centre surface", () => {
  it("a call_centre_supervisor gets the rota — the whole point of this route", () => {
    renderAs("call_centre_supervisor");
    expect(screen.getByTestId("the-one-rota-page")).toBeInTheDocument();
  });

  it("an admin and a super_admin get it too", () => {
    for (const role of ["admin", "super_admin"]) {
      const { unmount } = renderAs(role);
      expect(screen.getByTestId("the-one-rota-page"), role).toBeInTheDocument();
      unmount();
    }
  });

  it("a plain operator does NOT — the rota is not theirs to manage", () => {
    renderAs("call_centre");
    expect(screen.queryByTestId("the-one-rota-page")).not.toBeInTheDocument();
  });

  it("nor does somebody with no staff role at all", () => {
    // The dangerous direction: a null role must not read as "not excluded".
    renderAs(null);
    expect(screen.queryByTestId("the-one-rota-page")).not.toBeInTheDocument();
  });

  it("every role in ROTA_MANAGER_ROLES gets in, and nothing else does", () => {
    // Driven from the constant rather than from a hand-written list, so adding a role there
    // cannot quietly leave this test asserting the old set.
    for (const role of ROTA_MANAGER_ROLES) {
      const { unmount } = renderAs(role);
      expect(screen.getByTestId("the-one-rota-page"), role).toBeInTheDocument();
      unmount();
    }
    for (const role of ["call_centre", "partner", "staff", "member", ""]) {
      const { unmount } = renderAs(role);
      expect(screen.queryByTestId("the-one-rota-page"), role).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("it is the SAME page, not a second rota", () => {
  it("the call-centre route imports the admin page rather than reimplementing it", () => {
    // Two rota grids would be two copy-week implementations and two generators, and the one
    // nobody watched would be the one that drifted.
    const wrapper = code("src/pages/call-centre/RotaPage.tsx");
    expect(wrapper).toMatch(/from\s+"@\/pages\/admin\/RotaPage"/);
  });

  it("the wrapper contains no rota UI of its own", () => {
    const wrapper = code("src/pages/call-centre/RotaPage.tsx");
    for (const forbidden of ["<table", "useStaffShifts", "generate_rota", "copyWeek"]) {
      expect(wrapper, `the wrapper reimplements ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the route is actually mounted, or none of the above is reachable", () => {
    const app = code("src/App.tsx");
    expect(app).toContain('import("./pages/call-centre/RotaPage")');
    expect(app).toMatch(/path="rota"\s+element={<CallCentreRotaPage\s*\/>}/);
  });
});

describe("the SOS escalation chain stays admin-only", () => {
  const rota = code("src/pages/admin/RotaPage.tsx");

  it("supervisors are NOT escalation editors", () => {
    // The two role sets coincide on admin/super_admin and must differ on the supervisor. If this
    // ever passes trivially because both lists are equal, the gate below stops meaning anything.
    expect(ESCALATION_EDITOR_ROLES as readonly string[]).not.toContain("call_centre_supervisor");
    expect(ROTA_MANAGER_ROLES as readonly string[]).toContain("call_centre_supervisor");
  });

  it("the page computes the escalation gate from that narrower set", () => {
    expect(rota).toContain("ESCALATION_EDITOR_ROLES");
    expect(rota).toMatch(/const canEditEscalation\s*=/);
  });

  it("the escalation ROW is behind the gate", () => {
    const rowAt = rota.indexOf("Escalation chain row");
    expect(rowAt, "the escalation row is gone — this test is now vacuous").toBeGreaterThan(-1);
    // The gate must be the thing immediately guarding the row, not merely present in the file.
    expect(rota.slice(rowAt, rowAt + 200)).toContain("canEditEscalation &&");
  });

  it("the escalation DIALOG is behind the gate too", () => {
    // Hiding the row while leaving the dialog mountable would leave the editor reachable by any
    // other path that flips its open state.
    const dlgAt = rota.indexOf("Escalation Chain Dialog");
    expect(dlgAt).toBeGreaterThan(-1);
    expect(rota.slice(dlgAt, dlgAt + 200)).toContain("canEditEscalation &&");
  });

  it("a supervisor does not even QUERY shift_escalation_chain", () => {
    // RLS would refuse the read anyway, so this is not the security boundary — it is about not
    // generating a policy denial on every week a supervisor pages through, which is the noise
    // that makes a real denial hard to spot.
    expect(rota).toMatch(/useEscalationChains\([\s\S]{0,120}canEditEscalation/);
  });
});

// The hook's own half of that: the third argument has to reach `useQuery`. Asserting the word
// `enabled` appears somewhere in the file is not enough — the parameter itself is named `enabled`,
// so deleting the line that passes it on leaves such a check green (it did).
describe("useEscalationChains only fires when enabled", () => {
  it("passes enabled straight through to useQuery, and defaults to on", async () => {
    vi.resetModules();
    const useQuery = vi.fn((_options: Record<string, unknown>) => ({ data: [] }));
    vi.doMock("@tanstack/react-query", () => ({
      useQuery,
      useMutation: vi.fn(() => ({})),
      useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    }));
    const { useEscalationChains } = await import("@/hooks/useEscalationChain");

    useEscalationChains("2026-09-07", "2026-09-13", false);
    expect(useQuery.mock.calls[0][0]).toMatchObject({ enabled: false });

    useEscalationChains("2026-09-07", "2026-09-13", true);
    expect(useQuery.mock.calls[1][0]).toMatchObject({ enabled: true });

    // Omitted: the admin call sites that predate this parameter must keep querying.
    useEscalationChains("2026-09-07", "2026-09-13");
    expect(useQuery.mock.calls[2][0]).toMatchObject({ enabled: true });

    vi.doUnmock("@tanstack/react-query");
    vi.resetModules();
  });
});

describe("the sidebar offers it to the right people, without disturbing the pinned order", () => {
  const sidebar = code("src/components/layout/CallCentreSidebar.tsx");

  it("Rota is NOT in the pinned menuItems array", () => {
    // `menuItems` is the order every operator's hand learns. A role-conditional entry inside it
    // would appear for two people and shift the list under everybody else.
    const start = sidebar.indexOf("const menuItems: MenuItem[] = [");
    const end = sidebar.indexOf("];", start);
    expect(sidebar.slice(start, end)).not.toContain("sidebar.rota");
  });

  it("it is spliced in for rota managers only", () => {
    expect(sidebar).toContain("ROTA_MANAGER_ROLES");
    expect(sidebar).toMatch(/canManageRota[\s\S]{0,200}sidebar\.rota/);
  });

  it("uses the CalendarDays icon Lee asked for", () => {
    expect(sidebar).toMatch(/icon:\s*CalendarDays,\s*labelKey:\s*"sidebar\.rota"/);
  });
});

// The assertions above read the file, which is right for the DECLARED order but cannot see a gate
// that has stopped gating: `canManageRota = true` passes every one of them. So the visibility
// itself is rendered.
describe("what the sidebar actually renders", () => {
  const renderSidebar = (role: string | null) => {
    mockStaffRole.mockReturnValue(role);
    return render(
      <MemoryRouter initialEntries={["/call-centre"]}>
        <TooltipProvider>
          <CallCentreSidebar />
        </TooltipProvider>
      </MemoryRouter>,
    );
  };

  // Two panes render at once (mobile sheet + desktop aside), so a link can legitimately appear
  // more than once. What matters is present-or-absent.
  const rotaLinks = () =>
    screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/call-centre/rota");

  it("a supervisor is offered Rota", () => {
    renderSidebar("call_centre_supervisor");
    expect(rotaLinks().length).toBeGreaterThan(0);
    expect(rotaLinks()[0]).toHaveTextContent("Rota");
  });

  it("an operator is not", () => {
    renderSidebar("call_centre");
    expect(rotaLinks()).toHaveLength(0);
  });

  it("neither is somebody with no staff role", () => {
    renderSidebar(null);
    expect(rotaLinks()).toHaveLength(0);
  });

  it("the pinned items are unmoved by the splice", () => {
    // The whole reason the entry is spliced rather than declared: an operator's list must be
    // identical to a supervisor's up to the point the extra item appears.
    const labelsFor = (role: string) => {
      const { unmount } = renderSidebar(role);
      const paths = screen
        .queryAllByRole("link")
        .map((a) => a.getAttribute("href"))
        .filter((h): h is string => !!h);
      // De-duplicated across the two panes, order preserved.
      const seen = [...new Set(paths)];
      unmount();
      return seen;
    };
    const operator = labelsFor("call_centre");
    const supervisor = labelsFor("call_centre_supervisor");
    expect(supervisor.slice(0, operator.length)).toEqual(operator);
    expect(supervisor).toContain("/call-centre/rota");
  });
});

describe("the label exists in every locale", () => {
  for (const locale of ["en", "es", "nl"]) {
    it(`${locale} has sidebar.rota`, () => {
      const json = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      expect(json.sidebar?.rota, `${locale}.sidebar.rota`).toBeTruthy();
    });
  }
});
