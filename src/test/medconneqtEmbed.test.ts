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

import { MEDCONNEQT_FRAME_ANCESTORS_HEADER as header } from "@/config/medconneqt";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const page = read("src/pages/call-centre/MedConneqtPage.tsx");
// The frame moved OUT of the page and into a host mounted by the layout (item 8: mount once,
// keep alive, do not remount). Every assertion about the frame therefore reads the host, and the
// page is asserted to contain no frame of its own — a second iframe would be a second session.
const host = read("src/components/call-centre/MedConneqtFrameHost.tsx");
const layout = read("src/components/layout/CallCentreLayout.tsx");
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
    // ADJACENCY, not "somewhere before alerts". The previous version of this assertion compared
    // medconneqt against alerts, and stayed green through the 9 Sep reorder that moved alerts
    // three slots down — it was never testing what its name says. The full order lives in
    // src/test/callCentreSidebarOrder.test.ts; this checks the one relationship this file owns.
    const keys = [...sidebar.matchAll(/labelKey:\s*"sidebar\.(\w+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(2);
    expect(keys.indexOf("medconneqt")).toBe(keys.indexOf("dashboard") + 1);
  });
});

describe("MedConneqt embed — the frame", () => {
  it("points at the partner platform from the shared constant", () => {
    expect(config).toMatch(/MEDCONNEQT_URL = "https:\/\/alarm\.medconneqt\.nl"/);
    expect(host).toMatch(/src={MEDCONNEQT_URL}/);
  });

  it("is labelled for screen readers and fills its container", () => {
    expect(host).toMatch(/title={t\("medconneqt\.frameTitle"\)}/);
    expect(host).toMatch(/className="h-full w-full border-0"/);
  });

  it("is sized from measured space, not a hardcoded header offset", () => {
    // guards against double scrollbars when the SOS bar shows/hides
    expect(host).toMatch(/getBoundingClientRect\(\)\.top/);
    expect(host).toMatch(/window\.innerHeight - top/);
    expect(host).toMatch(/addEventListener\("resize"/);
    expect(host).toMatch(/ResizeObserver/);
    expect(host).toMatch(/overflow-hidden/);
  });
});

describe("MedConneqt embed — failure is visible, never a blank rectangle", () => {
  it("treats a readable-but-empty frame as blocked (the X-Frame-Options case)", () => {
    expect(host).toMatch(/contentDocument/);
    expect(host).toMatch(/childElementCount === 0/);
    // an unreadable (cross-origin) document is the SUCCESS signal
    expect(host).toMatch(/setFrameState\("ready"\)/);
  });

  it("tells a network failure apart from a framing refusal", () => {
    // Chrome's own error page is cross-origin, so inspection alone reports a
    // dead host as a successful load. An independent no-cors probe is what
    // stops an empty browser error page being shown as "loaded".
    expect(host).toMatch(/fetch\(MEDCONNEQT_URL, \{ mode: "no-cors"/);
    // our own service worker answers failed cross-origin requests with a
    // synthesised offline Response, so "the promise resolved" is NOT proof of
    // reachability — only a real no-cors network response is opaque
    expect(host).toMatch(/res\.type !== "default"/);
    expect(host).toMatch(/setReachable\(false\)/);
    expect(host).toMatch(/reachable === false \? "unreachable"/);
    expect(host).toMatch(/medconneqt\.unreachableTitle/);
    expect(host).toMatch(/medconneqt\.unreachableBody/);
  });

  it("falls back when the frame never loads at all", () => {
    expect(config).toMatch(/MEDCONNEQT_LOAD_TIMEOUT_MS/);
    expect(host).toMatch(/setTimeout\(\(\) => setFrameState\("blocked"\), MEDCONNEQT_LOAD_TIMEOUT_MS\)/);
    expect(host).toMatch(/onError={\(\) => setFrameState\("blocked"\)}/);
  });

  it("the blocked state explains itself and offers the new tab plus a retry", () => {
    expect(host).toMatch(/medconneqt\.blockedTitle/);
    expect(host).toMatch(/medconneqt\.blockedBody/);
    expect(host).toMatch(/medconneqt\.retry/);
  });

  it("the new-tab escape hatch is always on screen, not only when blocked", () => {
    // On the PAGE, in the header, outside every state branch — so it is there while the frame is
    // still loading and while it is working. The host carries a second one inside the failure
    // panel, where somebody who has just read "this cannot be embedded" needs it.
    expect(page).toMatch(/target="_blank"/);
    expect(page).toMatch(/medconneqt\.openInNewTab/);
    expect(host).toMatch(/medconneqt\.openInNewTab/);
    for (const [name, src] of [["page", page], ["host", host]] as const) {
      expect(src, name).not.toMatch(/target="_blank"(?![\s\S]{0,120}rel="noopener noreferrer")/);
    }
  });

  it("explains the separate MedConneqt login and the third-party-cookie trap", () => {
    expect(page).toMatch(/medconneqt\.loginNote/);
    expect(page).toMatch(/medconneqt\.sessionNote/);
  });
});

describe("MedConneqt embed — the session survives navigation (item 8)", () => {
  it("the frame is mounted by the LAYOUT, not by the route component", () => {
    // The whole point: the layout outlives every route change, so the frame does too.
    expect(layout).toContain("<MedConneqtFrameHost />");
    expect(layout).toContain('import { MedConneqtFrameHost }');
    expect(page).not.toMatch(/<iframe/);
  });

  it("it is HIDDEN when off-route, never conditionally rendered", () => {
    // `display: none` (which `hidden` gives us) keeps an iframe's document, cookies and scroll
    // position. A conditional render — `{active && <iframe …>}` — throws all three away, which
    // is the defect: back from Members and the operator is at Medconneqt's login form again.
    expect(host).toMatch(/hidden={!active}/);
    expect(host).not.toMatch(/\{active && [\s\S]{0,40}<iframe/);
    expect(host).not.toMatch(/if \(!active\) return null/);
  });

  it("does not probe the third party from unrelated call-centre screens", () => {
    // Mounted everywhere means the fetch would fire everywhere without this gate.
    const probe = host.slice(host.indexOf("fetch(MEDCONNEQT_URL"));
    expect(host.slice(0, host.indexOf("fetch(MEDCONNEQT_URL"))).toContain("if (!active) return;");
    expect(probe).toContain("[attempt, active]");
  });

  it("the route it watches for is the one App.tsx actually mounts", () => {
    expect(config).toMatch(/MEDCONNEQT_ROUTE = "\/call-centre\/medconneqt"/);
    expect(host).toContain("pathname === MEDCONNEQT_ROUTE");
    // The constant and the route table cannot drift apart silently: the layout path plus the
    // nested path is what the constant has to equal.
    expect(app).toMatch(/path="\/call-centre"/);
    expect(app).toMatch(/<Route path="medconneqt"/);
  });
});

describe("MedConneqt embed — a refusal names the header Medconneqt must send", () => {
  it("the blocked panel prints a frame-ancestors header for OUR origin", () => {
    expect(config).toContain("MEDCONNEQT_FRAME_ANCESTORS_HEADER");
    expect(host).toContain("MEDCONNEQT_FRAME_ANCESTORS_HEADER(origin)");
    expect(host).toContain("window.location.origin");
    // Built from the live origin rather than hardcoded: the operator may be on the production
    // domain or on a preview URL, and it is their origin that Medconneqt refused.
    expect(header("https://icealarm.es")).toBe(
      "Content-Security-Policy: frame-ancestors https://icealarm.es;",
    );
  });

  it("it also says X-Frame-Options has to go — it cannot be narrowed to us", () => {
    // X-Frame-Options has no allow-list form in any current browser (ALLOW-FROM is dead), so
    // "add us to X-Frame-Options" is advice that cannot be followed. Only frame-ancestors can.
    expect(host).toContain("medconneqt.blockedHeaderXfo");
    for (const locale of ["en", "es", "nl"]) {
      const raw = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      expect(raw.medconneqt.blockedHeaderXfo, locale).toContain("X-Frame-Options");
      expect(raw.medconneqt.blockedHeaderNote, locale).toBeTruthy();
    }
  });

  it("the note is shown for a REFUSAL, not for an unreachable host", () => {
    // A dead host needs a retry, not a CSP lecture — the header advice would be wrong there.
    expect(host).toMatch(/state === "blocked" && \(/);
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
