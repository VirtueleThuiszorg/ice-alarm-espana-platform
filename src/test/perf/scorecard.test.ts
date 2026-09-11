import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ROUTES,
  CHECKS,
  LIGHTHOUSE_ROUTES,
  loadBudgets,
  scoreRoute,
  thresholdFor,
  allRoutesPerfect,
  isPublicSurface,
  type RouteMeasurement,
  type RouteSpec,
} from "./scorecard";
import { getDeclaredRoutes } from "../../../e2e/helpers/routes";

/**
 * THE SCORER IS ITSELF UNDER TEST.
 *
 * A performance gate is only worth the arithmetic behind it, and the arithmetic is
 * the easiest thing in the system to get quietly wrong — an off-by-one on a `<=`,
 * a missing route, a budget read from the wrong key. Every one of those failures
 * looks like GOOD news (a green gate, a high score), which is exactly the kind of
 * bug nobody goes looking for.
 *
 * So: the scoring is proved against handmade measurements, and the route catalogue
 * is proved against `src/App.tsx` itself.
 */

/** A measurement that passes every check, as the baseline for one-at-a-time failures. */
function perfect(): RouteMeasurement {
  const profile = {
    lcpMs: 1200,
    transitionWarmMs: 120,
    transitionColdMs: 600,
    cls: 0.01,
    longTasksMs: [60],
    requestCount: 20,
    totalBytes: 300_000,
  };
  return {
    routeId: "admin.members",
    mobile: { ...profile },
    desktop: { ...profile },
    routeJsGzBytes: 100_000,
    dbQueries: 3,
    dbQueryP95Ms: 40,
    nPlusOneTables: [],
  };
}

const route = (id: string): RouteSpec => {
  const found = ROUTES.find((r) => r.id === id);
  if (!found) throw new Error(`no route ${id}`);
  return found;
};

describe("budgets file", () => {
  it("is the only place the thresholds are written down", () => {
    const budgets = loadBudgets();
    for (const key of [
      "lcpMobileColdMs",
      "lcpDesktopColdMs",
      "transitionWarmMs",
      "transitionColdMs",
      "routeJsGzBytes",
      "publicRouteJsGzBytes",
      "dbQueriesPerLoad",
      "dbQueryP95Ms",
      "clsBelow",
      "longTaskMs",
    ] as const) {
      expect(typeof budgets.thresholds[key], `thresholds.${key}`).toBe("number");
    }
  });

  it("carries the numbers the brief set, so a silent loosening shows in a diff", () => {
    const t = loadBudgets().thresholds;
    expect(t.lcpMobileColdMs).toBe(2500);
    expect(t.transitionWarmMs).toBe(300);
    expect(t.transitionColdMs).toBe(1000);
    expect(t.routeJsGzBytes).toBe(250 * 1024);
    expect(t.publicRouteJsGzBytes).toBe(150 * 1024);
    expect(t.dbQueriesPerLoad).toBe(6);
    expect(t.dbQueryP95Ms).toBe(100);
    expect(t.clsBelow).toBe(0.1);
    expect(t.longTaskMs).toBe(100);
  });

  it("defines both device profiles with a CPU slowdown on mobile", () => {
    const { mobile, desktop } = loadBudgets().profiles;
    expect(mobile.cpuThrottlingRate).toBe(4);
    expect(desktop.cpuThrottlingRate).toBe(1);
    expect(mobile.isMobile).toBe(true);
  });

  it("makes every override carry a reason, so an exception can never look like a pass", () => {
    for (const [id, override] of Object.entries(loadBudgets().overrides)) {
      expect(typeof override.reason, `overrides.${id}.reason`).toBe("string");
      expect(override.reason.length, `overrides.${id}.reason`).toBeGreaterThan(10);
      expect(ROUTES.some((r) => r.id === id), `overrides.${id} names no route`).toBe(true);
    }
  });
});

describe("the route catalogue", () => {
  it("names only routes src/App.tsx actually declares", () => {
    const declared = new Set(getDeclaredRoutes());
    for (const r of ROUTES) {
      expect(declared.has(r.url), `${r.id} -> ${r.url} is not a declared route`).toBe(true);
    }
  });

  it("points every route at a page module that exists on disk", () => {
    const src = path.resolve(__dirname, "../..");
    for (const r of ROUTES) {
      if (!r.module) continue;
      expect(fs.existsSync(path.join(src, r.module)), `${r.id} -> src/${r.module}`).toBe(true);
    }
  });

  it("has unique ids and covers every surface a human navigates", () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    const surfaces = new Set(ROUTES.map((r) => r.surface));
    for (const surface of ["public", "join", "auth", "member", "call-centre", "admin", "partner"]) {
      expect(surfaces.has(surface as never), `no route on the ${surface} surface`).toBe(true);
    }
  });

  it("gives Lighthouse six real routes, one per surface it can reach", () => {
    expect(LIGHTHOUSE_ROUTES.length).toBe(6);
    for (const id of LIGHTHOUSE_ROUTES) {
      expect(ROUTES.some((r) => r.id === id), `${id} is not in the catalogue`).toBe(true);
    }
  });
});

