import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GlobalSearchMount } from "@/components/GlobalSearchMount";

// The palette reads the signed-in identity to decide what it may search. Mocked
// rather than provided, so these assertions are about the LAZY MOUNT and not
// about the auth stack — a signed-out visitor is the case that matters here
// anyway, and it is the one that must load nothing.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, isStaff: false, isPartner: false, memberId: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/*
  The palette is substituted for a marker. The real one reaches cmdk, two dozen
  icons and four Supabase searches, and evaluating that graph under jsdom is not
  what any assertion in this file is about — what is, is that the mount holds the
  shortcut, arms on it, and hands `defaultOpen` over.
*/
vi.mock("@/components/GlobalSearch", () => ({
  GlobalSearch: ({ defaultOpen }: { defaultOpen?: boolean }) => (
    <div data-testid="palette">{defaultOpen ? "open" : "closed"}</div>
  ),
}));

const mount = () =>
  render(
    <MemoryRouter>
      <GlobalSearchMount />
    </MemoryRouter>,
  );

/**
 * WHAT EVERY VISITOR DOWNLOADS BEFORE ANYTHING PAINTS.
 *
 * `docs/perf/BASELINE.md` measured a 428 KB gz shell on all 36 routes, against
 * page chunks of 2-115 KB. The cause was not subtle and it will come back the
 * same way: somebody adds a convenient top-level `import` in `App.tsx` for
 * something only one surface renders, and the whole tree behind it joins the
 * entry chunk for everybody.
 *
 * A byte budget alone would catch the size but not the cause, and only in the CI
 * job that runs a build. These assertions catch the CAUSE, in the unit suite, in
 * milliseconds — and they name the specific regression rather than a number
 * somebody will raise.
 */

const SRC = path.resolve(__dirname, "../..");
const APP = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");

/** A `import { X } from "…"` at the top level — the kind that is never lazy. */
function staticallyImports(source: string, specifier: string): boolean {
  const re = new RegExp(
    `^import\\s[^;]*?from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "m",
  );
  return re.test(source);
}

describe("the entry chunk carries only what every visitor needs", () => {
  const AUTHENTICATED_LAYOUTS = [
    "AdminLayout",
    "CallCentreLayout",
    "ClientLayout",
    "PartnerLayout",
  ];

  it.each(AUTHENTICATED_LAYOUTS)(
    "does not statically import %s — no signed-out visitor renders one",
    (layout) => {
      expect(
        staticallyImports(APP, `@/components/layout/${layout}`),
        `App.tsx statically imports ${layout}. That puts it, and everything it reaches, in ` +
          `the entry chunk every visitor downloads. CallCentreLayout is the worst of them: ` +
          `it reaches useTwilioDevice, so a static import ships the Twilio Voice SDK to ` +
          `somebody reading the pricing page on their phone.`,
      ).toBe(false);
    },
  );

  it.each(AUTHENTICATED_LAYOUTS)("loads %s lazily instead", (layout) => {
    expect(APP).toContain(`import("@/components/layout/${layout}")`);
  });

  it("keeps PublicThemeLayout EAGER, because the public routes are the cold first visit", () => {
    // The one layout that must NOT be lazy: making it so would add a round trip
    // to the exact path this whole change exists to speed up.
    expect(staticallyImports(APP, "@/components/layout/PublicThemeLayout")).toBe(true);
  });

  it("does not statically import the Cmd+K palette", () => {
    expect(
      staticallyImports(APP, "@/components/GlobalSearch"),
      "GlobalSearch is ~500 lines reaching cmdk, two dozen icons and four Supabase " +
        "searches, and its results are gated on isStaff. Mount it through " +
        "GlobalSearchMount so it loads on the first Cmd+K instead.",
    ).toBe(false);
    expect(APP).toContain("GlobalSearchMount");
  });
});

describe("GlobalSearchMount — lazy, but the shortcut still works", () => {
  it("renders nothing at all until somebody presses Cmd+K", () => {
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("ignores a bare k, so typing a letter never fetches the chunk", async () => {
    const { container } = mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("mounts the palette on Cmd+K, and hands it over ALREADY OPEN", async () => {
    /*
      The trap: the palette's own keydown listener lives INSIDE the palette, so a
      component mounted BY the keypress cannot have heard it. Without
      `defaultOpen`, the first Cmd+K would fetch the chunk and show nothing, and
      the user would have to press it twice — a regression that looks like the
      shortcut being flaky rather than like a code-splitting mistake.

      The real palette is substituted here because it is 500 lines over cmdk and
      four Supabase searches, none of which this assertion is about. What is
      under test is the HANDOVER: that the shortcut arms the mount, and that the
      mount passes `defaultOpen`.
    */
    mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(await screen.findByTestId("palette")).toHaveTextContent("open");
  });

  it("arms on Ctrl+K too, for everybody not on a Mac", async () => {
    mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(await screen.findByTestId("palette")).toBeInTheDocument();
  });
});

describe("GlobalSearch itself honours defaultOpen", () => {
  it("starts closed by default, so no other caller changes behaviour", () => {
    const source = fs.readFileSync(path.join(SRC, "components/GlobalSearch.tsx"), "utf8");
    expect(source).toMatch(/defaultOpen\s*=\s*false/);
    expect(source).toContain("useState(defaultOpen)");
  });
});

describe("the wiring inventory follows a lazy import with a .then unwrap", () => {
  it("recognises both shapes, so splitting code cannot delete rows from the register", () => {
    // When the layouts stopped being statically imported, the inventory walker
    // stopped seeing them — and every wire reachable only through a layout
    // vanished from that surface's section of WIRING_REGISTER.md. A register
    // that loses rows when code is split is worse than no register, because the
    // rows it still shows look complete.
    const inventory = fs.readFileSync(
      path.resolve(__dirname, "../../../scripts/wiring/inventory.mjs"),
      "utf8",
    );
    const pattern = /const \(\\w\+\) = lazyWithRetry\\\(\\s\*\\\(\\\)\\s\*=>\\s\*import/;
    expect(
      pattern.test(inventory),
      "inventory.mjs must match a lazyWithRetry import WITHOUT requiring the call to " +
        "close immediately after it, or the `.then((m) => ({ default: m.X }))` form " +
        "used by every named export goes unseen.",
    ).toBe(true);
  });
});
