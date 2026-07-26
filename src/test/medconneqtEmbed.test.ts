/**
 * MedConneqt embedded view (integration option b, Lee 2026-07-25).
 *
 * alarm.medconneqt.nl is a third-party medication-dispenser alarm platform.
 * Staff work it alongside our own call-centre and should not have to leave the
 * portal, so it renders in an iframe at /call-centre/medconneqt with our
 * chrome retained.
 *
 * Framing is NOT in our control. If Medconneqt send X-Frame-Options or a
 * frame-ancestors CSP that excludes us, the browser parks the frame on
 * about:blank and the page must say so plainly rather than showing a silent
 * blank rectangle. These pins keep that failure path — and the always-present
 * escape hatch — from being refactored away.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const page = read("src/pages/call-centre/MedConneqtPage.tsx");
const sidebar = read("src/components/layout/CallCentreSidebar.tsx");
const app = read("src/App.tsx");
const config = read("src/config/medconneqt.ts");

describe("MedConneqt embed — routing", () => {
  it("is a real route inside the call-centre layout, so our chrome is kept", () => {
    expect(app).toMatch(/<Route path="medconneqt" element={<MedConneqtPage \/>} \/>/);
    expect(app).toMatch(/import\("\.\/pages\/call-centre\/MedConneqtPage"\)/);
  });

  it("the sidebar navigates internally — staff never leave the portal", () => {
    expect(sidebar).toMatch(/labelKey: "sidebar\.medconneqt", path: "\/call-centre\/medconneqt"/);
    // the previous new-tab implementation and its MenuItem flag are gone
    expect(sidebar).not.toMatch(/external/);
    expect(sidebar).not.toMatch(/target="_blank"/);
  });

  it("sits directly under Dashboard", () => {
    const dashboard = sidebar.indexOf('labelKey: "sidebar.dashboard"');
    const medconneqt = sidebar.indexOf('labelKey: "sidebar.medconneqt"');
    const alerts = sidebar.indexOf('labelKey: "sidebar.alerts"');
    expect(medconneqt).toBeGreaterThan(dashboard);
    expect(medconneqt).toBeLessThan(alerts);
  });
});

describe("MedConneqt embed — the frame", () => {
  it("points at the partner platform from the shared constant", () => {
    expect(config).toMatch(/MEDCONNEQT_URL = "https:\/\/alarm\.medconneqt\.nl"/);
    expect(page).toMatch(/src={MEDCONNEQT_URL}/);
  });

  it("is labelled for screen readers and fills its container", () => {
    expect(page).toMatch(/title={t\("medconneqt\.frameTitle"\)}/);
    expect(page).toMatch(/className="h-full w-full border-0"/);
  });

  it("is sized from measured space, not a hardcoded header offset", () => {
    // guards against double scrollbars when the SOS bar shows/hides
    expect(page).toMatch(/getBoundingClientRect\(\)\.top/);
    expect(page).toMatch(/window\.innerHeight - top/);
    expect(page).toMatch(/addEventListener\("resize"/);
    expect(page).toMatch(/ResizeObserver/);
    expect(page).toMatch(/overflow-hidden/);
  });
});

describe("MedConneqt embed — failure is visible, never a blank rectangle", () => {
  it("treats a readable-but-empty frame as blocked (the X-Frame-Options case)", () => {
    expect(page).toMatch(/contentDocument/);
    expect(page).toMatch(/childElementCount === 0/);
    // an unreadable (cross-origin) document is the SUCCESS signal
    expect(page).toMatch(/setFrameState\("ready"\)/);
  });

  it("tells a network failure apart from a framing refusal", () => {
    // Chrome's own error page is cross-origin, so inspection alone reports a
    // dead host as a successful load. An independent no-cors probe is what
    // stops an empty browser error page being shown as "loaded".
    expect(page).toMatch(/fetch\(MEDCONNEQT_URL, \{ mode: "no-cors"/);
    // our own service worker answers failed cross-origin requests with a
    // synthesised offline Response, so "the promise resolved" is NOT proof of
    // reachability — only a real no-cors network response is opaque
    expect(page).toMatch(/res\.type !== "default"/);
    expect(page).toMatch(/setReachable\(false\)/);
    expect(page).toMatch(/reachable === false \? "unreachable"/);
    expect(page).toMatch(/medconneqt\.unreachableTitle/);
    expect(page).toMatch(/medconneqt\.unreachableBody/);
  });

  it("falls back when the frame never loads at all", () => {
    expect(config).toMatch(/MEDCONNEQT_LOAD_TIMEOUT_MS/);
    expect(page).toMatch(/setTimeout\(\(\) => setFrameState\("blocked"\), MEDCONNEQT_LOAD_TIMEOUT_MS\)/);
    expect(page).toMatch(/onError={\(\) => setFrameState\("blocked"\)}/);
  });

  it("the blocked state explains itself and offers the new tab plus a retry", () => {
    expect(page).toMatch(/medconneqt\.blockedTitle/);
    expect(page).toMatch(/medconneqt\.blockedBody/);
    expect(page).toMatch(/medconneqt\.retry/);
  });

  it("the new-tab escape hatch is always on screen, not only when blocked", () => {
    // rendered from a variable used in the header, outside any state branch
    expect(page).toMatch(/const openInNewTab = \(/);
    expect(page).toMatch(/\{openInNewTab\}/);
    const opens = page.match(/target="_blank"/g) ?? [];
    expect(opens.length).toBeGreaterThanOrEqual(2);
    expect(page).not.toMatch(/target="_blank"(?![\s\S]{0,120}rel="noopener noreferrer")/);
  });

  it("explains the separate MedConneqt login and the third-party-cookie trap", () => {
    expect(page).toMatch(/medconneqt\.loginNote/);
    expect(page).toMatch(/medconneqt\.sessionNote/);
  });
});

describe("MedConneqt embed — copy exists in every locale", () => {
  const KEYS = [
    "title",
    "subtitle",
    "loginNote",
    "sessionNote",
    "openInNewTab",
    "frameTitle",
    "loading",
    "blockedTitle",
    "blockedBody",
    "unreachableTitle",
    "unreachableBody",
    "retry",
  ];
  for (const locale of ["en", "es", "nl"]) {
    it(`${locale} has the full medconneqt namespace`, () => {
      const raw = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      expect(raw.medconneqt, `${locale} needs the medconneqt namespace`).toBeDefined();
      for (const key of KEYS) {
        expect(raw.medconneqt[key], `${locale}.medconneqt.${key}`).toBeTruthy();
      }
      expect(raw.sidebar.medconneqt).toBe("MedConneqt");
    });
  }
});
