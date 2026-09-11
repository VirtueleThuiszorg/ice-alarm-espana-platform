import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE SCORECARD. What "fast enough" means for this platform, as arithmetic.
 *
 * ── WHY A SCORECARD AND NOT A JUDGEMENT ─────────────────────────────────────
 *
 * "The admin members page feels slow" is not a finding anybody can close. It has no
 * before, no after, and no way to tell a fix from a placebo. Every number in here is
 * measured on the PRODUCTION build in a real Chromium, against budgets that live in
 * one file (`perf/budgets.json`) that the CI gate reads too — so a route cannot pass
 * the gate and fail the report, and a budget cannot be widened inside the check that
 * enforces it.
 *
 * A route scores out of 10. The ten checks are exactly the ten conditions in the
 * brief, one point each, and `scoreRoute` is the only thing that decides. Nothing
 * here rounds up, and there is no partial credit: a check passes or it does not.
 *
 * ── WHAT IS REAL IN A MEASUREMENT, AND WHAT IS NOT ──────────────────────────
 *
 * REAL: the production bundle, a real Chromium with CDP CPU + network throttling,
 * real React Router, the real supabase-js client building its own requests, real
 * layout and paint. LCP, CLS, long tasks and transition timings are the browser's
 * own numbers, read from PerformanceObserver.
 *
 * MODELLED: the backend. Supabase is answered by `e2e/helpers/supabaseStub.ts`, so
 * `dbQueries` is an exact count of the requests the page actually issued — which is
 * the number this audit is trying to drive down — but `dbQueryP95Ms` is NOT a
 * measurement of Postgres. It is filled from the EXPLAIN ANALYZE evidence in
 * `docs/perf/` and defaults to `null`, which scores as UNPROVEN rather than as a
 * pass. A stub can never award that point; see {@link scoreRoute}.
 *
 * That distinction is the whole reason `dbQueryP95Ms` is nullable. A harness that
 * silently scored an unmeasured value as 0ms would report 10/10 for a page whose
 * query plan nobody had ever looked at.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
export const BUDGETS_PATH = path.join(REPO_ROOT, "perf/budgets.json");

/* ── budgets ─────────────────────────────────────────────────────────────── */

export interface Thresholds {
  lcpMobileColdMs: number;
  lcpDesktopColdMs: number;
  transitionWarmMs: number;
  transitionColdMs: number;
  routeJsGzBytes: number;
  publicRouteJsGzBytes: number;
  dbQueriesPerLoad: number;
  dbQueryP95Ms: number;
  clsBelow: number;
  longTaskMs: number;
}

export interface DeviceProfile {
  label: string;
  cpuThrottlingRate: number;
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
}

/**
 * What a route is allowed to be TODAY, on the way to what `thresholds` says it
 * must become. `nPlusOneTables` is the set of tables a route is currently known to
 * read once per row — listed so the gate catches a NEW one rather than shrugging
 * at all of them.
 */
export type RatchetEntry = Partial<Thresholds> & { nPlusOneTables?: string[] };

export interface Budgets {
  thresholds: Thresholds;
  profiles: Record<"mobile" | "desktop", DeviceProfile>;
  /** Per-route loosenings. Every entry carries a `reason`, printed beside the route. */
  overrides: Record<string, { reason: string } & Partial<Thresholds>>;
  /** The CI gate's ceiling per route. Tightened only; see budgets.json. */
  ratchet: Record<string, RatchetEntry>;
}

let cached: Budgets | null = null;

/** Read `perf/budgets.json`. Cached — it is read by 30 routes x 2 profiles. */
export function loadBudgets(): Budgets {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(BUDGETS_PATH, "utf8")) as Record<string, unknown>;
  // `_comment` keys are documentation and must not be mistaken for a route id.
  const withoutComments = (value: unknown) =>
    Object.fromEntries(
      Object.entries((value ?? {}) as Record<string, unknown>).filter(
        ([key]) => !key.startsWith("_"),
      ),
    );

  cached = {
    thresholds: raw.thresholds as Thresholds,
    profiles: raw.profiles as Budgets["profiles"],
    overrides: withoutComments(raw.overrides) as Budgets["overrides"],
    ratchet: withoutComments(raw.ratchet) as Budgets["ratchet"],
  };
  return cached;
}

