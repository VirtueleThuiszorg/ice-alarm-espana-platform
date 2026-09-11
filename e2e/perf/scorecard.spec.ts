import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSupabaseStub, type RecordedCall } from "../helpers/supabaseStub";
import { settle } from "../helpers/settle";
import { INSTALL_OBSERVERS, READ_VITALS, READ_SINCE_MARK } from "./observers";
import {
  restoreSessionStorage,
  scenarioFor,
  signInAndCaptureState,
  type CapturedSession,
  type PersonaName,
} from "./personas";
import {
  ROUTES,
  loadBudgets,
  type DeviceProfile,
  type ProfileMeasurement,
  type RouteMeasurement,
  type RouteSpec,
} from "../../src/test/perf/scorecard";

/**
 * THE MEASUREMENT RUN. Every route, both device profiles, on the production build.
 *
 * Not part of `npm run audit:pages` — it lives behind `playwright.perf.config.ts`
 * because a full pass is ~36 routes x 2 profiles x 3 loads and takes minutes, and
 * because it WRITES A REPORT rather than asserting. The assertions live in the CI
 * Performance job, which reads the same budgets file.
 *
 * Output: `docs/perf/measurements.json`, rendered into the scorecard tables by
 * `scripts/perf/report.mjs`.
 */

// Playwright loads specs as ES modules, where `__dirname` does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../docs/perf/measurements.json");
const budgets = loadBudgets();

/** Where a click to this route realistically starts from. */
function hubFor(route: RouteSpec): string {
  switch (route.surface) {
    case "member":
      return route.url === "/dashboard" ? "/dashboard/profile" : "/dashboard";
    case "call-centre":
      return route.url === "/call-centre" ? "/call-centre/members" : "/call-centre";
    case "admin":
      return route.url === "/admin" ? "/admin/members" : "/admin";
    default:
      return route.url === "/" ? "/pricing" : "/";
  }
}

function personaOf(route: RouteSpec): PersonaName {
  return route.persona ?? "anonymous";
}

/** Apply the profile's CPU and network shape through CDP. */
async function throttle(page: Page, profile: DeviceProfile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: (profile.downloadKbps * 1024) / 8,
    uploadThroughput: (profile.uploadKbps * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottlingRate });
  return cdp;
}

/**
 * Supabase calls that count as a query for the budget: PostgREST reads and RPCs,
 * plus edge functions the page BLOCKS on. Auth calls are excluded — a session
 * refresh is not a page query, and counting it would put every route one over
 * before it read a row.
 */
function countQueries(calls: RecordedCall[]): number {
  return calls.filter((c) => c.path.startsWith("/rest/v1/") || c.path.startsWith("/functions/v1/"))
    .length;
}

/**
 * A table read more than twice on one page load, with a DIFFERENT filter each time,
 * is a per-row fetch. Two reads of the same table is a legitimate pattern (a list
 * plus a count); three distinct filters is a loop over rows.
 */
function detectNPlusOne(calls: RecordedCall[]): string[] {
  const byTable = new Map<string, Set<string>>();
  for (const call of calls) {
    if (!call.path.startsWith("/rest/v1/")) continue;
    const [pathname, search = ""] = call.path.slice("/rest/v1/".length).split("?");
    if (pathname.startsWith("rpc/")) continue;
    if (!byTable.has(pathname)) byTable.set(pathname, new Set());
    byTable.get(pathname)!.add(search);
  }
  return [...byTable.entries()]
    .filter(([, filters]) => filters.size >= 3)
    .map(([table]) => table)
    .sort();
}

/**
 * Open whatever hides the navigation on a narrow viewport.
 *
 * On the mobile profile every surface puts its links behind a toggle, so without
 * this the link to the route is present in the DOM but not clickable, and the
 * transition times out at the click rather than being measured. Tried in order of
 * how specific the handle is; the first one that reveals the link wins.
 */
async function revealNav(page: Page, targetHref: string) {
  const linkVisible = () =>
    page.locator(`a[href="${targetHref}"]`).first().isVisible().catch(() => false);
  if (await linkVisible()) return;

  const handles = [
    '[data-testid="menu-toggle"]',
    'button[aria-label*="menu" i]',
    'button[aria-label*="navigation" i]',
    'button[aria-label*="sidebar" i]',
    "header button:has(svg)",
  ];
  for (const selector of handles) {
    const toggle = page.locator(selector).first();
    if (!(await toggle.isVisible().catch(() => false))) continue;
    await toggle.click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(200);
    if (await linkVisible()) return;
  }
}

/**
 * Third-party origins are cut off at the network edge, and the report says so.
 *
 * The measurement environment cannot reach `fonts.googleapis.com`, and the request
 * does not fail fast — it hangs until the connection resets, which put LCP at 13
 * SECONDS on a page that renders in well under one. That number is a fact about
 * this sandbox and nothing at all about the application, and leaving it in would
 * have made every route fail its LCP check for a reason no code change could fix.
 *
 * Aborting immediately is the honest substitute: the browser takes the same
 * fallback-font path it takes when Google Fonts is unreachable for a real user,
 * without the artificial stall. That the app depends on a third-party font host at
 * all is itself a finding — see the self-hosted-fonts work.
 */
