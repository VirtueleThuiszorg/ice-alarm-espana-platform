// @vitest-environment jsdom
//
// THE TWELVE TABS ON THE MEMBER RECORD — the second answer, and why the first one was wrong.
//
// #291 painted all twelve solid brand red. Every state passed AA and the tests below were green,
// which is the point worth remembering: the defect it left was not a contrast failure, it was
// spending the alarm colour on navigation. MEMBER_UX_RULES R1 reserves red for alarm and
// critical actions, and a filing screen whose loudest element is its tab row has quietly
// devalued the colour that has to mean "emergency" everywhere else in the product.
//
// So red appears exactly ONCE on this bar. These tests hold that count at one, hold the scope
// shut, and hold the palette to the same contrast bar as the rest of the design system.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MEMBER_RECORD_TABS,
  MEMBER_TAB_LIST_CLASS,
  MEMBER_TAB_TRIGGER_CLASS,
} from "@/components/admin/member-detail/memberRecordTabs";
import { contrast, tokensFor, css } from "./helpers/contrast";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

afterEach(() => cleanup());

describe("the palette", () => {
  const tokens = tokensFor(":root");
  const strip = () => tokens["--member-tab-strip"];

  it("keeps the resting label at AA on the strip — and is NOT --muted-foreground, which fails", () => {
    /*
      This is the one that would have shipped broken by looking obviously right. The strip is
      --muted and the label is a muted label, so aliasing --muted-foreground is the natural
      move. It is 4.45:1 — under AA by five hundredths, on the resting state of all twelve.
    */
    expect(contrast(tokens["--member-tab-fg"], strip())).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["--muted-foreground"], strip())).toBeLessThan(4.5);
    expect(tokens["--member-tab-fg"]).not.toBe(tokens["--muted-foreground"]);
  });

  it("keeps the active label at AA on both surfaces it can sit on", () => {
    for (const bg of [strip(), tokens["--member-tab-surface"]]) {
      expect(contrast(tokens["--member-tab-fg-active"], bg), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the hover surface readable too — a hover state is not exempt", () => {
    expect(contrast(tokens["--member-tab-fg-active"], tokens["--member-tab-hover"]))
      .toBeGreaterThanOrEqual(4.5);
  });

  it("IS the app-icon red on the underline — aliased, not re-typed", () => {
    // A future change to the brand hue must not leave this underline behind on the old one.
    expect(tokens["--member-tab-underline"]).toBe(tokens["--primary"]);
    // Non-text, so the bar is 3:1 (WCAG 1.4.11) — it clears the text bar anyway.
    expect(contrast(tokens["--member-tab-underline"], tokens["--member-tab-surface"]))
      .toBeGreaterThanOrEqual(3);
  });

  it("proves the white active tab CANNOT be the signal on its own", () => {
    /*
      1.10:1. This is why the underline, the shadow and the weight change are not decoration —
      delete them and there is no way to tell which tab you are on. Asserted so that a future
      tidy-up which removes "the redundant cues" fails here with the number in front of it.
    */
    expect(contrast(tokens["--member-tab-surface"], strip())).toBeLessThan(1.5);
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("data-[state=active]:after:bg-[hsl(var(--member-tab-underline))]");
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("data-[state=active]:font-semibold");
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("data-[state=active]:shadow-sm");
  });

  it("carries the brand red exactly once, and nowhere in the resting state", () => {
    /*
      THE WHOLE POINT OF THIS PR, as an assertion rather than a claim. One reference to the red
      token in the trigger class, and it is behind data-[state=active].
    */
    const reds = MEMBER_TAB_TRIGGER_CLASS.match(/--member-tab-underline/g) ?? [];
    expect(reds).toHaveLength(1);

    const resting = MEMBER_TAB_TRIGGER_CLASS.split(" ")
      .filter((c) => !c.startsWith("data-[state=active]:"));
    expect(resting.join(" ")).not.toContain("--member-tab-underline");
    expect(resting.join(" ")).not.toContain("--primary");
  });

  it("has no red left in the tab tokens themselves except the underline", () => {
    // The old set was four red tokens; three of them are gone rather than left dangling.
    for (const dead of ["--member-tab", "--member-tab-foreground", "--member-tab-active"]) {
      expect(tokens[dead], dead).toBeUndefined();
    }
    // Everything still named --member-tab-* that is NOT the underline is a neutral: a hue in
    // the blue-grey family the rest of the chrome uses, at low saturation. The underline is the
    // single exception, and naming it here is what makes "exactly one red" checkable.
    const named = Object.keys(tokens).filter((k) => k.startsWith("--member-tab")).sort();
    expect(named).toEqual([
      "--member-tab-fg",
      "--member-tab-fg-active",
      "--member-tab-hover",
      "--member-tab-strip",
      "--member-tab-surface",
      "--member-tab-underline",
    ]);

    const saturation = (v: string) => Number(v.match(/[\d.]+\s+([\d.]+)%/)![1]);
    const coloured = named.filter((k) => saturation(tokens[k]) > 15);
    expect(coloured).toEqual(["--member-tab-underline"]);
  });

  it("does NOT touch the safety colours or the admin theme's Ink primary", () => {
    const admin = tokensFor(".theme-admin");
    expect(admin["--primary"]).toBe("218 22% 10%");
    expect(admin["--member-tab-strip"]).toBeUndefined();
    for (const key of Object.keys(tokens).filter((k) => k.startsWith("--member-tab"))) {
      expect(key, key).not.toMatch(/alert|status|destructive/);
    }
  });
});

