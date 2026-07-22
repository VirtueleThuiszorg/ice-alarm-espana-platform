import type { Page } from "@playwright/test";

/** Strings that must NEVER appear in rendered public output (LAUNCH_SCOPE.md §7). */
export const FORBIDDEN_BRAND_STRINGS = ["icealarm", "icehealthsync", "ICE Alarm"];

/**
 * Buttons whose action cannot be detected by the no-op heuristic (they open a
 * native picker, trigger a download, or hand off to an external SDK), so they
 * would false-positive as "dead". Matched case-insensitively against the
 * button's accessible name. Keep this list SHORT and justified.
 */
export const BUTTON_NOOP_ALLOWLIST: RegExp[] = [
  /accept|reject|manage cookies|cookie/i, // GDPR banner — state lives outside the DOM we snapshot
];

export type Lang = "en" | "es" | "nl";

/**
 * Navigate to `path` with the audit hooks primed: language preset, first-visit
 * language modal suppressed, and the i18n missing-key collector armed
 * (see the guarded handler in src/i18n/index.ts).
 */
export async function gotoAudited(page: Page, path: string, lng: Lang = "en") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("i18nextLng", l as string);
      // Suppress the first-visit language modal so it doesn't mask the page.
      localStorage.setItem("iceAlarmLanguageSelected", "true");
    } catch {
      /* ignore */
    }
    (window as unknown as { __AUDIT__: boolean }).__AUDIT__ = true;
    (window as unknown as { __I18N_MISSING__: string[] }).__I18N_MISSING__ = [];
  }, lng);

  // 'commit' returns as soon as navigation commits; we then wait on the app's own
  // readiness signal (#main-content mounts after Suspense resolves the lazy route).
  // Waiting on domcontentloaded/load instead would block on the full cold boot
  // (~13s: large bundle + synchronous ~528KB i18n JSON parse) with no benefit.
  await page.goto(path, { waitUntil: "commit" });
  await page.waitForSelector("#main-content", { timeout: 30_000 });
  // Brief settle so children + footer render and missing i18n keys are collected.
  await page.waitForTimeout(700);
}

export interface Anchor {
  text: string;
  href: string;
}

/** Anchors whose href is a dead placeholder (`#` or empty). */
export async function findDeadAnchors(page: Page): Promise<Anchor[]> {
  return page.$$eval("a", (els) =>
    els
      .filter((a) => {
        const h = a.getAttribute("href");
        return h === "#" || h === "" || h === null;
      })
      .map((a) => ({
        text: (a.textContent || "").trim().slice(0, 80),
        href: a.getAttribute("href") ?? "(none)",
      }))
  );
}

/** Internal (`/...`) hrefs on the page, de-duplicated. */
export async function collectInternalHrefs(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval('a[href^="/"]', (els) =>
    els.map((a) => a.getAttribute("href") || "")
  );
  return [...new Set(hrefs.filter(Boolean))];
}

export interface BrandHit {
  term: string;
  sample: string;
}

/** Occurrences of forbidden brand strings in the rendered text. */
export async function findBrandLeaks(page: Page): Promise<BrandHit[]> {
  const text = await page.evaluate(() => document.body.innerText || "");
  const hits: BrandHit[] = [];
  for (const term of FORBIDDEN_BRAND_STRINGS) {
    // Allow whitespace variation ("ICE Alarm" / "ICE  Alarm").
    const re = new RegExp(term.replace(/\s+/g, "\\s+"), "i");
    const m = re.exec(text);
    if (m) {
      const at = Math.max(0, m.index - 20);
      hits.push({ term, sample: text.slice(at, at + 60).replace(/\s+/g, " ") });
    }
  }
  return hits;
}

/** Missing i18n keys captured for the current language (see src/i18n/index.ts). */
export async function collectMissingI18nKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __I18N_MISSING__?: string[] };
    return [...new Set(w.__I18N_MISSING__ || [])];
  });
}

/** The active i18n language actually in effect (post language-detection). */
export async function activeLanguage(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang || "");
}

export interface DeadButton {
  index: number;
  name: string;
}

/**
 * Heuristic no-op button detector. Boots the page ONCE (the app cold-boots in
 * ~13s, so per-button navigation is impractical), then clicks each visible,
 * enabled, non-allowlisted button and checks whether anything observable changed
 * (url / dialog / toast / aria-expanded / DOM size). A button that changed
 * NOTHING is reported as a probable dead handler. Presses Escape after each
 * click and re-navigates only if a click caused navigation, to limit state bleed.
 *
 * Intentionally conservative — it under-reports rather than flag legitimately
 * interactive controls.
 */
export async function findNoOpButtons(
  page: Page,
  path: string,
  lng: Lang,
  max = 20
): Promise<DeadButton[]> {
  const snapshot = () =>
    page.evaluate(() => ({
      url: location.href,
      dialogs: document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length,
      toasts: document.querySelectorAll(
        "[data-sonner-toast],[role='status'],.toast,li[data-state='open']"
      ).length,
      expanded: document.querySelectorAll('[aria-expanded="true"]').length,
      domSize: document.body.innerHTML.length,
    }));

  await gotoAudited(page, path, lng);
  const startUrl = page.url();
  const count = Math.min(await page.locator("button:visible").count(), max);
  const dead: DeadButton[] = [];

  for (let i = 0; i < count; i++) {
    if (page.url() !== startUrl) await gotoAudited(page, path, lng);
    const buttons = page.locator("button:visible");
    if (i >= (await buttons.count())) break;
    const btn = buttons.nth(i);
    if (await btn.isDisabled().catch(() => true)) continue;

    const name = (
      (await btn.getAttribute("aria-label")) ||
      (await btn.innerText().catch(() => "")) ||
      (await btn.getAttribute("title")) ||
      ""
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);

    if (BUTTON_NOOP_ALLOWLIST.some((re) => re.test(name))) continue;

    const before = await snapshot();
    await btn.click({ trial: false, timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    const after = await snapshot();

    const changed =
      before.url !== after.url ||
      before.dialogs !== after.dialogs ||
      before.toasts !== after.toasts ||
      before.expanded !== after.expanded ||
      Math.abs(before.domSize - after.domSize) > 40;

    if (!changed) dead.push({ index: i, name: name || "(unnamed)" });

    // Best-effort: close any opened overlay so the next button's index is stable.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(100);
  }

  return dead;
}