describe("the tighter public JS budget", () => {
  it("applies to the surfaces a cold first-time visitor lands on", () => {
    expect(isPublicSurface("public")).toBe(true);
    expect(isPublicSurface("join")).toBe(true);
    expect(isPublicSurface("auth")).toBe(true);
    expect(isPublicSurface("admin")).toBe(false);
    expect(isPublicSurface("call-centre")).toBe(false);
  });

  it("is the number a public route is actually measured against", () => {
    expect(thresholdFor(route("public.home"), "routeJsGzBytes")).toBe(150 * 1024);
    expect(thresholdFor(route("admin.members"), "routeJsGzBytes")).toBe(250 * 1024);
  });
});

describe("scoreRoute", () => {
  it("awards 10/10 only when every check passes", () => {
    const score = scoreRoute(route("admin.members"), perfect());
    expect(score.score).toBe(10);
    expect(score.checks).toHaveLength(CHECKS.length);
    expect(score.checks.every((c) => c.passed)).toBe(true);
  });

  it("passes AT the budget and fails one unit above it", () => {
    const at = { ...perfect(), mobile: { ...perfect().mobile, lcpMs: 2500 } };
    const over = { ...perfect(), mobile: { ...perfect().mobile, lcpMs: 2501 } };
    expect(scoreRoute(route("admin.members"), at).score).toBe(10);
    expect(scoreRoute(route("admin.members"), over).score).toBe(9);
  });

  it("treats CLS as a STRICT bound — 0.1 is not 'good'", () => {
    const exactly = { ...perfect(), mobile: { ...perfect().mobile, cls: 0.1 } };
    expect(scoreRoute(route("admin.members"), exactly).score).toBe(9);
    const under = { ...perfect(), mobile: { ...perfect().mobile, cls: 0.099 } };
    expect(scoreRoute(route("admin.members"), under).score).toBe(10);
  });

  it("FAILS an unmeasured query p95 rather than scoring it as zero", () => {
    const unmeasured = { ...perfect(), dbQueryP95Ms: null };
    const score = scoreRoute(route("admin.members"), unmeasured);
    expect(score.score).toBe(9);
    const check = score.checks.find((c) => c.name === "DB query p95")!;
    expect(check.passed).toBe(false);
    expect(check.actual).toBe("unmeasured");
  });

  it("FAILS an unmeasurable transition rather than reading null as instant", () => {
    // The trap this pins: JSON cannot carry Infinity, so a sentinel arrives as
    // null — and `null <= 300` is TRUE in JavaScript. A route with no clickable
    // link would have scored the fastest possible transition.
    const noLink = { ...perfect(), mobile: { ...perfect().mobile, transitionColdMs: null } };
    const score = scoreRoute(route("admin.members"), noLink);
    expect(score.score).toBe(9);
    const check = score.checks.find((c) => c.name === "Transition cold")!;
    expect(check.passed).toBe(false);
    expect(check.actual).toBe("no link");

    const noWarm = { ...perfect(), mobile: { ...perfect().mobile, transitionWarmMs: null } };
    expect(scoreRoute(route("admin.members"), noWarm).score).toBe(9);
  });

  it("scores the longest long task, not the first one observed", () => {
    const m = { ...perfect(), mobile: { ...perfect().mobile, longTasksMs: [60, 250, 70] } };
    const check = scoreRoute(route("admin.members"), m).checks.find(
      (c) => c.name === "Longest long task",
    )!;
    expect(check.passed).toBe(false);
    expect(check.actual).toBe("250 ms");
  });

  it("names the tables that made it call N+1", () => {
    const m = { ...perfect(), nPlusOneTables: ["subscriptions", "devices"] };
    const check = scoreRoute(route("admin.members"), m).checks.find((c) => c.name === "No N+1")!;
    expect(check.passed).toBe(false);
    expect(check.actual).toBe("subscriptions, devices");
  });

  it("measures a public route against the public JS budget, not the generous one", () => {
    const m = { ...perfect(), routeJsGzBytes: 200 * 1024 };
    expect(scoreRoute(route("admin.members"), m).score).toBe(10);
    expect(scoreRoute(route("public.home"), m).score).toBe(9);
  });

  it("can drop every point at once, so a broken page cannot look mediocre", () => {
    const awful: RouteMeasurement = {
      routeId: "public.home",
      mobile: {
        lcpMs: 9000,
        transitionWarmMs: 2000,
        transitionColdMs: 5000,
        cls: 0.9,
        longTasksMs: [900],
        requestCount: 200,
        totalBytes: 9_000_000,
      },
      desktop: {
        lcpMs: 9000,
        transitionWarmMs: 2000,
        transitionColdMs: 5000,
        cls: 0.9,
        longTasksMs: [900],
        requestCount: 200,
        totalBytes: 9_000_000,
      },
      routeJsGzBytes: 900_000,
      dbQueries: 40,
      dbQueryP95Ms: 900,
      nPlusOneTables: ["members"],
    };
    expect(scoreRoute(route("public.home"), awful).score).toBe(0);
  });
});

describe("allRoutesPerfect — the stop condition", () => {
  it("is false while any route is below 10", () => {
    const ten = scoreRoute(route("admin.members"), perfect());
    const nine = scoreRoute(route("admin.members"), { ...perfect(), dbQueries: 99 });
    expect(allRoutesPerfect([ten, ten])).toBe(true);
    expect(allRoutesPerfect([ten, nine])).toBe(false);
  });

  it("is false for an empty run, so 'measured nothing' never reads as success", () => {
    expect(allRoutesPerfect([])).toBe(false);
  });
});