describe("the variant is scoped to this page", () => {
  it("does not restyle the global Tabs component", () => {
    const ui = read("src/components/ui/tabs.tsx");
    expect(ui).not.toContain("member-tab");
  });

  it("is applied to all twelve triggers on the member record, and only there", () => {
    const page = read("src/pages/admin/MemberDetailPage.tsx");
    const triggers = [...page.matchAll(/<TabsTrigger value="([a-z]+)" className=\{MEMBER_TAB_TRIGGER_CLASS\}>/g)]
      .map((m) => m[1]);

    expect(triggers).toHaveLength(12);
    expect(triggers).toEqual([...MEMBER_RECORD_TABS]);
    expect(page).not.toMatch(/<TabsTrigger value="[a-z]+">/);

    const others = ["src/pages/client/ClientDashboard.tsx", "src/pages/admin/SettingsPage.tsx"];
    for (const path of others) {
      try {
        expect(read(path), path).not.toContain("MEMBER_TAB_TRIGGER_CLASS");
      } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") throw e;
      }
    }
  });

  it("scopes the strip rule to its own class, so no other scroller picks it up", () => {
    // `.member-tab-strip` and nothing broader. A rule that lost its prefix would hide the
    // scrollbar on every horizontal scroller in the product.
    expect(css).toContain(".member-tab-strip {");
    expect(css).not.toMatch(/^\s*\[class\*="overflow-x"\]/m);
  });
});

describe("what renders", () => {
  const renderTabs = () =>
    render(
      <Tabs defaultValue="profile">
        <TabsList className={MEMBER_TAB_LIST_CLASS}>
          {MEMBER_RECORD_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className={MEMBER_TAB_TRIGGER_CLASS}>
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>,
    );

  it("leaves every resting trigger neutral — no tab is painted red", () => {
    /*
      Split the class list on whitespace and drop the state-gated classes BEFORE looking for the
      red. A plain `not.toContain` on the whole string passes nothing: the resting classes and
      `data-[state=active]:after:bg-[hsl(var(--member-tab-underline))]` share the substring, so
      the assertion is true only about text and never about the tab.
    */
    renderTabs();
    const triggers = screen.getAllByRole("tab");
    expect(triggers).toHaveLength(12);
    for (const trigger of triggers) {
      expect(trigger.className, trigger.textContent ?? "").toContain("text-[hsl(var(--member-tab-fg))]");
      const resting = trigger.className
        .split(/\s+/)
        .filter((c) => !/^(data-\[state=active\]|hover|focus-visible|disabled):/.test(c));
      expect(resting.join(" "), trigger.textContent ?? "").not.toContain("--member-tab-underline");
    }
  });

  it("gives every tab a 44px tap target", () => {
    // Not a look. This row gets used on a phone during a courtesy call.
    renderTabs();
    for (const trigger of screen.getAllByRole("tab")) {
      expect(trigger.className).toContain("min-h-[44px]");
    }
  });

  it("marks the active tab, and only the active tab", () => {
    renderTabs();
    const triggers = screen.getAllByRole("tab");
    const active = triggers.filter((t) => t.getAttribute("data-state") === "active");
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe("profile");
  });

  it("gives the row a neutral strip and the scroll class, not a transparent band", () => {
    /*
      The bare class is checked as an exact member of the split list, not as a substring.
      `bg-[hsl(var(--member-tab-strip))]` contains the text "member-tab-strip", so a
      `toContain` on the whole string stays green with the scroll class deleted — which is the
      class that carries the entire edge fade.
    */
    renderTabs();
    const list = screen.getByRole("tablist");
    expect(list.className.split(/\s+/)).toContain("member-tab-strip");
    expect(list.className).toContain("bg-[hsl(var(--member-tab-strip))]");
    expect(list.className).toContain("overflow-x-auto");
  });

  it("keeps a visible keyboard focus ring, inset so the scroller cannot clip it", () => {
    /*
      An OFFSET ring — what this had before — is drawn outside the tab, and on the first tab of
      an overflow-x container that is exactly where the clipping edge is. Inset keeps it whole.
    */
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("focus-visible:ring-2");
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("focus-visible:ring-inset");
    expect(MEMBER_TAB_TRIGGER_CLASS).not.toContain("focus-visible:ring-offset-2");
  });
});

describe("the edge fade", () => {
  /*
    jsdom applies no stylesheet, so a render test can only prove the class is on the element.
    The rule is asserted against index.css itself — the same split #328 used. Either half alone
    passes while the feature is broken: the class with no rule, or the rule with nothing
    carrying it.
  */
  const rule = css.slice(css.indexOf(".member-tab-strip {"), css.indexOf(".member-tab-strip::-webkit-scrollbar"));

  it("only shows the fade when there is something to scroll to", () => {
    // The cover layers are `local` (they move with the content) and the shadows are `scroll`
    // (fixed to the box). Drop the covers and the fade is permanently on, dimming the first and
    // last tab on a screen where all twelve already fit.
    expect(rule).toContain("background-attachment: local, local, scroll, scroll;");
    expect(rule.match(/linear-gradient/g)).toHaveLength(4);
  });

  it("paints the covers in the strip's own colour, so they are invisible when at rest", () => {
    expect(rule).toContain("hsl(var(--member-tab-strip)) 40%");
  });

  it("hides the scrollbar in both engines, or the row changes height", () => {
    expect(rule).toContain("scrollbar-width: none;");
    expect(css).toContain(".member-tab-strip::-webkit-scrollbar");
  });
});
