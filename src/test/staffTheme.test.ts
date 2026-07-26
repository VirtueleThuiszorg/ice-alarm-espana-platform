/**
 * Staff / call-centre theme guard (.theme-staff).
 *
 * The portal's page background used to be 0 0% 99% against 0 0% 100% cards — a
 * 1% difference, so nothing had an edge. The fix tints the PAGE with a ~6% wash
 * of the brand teal and keeps cards white. Two things must stay true:
 *
 *  1. The wash never touches safety-critical colour. Red belongs to SOS and
 *     emergencies; --alert-*, --status-* and --destructive are functional UI
 *     state, not brand, and .theme-staff must not redefine any of them.
 *  2. Every text pair still clears WCAG AA (4.5:1), on the wash and on cards.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** The declarations inside `.theme-staff { … }` (the token block). */
function themeStaffBlock(): string {
  const start = css.indexOf(".theme-staff {");
  expect(start, ".theme-staff token block missing from src/index.css").toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of themeStaffBlock().matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
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

describe("staff theme (.theme-staff)", () => {
  it("is applied by CallCentreLayout, so every /call-centre page inherits it", () => {
    const layout = readFileSync(join(process.cwd(), "src/components/layout/CallCentreLayout.tsx"), "utf8");
    expect(layout).toMatch(/className="theme-staff /);
  });

  it("leaves every safety-critical colour token alone", () => {
    // Red is reserved for emergencies. If a future edit tints these to match the
    // wash, an operator's SOS cue changes colour — this is the line that stops it.
    const overridden = Object.keys(tokens()).filter(
      (t) => /^--(alert|status|sidebar)-/.test(t) || t === "--destructive" || t === "--destructive-foreground",
    );
    expect(overridden, `.theme-staff must not redefine safety/status tokens: ${overridden.join(", ")}`).toEqual([]);
  });

  it("tints the page, not the cards", () => {
    const t = tokens();
    expect(t["--card"], "cards must stay pure white so they lift off the wash").toBe("0 0% 100%");
    expect(t["--popover"]).toBe("0 0% 100%");
    // The wash is a light, low-chroma teal — near-white, never saturated.
    const [h, , l] = t["--background"].match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)!.slice(1).map(Number);
    expect(h, "wash hue should sit on the brand teal (#1CBAC8 = 185deg)").toBeGreaterThanOrEqual(180);
    expect(h).toBeLessThanOrEqual(195);
    expect(l, "wash must stay near-white, not a clinical aqua").toBeGreaterThanOrEqual(94);
    expect(contrast(t["--background"], "0 0% 100%"), "wash must be visibly off-white").toBeGreaterThan(1.02);
  });

  it("keeps every text pair at WCAG AA (4.5:1) on both the wash and the cards", () => {
    const t = tokens();
    const CARD = "0 0% 100%";
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
    const t = tokens();
    expect(contrast(t["--ring"], t["--background"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t["--ring"], "0 0% 100%")).toBeGreaterThanOrEqual(3);
  });
});
