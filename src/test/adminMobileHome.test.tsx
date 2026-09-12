/**
 * /admin ON A PHONE — the five things Lee opens his phone for, each one tappable.
 *
 * WHY A DIFFERENT LAYOUT AND NOT A RESPONSIVE ONE. The desktop dashboard is a seven-tile grid
 * plus five widgets. On a 390px screen that is a column of twenty cards: everything present,
 * nothing findable, and the number Lee actually opens his phone for — did anything sell today —
 * four scrolls down.
 *
 * SO THE TESTS ARE ABOUT WHAT ARRIVES ON THE SCREEN AND WHERE A TAP GOES, rendered rather than
 * scanned: a tile whose `to` is a route that does not exist reads exactly like a working tile
 * in a source assertion, and "tapping it does nothing" is the complaint this whole feature
 * exists to answer.
 *
 * The one thing asserted from source is the BRANCH — that the phone home receives the
 * dashboard's own already-fetched data rather than issuing its own queries — because that is a
 * property of the caller, not of this component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── fakes ───────────────────────────────────────────────────────────────────
let salesRow: Record<string, number> | null = null;
let salesError: { message: string } | null = null;
let readinessCount: number | null = 0;
let readinessError: { message: string } | null = null;
let notifications: Array<{
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = () => q;
    q.eq = self;
    q.not = () => ({
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ count: readinessCount, error: readinessError }),
    });
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return q;
  };
  return {
    supabase: {
      from: () => chain(),
      rpc: async () => ({ data: salesRow, error: salesError }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  };
});

// The bell's own hook, faked at the hook boundary: this test is about what the phone home does
// with ten notifications, not about how useNotifications pages them.
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ notifications, isLoading: false, unreadCount: 0 }),
}));

vi.mock("@/components/admin/dashboard/IsabellaHealthPill", () => ({
  IsabellaHealthPill: () => <div data-testid="isabella-pill">Isabella</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = (typeof fallback === "object" ? fallback : opts) ?? {};
      const text = typeof fallback === "string" ? fallback : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(vars[n] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const { AdminMobileHome } = await import("@/components/admin/dashboard/AdminMobileHome");

function renderHome(props: Partial<Parameters<typeof AdminMobileHome>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminMobileHome
        stats={{ active_members: 42, active_alerts: 0, new_members_30d: 3 }}
        statsLoading={false}
        statsError={false}
        alerts={[]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  salesError = null;
  readinessError = null;
  readinessCount = 0;
  notifications = [];
  salesRow = {
    paid_sales_today: 3,
    paid_amount_today: 480,
    paid_sales_60min: 0,
    paid_amount_60min: 0,
    new_subscriptions: 0,
    partner_signups: 0,
    ai_hot_items: 0,
    followups_pending: 0,
  };
});
afterEach(() => cleanup());

// ── the five things, and where each one goes ────────────────────────────────
describe("the five tiles Lee named", () => {
  it("shows today's takings as amount AND count", async () => {
    renderHome();
    // "€480 · 3 orders" is a different morning from "€480 · 24 orders" — the amount is what
    // somebody is looking for and the count gives it scale, so both, in that order.
    await waitFor(() => expect(screen.getByText("€480 · 3")).toBeTruthy());
  });

  it("shows active alerts, active members, and the not-yet-monitored count", async () => {
    readinessCount = 2;
    renderHome({ stats: { active_members: 42, active_alerts: 4, new_members_30d: 3 } });

    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
  });

  it("shows the Isabella pill — the same component the desktop header uses", () => {
    renderHome();
    expect(screen.getByTestId("isabella-pill")).toBeTruthy();
  });

  it("every tile is a link to a route that exists", () => {
    /*
      THE "TAPPING IT DOES NOTHING" TEST. A tile whose `to` points at a path with no route reads
      exactly like a working tile in a source scan, and lands the user on the catch-all.
      So each destination is checked against App.tsx's actual admin routes.
    */
    const { container } = renderHome();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThanOrEqual(5);

    const app = read("src/App.tsx");
    const adminRoutes = [...app.matchAll(/<Route\s+path="([a-z0-9\-/:]+)"/g)].map((m) => m[1]);

    for (const href of hrefs.filter((h) => h.startsWith("/admin/"))) {
      const path = href.replace("/admin/", "");
      expect(adminRoutes, `${href} has no admin route`).toContain(path);
    }
  });

  it("names the newest alert, so the tile says why to tap it", () => {
    renderHome({
      stats: { active_members: 1, active_alerts: 1, new_members_30d: 0 },
      alerts: [
        {
          id: "a1",
          alert_type: "fall_detected",
          received_at: new Date().toISOString(),
          member: { first_name: "Mary", last_name: "Smith" },
        },
      ],
    });
    // "1 alert" and "1 alert, a fall for Mary Smith" are a different reason to tap.
    expect(screen.getByText(/fall_detected — Mary Smith/)).toBeTruthy();
  });

  it("says 'unknown member' rather than an empty dash when the join returned nothing", () => {
    renderHome({
      stats: { active_members: 1, active_alerts: 1, new_members_30d: 0 },
      alerts: [{ id: "a1", alert_type: "sos_button", member: null }],
    });
    expect(screen.getByText(/sos_button — unknown member/)).toBeTruthy();
  });
});

