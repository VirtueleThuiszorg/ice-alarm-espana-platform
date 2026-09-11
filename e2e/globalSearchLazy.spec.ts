import { test, expect } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * The Cmd+K palette is loaded on demand — and STILL OPENS on the press that loads it.
 *
 * `GlobalSearch` used to be rendered unconditionally at the top of the app, which
 * put ~500 lines over `cmdk`, two dozen icons and four Supabase searches into the
 * entry chunk every visitor downloads (docs/perf/BASELINE.md). It now sits behind
 * `GlobalSearchMount`, which holds the shortcut and imports the palette on the
 * first press.
 *
 * The unit test for that handover substitutes the palette, because evaluating its
 * module graph under jsdom proves nothing about a browser. THIS is the assertion
 * that the real component, in the real production bundle, still opens — and it is
 * the one that catches what the substitution cannot: a chunk that fails to load,
 * or a dialog that mounts closed and needs a second press.
 *
 * ── WHY THE SERVICE WORKER IS BLOCKED HERE ──────────────────────────────────
 *
 * `public/sw.js` answers a hashed JS chunk with `networkFirst`, and `networkFirst`
 * puts the cache write INSIDE the same try as the fetch:
 *
 *     const response = await fetch(request);
 *     if (response.ok) {
 *       const cache = await caches.open(cacheName);   // <- can reject
 *       cache.put(request, response.clone());
 *     }
 *     return response;
 *     } catch { ... return offlineFallback(); }
 *
 * So when CacheStorage is unavailable — a private window, blocked site data, a
 * full quota, or this sandbox — a request that the NETWORK ANSWERED PERFECTLY is
 * thrown away and the caller gets `offline.html` with status 503 instead. For a
 * lazily-loaded chunk that means the app cannot load its own code; for a Supabase
 * read it means the client is handed an HTML document where it expected JSON.
 *
 * This is observed here, not theorised: with the worker registered, this spec saw
 * every Supabase GET and the `GlobalSearch` chunk come back as 503 offline pages.
 * It is a defect in the worker, fixed in the service-worker work and recorded in
 * docs/perf/BASELINE.md — not a defect in the lazy mount, which is what this file
 * is about. Blocking the worker isolates the thing under test.
 */
test.use({ serviceWorkers: "block" });

/** Sign in as a member, so the palette has a `user` to render for. */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"], input[type="email"]').first().fill("member@example.com");
  await page.locator('input[type="password"]').first().fill("Password123");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth-token")),
    undefined,
    { timeout: 20_000 },
  );
}

test("a signed-out visitor renders no palette at all, before or after Cmd+K", async ({ page }) => {
  /*
    THIS IS WHY THE PALETTE HAD NO BUSINESS IN THE ENTRY CHUNK.

    `GlobalSearch` ends with `if (!user) return null` — it renders NOTHING for a
    signed-out visitor. Every person who has ever opened the pricing page on their
    phone downloaded and parsed ~500 lines over cmdk, two dozen icons and four
    Supabase searches to render null.

    It is asserted rather than merely noted, because the day somebody makes the
    palette render something for signed-out visitors, the reason it is lazy
    changes and this file should have to be read.
  */
  await installSupabaseStub(page, {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("main, h1").first().waitFor({ state: "visible" });

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await page.waitForTimeout(1_500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a signed-in member gets the palette on the press that loads it", async ({ page }) => {
  await installSupabaseStub(page, {
    roleInfo: {
      is_staff: false,
      staff_role: null,
      is_partner: false,
      partner_id: null,
      member_id: "11111111-1111-4111-8111-111111111111",
    },
  });
  await signIn(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });

  // Nothing yet — the palette has not been fetched, let alone rendered.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");

  // ONE press, not two. If `defaultOpen` were dropped, the press that loads the
  // chunk would render the palette closed and this would fail.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.locator("input[placeholder]")).toBeVisible();
});
