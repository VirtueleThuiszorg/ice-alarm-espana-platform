/**
 * Pricing selection → join wizard deep link.
 *
 * The double-selection bug: /pricing (and the home + pendant pricing sections) asked for the
 * membership plan, then wizard step 1 asked again. The CTAs now carry the answer in the URL
 * and the wizard starts pre-selected, skipping step 1 when the plan is unambiguous.
 *
 * These are the rules the wizard's mount-time state depends on, so they are pinned here:
 * a valid plan skips step 1, a bogus param never pre-selects anything, and a billing period
 * on its own is not enough to skip (it is chosen on the review step, not step 1).
 */
import { describe, it, expect } from "vitest";
import { buildJoinPath, canSkipPlanStep, parseJoinSelection, resolveJoinEntry } from "@/lib/joinLink";

describe("buildJoinPath", () => {
  it("carries plan and billing period", () => {
    expect(buildJoinPath({ plan: "couple", billing: "annual" })).toBe("/join?plan=couple&billing=annual");
  });

  it("carries plan alone", () => {
    expect(buildJoinPath({ plan: "single" })).toBe("/join?plan=single");
  });

  it("falls back to the plain wizard entry when nothing was selected", () => {
    expect(buildJoinPath()).toBe("/join");
    expect(buildJoinPath({})).toBe("/join");
  });
});

describe("parseJoinSelection", () => {
  const parse = (query: string) => parseJoinSelection(new URLSearchParams(query));

  it("round-trips every card CTA the pricing surfaces can render", () => {
    for (const plan of ["single", "couple"] as const) {
      for (const billing of ["monthly", "annual"] as const) {
        const path = buildJoinPath({ plan, billing });
        expect(parse(path.split("?")[1])).toEqual({ plan, billing });
      }
    }
  });

  it("returns nothing for a bare /join", () => {
    expect(parse("")).toEqual({ plan: undefined, billing: undefined });
  });

  it("drops an unknown plan rather than pre-selecting it", () => {
    expect(parse("plan=enterprise&billing=annual")).toEqual({ plan: undefined, billing: "annual" });
  });

  it("drops an unknown billing period rather than pre-selecting it", () => {
    expect(parse("plan=single&billing=weekly")).toEqual({ plan: "single", billing: undefined });
  });

  it("ignores unrelated params (referral / utm links land on /join too)", () => {
    expect(parse("ref=ABC123&utm_source=fb")).toEqual({ plan: undefined, billing: undefined });
  });
});

describe("canSkipPlanStep", () => {
  it("skips step 1 once the plan arrived", () => {
    expect(canSkipPlanStep({ plan: "single" })).toBe(true);
    expect(canSkipPlanStep({ plan: "couple", billing: "annual" })).toBe(true);
  });

  it("does not skip on a billing period alone — step 1 asks for the plan", () => {
    expect(canSkipPlanStep({ billing: "annual" })).toBe(false);
  });

  it("does not skip with nothing selected", () => {
    expect(canSkipPlanStep({})).toBe(false);
  });
});

describe("resolveJoinEntry (wizard mount state)", () => {
  const entry = (query: string) => resolveJoinEntry(new URLSearchParams(query));

  it("starts on step 1 for a plain /join", () => {
    expect(entry("")).toEqual({ selection: { plan: undefined, billing: undefined }, planStepSkipped: false, initialStep: 1 });
  });

  it("starts on step 2 pre-selected when a pricing card carried the choice", () => {
    expect(entry("plan=couple&billing=annual")).toEqual({
      selection: { plan: "couple", billing: "annual" },
      planStepSkipped: true,
      initialStep: 2,
    });
  });

  it("still starts on step 1 when only the billing period came through", () => {
    expect(entry("billing=annual")).toEqual({
      selection: { plan: undefined, billing: "annual" },
      planStepSkipped: false,
      initialStep: 1,
    });
  });

  // The gateway sends the member back to /join?success=… — that path restores the saved
  // draft and jumps to confirmation, so re-applying a deep link there would clobber the
  // membership they actually paid for.
  it("ignores the deep link when returning from a successful checkout", () => {
    expect(entry("success=true&order=ICE-1&plan=single&billing=monthly")).toEqual({
      selection: {},
      planStepSkipped: false,
      initialStep: 1,
    });
  });

  it("ignores the deep link when returning from a cancelled checkout", () => {
    expect(entry("cancelled=true&plan=single")).toEqual({
      selection: {},
      planStepSkipped: false,
      initialStep: 1,
    });
  });
});