/** The budget in force for one route: the global threshold, or its named override. */
export function thresholdFor<K extends keyof Thresholds>(
  route: RouteSpec,
  key: K,
  budgets: Budgets = loadBudgets(),
): number {
  const override = budgets.overrides[route.id]?.[key];
  if (typeof override === "number") return override;
  // The JS budget is the one threshold that differs by surface rather than by route:
  // a marketing page is a cold first visit on a phone and gets the tighter number.
  if (key === "routeJsGzBytes" && isPublicSurface(route.surface)) {
    return budgets.thresholds.publicRouteJsGzBytes;
  }
  return budgets.thresholds[key];
}

/* ── the routes under audit ──────────────────────────────────────────────── */

export type Surface = "public" | "join" | "auth" | "member" | "call-centre" | "admin" | "partner";

/** Surfaces a cold, uncached, first-time visitor lands on. They get the tight JS budget. */
export function isPublicSurface(surface: Surface): boolean {
  return surface === "public" || surface === "join" || surface === "auth";
}

export interface RouteSpec {
  /** Stable id used as the key in budgets.json overrides and in the report tables. */
  id: string;
  /** The URL the harness navigates to. Params are already substituted. */
  url: string;
  surface: Surface;
  /**
   * Which stubbed identity must be signed in for the page to render. `null` is a
   * page that renders signed-out — the public marketing surface and the join flow.
   */
  persona: "member" | "staff" | "admin" | "partner" | null;
  /**
   * The lazy module backing this route, relative to `src/` — the key used to walk
   * the Vite manifest and total the JS the route ships. `null` for routes that
   * render no page chunk of their own (redirects).
   */
  module: string | null;
  /**
   * A selector that only exists once the route's real content has painted. The
   * transition timer stops when this appears, so "click -> content painted" means
   * content and not a skeleton. Kept deliberately coarse (a landmark, a heading)
   * so it survives copy changes.
   */
  ready: string;
}

/**
 * The ~30 primary routes. Chosen as the ones a real session actually moves between:
 * every marketing page, the join wizard, every member portal tab, the call centre's
 * working screens, and the admin pages with the heaviest data.
 *
 * Detail routes that need a real record id (`/admin/members/:id`) are represented by
 * their list page; a list is what a click starts from, and the detail page is
 * measured separately in the N+1 work where its query shape is the point.
 */