// ── a failed read is never a quiet zero ─────────────────────────────────────
describe("a failed read is not good news", () => {
  it("says so for today's takings instead of showing €0", async () => {
    /*
      €0 today is TRUE, common, and unremarkable. It must not also be what a broken RPC looks
      like, or the one morning the read fails is the morning nobody investigates. This is the
      same distinction the desktop sales pill makes, and it is why the tile takes isError rather
      than `data ?? 0`.
    */
    salesRow = null;
    salesError = { message: "22P02 invalid input syntax" };
    renderHome();
    await waitFor(() => expect(screen.getAllByText("could not be read").length).toBeGreaterThan(0));
    expect(screen.queryByText("€0 · 0")).toBeNull();
  });

  it("says so for the readiness count — 'nobody is waiting' is the wrong answer that looks right", async () => {
    readinessCount = null;
    readinessError = { message: "permission denied" };
    renderHome();
    await waitFor(() => expect(screen.getAllByText("could not be read").length).toBeGreaterThan(0));
  });

  it("says so for the whole stats RPC, on every tile that came from it", () => {
    renderHome({ stats: undefined, statsError: true });
    // Alerts and members both come from that one RPC, so both must report it — a zero on either
    // is a claim nobody made.
    expect(screen.getAllByText("could not be read").length).toBeGreaterThanOrEqual(2);
  });
});

