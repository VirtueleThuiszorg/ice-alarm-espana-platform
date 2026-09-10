// @vitest-environment jsdom
//
// THE TWELVE TABS ON THE MEMBER RECORD — Lee's complaint, and the two ways of "fixing" it that
// would have been worse.
//
// The default `TabsList` renders an inactive trigger muted grey and the ACTIVE one white. On a
// twelve-tab row that reads as eleven disabled tabs and one gap.
//
// WORSE FIX 1: restyle `components/ui/tabs.tsx`. The same component renders the member portal's
// tabs, the public site's and every other admin screen's — one page's complaint would repaint
// all of them.
// WORSE FIX 2: use `bg-primary`. On `.theme-admin` --primary is INK, deliberately: red is
// rationed on the surface where an operator watches for emergencies. Using it would either
// produce black tabs, or require repealing that rule for every admin screen at once.
//
// So: a scoped token set and a class constant. These tests hold that scope shut, and hold the
// palette to the same contrast bar as the rest of the design system.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MEMBER_RECORD_TABS,
  MEMBER_TAB_LIST_CLASS,
  MEMBER_TAB_TRIGGER_CLASS,
} from "@/components/admin/member-detail/memberRecordTabs";
import { contrast, tokensFor } from "./helpers/contrast";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const WHITE = "0 0% 100%";

afterEach(() => cleanup());

describe("the palette", () => {
  const tokens = tokensFor(":root");

  it("IS the app-icon red — the same triplet as the brand primary, aliased not re-typed", () => {
    /*
      "Use the existing brand red token, not a new hex." Aliasing rather than copying is what
      stops a future change to the brand hue leaving these twelve tabs behind on the old one.
    */
    expect(tokens["--member-tab"]).toBe(tokens["--primary"]);
    expect(tokens["--member-tab"]).toBe("350 85% 42%");
  });

  it("keeps white text at WCAG AA on every state", () => {
    for (const state of ["--member-tab", "--member-tab-active", "--member-tab-hover"] as const) {
      expect(contrast(tokens[state], WHITE), state).toBeGreaterThanOrEqual(4.5);
    }
    expect(tokens["--member-tab-foreground"]).toBe(WHITE);
  });

  it("goes DARKER for active and hover, never grey", () => {
    // Turning grey is exactly what the default does and exactly what Lee is correcting.
    const lightness = (v: string) => Number(v.match(/([\d.]+)%$/)![1]);
    const saturation = (v: string) => Number(v.match(/[\d.]+\s+([\d.]+)%/)![1]);

    expect(lightness(tokens["--member-tab-active"])).toBeLessThan(lightness(tokens["--member-tab"]));
    expect(lightness(tokens["--member-tab-hover"])).toBeLessThan(lightness(tokens["--member-tab"]));
    // Same hue family, still saturated — a desaturated "darker" is grey by another name.
    for (const state of ["--member-tab-active", "--member-tab-hover"] as const) {
      expect(saturation(tokens[state]), state).toBeGreaterThan(50);
    }
  });

  it("does NOT touch the safety colours or the admin theme's Ink primary", () => {
    /*
      The rationing rule stands: this repaints twelve triggers on one page, not the surface an
      operator watches for emergencies.
    */
    const admin = tokensFor(".theme-admin");
    expect(admin["--primary"]).toBe("218 22% 10%");
    expect(admin["--member-tab"]).toBeUndefined();

    // The change adds exactly four tokens and redefines nothing. `portalTheme.test.ts` holds
    // the safety palette itself; this holds that this feature did not reach into it.
    const added = Object.keys(tokens).filter((k) => k.startsWith("--member-tab"));
    expect(added.sort()).toEqual([
      "--member-tab",
      "--member-tab-active",
      "--member-tab-foreground",
      "--member-tab-hover",
    ]);
    for (const key of added) {
      expect(key, key).not.toMatch(/alert|status|destructive/);
    }
  });
});

describe("the variant is scoped to this page", () => {
  it("does not restyle the global Tabs component", () => {
    const ui = read("src/components/ui/tabs.tsx");
    expect(ui).not.toContain("--member-tab");
    // The member portal and the public site render the same component; if this file carried the
    // red, their tabs would turn red too.
    expect(ui).not.toContain("member-tab");
  });

  it("is applied to all twelve triggers on the member record, and only there", () => {
    const page = read("src/pages/admin/MemberDetailPage.tsx");
    const triggers = [...page.matchAll(/<TabsTrigger value="([a-z]+)" className=\{MEMBER_TAB_TRIGGER_CLASS\}>/g)]
      .map((m) => m[1]);

    expect(triggers).toHaveLength(12);
    expect(triggers).toEqual([...MEMBER_RECORD_TABS]);
    // No trigger left behind on the default styling.
    expect(page).not.toMatch(/<TabsTrigger value="[a-z]+">/);

    // And no other page has picked the class up.
    const others = ["src/pages/client/ClientDashboard.tsx", "src/pages/admin/SettingsPage.tsx"];
    for (const path of others) {
      try {
        expect(read(path), path).not.toContain("MEMBER_TAB_TRIGGER_CLASS");
      } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") throw e;
      }
    }
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

  it("gives every trigger the red background, not just the active one", () => {
    renderTabs();
    const triggers = screen.getAllByRole("tab");
    expect(triggers).toHaveLength(12);
    for (const trigger of triggers) {
      expect(trigger.className, trigger.textContent ?? "").toContain("bg-[hsl(var(--member-tab))]");
      expect(trigger.className).toContain("text-[hsl(var(--member-tab-foreground))]");
    }
  });

  it("marks the active tab with THREE cues, not just a colour", () => {
    /*
      Darker red on red is 1.58:1. Somebody with reduced colour vision, or a screen in sunlight,
      would not be able to tell which tab they are on — so the active state also carries a white
      ring and an underline. WCAG 1.4.1.
    */
    renderTabs();
    const active = screen.getAllByRole("tab").find((t) => t.getAttribute("data-state") === "active")!;
    expect(active).toBeTruthy();
    expect(active.className).toContain("data-[state=active]:bg-[hsl(var(--member-tab-active))]");
    expect(active.className).toContain("data-[state=active]:ring-2");
    expect(active.className).toContain("data-[state=active]:underline");
  });

  it("never turns the active tab white or grey", () => {
    // The default variant does exactly that, and it is the complaint.
    expect(MEMBER_TAB_TRIGGER_CLASS).not.toMatch(/data-\[state=active\]:bg-(background|white|muted)/);
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("data-[state=active]:shadow-none");
  });

  it("keeps a visible keyboard focus ring, offset so it is not lost on red", () => {
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("focus-visible:ring-2");
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("focus-visible:ring-offset-2");
    // The ring token is ICE Red on the wash and is checked at 3:1 by portalTheme.test.ts; the
    // offset is what keeps it legible against a red tab rather than blending into it.
    expect(MEMBER_TAB_TRIGGER_CLASS).toContain("focus-visible:ring-[hsl(var(--ring))]");
  });

  it("drops the grey plate behind the row", () => {
    renderTabs();
    const list = screen.getByRole("tablist");
    expect(list.className).toContain("bg-transparent");
    expect(list.className).not.toContain("bg-muted");
  });
});
