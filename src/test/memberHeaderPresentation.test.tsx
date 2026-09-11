// @vitest-environment jsdom
//
// THE MEMBER RECORD'S HEADER — a raw enum on 431 records, and a phone that scrolled sideways.
//
// Two defects, both found by looking at the page rather than by a failing test:
//
//   · THE STATUS CHIP rendered `pending_review`. The switch behind it ended
//     `default: return <Badge variant="outline">{status}</Badge>`, and `pending_review` is
//     exactly what the CRM import writes — so the commonest state in the members table was
//     shown to staff as a database value. A `default` that renders its own input is the shape
//     of that bug, and the fix is a keyed map with no default at all.
//   · THE ACTION ROW could not wrap. At 390px four buttons pushed the document 325px wider
//     than the viewport and the whole record scrolled sideways.

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

import {
  MEMBER_STATUS_PRESENTATION,
  memberStatusPresentation,
  type MemberStatus,
} from "@/lib/statusLabel";
import { contrast, hexToHsl, tokensFor } from "./helpers/contrast";
import { stripComments } from "./helpers/stripComments";
import enLocale from "@/i18n/locales/en.json";
import esLocale from "@/i18n/locales/es.json";
import nlLocale from "@/i18n/locales/nl.json";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const header = () => read("src/components/admin/member-detail/MemberHeader.tsx");

/** The four the database can actually hold, read off the generated types rather than retyped. */
const ENUM_VALUES = (() => {
  const types = read("src/integrations/supabase/types.ts");
  const m = types.match(/member_status:\s*\[([^\]]+)\]/);
  expect(m, "member_status enum missing from the generated types").toBeTruthy();
  return m![1].split(",").map((v) => v.trim().replace(/^"|"$/g, "")).filter(Boolean);
})();

afterEach(() => cleanup());