async function cutOffThirdParties(page: Page) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const local = url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
    if (local || url.startsWith("data:") || url.startsWith("blob:")) return route.fallback();
    return route.abort();
  });
}

/**
 * Start a route transition from the page the user is on, and time it until the
 * target route's content is painted. `null` when the navigation never lands —
 * which scores as a failure, never as a pass.
 */
async function clickThrough(page: Page, route: RouteSpec): Promise<number | null> {
  await revealNav(page, route.url);

  const link = page.locator(`a[href="${route.url}"]`).first();

  /*
    DECIDE HOW TO NAVIGATE **BEFORE** STARTING THE CLOCK.

    The first version marked the start, then tried a click with a 6-second
    timeout, then fell back. When the click could not land, those six seconds of
    Playwright waiting to be able to click were INSIDE the measurement, and routes
    reported ~6,900ms transitions that had nothing to do with the application.
    A harness that times its own retries is measuring itself.

    So: settle on a method first, then mark, then act.

      1. A VISIBLE LINK is clicked for real. What a human does.
      2. Otherwise `pushState` + `popstate`. On the mobile profile every surface
         puts its navigation in a Radix Sheet, which does not RENDER its links
         until opened, so for most routes there is no anchor in the DOM at all.
         BrowserRouter subscribes to `popstate`, so this drives the identical
         navigation — the chunk fetch, the Suspense boundary, the render and the
         queries are the same work; the only thing skipped is the anchor's own
         onClick.

    Either way the clock starts at the navigation and stops when the target
    route's content is on screen.
  */
  const clickable = await link.isVisible().catch(() => false);

  await page.evaluate("window.__perf__ && window.__perf__.mark()");

  if (clickable) {
    await link.click({ timeout: 5_000, noWaitAfter: true }).catch(() => {});
  } else {
    await page.evaluate((target) => {
      history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }, route.url);
  }

  try {
    // THE URL CHANGE IS PART OF THE SIGNAL, and leaving it out was a real bug in
    // this harness: `ready` is a coarse landmark ("main, h1") that the HUB page
    // satisfies too, so `waitFor visible` returned on the frame of the click and
    // every transition reported ~300ms of nothing. Waiting for the router to land
    // on the target URL first is what makes the second wait mean "the TARGET's
    // content is on screen".
    await page.waitForURL((url) => url.pathname === route.url, { timeout: 25_000 });
    await page.locator(route.ready).first().waitFor({ state: "visible", timeout: 25_000 });
  } catch {
    return null;
  }
  return (await page.evaluate(READ_SINCE_MARK)) as number;
}

/**
 * Both transition timings, from ONE live SPA session.
 *
 * COLD is the first click: the route's chunk has never been fetched and its
 * queries have never run. WARM is the same click again after going BACK — and
 * `goBack()` rather than `goto(hub)` is the whole point, because a `goto` reloads
 * the document and throws away the react-query cache and the parsed chunk, which
 * is exactly what "warm" is supposed to still have. Measuring warm after a reload
 * would have measured cold twice and reported the caching work as having achieved
 * nothing.
 */
async function timeTransitions(
  page: Page,
  hub: string,
  route: RouteSpec,
): Promise<{ cold: number | null; warm: number | null }> {
  await page.goto(hub, { waitUntil: "domcontentloaded" });
  await page.locator("main, h1, form").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});

  const cold = await clickThrough(page, route);
  if (cold === null) return { cold: null, warm: null };

  await page.goBack({ waitUntil: "commit" }).catch(() => {});
  await page.waitForURL((url) => url.pathname === hub, { timeout: 15_000 }).catch(() => {});
  await page.locator("main, h1, form").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

  const warm = await clickThrough(page, route);
  return { cold, warm };
}

/** A page wired for measurement: observers in, third parties out, throttled. */
async function preparePage(context: BrowserContext, route: RouteSpec, profile: DeviceProfile) {
  const page = await context.newPage();
  await page.addInitScript(INSTALL_OBSERVERS);
  const stub = await installSupabaseStub(page, scenarioFor(personaOf(route)));
  await cutOffThirdParties(page);
  await throttle(page, profile);
  return { page, stub };
}

/**
 * One route on one device profile.
 *
 * TWO CONTEXTS, not two pages in one, and the difference is the measurement.
 * Pages in one context share an HTTP cache, so opening the route to measure its
 * cold LOAD would leave its chunk cached for the cold TRANSITION that follows —
 * and the cold transition would quietly become a warm one. Each starts from a
 * context that has never fetched anything.
 */
