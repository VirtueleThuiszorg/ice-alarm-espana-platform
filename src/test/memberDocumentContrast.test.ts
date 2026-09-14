import { describe, it, expect } from "vitest";
import { contrast, tokensFor } from "./helpers/contrast";
import { BRAND_INK, BRAND_RED } from "@/lib/brandMark";
import { MEMBER_DOCUMENT_PRINT_CSS } from "@/lib/memberDocument";

/**
 * THE MEMBER DOCUMENT CLEARS AA — on screen in every theme, and on paper.
 *
 * GOALS.md G3: "the bar is 'could a 75-year-old use this unaided'". This document is read by
 * exactly that person, often as a photocopy, often in a hospital corridor. Two things had to be
 * checked and neither was covered by the palette guards that already exist:
 *
 *   1. `MemberDocumentView` uses `text-muted-foreground` on the DIALOG's ground, not on the page
 *      ground. `publicPaletteContrast.test.ts` pairs every `*-foreground` with its own base —
 *      so `--muted-foreground on --popover` and `--muted-foreground on --card`, which is what a
 *      field label actually renders as, were nobody's pair.
 *
 *   2. The print document does not use tokens at all. It is a standalone `<html>` with literal
 *      hex, so no token test reaches it — its contrast has to be computed from the hex.
 *
 * A ratio computed here is the ratio a reader gets, because both surfaces are checked in the
 * form they are actually rendered in.
 */

const AA = 4.5;
/** WCAG 1.4.11: a non-text cue — the red section rule — needs 3:1, not 4.5:1. */
const AA_NON_TEXT = 3;

const t = tokensFor(":root");

/** "#C8102E" -> the bare HSL triplet the contrast helper takes. */
function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return `${h} ${s * 100}% ${l * 100}%`;
}

const PAPER = "0 0% 100%";

describe("the document on screen — the pairs the dialog actually renders", () => {
  /** [foreground, background, what a reader is looking at] */
  const PAIRS: Array<[string, string, string]> = [
    ["--muted-foreground", "--popover", "a field label in the dialog"],
    ["--muted-foreground", "--card", "a field label on a card"],
    ["--foreground", "--popover", "a field value in the dialog"],
    ["--muted-foreground", "--background", "the confidentiality notice"],
  ];

  it.each(PAIRS)("%s on %s — %s", (fg, bg) => {
    expect(t[fg], `${fg} missing from :root`).toBeTruthy();
    expect(t[bg], `${bg} missing from :root`).toBeTruthy();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(AA);
  });

  it("the section rule is visible as a cue, not only as decoration", () => {
    // 1.4.11, not 1.4.3: the rule carries no text. It is the only brand-red thing on the sheet
    // and the thing that makes a section scannable, so it has to clear the graphical bar.
    expect(contrast(t["--primary"], t["--background"])).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrast(t["--primary"], t["--popover"])).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("the document on paper — computed from the hex, because there are no tokens there", () => {
  const ink = hexToHslTriplet(BRAND_INK);
  const red = hexToHslTriplet(BRAND_RED);
  /** The two greys the print stylesheet uses, read out of it rather than restated here. */
  const muted = hexToHslTriplet("#5A6470");
  const rule = hexToHslTriplet("#C9CFD8");

  it("uses exactly the greys asserted below — read from the stylesheet, not assumed", () => {
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("#5A6470");
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("#C9CFD8");
  });

  it("body text on white clears AA with room to spare", () => {
    expect(contrast(ink, PAPER)).toBeGreaterThanOrEqual(AA);
  });

  it("a field LABEL on white clears AA — the smallest text on the sheet", () => {
    // 9.5pt Slate. This is the size and weight a 78-year-old reads a photocopy of, so it is the
    // pair most worth being sure about.
    expect(contrast(muted, PAPER)).toBeGreaterThanOrEqual(AA);
  });

  it("the footer notice on white clears AA at 8pt", () => {
    expect(contrast(muted, PAPER)).toBeGreaterThanOrEqual(AA);
  });

  it("the red section rule clears the non-text bar on white", () => {
    expect(contrast(red, PAPER)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the hairline borders are deliberately BELOW the text bar, and are never text", () => {
    // #C9CFD8 is a 1px separator around a note box and under the meta line. Recorded rather
    // than silently exempt: if a future change puts words in that colour, this says it must not.
    expect(contrast(rule, PAPER)).toBeLessThan(AA_NON_TEXT);
    expect(MEMBER_DOCUMENT_PRINT_CSS).not.toMatch(/color:#C9CFD8/);
  });
});
