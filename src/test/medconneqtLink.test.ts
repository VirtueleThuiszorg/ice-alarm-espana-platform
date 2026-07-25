/**
 * Medconneqt (alarm.medconneqt.nl) is a third-party medication-dispenser alarm
 * platform staff work alongside our own call-centre. Integration option (a) —
 * a sidebar link opening in a new tab — chosen deliberately over an iframe:
 * their framing headers are outside our control and a framed third-party login
 * would break on SameSite cookies. If they expose an API, dispenser alarms
 * move into our own queue instead (gated work — it touches the alerts path).
 *
 * These pins keep the link safe (noopener) and honest (external indicator),
 * and keep it out of the internal router.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const sidebar = readFileSync(join(ROOT, "src/components/layout/CallCentreSidebar.tsx"), "utf8");

describe("MedConneqt sidebar link", () => {
  it("points at the alarm platform and is flagged external", () => {
    expect(sidebar).toMatch(/const MEDCONNEQT_URL = "https:\/\/alarm\.medconneqt\.nl"/);
    expect(sidebar).toMatch(/labelKey: "sidebar\.medconneqt", path: MEDCONNEQT_URL, external: true/);
  });

  it("sits directly under Dashboard", () => {
    const dashboard = sidebar.indexOf('labelKey: "sidebar.dashboard"');
    const medconneqt = sidebar.indexOf('labelKey: "sidebar.medconneqt"');
    const alerts = sidebar.indexOf('labelKey: "sidebar.alerts"');
    expect(dashboard).toBeGreaterThan(-1);
    expect(medconneqt).toBeGreaterThan(dashboard);
    expect(medconneqt).toBeLessThan(alerts);
  });

  it("opens in a new tab with noopener, not through the internal router", () => {
    // an external URL passed to NavLink would be treated as an app route
    expect(sidebar).toMatch(/if \(item\.external\)/);
    expect(sidebar).toMatch(/target="_blank"/);
    expect(sidebar).toMatch(/rel="noopener noreferrer"/);
  });

  it("shows an external-link indicator so staff know they are leaving", () => {
    expect(sidebar).toMatch(/ExternalLink/);
  });

  it("is not registered as an application route", () => {
    const app = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
    expect(app).not.toMatch(/medconneqt/i);
  });

  it("is labelled in all three locales", () => {
    for (const locale of ["en", "es", "nl"]) {
      const raw = JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), "utf8"));
      expect(raw.sidebar.medconneqt, `${locale} needs sidebar.medconneqt`).toBe("MedConneqt");
    }
  });
});