async function measureProfile(
  newContext: () => Promise<BrowserContext>,
  route: RouteSpec,
  profile: DeviceProfile,
): Promise<ProfileMeasurement & { calls: RecordedCall[] }> {
  // ── the cold load ────────────────────────────────────────────────────────
  const loadContext = await newContext();
  let vitals: Omit<ProfileMeasurement, "transitionWarmMs" | "transitionColdMs">;
  let calls: RecordedCall[];
  try {
    const { page, stub } = await preparePage(loadContext, route, profile);
    await page.goto(route.url, { waitUntil: "domcontentloaded" });
    await page.locator(route.ready).first().waitFor({ state: "visible", timeout: 60_000 });
    await settle(page).catch(() => {});
    // One frame past settle, so a shift caused by the last paint is in the CLS total.
    await page.waitForTimeout(250);
    vitals = (await page.evaluate(READ_VITALS)) as typeof vitals;
    calls = [...stub.calls];
  } finally {
    await loadContext.close();
  }

  // ── the transitions ──────────────────────────────────────────────────────
  const navContext = await newContext();
  let cold: number | null;
  let warm: number | null;
  try {
    const { page } = await preparePage(navContext, route, profile);
    ({ cold, warm } = await timeTransitions(page, hubFor(route), route));
  } finally {
    await navContext.close();
  }

  // `null` is carried through as null — NOT as Infinity. JSON has no Infinity, so
  // the sentinel would reach the scorer as `null`, and `null <= 300` is true in
  // JavaScript: an unmeasurable transition would have scored as the fastest
  // possible one. The scorer fails `null` explicitly instead.
  return { ...vitals, transitionColdMs: cold, transitionWarmMs: warm, calls };
}

test.describe("performance scorecard", () => {
  test("measure every primary route on both device profiles", async ({ browser }) => {
    // 36 routes x 2 profiles x 3 page loads, all throttled. This is a report, not a
    // gate, and it is allowed to take as long as it honestly takes.
    test.setTimeout(60 * 60_000);

    const personas: Array<Exclude<PersonaName, "anonymous">> = ["member", "staff", "admin", "partner"];
    const sessions = new Map<PersonaName, CapturedSession | undefined>();
    for (const persona of personas) {
      sessions.set(persona, await signInAndCaptureState(browser, persona));
    }
    sessions.set("anonymous", undefined);

    const results: RouteMeasurement[] = [];

    for (const route of ROUTES) {
      const session = sessions.get(personaOf(route));
      const perProfile: Partial<Record<"mobile" | "desktop", ProfileMeasurement>> = {};
      let calls: RecordedCall[] = [];

      for (const key of ["mobile", "desktop"] as const) {
        const profile = budgets.profiles[key];
        const newContext = async () => {
          const context = await browser.newContext({
            storageState: session?.storageState,
            viewport: profile.viewport,
            deviceScaleFactor: profile.deviceScaleFactor,
            isMobile: profile.isMobile,
            hasTouch: profile.isMobile,
            /*
            THE SERVICE WORKER IS BLOCKED, and the reason is a defect rather than a
            convenience.

            `public/sw.js` routes every Supabase GET through `networkFirst(request,
            API_CACHE)` — it CACHES API RESPONSES and, when the fetch fails, answers
            with `offline.html`. In this harness that meant every PostgREST read came
            back as an HTML offline page with status 503, the stub never saw the
            request at all (a fetch issued by a service worker does not pass through
            page routing), and every signed-in page rendered its error state.

            Blocking it is the only way to measure the application. The finding it
            exposed — that a member's medical records and a list of alerts are written
            into CacheStorage on disk, and that a flaky network turns a data call into
            an HTML page the client tries to parse as JSON — is recorded in
            docs/perf/BASELINE.md and fixed separately; see the service-worker work.
          */
            serviceWorkers: "block",
          });
          // Staff, admin and partner sessions live in sessionStorage, which
          // `storageState` cannot carry. Replayed before any app code runs.
          if (session?.sessionStorage) {
            await context.addInitScript(restoreSessionStorage(session.sessionStorage));
          }
          return context;
        };

        const measured = await measureProfile(newContext, route, profile);
        const { calls: seen, ...vitals } = measured;
        perProfile[key] = vitals;
        if (key === "mobile") calls = seen;
      }

      results.push({
        routeId: route.id,
        mobile: perProfile.mobile!,
        desktop: perProfile.desktop!,
        // Filled in from the build manifest by scripts/perf/report.mjs — the browser
        // sees uncompressed bytes from `vite preview`, which is not what ships.
        routeJsGzBytes: 0,
        dbQueries: countQueries(calls),
        // Deliberately unmeasured here: a stub has no query planner. Populated from
        // the EXPLAIN ANALYZE evidence, and `null` scores as a FAIL until it is.
        dbQueryP95Ms: null,
        nPlusOneTables: detectNPlusOne(calls),
      });

      // Written after every route so a run that dies at route 30 still leaves 29
      // measurements behind rather than nothing.
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    }

    expect(results.length).toBe(ROUTES.length);
    // An LCP of exactly 0 means the observer never fired, not a page that painted
    // instantly. Catching it here stops a broken harness from reporting a perfect score.
    for (const r of results) {
      expect(r.mobile.lcpMs, `${r.routeId} produced no LCP entry`).toBeGreaterThan(0);
    }
  });
});
