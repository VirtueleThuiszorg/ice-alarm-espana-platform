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
  gateCeilingFor,
  isPublicSurface,
  knownNPlusOne,
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

describe("the JS budget is now one number for every surface", () => {
  /*
    WITHDRAWN, 12 Sep 2026 (Lee). Public routes were held to 150 KB gz on the
    argument that a marketing page is a cold first visit on a phone. The argument
    is right about the user and wrong about the number: react + react-dom +
    react-router + supabase-js + i18next are over it before any product code is
    added, so the row could never go green however much was cut. A check with no
    passing state stops being information — a reader learns to skip the column,
    and a real regression hides in a row that was already red.

    `isPublicSurface` stays: it is how the report groups routes, and the surfaces
    it names are still the ones a stranger lands on first.
  */
  it("still knows which surfaces a cold first-time visitor lands on", () => {
    expect(isPublicSurface("public")).toBe(true);
    expect(isPublicSurface("join")).toBe(true);
    expect(isPublicSurface("auth")).toBe(true);
    expect(isPublicSurface("admin")).toBe(false);
    expect(isPublicSurface("call-centre")).toBe(false);
  });

  it("measures a public route against the same 250 KB as every other route", () => {
    expect(thresholdFor(route("public.home"), "routeJsGzBytes")).toBe(250 * 1024);
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

  it("scores a public route on the same JS budget as an admin one", () => {
    // 200 KB passes everywhere now; it used to fail on public only. The pair is
    // kept rather than deleted so the change of rule is visible in the suite.
    const under = { ...perfect(), routeJsGzBytes: 200 * 1024 };
    expect(scoreRoute(route("admin.members"), under).score).toBe(10);
    expect(scoreRoute(route("public.home"), under).score).toBe(10);

    const over = { ...perfect(), routeJsGzBytes: 300 * 1024 };
    expect(scoreRoute(route("admin.members"), over).score).toBe(9);
    expect(scoreRoute(route("public.home"), over).score).toBe(9);
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

describe("the ratchet — what the CI gate actually enforces", () => {
  /*
    A RATCHET IS ONLY HONEST IF IT CAN ONLY TIGHTEN.

    The gate enforces `ratchet` rather than `thresholds`, because a gate set to
    the finished numbers is red on the day it lands and gets deleted within a
    week. That trade is only safe while the ratchet cannot be used to excuse a
    regression, so the invariants that make it a ratchet rather than a waiver are
    asserted here.
  */
  const budgets = loadBudgets();

  it("every entry names a route that exists", () => {
    for (const id of Object.keys(budgets.ratchet)) {
      expect(ROUTES.some((r) => r.id === id), `ratchet.${id} names no route`).toBe(true);
    }
  });

  it("never claims a route is ALLOWED to be better than the target", () => {
    // A ratchet tighter than the target is not tighter in practice — the gate
    // takes the looser of the two, so the entry would do nothing except read as
    // if the route were held to something it is not. Record only breaches.
    for (const [id, entry] of Object.entries(budgets.ratchet)) {
      const route = ROUTES.find((r) => r.id === id)!;
      for (const [key, value] of Object.entries(entry)) {
        if (key === "nPlusOneTables" || typeof value !== "number") continue;
        expect(
          value,
          `ratchet.${id}.${key} is tighter than the target — delete it instead`,
        ).toBeGreaterThan(thresholdFor(route, key as keyof typeof budgets.thresholds, budgets));
      }
    }
  });

  it("only covers metrics the scorecard actually knows about", () => {
    const known = new Set([...Object.keys(budgets.thresholds), "nPlusOneTables"]);
    for (const [id, entry] of Object.entries(budgets.ratchet)) {
      for (const key of Object.keys(entry)) {
        expect(known.has(key), `ratchet.${id}.${key} is not a budget`).toBe(true);
      }
    }
  });

  it("gateCeilingFor takes the ratchet where there is one, and the target otherwise", () => {
    const home = ROUTES.find((r) => r.id === "public.home")!;
    const ratcheted = budgets.ratchet["public.home"]?.lcpMobileColdMs;
    if (typeof ratcheted === "number") {
      expect(gateCeilingFor(home, "lcpMobileColdMs", budgets)).toBe(ratcheted);
    }
    // A metric with no entry falls through to the finished number, which is what
    // makes deleting an entry the way a route graduates.
    expect(gateCeilingFor(home, "transitionWarmMs", budgets)).toBe(
      budgets.thresholds.transitionWarmMs,
    );
  });

  it("a route with no ratchet entry at all is held to every target", () => {
    /*
      Asserted against an EMPTY ratchet rather than against whichever route
      happens to lack an entry today. The first version searched the real file
      for an unratcheted route and went red the moment every route acquired a JS
      entry — a test about the function failing because of the data, which is the
      wrong thing to be sensitive to. The property is: no entry, target applies.
    */
    const empty = { ...budgets, ratchet: {} };
    for (const route of ROUTES.slice(0, 3)) {
      expect(gateCeilingFor(route, "dbQueriesPerLoad", empty)).toBe(
        empty.thresholds.dbQueriesPerLoad,
      );
      expect(gateCeilingFor(route, "lcpMobileColdMs", empty)).toBe(
        empty.thresholds.lcpMobileColdMs,
      );
    }
  });

  it("knownNPlusOne lists only what is already there, so a NEW one still fails", () => {
    for (const [id, entry] of Object.entries(budgets.ratchet)) {
      const route = ROUTES.find((r) => r.id === id)!;
      expect(knownNPlusOne(route, budgets)).toEqual(entry.nPlusOneTables ?? []);
    }
    // And an unlisted route tolerates nothing at all.
    expect(knownNPlusOne(ROUTES[0], { ...budgets, ratchet: {} })).toEqual([]);
  });

  it("the scorecard still scores against the TARGETS, not the ratchet", () => {
    /*
      The most important assertion in this block. The gate is allowed to be
      lenient; the report is not. If `scoreRoute` ever read the ratchet, every
      route would score 10/10 the moment its current numbers were recorded, and
      the scorecard would say the work was finished on the day it started.
    */
    const route = ROUTES.find((r) => r.id === "public.home")!;
    const overBudgetButUnderRatchet: RouteMeasurement = {
      ...perfect(),
      mobile: { ...perfect().mobile, lcpMs: 4000 },
    };
    const score = scoreRoute(route, overBudgetButUnderRatchet, budgets);
    expect(score.checks.find((c) => c.name === "LCP mobile cold")!.passed).toBe(false);
  });
});
