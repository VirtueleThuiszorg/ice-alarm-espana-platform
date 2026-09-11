/**
 * WCAG contrast maths over the design tokens in src/index.css.
 *
 * Extracted from portalTheme.test.ts so the public-palette guard can use the SAME
 * implementation rather than a second copy. Two contrast functions that drift apart is how
 * one surface quietly gets a laxer bar than another (CLAUDE.md: no duplicate parallel
 * implementations).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** "185 45% 96.5%" -> [r,g,b] */
export function hslToRgb(value: string): [number, number, number] {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`token value is not a bare HSL triplet: "${value}"`);
  const [h, s, l] = [Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100];
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

/** WCAG 2.1 relative-contrast ratio between two bare HSL triplets. */
export function contrast(a: string, b: string): number {
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

/**
 * The declarations of a token block. Portals that share a wash use one grouped selector
 * (`.theme-staff, .theme-admin { … }`) rather than identical copies that would drift, so the
 * class is matched anywhere in the selector list — not just at its start.
 */
export function blockFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(^|[,\\s])${escaped}\\s*(,[^{]*)?\\{`, "m"));
  if (!m) throw new Error(`${selector} token block missing from src/index.css`);
  const open = css.indexOf("{", m.index!);
  // Brace-match rather than indexOf("}"), so a block containing a nested rule is not truncated.
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(open + 1, i - 1);
}

export function tokensFor(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of blockFor(selector).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * "#d1fae5" -> "160 84% 90%", so a Tailwind palette class can be checked by the SAME contrast
 * maths as a design token.
 *
 * A CONVERSION, NOT A SECOND CONTRAST FUNCTION. The member record's status chips use Tailwind's
 * emerald/amber/slate scales rather than tokens — they are three chips on one header, and
 * minting six tokens for them would put more names in the palette than the feature is worth.
 * They still have to clear AA, and the only honest way to check that is with the function
 * everything else is checked with, so the hex is converted rather than the maths duplicated.
 */
export function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}
