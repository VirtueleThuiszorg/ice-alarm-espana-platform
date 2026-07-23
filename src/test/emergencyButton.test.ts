/**
 * WP-D (STAGE_SOS_FIX.md) — the "Call Emergency Services" quick action.
 *
 * Before WP-D this was a destructive-styled BUTTON WITH NO HANDLER on the live
 * alerts queue — a life-safety-labelled control that did nothing. Lee's
 * decision: tel:112 tap-to-dial, keep the button, and show the number itself
 * so operators on non-dialer devices can read it and dial on a desk phone.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/pages/call-centre/CallCentreDashboard.tsx"),
  "utf8",
);

describe("WP-D — emergency quick action is real", () => {
  it("is a tel:112 link (tap-to-dial)", () => {
    expect(source).toMatch(/callEmergency[\s\S]{0,400}/); // key still rendered
    expect(source).toMatch(/<a href="tel:112">[\s\S]{0,300}?callEmergency/);
  });

  it("displays the number 112 visibly (non-dialer fallback)", () => {
    expect(source).toMatch(/callEmergency[\s\S]{0,300}?>112</);
  });

  it("no longer renders the dead no-handler emergency button", () => {
    // The old shape: a destructive Button wrapping the callEmergency label with
    // neither asChild+anchor nor onClick.
    const dead = /<Button variant="destructive"[^>]*>\s*<PhoneCall[^>]*\/>\s*\{t\("callCentre\.quickActions\.callEmergency"\)\}\s*<\/Button>/;
    expect(source).not.toMatch(dead);
  });
});
