/**
 * Logged-in portal theme guard (.theme-staff / .theme-admin / …).
 *
 * Every portal used to render page 0 0% 99% against 0 0% 100% cards — a 1%
 * difference, so no card had a visible edge. Each portal now tints the PAGE
 * with a light wash and keeps cards white. Two things must stay true for all
 * of them, which is why this is one table-driven suite rather than a file per
 * portal:
 *
 * Since the ICE rebrand every portal shares ONE warm neutral family (28-40deg)
 * rather than a hue per portal, so the ranges below are identical by design.
 *
 *  1. The wash never touches safety-critical colour. Red belongs to SOS and
 *     emergencies; --alert-*, --status-* and --destructive are functional UI
 *     state, not brand, and no portal block may redefine them.
 *  2. Every text pair still clears WCAG AA (4.5:1), on the wash and on cards.
 *
 * Adding a portal = one row in PORTALS below, one token block in index.css,
 * one class on the layout. Nothing else.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, tokensFor } from "./helpers/contrast";

interface Portal {
  /** CSS class that scopes the token block. */
  theme: string;
  /** Layout component that applies it, relative to src/. */
  layout: string;
  /** Expected wash hue range — each portal picks its own family. */
  hue: [number, number];
}

const PORTALS: Portal[] = [
  { theme: "theme-staff", layout: "components/layout/CallCentreLayout.tsx", hue: [28, 40] },
  { theme: "theme-partner", layout: "components/layout/PartnerLayout.tsx", hue: [28, 40] },
  { theme: "theme-member", layout: "components/layout/ClientLayout.tsx", hue: [28, 40] },
  { theme: "theme-admin", layout: "components/layout/AdminLayout.tsx", hue: [28, 40] },
];

// Contrast maths and token parsing are shared with publicPaletteContrast.test.ts — one
// implementation, so the two surfaces cannot drift onto different bars.
const tokens = (theme: string) => tokensFor(`.${theme}`);

const CARD = "0 0% 100%";

describe.each(PORTALS)("portal theme (.$theme)", ({ theme, layout, hue }) => {
  it("is applied by its layout, so every page in the portal inherits it", () => {
    const src = readFileSync(join(process.cwd(), "src", layout), "utf8");
    expect(src, `${layout} must put "${theme}" on its root element`).toMatch(
      new RegExp(`className="${theme} `),
    );
  });

  it("leaves every safety-critical colour token alone", () => {
    // Red is reserved for emergencies. If a future edit tints these to match a
    // wash, an operator's SOS cue changes colour — this is the line that stops it.
    const overridden = Object.keys(tokens(theme)).filter(
      (t) => /^--(alert|status|sidebar)-/.test(t) || t === "--destructive" || t === "--destructive-foreground",
    );
    expect(overridden, `.${theme} must not redefine safety/status tokens: ${overridden.join(", ")}`).toEqual([]);
  });

  it("tints the page, not the cards", () => {
    const t = tokens(theme);
    expect(t["--card"], "cards must stay pure white so they lift off the wash").toBe(CARD);
    expect(t["--popover"]).toBe(CARD);
    const [h, , l] = t["--background"].match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)!.slice(1).map(Number);
    expect(h, `wash hue should sit in this portal's family (${hue[0]}-${hue[1]}deg)`).toBeGreaterThanOrEqual(hue[0]);
    expect(h).toBeLessThanOrEqual(hue[1]);
    expect(l, "wash must stay near-white, not a saturated colour field").toBeGreaterThanOrEqual(94);
    expect(contrast(t["--background"], CARD), "wash must be visibly off-white").toBeGreaterThan(1.02);
  });

  it("keeps every text pair at WCAG AA (4.5:1) on both the wash and the cards", () => {
    const t = tokens(theme);
    const pairs: Array<[string, string, string]> = [
      ["--foreground", "--background", "body text on the wash"],
      ["--foreground", CARD, "body text on a card"],
      ["--foreground", "--muted", "body text on a muted panel"],
      ["--muted-foreground", "--background", "secondary text on the wash"],
      ["--muted-foreground", CARD, "secondary text on a card"],
      ["--muted-foreground", "--muted", "secondary text on a muted panel"],
      ["--secondary-foreground", "--secondary", "text on a secondary surface"],
      ["--accent-foreground", "--accent", "text on an accent/hover surface"],
    ];
    const failures = pairs
      .map(([fg, bg, what]) => ({ what, ratio: contrast(t[fg] ?? fg, t[bg] ?? bg) }))
      .filter((r) => r.ratio < 4.5)
      .map((r) => `${r.what}: ${r.ratio.toFixed(2)}:1`);
    expect(failures, `below WCAG AA: ${failures.join(", ")}`).toEqual([]);
  });

  it("keeps the focus ring at 3:1 against both surfaces (WCAG 1.4.11)", () => {
    const t = tokens(theme);
    expect(contrast(t["--ring"], t["--background"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t["--ring"], CARD)).toBeGreaterThanOrEqual(3);
  });
});
