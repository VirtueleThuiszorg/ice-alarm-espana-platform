/**
 * Logged-in portal theme guard (.theme-staff / .theme-admin / …).
 *
 * Every portal used to render page 0 0% 99% against 0 0% 100% cards — a 1%
 * difference, so no card had a visible edge. Each portal now tints the PAGE
 * with a light wash and keeps cards white. Two things must stay true for all
 * of them, which is why this is one table-driven suite rather than a file per
 * portal:
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

interface Portal {
  /** CSS class that scopes the token block. */
  theme: string;
  /** Layout component that applies it, relative to src/. */
  layout: string;
  /** Expected wash hue range — each portal picks its own family. */
  hue: [number, number];
}

const PORTALS: Portal[] = [
  { theme: "theme-staff", layout: "components/layout/CallCentreLayout.tsx", hue: [180, 195] },
  // Member is the one customer-facing portal; the hue range is deliberately wide
  // enough to cover both the aqua wash and the warm public alternative (36deg),
  // so swapping palettes does not require editing the guard.
  { theme: "theme-member", layout: "components/layout/ClientLayout.tsx", hue: [30, 195] },
  { theme: "theme-admin", layout: "components/layout/AdminLayout.tsx", hue: [180, 195] },
];

const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/**
 * The declarations of the block governing `theme`. Portals that share a wash use
 * one grouped selector (`.theme-staff, .theme-admin { … }`) rather than keeping
 * identical copies that would drift, so match the class anywhere in the selector
 * list — not just at its start.
 * The declarations of the block governing `theme`. Internal portals share one
 * block via a grouped selector (`.theme-staff, .theme-admin { … }`) rather than
 * keeping two identical copies that would drift, so match the class anywhere in
 * the selector list — not just at its start.
 */
function block(theme: string): string {
  const m = css.match(new RegExp(`(^|[,\\s])\\.${theme}\\s*(,[^{]*)?\\{`, "m"));
  expect(m, `.${theme} token block missing from src/index.css`).not.toBeNull();
  const open = css.indexOf("{", m!.index!);
  return css.slice(open + 1, css.indexOf("}", open));
}

function tokens(theme: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(theme).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** "185 45% 96.5%" -> [r,g,b] */
function hslToRgb(value: string): [number, number, number] {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  expect(m, `token value is not a bare HSL triplet: "${value}"`).not.toBeNull();
  const [h, s, l] = [Number(m![1]) / 360, Number(m![2]) / 100, Number(m![3]) / 100];
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function contrast(a: string, b: string): number {
  const lum = (v: string) => {
    const [r, g, bl] = hslToRgb(v).map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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