describe("the status mapping", () => {
  it("names every status the database can hold, derived from the enum not from memory", () => {
    /*
      Derived rather than pinned: a hand-written list of four is a list that is still four after
      somebody adds a fifth. TypeScript's Record already fails the BUILD in that case; this
      fails the TEST, with the missing name on screen.
    */
    expect(Object.keys(MEMBER_STATUS_PRESENTATION).sort()).toEqual([...ENUM_VALUES].sort());
    expect(ENUM_VALUES).toContain("pending_review");
  });

  it("never renders the raw enum — not even for a value the enum has dropped", () => {
    for (const status of ENUM_VALUES) {
      const p = memberStatusPresentation(status);
      expect(p.fallback, status).not.toBe(status);
      expect(p.fallback, status).not.toMatch(/_/);
    }
    // A row written before an enum change, or a null column.
    for (const odd of ["member_status_v2", "", null, undefined]) {
      const p = memberStatusPresentation(odd);
      expect(p.fallback).toBe("Unknown status");
      expect(p.fallback).not.toBe(odd);
    }
  });

  it("has no `cancelled`, because a member cannot be cancelled", () => {
    /*
      The brief asked for "cancelled → muted red outline". `cancelled` is a `subscription_status`
      — a different fact about a different row, rendered by a different chip. A case here would
      be a branch nothing can reach and an implication that is false. Recorded, not invented.
    */
    expect(ENUM_VALUES).not.toContain("cancelled");
    expect(Object.keys(MEMBER_STATUS_PRESENTATION)).not.toContain("cancelled");
  });

  it("keeps red out of it — R1 rations the alarm colour", () => {
    const brand = tokensFor(":root")["--primary"];
    for (const [status, p] of Object.entries(MEMBER_STATUS_PRESENTATION)) {
      expect(p.className, status).not.toContain("destructive");
      expect(p.className, status).not.toContain("--primary");
      expect(p.className, status).not.toMatch(/\bbg-red-/);
    }
    // And the header no longer reaches for it either. `suspended` used to be variant destructive.
    expect(stripComments(header())).not.toContain('variant="destructive"');
    expect(brand).toBeTruthy();
  });

  it("marks the one that needs somebody to act, and only that one", () => {
    // pending_review is an imported client the platform has never billed. Amber is the point of
    // the chip; if everything is amber, nothing is.
    const amber = Object.entries(MEMBER_STATUS_PRESENTATION)
      .filter(([, p]) => p.className.includes("amber"))
      .map(([k]) => k);
    expect(amber).toEqual(["pending_review"]);
  });

  it("keeps every chip at AA, by the same maths the tokens are checked with", () => {
    // Tailwind palette values, so the hex is converted rather than the contrast duplicated.
    const SCALE: Record<string, string> = {
      "emerald-100": "#d1fae5", "emerald-900": "#064e3b",
      "amber-100": "#fef3c7", "amber-900": "#78350f",
      "slate-200": "#e2e8f0", "slate-800": "#1e293b",
    };
    for (const [status, p] of Object.entries(MEMBER_STATUS_PRESENTATION)) {
      const bg = p.className.match(/bg-([a-z]+-\d+)/)?.[1];
      const fg = p.className.match(/text-([a-z]+-\d+)/)?.[1];
      expect(bg, `${status} has no background`).toBeTruthy();
      expect(fg, `${status} has no text colour`).toBeTruthy();
      expect(SCALE[bg!], `${bg} not in the checked scale`).toBeTruthy();
      expect(SCALE[fg!], `${fg} not in the checked scale`).toBeTruthy();
      expect(contrast(hexToHsl(SCALE[fg!]), hexToHsl(SCALE[bg!])), status).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("writes its classes as whole literals, or Tailwind drops them from the build", () => {
    /*
      A class assembled at runtime (`bg-${colour}-100`) is invisible to Tailwind's scanner, so
      it is not emitted — an unstyled chip in production and a perfectly green test. Every class
      here must be a complete literal in the source.
    */
    const src = stripComments(read("src/lib/statusLabel.ts"));
    expect(src).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*(bg|text)-/);
    for (const p of Object.values(MEMBER_STATUS_PRESENTATION)) {
      for (const cls of p.className.split(" ")) {
        expect(src, cls).toContain(cls);
      }
    }
  });
});

describe("the translations", () => {
  const locales = { en: enLocale, es: esLocale, nl: nlLocale } as Record<string, Record<string, unknown>>;

  it("has a key for every status, in all three languages", () => {
    const keys = [
      ...Object.values(MEMBER_STATUS_PRESENTATION).map((p) => p.key),
      memberStatusPresentation(null).key,
      "memberStatus.hasPendant",
      "memberStatus.noPendant",
    ];
    for (const [lang, dict] of Object.entries(locales)) {
      const ns = dict.memberStatus as Record<string, string> | undefined;
      expect(ns, `${lang}.json has no memberStatus namespace`).toBeTruthy();
      for (const key of keys) {
        expect(ns![key.split(".")[1]], `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it("is actually translated, not English copied into es and nl", () => {
    /*
      `memberStatus` is a staff namespace, so localeParse's no-English rule does not cover it.
      Untranslated Spanish on the surface a Spanish call centre uses all day is worth its own
      assertion.
    */
    const en = enLocale.memberStatus as Record<string, string>;
    for (const lang of ["es", "nl"]) {
      const ns = locales[lang].memberStatus as Record<string, string>;
      const identical = Object.keys(en).filter((k) => ns[k] === en[k]);
      expect(identical, `${lang} left untranslated`).toEqual([]);
    }
  });
});

describe("what the header renders", () => {
  const src = () => stripComments(header());

  it("uses the mapping rather than a switch of its own", () => {
    expect(src()).toContain("memberStatusPresentation");
    // The switch is gone, not merely bypassed.
    expect(src()).not.toContain("getStatusBadge");
    expect(src()).not.toMatch(/case "active":/);
  });

  it("leaves NO second copy of the member-status switch anywhere", () => {
    /*
      The members list had the identical defect — no `pending_review` case, and a `default` that
      renders the enum — so all 431 imported members read `pending_review` there too. Fixing one
      and not the other is the drift this module exists to stop, so both are asserted.

      SubscriptionTab keeps its own switch and that is correct: it renders `subscription_status`,
      a different enum on a different row.
    */
    const list = stripComments(read("src/pages/admin/MembersPage.tsx"));
    expect(list).toContain("memberStatusPresentation");
    expect(list).not.toMatch(/case "suspended":/);
    expect(list).not.toMatch(/<Badge variant="outline">\{status\}<\/Badge>/);
  });

  it("lets the action row wrap, which is the 325px fix", () => {
    /*
      Asserted on the class, because the geometry itself is asserted in the browser
      (e2e/memberRecordVisual.spec.ts measures the document at 390). This is the half a unit
      test can hold: the row is allowed to become a column, and the buttons inside it are
      allowed to wrap.
    */
    const s = src();
    expect(s).toMatch(/flex flex-col items-start justify-between gap-3 lg:flex-row/);
    expect(s).toContain("flex flex-wrap items-center gap-2");
    expect(s).not.toMatch(/<div className="flex items-start justify-between">/);
  });

  it("tints the avatar with tokens NEITHER THEME can shadow", () => {
    /*
      THE BUG THIS TEST DID NOT CATCH THE FIRST TIME, kept because it is the more useful half.

      The obvious implementation is `bg-accent text-accent-foreground` — a shared token pair
      that is a red wash at :root and passes 8.15:1 there. This component renders inside
      .theme-staff and .theme-admin, and BOTH replace --accent with a warm sand and
      --accent-foreground with near-black ink. So the disc shipped beige, and the first version
      of this assertion was green because it read the :root block.

      It is #291's mistake in a new place: reaching for a shared token whose value the surface
      has already replaced. The fix is dedicated tokens, and the test now checks the surfaces
      the component is on rather than the block the token happens to be declared in.
    */
    const s = src();
    expect(s).toContain("bg-[hsl(var(--member-avatar))]");
    expect(s).not.toContain("bg-accent");

    const root = tokensFor(":root");
    expect(contrast(root["--member-avatar-foreground"], root["--member-avatar"]))
      .toBeGreaterThanOrEqual(4.5);

    // Neither theme may redefine them, or the disc silently becomes whatever that theme says.
    for (const theme of [".theme-staff", ".theme-admin"]) {
      const t = tokensFor(theme);
      expect(t["--member-avatar"], theme).toBeUndefined();
      expect(t["--member-avatar-foreground"], theme).toBeUndefined();
      // And the trap itself, recorded: these ARE shadowed, which is why they are not used.
      expect(t["--accent"], theme).toBeDefined();
      expect(t["--accent"], theme).not.toBe(root["--accent"]);
    }
  });

  it("makes the pendant chip neutral with an icon, not a second green status", () => {
    /*
      It was the same green as an active membership, on a different KIND of fact — two unrelated
      chips reading as one status. Whether a pendant is on file is inventory, not health.
    */
    const s = src();
    expect(s).toContain("ShieldCheck");
    expect(s).not.toMatch(/Has Pendant[\s\S]{0,200}alert-resolved/);
    expect(s).not.toContain("bg-alert-resolved/10");
  });

  it("leaves the contact rows as text — no new wire", () => {
    // The brief says "phone clickable as it is today". Today it is not a link, and turning it
    // into one would add a control the wiring register has never been told about. Unchanged.
    const s = src();
    expect(s).not.toContain("href={`tel:");
    expect(s).toContain("<Mail");
    expect(s).toContain("<Phone");
    expect(s).toContain("<MapPin");
  });
});

describe("the chip in a real render", () => {
  vi.mock("@/hooks/useMemberAvatar", () => ({ useMemberAvatarUrl: () => ({ data: null }) }));
  vi.mock("@/components/admin/member-detail/MemberOverviewDialog", () => ({
    MemberOverviewDialog: () => null,
  }));
  vi.mock("@/components/admin/member-detail/MemberMissingInfoDialog", () => ({
    MemberMissingInfoDialog: () => null,
  }));
  vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
  }));

  it("says 'Pending review', not 'pending_review'", async () => {
    const { MemberHeader } = await import("@/components/admin/member-detail/MemberHeader");
    render(
      <MemberHeader
        member={{
          id: "m1",
          first_name: "Ana",
          last_name: "Alpha",
          email: "a@example.com",
          phone: "+34600000001",
          photo_url: null,
          address_line_1: "Calle Mayor 14",
          address_line_2: null,
          city: "Albox",
          province: "Almería",
          status: "pending_review" as MemberStatus,
          nie_dni: null,
          preferred_language: "es",
        }}
        subscription={null}
        hasDevice={false}
        onEdit={() => {}}
        onSuspend={() => {}}
        onDelete={() => {}}
      />,
    );
    const chip = screen.getByTestId("member-status-chip");
    expect(chip.textContent).toBe("Pending review");
    expect(chip.textContent).not.toContain("_");
    expect(screen.getByTestId("member-pendant-chip").textContent).toContain("No pendant");
    // The initials disc carries the brand tint rather than the default grey.
    expect(screen.getByText("AA").className).toContain("bg-[hsl(var(--member-avatar))]");
  });
});
