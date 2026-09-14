import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "../helpers/stripComments";
import { ROUTE_MODULES, ROUTE_MODULE_COUNT } from "@/lib/routeModules.generated";
import { ROUTE_DATA } from "@/lib/routeData";
import { STALE_TIMES } from "@/config/constants";

/**
 * PREFETCH ON HOVER — and the two ways it silently does nothing.
 *
 * Every page here is lazy, so a click on a sidebar link starts a round trip for
 * the route's JavaScript, and only when that lands can the page mount and begin
 * its queries. Two serial waits, watched through a `<PageLoader />`. A pointer
 * reaches a link a few hundred milliseconds before the click, which is enough to
 * have both in hand.
 *
 * It fails quietly in two ways, and both are asserted here:
 *
 *   1. THE WRONG SPECIFIER. `import("@/pages/admin/MembersPage")` and
 *      `import("./pages/admin/MembersPage")` are the same module only because
 *      Vite resolves both to /src/pages/admin/MembersPage. Hand-writing the map
 *      beside App.tsx's 113 importers would drift the first time somebody moved
 *      a page, and the prefetch would warm a chunk nobody asks for — a request
 *      spent, nothing saved, and nothing on screen to show for it. So the map is
 *      GENERATED from App.tsx and `--check` runs here.
 *
 *   2. THE WRONG KEY. React Query keys on the whole `queryKey`. A prefetch that
 *      restates a key the page builds from its filter state warms an entry the
 *      page never reads. So ROUTE_DATA may only use query options imported from
 *      the hook that owns them.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("the generated route map", () => {
  it("is current with App.tsx", () => {
    expect(() =>
      execFileSync("node", ["scripts/routes/build-prefetch-map.mjs", "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).not.toThrow();
  });

  it("covers a real number of routes — a parse break would leave it near-empty", () => {
    expect(ROUTE_MODULE_COUNT).toBeGreaterThan(90);
    expect(Object.keys(ROUTE_MODULES)).toHaveLength(ROUTE_MODULE_COUNT);
  });

  it("covers EVERY path the staff sidebars link to", () => {
    /*
      The assertion that proves this is systematic rather than sampled.

      The first version of the generator matched only `path="/..."` and found 80
      routes — missing every NESTED one, which is to say every admin and
      call-centre page, which is to say almost everything a staff sidebar links
      to. Nothing failed; the links simply were not prefetched, and no number on
      any dashboard would have shown it.
    */
    const navPaths = [
      "src/components/layout/AdminSidebar.tsx",
      "src/components/layout/CallCentreSidebar.tsx",
    ].flatMap((file) =>
      [...read(file).matchAll(/path: "(\/[^"]*)"/g)].map((m) => m[1]),
    );

    expect(navPaths.length).toBeGreaterThan(40);
    const missing = navPaths.filter((p) => !(p in ROUTE_MODULES));
    expect(missing, "these sidebar links would click into an unwarmed chunk").toEqual([]);
  });

  it("holds no parameterised or wildcard path", () => {
    // A nav link points at a concrete path. A pattern cannot be prefetched, and
    // an entry for one would never be hit.
    for (const routePath of Object.keys(ROUTE_MODULES)) {
      expect(routePath).not.toContain(":");
      expect(routePath).not.toContain("*");
    }
  });

  it("resolves every specifier through the alias, not App.tsx's relative form", () => {
    const generated = read("src/lib/routeModules.generated.ts");
    expect(generated).not.toMatch(/import\("\.\/pages\//);
    expect(generated).toMatch(/import\("@\/pages\//);
  });
});

describe("the data half only prefetches keys it does not own", () => {
  const ROUTE_DATA_SRC = stripComments(read("src/lib/routeData.ts"));

  it("points at routes that actually exist", () => {
    for (const routePath of Object.keys(ROUTE_DATA)) {
      expect(ROUTE_MODULES, `ROUTE_DATA has ${routePath}, which is not a route`).toHaveProperty(
        routePath,
      );
    }
  });

  it("never writes a queryKey of its own", () => {
    /*
      The whole point. A literal `queryKey:` here would be a second copy of a key
      the page already builds, and the first time the page's version changed the
      prefetch would warm an entry nobody reads — invisible, because a prefetch
      that misses looks exactly like one that was never needed.
    */
    expect(ROUTE_DATA_SRC).not.toMatch(/queryKey\s*:/);
  });

  it("uses the repo's existing stale tiers rather than its own numbers", () => {
    // src/config/constants.ts owns STALE_TIMES and 26 files already use it. A
    // prefetch on a different number would warm an entry the page then treats as
    // stale and immediately refetches.
    expect(ROUTE_DATA_SRC).toContain("STALE_TIMES");
    expect(ROUTE_DATA_SRC).not.toMatch(/staleTime:\s*\d/);
  });
});

describe("the stale tiers", () => {
  it("keep the alert path out of the cache entirely", () => {
    expect(STALE_TIMES.LIVE).toBe(0);
  });

  it("are the three the brief asks for, on the module this repo already had", () => {
    expect(STALE_TIMES.VERY_LONG).toBe(1000 * 60 * 30); // reference data
    expect(STALE_TIMES.MEDIUM).toBe(1000 * 60 * 2); // lists
    expect(STALE_TIMES.LIVE).toBe(0); // live alert data
  });

  it("are applied to every operational read of an alert", () => {
    /*
      These are the queries an operator DECIDES from. `reports-alerts` is
      deliberately absent: it is a historical report and a two-minute cache is
      fine for it. Listing the files means moving one of these onto a cached tier
      has to be done deliberately, in a diff that says so.
    */
    const operational = [
      "src/pages/admin/AlertsPage.tsx",
      "src/pages/admin/AdminDashboard.tsx",
      "src/pages/admin/EV07BPage.tsx",
      "src/components/admin/products/DeviceAlertsPanel.tsx",
      "src/components/call-centre/DeviceOfflineAlertsCard.tsx",
      "src/hooks/useMemberProfile.ts",
      "src/hooks/usePartnerAlertNotifications.ts",
    ];
    for (const file of operational) {
      expect(stripComments(read(file)), `${file} no longer reads alerts live`).toContain(
        "STALE_TIMES.LIVE",
      );
    }
  });
});

describe("the nav surfaces are wired", () => {
  // Every surface a person navigates from. Missing one makes the feature
  // "systematic" in name only — which is what the brief asked it not to be.
  const NAVS = [
    "src/components/layout/AdminSidebar.tsx",
    "src/components/layout/CallCentreSidebar.tsx",
    "src/components/layout/PublicHeader.tsx",
    "src/components/layout/PublicMobileNav.tsx",
  ];

  it.each(NAVS)("%s calls usePrefetchRoute and spreads it onto its links", (file) => {
    const src = stripComments(read(file));
    expect(src).toContain("usePrefetchRoute()");
    expect(src).toMatch(/\{\.\.\.prefetch\(/);
  });
});

describe("the hook itself", () => {
  const HOOK = stripComments(read("src/hooks/usePrefetchRoute.ts"));

  it("listens on hover, focus AND touchstart", () => {
    // focus is what makes this work for a keyboard; touchstart is the only
    // warning a phone gives. Dropping either makes it a pointer-only feature.
    expect(HOOK).toContain("onMouseEnter");
    expect(HOOK).toContain("onFocus");
    expect(HOOK).toContain("onTouchStart");
  });

  it("warms each path once, not once per mouse event", () => {
    expect(HOOK).toContain("seen");
  });

  it("swallows a failed chunk fetch — a hover must never throw", () => {
    expect(HOOK).toMatch(/\.catch\(\(\) => \{\}\)/);
  });
});