export const ROUTES: RouteSpec[] = [
  // ── public marketing ──────────────────────────────────────────────────────
  { id: "public.home", url: "/", surface: "public", persona: null, module: "pages/Index.tsx", ready: "main, h1" },
  { id: "public.how-it-works", url: "/how-it-works", surface: "public", persona: null, module: "pages/HowItWorksPage.tsx", ready: "main, h1" },
  { id: "public.pricing", url: "/pricing", surface: "public", persona: null, module: "pages/PricingPage.tsx", ready: "main, h1" },
  { id: "public.pendant", url: "/pendant", surface: "public", persona: null, module: "pages/PendantPage.tsx", ready: "main, h1" },
  { id: "public.contact", url: "/contact", surface: "public", persona: null, module: "pages/ContactPage.tsx", ready: "main, h1" },
  { id: "public.help", url: "/help", surface: "public", persona: null, module: "pages/KnowledgeBasePage.tsx", ready: "main, h1" },
  { id: "public.blog", url: "/blog", surface: "public", persona: null, module: "pages/blog/BlogListPage.tsx", ready: "main, h1" },
  { id: "public.terms", url: "/terms", surface: "public", persona: null, module: "pages/TermsPage.tsx", ready: "main, h1" },
  { id: "public.privacy", url: "/privacy", surface: "public", persona: null, module: "pages/PrivacyPage.tsx", ready: "main, h1" },

  // ── the money path ────────────────────────────────────────────────────────
  { id: "join.wizard", url: "/join", surface: "join", persona: null, module: "pages/join/JoinWizard.tsx", ready: "main, form, h1" },
  { id: "auth.login", url: "/login", surface: "auth", persona: null, module: "pages/auth/Login.tsx", ready: "form, main" },
  { id: "auth.staff-login", url: "/staff/login", surface: "auth", persona: null, module: "pages/auth/StaffLogin.tsx", ready: "form, main" },
  { id: "partner.join", url: "/partner/join", surface: "partner", persona: null, module: "pages/partner/PartnerJoin.tsx", ready: "main, form, h1" },

  // ── member portal ─────────────────────────────────────────────────────────
  { id: "member.dashboard", url: "/dashboard", surface: "member", persona: "member", module: "pages/client/ClientDashboard.tsx", ready: "main" },
  { id: "member.profile", url: "/dashboard/profile", surface: "member", persona: "member", module: "pages/client/ProfilePage.tsx", ready: "main" },
  { id: "member.medical", url: "/dashboard/medical", surface: "member", persona: "member", module: "pages/client/MedicalInfoPage.tsx", ready: "main" },
  { id: "member.contacts", url: "/dashboard/contacts", surface: "member", persona: "member", module: "pages/client/EmergencyContactsPage.tsx", ready: "main" },
  { id: "member.device", url: "/dashboard/device", surface: "member", persona: "member", module: "pages/client/DevicePage.tsx", ready: "main" },
  { id: "member.subscription", url: "/dashboard/subscription", surface: "member", persona: "member", module: "pages/client/SubscriptionPage.tsx", ready: "main" },
  { id: "member.support", url: "/dashboard/support", surface: "member", persona: "member", module: "pages/client/SupportPage.tsx", ready: "main" },
  { id: "member.messages", url: "/dashboard/messages", surface: "member", persona: "member", module: "pages/client/MessagesPage.tsx", ready: "main" },

  // ── call centre (the life-safety surface) ─────────────────────────────────
  { id: "cc.dashboard", url: "/call-centre", surface: "call-centre", persona: "staff", module: "pages/call-centre/StaffDashboard.tsx", ready: "main" },
  { id: "cc.alerts", url: "/call-centre/alerts", surface: "call-centre", persona: "staff", module: "pages/call-centre/CallCentreDashboard.tsx", ready: "main" },
  { id: "cc.members", url: "/call-centre/members", surface: "call-centre", persona: "staff", module: "pages/call-centre/MembersPage.tsx", ready: "main" },
  { id: "cc.messages", url: "/call-centre/messages", surface: "call-centre", persona: "staff", module: "pages/call-centre/MessagesPage.tsx", ready: "main" },
  { id: "cc.tasks", url: "/call-centre/tasks", surface: "call-centre", persona: "staff", module: "pages/call-centre/TasksPage.tsx", ready: "main" },
  { id: "cc.my-shifts", url: "/call-centre/my-shifts", surface: "call-centre", persona: "staff", module: "pages/call-centre/MyShiftsPage.tsx", ready: "main" },

  // ── admin ─────────────────────────────────────────────────────────────────
  { id: "admin.dashboard", url: "/admin", surface: "admin", persona: "admin", module: "pages/admin/AdminDashboard.tsx", ready: "main" },
  { id: "admin.members", url: "/admin/members", surface: "admin", persona: "admin", module: "pages/admin/MembersPage.tsx", ready: "main" },
  { id: "admin.alerts", url: "/admin/alerts", surface: "admin", persona: "admin", module: "pages/admin/AlertsPage.tsx", ready: "main" },
  { id: "admin.devices", url: "/admin/devices", surface: "admin", persona: "admin", module: "pages/admin/DevicesPage.tsx", ready: "main" },
  { id: "admin.finance", url: "/admin/finance", surface: "admin", persona: "admin", module: "pages/admin/FinanceDashboard.tsx", ready: "main" },
  { id: "admin.orders", url: "/admin/orders", surface: "admin", persona: "admin", module: "pages/admin/OrdersPage.tsx", ready: "main" },
  { id: "admin.staff", url: "/admin/staff", surface: "admin", persona: "admin", module: "pages/admin/StaffPage.tsx", ready: "main" },
  { id: "admin.settings", url: "/admin/settings", surface: "admin", persona: "admin", module: "pages/admin/SettingsPage.tsx", ready: "main" },
  { id: "admin.analytics", url: "/admin/analytics", surface: "admin", persona: "admin", module: "pages/admin/AnalyticsPage.tsx", ready: "main" },
];

