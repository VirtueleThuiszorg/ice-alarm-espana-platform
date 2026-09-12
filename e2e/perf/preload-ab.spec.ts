import { test, expect } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { INSTALL_OBSERVERS, READ_VITALS } from "./observers";
import { loadBudgets } from "../../src/test/perf/scorecard";

/**
 * A/B: what the shell's <link rel=modulepreload> tags are worth.
 *
 * Vite emits one per eager chunk by default. The arm that strips them rewrites
 * the served HTML, so both arms run the SAME build — the only difference is
 * whether the browser learns about the six shell chunks before the entry module
 * has parsed. Three runs per arm, median reported, same method as the font A/B.
 */
const mobile = loadBudgets().profiles.mobile;
const RUNS = 3;
const ROUTES = ["/", "/pricing", "/how-it-works", "/privacy", "/contact"];

async function measure(browser: Browser, url: string, preload: boolean) {
  const ctx = await browser.newContext({
    viewport: { width: mobile.viewport.width, height: mobile.viewport.height },
    serviceWorkers: "block",
  });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(INSTALL_OBSERVERS);
    await page.route("**/*", async (r) => {
      const u = r.request().url();
      const local = u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost");
      if (!local && !u.startsWith("data:") && !u.startsWith("blob:")) return r.abort();
      if (!preload && r.request().resourceType() === "document") {
        const res = await r.fetch();
        const body = (await res.text()).replace(/<link rel="modulepreload"[^>]*>/g, "");
        return r.fulfill({ response: res, body });
      }
      return r.fallback();
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: mobile.latencyMs,
      downloadThroughput: (mobile.downloadKbps * 1024) / 8,
      uploadThroughput: (mobile.uploadKbps * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: mobile.cpuThrottlingRate });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("main, h1").first().waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(300);
    return (await page.evaluate(READ_VITALS)) as { lcpMs: number; requestCount: number };
  } finally {
    await ctx.close();
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("modulepreload on vs off, per public route", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  console.log("\nroute            preload_on  preload_off   delta   requests");
  for (const url of ROUTES) {
    const on: number[] = [];
    const off: number[] = [];
    let reqs = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const a = await measure(browser, url, true);
      on.push(a.lcpMs);
      reqs = a.requestCount;
      off.push((await measure(browser, url, false)).lcpMs);
    }
    const mOn = median(on);
    const mOff = median(off);
    console.log(
      `${url.padEnd(16)} ${String(Math.round(mOn)).padStart(9)} ${String(Math.round(mOff)).padStart(12)} ` +
        `${String(Math.round(mOff - mOn)).padStart(7)} ${String(reqs).padStart(10)}`,
    );
    expect(mOn).toBeGreaterThan(0);
  }
});