// ── the last ten notifications ──────────────────────────────────────────────
describe("the notification list", () => {
  /*
    NO `title` ON THE FIXTURE, because there is no title on the row.

    `notification_log` has `event_type` and `message` and nothing else; the title is a
    TRANSLATION of the type (`notificationTitle`), so every notification of one type now shares
    one title. These two tests used to count distinct titles, which only worked because the old
    mapper invented one per row out of the routing key. They count the distinct BODY instead —
    the per-row text — and what they are actually about (ten and no more; flat rather than a dead
    link) is unchanged.
  */
  const make = (i: number, type = "sale") => ({
    id: `n${i}`,
    type,
    message: `Body ${i}`,
    read: i % 2 === 0,
    created_at: new Date().toISOString(),
    metadata: { order_id: "o-1" },
  });

  it("shows ten and no more, however many the hook returns", () => {
    // A phone list longer than a screen is a list nobody reaches the bottom of.
    notifications = Array.from({ length: 25 }, (_, i) => make(i));
    renderHome();
    expect(screen.getAllByText(/^Body \d+$/)).toHaveLength(10);
  });

  it("links each one through the same resolver the bell uses", () => {
    notifications = [make(1, "sale")];
    const { container } = renderHome();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    // notificationLink(type, metadata, isStaff=true) — isStaff, because this is /admin. Getting
    // that argument wrong would send an admin to the member portal.
    expect(hrefs.some((h) => h?.startsWith("/admin/orders"))).toBe(true);
  });

  it("renders an unlinkable notification flat rather than as a dead link", () => {
    /*
      `notificationLink` returns null when it cannot resolve a destination. Wrapping that in a
      <Link to={null}> is the literal "tapping it does nothing" complaint, so those render as
      plain rows.
    */
    notifications = [{ ...make(2, "totally_unknown_type"), metadata: null }];
    const { container } = renderHome();
    const anchorTexts = [...container.querySelectorAll("a")].map((a) => a.textContent ?? "");
    expect(anchorTexts.some((t) => t.includes("Body 2"))).toBe(false);
    expect(screen.getByText("Body 2")).toBeTruthy();
    // And the unknown type is humanised rather than printed as a key.
    expect(screen.getByText("Totally unknown type")).toBeTruthy();
  });

  it("marks the unread ones", () => {
    notifications = [make(1), make(2)];
    renderHome();
    // make(1) is unread (odd), make(2) is read.
    expect(screen.getAllByText("new")).toHaveLength(1);
  });

  it("says so when there is nothing, rather than rendering an empty box", () => {
    notifications = [];
    renderHome();
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
  });
});

// ── the caller's half of the contract ───────────────────────────────────────
describe("the dashboard hands over data it already has", () => {
  const dashboard = read("src/pages/admin/AdminDashboard.tsx");

  it("branches on the shared 768px hook, not on a hand-rolled media query", () => {
    // The same breakpoint Tailwind's `md:` uses, so the phone home and the responsive classes
    // elsewhere cannot disagree about what "a phone" is.
    expect(dashboard).toContain('from "@/hooks/use-mobile"');
    expect(dashboard).toMatch(/const isMobile = useIsMobile\(\)/);
    expect(dashboard).toMatch(/if \(isMobile\) \{[\s\S]{0,400}?<AdminMobileHome/);
    expect(read("src/hooks/use-mobile.tsx")).toContain("MOBILE_BREAKPOINT = 768");
  });

  it("passes stats and alerts down instead of re-querying them", () => {
    /*
      "Same data hooks as desktop; no new queries." Handing the already-fetched results to the
      phone home is what makes that true: the two layouts cannot show different numbers, and
      rotating the device costs no round trip.
    */
    expect(dashboard).toMatch(/stats=\{stats\}/);
    expect(dashboard).toMatch(/alerts=\{\(alertsData \?\? \[\]\)/);
    expect(dashboard).toMatch(/statsError=\{!!statsError\}/);

    const home = read("src/components/admin/dashboard/AdminMobileHome.tsx");
    // It reads no table of its own: every query it makes is through a hook the desktop uses too.
    expect(home).not.toMatch(/supabase\s*\.\s*from\(/);
    expect(home).not.toMatch(/supabase\.rpc\(/);
  });

  it("shares the readiness hook with the desktop tile, so the two cannot diverge", () => {
    // The number that says money has been taken and nobody is watching now appears on both
    // surfaces — from ONE hook, because two derivations of readiness would eventually disagree.
    expect(dashboard).toContain("useMonitoringReadiness");
    expect(read("src/components/admin/dashboard/AdminMobileHome.tsx")).toContain("useMonitoringReadiness");
    const hook = read("src/hooks/useMonitoringReadiness.ts");
    expect(hook).toContain("member_monitoring_readiness");
    // A failed read throws rather than returning 0 — the caller renders the failure.
    expect(hook).toMatch(/if \(error\) throw error;/);
    expect(hook).toContain('.not("paid_since", "is", null)');
  });
});
