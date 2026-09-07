/**
 * GOALS.md G3: "WCAG AA is the MINIMUM… The bar is 'could a 75-year-old use this unaided'."
 *
 * portalTheme.test.ts has guarded the four LOGGED-IN portal themes since the rebrand. The base
 * `:root` palette had no such guard — and that is the palette behind the public site, the join
 * wizard and every alert badge in the product. So the surface a family first meets, and the
 * badge that says a fall was detected, were the two nobody was checking.
 *
 * WHAT THIS FOUND, measured not assumed:
 *
 *   --alert-fall-foreground on --alert-fall     2.79:1   below even the 3:1 large-text floor
 *   --alert-resolved-foreground on --alert-resolved  3.33:1
 *   --destructive-foreground on --destructive   3.78:1
 *   --alert-checkin-foreground on --alert-checkin    3.80:1
 *   --alert-sos-foreground on --alert-sos       4.20:1
 *   --muted-foreground on --muted               4.45:1
 *
 * All six are white-or-near-white text on a saturated fill, rendered by <Badge> — small text,
 * so AA 4.5:1 is the applicable bar, not the 3:1 large-text one.
 *
 * WHAT WAS FIXED HERE, AND WHAT WAS NOT. `--alert-fall` was the only one failing every bar, and
 * it is fixed by darkening the FOREGROUND — the orange is untouched, so the operator's colour
 * cue is unchanged, and it follows the treatment --alert-battery already uses on the
 * neighbouring hue. The other five need either a darker fill (which changes a safety colour) or
 * larger/bolder badge text. Both are design decisions on alert UI, both carry the human gate in
 * CLAUDE.md, and neither is being made silently inside a test PR.
 *
 * So they are RATCHETED, not blessed: each is pinned at the value measured today, the suite
 * fails if any regresses, and KNOWN_SHORTFALL is asserted to be exactly this set — a sixth
 * sub-AA pair cannot appear without someone editing this list, which is a visible act in a
 * diff. That is the difference between recording a debt and hiding one.
 */
import { describe, it, expect } from "vitest";
import { contrast, tokensFor } from "./helpers/contrast";

const AA = 4.5;
const t = tokensFor(":root");

/** [foreground, background, what a user is reading] */
type Pair = [string, string, string];

const AT_AA: Pair[] = [
  ["--foreground", "--background", "body text on the page"],
  ["--card-foreground", "--card", "text on a card"],
  ["--popover-foreground", "--popover", "text in a popover"],
  ["--primary-foreground", "--primary", "text on a primary button"],
  ["--secondary-foreground", "--secondary", "text on a secondary button"],
  ["--accent-foreground", "--accent", "text on the accent wash"],
  ["--muted-foreground", "--background", "muted helper text on the page"],
  ["--alert-battery-foreground", "--alert-battery", "the battery badge"],
  // Fixed in this change: was 2.79 with a white foreground.
  ["--alert-fall-foreground", "--alert-fall", "the FALL DETECTED badge"],
];

/**
 * Pairs that do NOT clear AA today, pinned at what they actually measure. Ratchet only:
 * raising a value here is a fix, lowering it is a regression the suite refuses.
 */
const KNOWN_SHORTFALL: Record<string, number> = {
  "--alert-resolved-foreground on --alert-resolved": 3.33,
  "--destructive-foreground on --destructive": 3.78,
  "--alert-checkin-foreground on --alert-checkin": 3.8,
  "--alert-sos-foreground on --alert-sos": 4.2,
  "--muted-foreground on --muted": 4.45,
};

describe("the public palette clears WCAG AA where it can", () => {
  it.each(AT_AA)("%s on %s — %s", (fg, bg) => {
    expect(t[fg], `${fg} missing from :root`).toBeTruthy();
    expect(t[bg], `${bg} missing from :root`).toBeTruthy();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(AA);
  });

  it("the FALL badge is legible — the one that was failing every bar", () => {
    // Named separately because it is the regression this file exists to prevent: a badge
    // telling somebody a fall was detected, at 2.79:1.
    expect(contrast(t["--alert-fall-foreground"], t["--alert-fall"])).toBeGreaterThanOrEqual(AA);
  });

  it("and the fix darkened the TEXT, not the orange — the colour cue is unchanged", () => {
    expect(t["--alert-fall"], "the fill must stay the orange operators recognise").toBe("25 95% 53%");
  });
});

describe("the sub-AA pairs are a recorded debt, not a moving one", () => {
  it.each(Object.entries(KNOWN_SHORTFALL))("%s does not get worse than %s:1", (key, pinned) => {
    const [fg, bg] = key.split(" on ");
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(pinned - 0.01);
  });

  it("every pinned pair is genuinely still below AA — a fixed one must leave this list", () => {
    // Without this, a pair could be fixed and then silently re-broken back down to its pin.
    const stillShort = Object.keys(KNOWN_SHORTFALL).filter((key) => {
      const [fg, bg] = key.split(" on ");
      return contrast(t[fg], t[bg]) < AA;
    });
    expect(
      stillShort.sort(),
      "a pair here now clears AA: move it into AT_AA rather than leaving it pinned low"
    ).toEqual(Object.keys(KNOWN_SHORTFALL).sort());
  });

  it("NO OTHER text pair in :root is below AA — a sixth cannot appear unnoticed", () => {
    // The control that makes the list a ratchet instead of a hiding place. Every *-foreground
    // token is paired with its base and checked; anything sub-AA must either be fixed or
    // deliberately added above, which is visible in a diff.
    const offenders: string[] = [];
    for (const token of Object.keys(t)) {
      if (!token.endsWith("-foreground")) continue;
      const base = token.replace(/-foreground$/, "");
      if (!t[base]) continue;
      const key = `${token} on ${base}`;
      if (key in KNOWN_SHORTFALL) continue;
      const ratio = contrast(t[token], t[base]);
      if (ratio < AA) offenders.push(`${key} = ${ratio.toFixed(2)}`);
    }
    expect(offenders, `sub-AA pairs not in KNOWN_SHORTFALL: ${offenders.join(", ")}`).toEqual([]);
  });
});