/**
 * THE CEILING THE CI GATE ENFORCES for one route and one metric.
 *
 * The ratchet where a route has one, the target otherwise — and a route with no
 * entry is held to the finished number, which is how deleting an entry graduates
 * a route. `Math.max` rather than a bare lookup so a ratchet can never be set
 * TIGHTER than the target by accident and then quietly relax when it is removed.
 */
export function gateCeilingFor<K extends keyof Thresholds>(
  route: RouteSpec,
  key: K,
  budgets: Budgets = loadBudgets(),
): number {
  const target = thresholdFor(route, key, budgets);
  const ratchet = budgets.ratchet[route.id]?.[key];
  return typeof ratchet === "number" ? Math.max(target, ratchet) : target;
}

/** Tables a route is KNOWN to read once per row today. A new one fails the gate. */
export function knownNPlusOne(route: RouteSpec, budgets: Budgets = loadBudgets()): string[] {
  return budgets.ratchet[route.id]?.nPlusOneTables ?? [];
}

/** The six routes the CI budget gate measures — one per surface that has one. */
export const LIGHTHOUSE_ROUTES = [
  "public.home",
  "public.pricing",
  "join.wizard",
  "auth.login",
  "member.dashboard",
  "cc.alerts",
] as const;

/* ── a measurement ───────────────────────────────────────────────────────── */

/** What the browser reported for one route on one device profile. */
export interface ProfileMeasurement {
  /** Largest Contentful Paint on a cold, empty-cache load. */
  lcpMs: number;
  /**
   * Click -> route content painted, with the chunk and data already cached.
   *
   * `null` means the transition could not be measured — the harness found no
   * visible in-app link to the route from its hub. That is NOT a pass: a primary
   * route nobody can click to is a finding, and JSON has no `Infinity`, so a
   * sentinel would have arrived here as `null` and `null <= 300` is `true` in
   * JavaScript. Scored explicitly instead; see {@link scoreRoute}.
   */
  transitionWarmMs: number | null;
  /** Click -> route content painted, chunk fetched for the first time. `null` as above. */
  transitionColdMs: number | null;
  /** Cumulative Layout Shift over the cold load. */
  cls: number;
  /** Every long task over 50ms, in ms. The budget is on the longest. */
  longTasksMs: number[];
  /** Requests and bytes over the wire on the cold load (reported, not scored). */
  requestCount: number;
  totalBytes: number;
}

export interface RouteMeasurement {
  routeId: string;
  mobile: ProfileMeasurement;
  desktop: ProfileMeasurement;
  /** JS the route ships, gzipped, totalled from the Vite manifest. */
  routeJsGzBytes: number;
  /** Supabase REST/RPC/function requests the page issued on one load. */
  dbQueries: number;
  /**
   * p95 of those queries against the real database, from EXPLAIN ANALYZE evidence.
   * `null` means nobody has measured it — which scores as a FAIL, not a pass.
   */
  dbQueryP95Ms: number | null;
  /**
   * Tables this route queried more than once with a different filter each time —
   * the signature of a per-row fetch. Empty is the passing state.
   */
  nPlusOneTables: string[];
}

/* ── scoring ─────────────────────────────────────────────────────────────── */

export interface CheckResult {
  name: string;
  passed: boolean;
  /** What was measured, formatted for the table. */
  actual: string;
  /** What it had to be. */
  budget: string;
}

export interface RouteScore {
  routeId: string;
  /** 0-10. One point per check in {@link CHECKS}. */
  score: number;
  checks: CheckResult[];
  /** The reason text from budgets.json, if this route has an override in force. */
  overrideReason: string | null;
}

/** The ten checks, in report order. Ten checks, ten points, no partial credit. */
export const CHECKS = [
  "LCP mobile cold",
  "LCP desktop cold",
  "Transition warm",
  "Transition cold",
  "Route JS (gz)",
  "DB queries / load",
  "DB query p95",
  "No N+1",
  "CLS",
  "Longest long task",
] as const;

const ms = (n: number) => `${Math.round(n)} ms`;
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

