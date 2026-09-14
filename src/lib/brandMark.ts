/**
 * THE MARK'S GEOMETRY, IN ONE PLACE — because it is now drawn twice.
 *
 * `Logo` renders it as JSX for the screen. The printed member record needs the same shield in a
 * standalone HTML document that has no React and cannot reference an app asset (the print frame
 * is written with `document.write`; a `<img src="/icon.svg">` would either 404 or race the print
 * dialog and come out blank). So the printer needs the SVG as a STRING.
 *
 * Two copies of a path `d` attribute is exactly the kind of duplication that rots silently: the
 * shield would be retouched on screen and the printed record would keep the old one for months,
 * and nobody would notice because the two are never seen side by side. So the coordinates live
 * here and both consumers import them.
 *
 * `public/icon.svg` remains the canonical vector source for the raster icon set; these constants
 * must stay in step with it, as they did when they lived in `logo.tsx`.
 */

/** The shield body. One closed path, so the mark engraves and embroiders in a single pass. */
export const SHIELD_PATH =
  "M50 7 L87 21 V50 C87 71.5 71 87.5 50 93.5 C29 87.5 13 71.5 13 50 V21 Z";

/** The heartbeat, knocked out of the shield rather than drawn over it. */
export const HEARTBEAT_PATH = "M25 52 H37 L43 38 L52 66 L58 52 H75";

/**
 * ICE Red and Ink as literal hex.
 *
 * The app's tokens are HSL triples in `index.css`, resolved by Tailwind at render time. The print
 * document is a separate `<html>` with its own `<style>`: no Tailwind, no `:root`, nothing to
 * resolve `hsl(var(--primary))` against. Hex here is not a second palette — it is the same two
 * colours (`#C8102E` = hsl(350 85% 42%), `#14181F` = hsl(218 22% 10%)) written in the only form
 * the print document can read. `brandMark.test.ts` asserts they match the tokens.
 */
export const BRAND_RED = "#C8102E";
export const BRAND_INK = "#14181F";

export interface BrandMarkOptions {
  /** Rendered width and height in the document's units. */
  size: number;
  /** The shield's fill. Defaults to ICE Red. */
  shield?: string;
  /** The heartbeat stroke — the ground colour showing through. Defaults to white. */
  beat?: string;
}

/**
 * The mark as a standalone SVG string, for documents that cannot run React.
 *
 * `aria-hidden` rather than `role="img"`: in the print document the wordmark sits beside it in
 * real text, so a screen reader announcing "ICE Alarm España" twice is worse than once.
 */
export function brandMarkSvg({ size, shield = BRAND_RED, beat = "#FFFFFF" }: BrandMarkOptions) {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<path d="${SHIELD_PATH}" fill="${shield}"/>` +
    `<path d="${HEARTBEAT_PATH}" fill="none" stroke="${beat}" stroke-width="7" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