/**
 * Score one route out of 10.
 *
 * Every comparison is `<=` against the budget except CLS, which is `<` (Core Web
 * Vitals defines 'good' as strictly under 0.1).
 *
 * `dbQueryP95Ms === null` FAILS. An unmeasured query plan is not a fast one, and
 * the harness that counts queries cannot see Postgres — so the only way to earn
 * that point is to put a real number in from EXPLAIN ANALYZE. This is deliberate:
 * the earlier version of this function treated a missing value as 0 and handed out
 * a 10 to pages nobody had ever profiled.
 */
export function scoreRoute(
  route: RouteSpec,
  m: RouteMeasurement,
  budgets: Budgets = loadBudgets(),
): RouteScore {
  const t = <K extends keyof Thresholds>(key: K) => thresholdFor(route, key, budgets);
  const longestMobile = m.mobile.longTasksMs.length ? Math.max(...m.mobile.longTasksMs) : 0;
  const jsBudget = t("routeJsGzBytes");

  const checks: CheckResult[] = [
    {
      name: "LCP mobile cold",
      passed: m.mobile.lcpMs <= t("lcpMobileColdMs"),
      actual: ms(m.mobile.lcpMs),
      budget: `<= ${ms(t("lcpMobileColdMs"))}`,
    },
    {
      name: "LCP desktop cold",
      passed: m.desktop.lcpMs <= t("lcpDesktopColdMs"),
      actual: ms(m.desktop.lcpMs),
      budget: `<= ${ms(t("lcpDesktopColdMs"))}`,
    },
    {
      name: "Transition warm",
      passed: m.mobile.transitionWarmMs !== null && m.mobile.transitionWarmMs <= t("transitionWarmMs"),
      actual: m.mobile.transitionWarmMs === null ? "no link" : ms(m.mobile.transitionWarmMs),
      budget: `<= ${ms(t("transitionWarmMs"))}`,
    },
    {
      name: "Transition cold",
      passed: m.mobile.transitionColdMs !== null && m.mobile.transitionColdMs <= t("transitionColdMs"),
      actual: m.mobile.transitionColdMs === null ? "no link" : ms(m.mobile.transitionColdMs),
      budget: `<= ${ms(t("transitionColdMs"))}`,
    },
    {
      name: "Route JS (gz)",
      passed: m.routeJsGzBytes <= jsBudget,
      actual: kb(m.routeJsGzBytes),
      budget: `<= ${kb(jsBudget)}`,
    },
    {
      name: "DB queries / load",
      passed: m.dbQueries <= t("dbQueriesPerLoad"),
      actual: String(m.dbQueries),
      budget: `<= ${t("dbQueriesPerLoad")}`,
    },
    {
      name: "DB query p95",
      // null is UNPROVEN, and unproven does not score. See the doc comment.
      passed: m.dbQueryP95Ms !== null && m.dbQueryP95Ms <= t("dbQueryP95Ms"),
      actual: m.dbQueryP95Ms === null ? "unmeasured" : ms(m.dbQueryP95Ms),
      budget: `<= ${ms(t("dbQueryP95Ms"))}`,
    },
    {
      name: "No N+1",
      passed: m.nPlusOneTables.length === 0,
      actual: m.nPlusOneTables.length ? m.nPlusOneTables.join(", ") : "none",
      budget: "none",
    },
    {
      name: "CLS",
      passed: m.mobile.cls < t("clsBelow"),
      actual: m.mobile.cls.toFixed(3),
      budget: `< ${t("clsBelow")}`,
    },
    {
      name: "Longest long task",
      passed: longestMobile <= t("longTaskMs"),
      actual: ms(longestMobile),
      budget: `<= ${ms(t("longTaskMs"))}`,
    },
  ];

  return {
    routeId: route.id,
    score: checks.filter((c) => c.passed).length,
    checks,
    overrideReason: budgets.overrides[route.id]?.reason ?? null,
  };
}

/** The stop condition for the whole audit: every route at 10, nothing below. */
export function allRoutesPerfect(scores: RouteScore[]): boolean {
  return scores.length > 0 && scores.every((s) => s.score === CHECKS.length);
}
