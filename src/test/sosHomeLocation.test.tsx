/**
 * THE SOS CARD'S TWO LOCATIONS — rendered, and the rule re-proved through the components.
 *
 * `homeLocation.test.ts` proves the state machine as arithmetic. This proves the CARD obeys it,
 * which is a different claim: a correct rule rendered by a component that ignores it is the
 * defect an operator would actually meet.
 *
 * The three properties that matter, all asserted as negatives:
 *
 *   1. THE HOME PIN IS NEVER SHOWN IN PLACE OF A PENDANT FIX. Whenever a usable fix exists, the
 *      map is the fix — however old it is. Home appears beside it, never instead of it.
 *   2. THE LABEL NEVER LIES. "set by member on <date>" only appears for a pin a member really
 *      set. A geocoded or imported coordinate reads "not confirmed by the member".
 *   3. WHEN THERE IS NO RECENT FIX, THE CARD SAYS SO IN WORDS. An operator must never have to
 *      infer the age of a coordinate from its absence.
 *
 * And one about what did NOT change: neither panel gained anything that escalates, resolves,
 * times an alert or decides who is called. The change is display only, and that is asserted
 * against the source rather than promised in a comment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSosLocation } from "@/lib/homeLocation";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Albox: the member's door, and a point 1.2 km away where the pendant last reported. */
const HOME = { lat: 37.388, lng: -2.148 };
const AWAY = { lat: 37.3985, lng: -2.1465 };
const NOW = new Date("2026-09-10T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let homeRow: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: homeRow, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      let text = key;
      let vars: Record<string, unknown> = {};
      if (typeof second === "string") {
        text = second;
        vars = (third as Record<string, unknown>) ?? {};
      } else if (second && typeof second === "object") {
        vars = second as Record<string, unknown>;
        text = String((vars.defaultValue as string) ?? key);
      }
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
  homeRow = null;
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const memberPin = (setAt = "2026-06-03T09:30:00.000Z") => ({
  home_lat: HOME.lat,
  home_lng: HOME.lng,
  home_location_accuracy_m: null,
  home_location_source: "member_pin",
  home_location_set_at: setAt,
});

async function renderBlock(props: Record<string, unknown>) {
  const { HomeLocationBlock } = await import("@/components/call-centre/sos/HomeLocationBlock");
  const view = resolveSosLocation(
    { live: props.live as never, home: props.home as never },
    NOW.getTime(),
  );
  if (!view.home) throw new Error("fixture has no home pin");
  return {
    view,
    ...render(
      <HomeLocationBlock
        home={view.home}
        isPrimary={view.primary === "home"}
        distanceMetres={view.distanceMetres}
        tone="card"
      />,
    ),
  };
}

describe("the home block's label — the part that must never lie", () => {
  it("a member's own pin is labelled with the member and the date they set it", async () => {
    await renderBlock({
      home: { ...HOME, source: "member_pin", setAt: "2026-06-03T09:30:00.000Z" },
      live: null,
    });
    expect(screen.getByTestId("sos-home-label")).toHaveTextContent(
      "Home location (set by member on 3 Jun 2026)",
    );
  });

  it("a GPS fix the member took is still the member's confirmation", async () => {
    await renderBlock({
      home: { ...HOME, source: "member_gps", setAt: "2026-06-03T09:30:00.000Z", accuracyM: 12 },
      live: null,
    });
    expect(screen.getByTestId("sos-home-label")).toHaveTextContent("set by member");
  });

  it("a staff correction says OUR TEAM, never the member", async () => {
    await renderBlock({
      home: { ...HOME, source: "staff_pin", setAt: "2026-07-01T10:00:00.000Z" },
      live: null,
    });
    const label = screen.getByTestId("sos-home-label");
    expect(label).toHaveTextContent("set by our team on 1 Jul 2026");
    expect(label).not.toHaveTextContent("set by member");
  });

  it("a geocoded or imported coordinate is labelled UNCONFIRMED", async () => {
    for (const source of ["geocoded", "imported"]) {
      cleanup();
      await renderBlock({ home: { ...HOME, source, setAt: "2026-03-01T00:00:00.000Z" }, live: null });
      const label = screen.getByTestId("sos-home-label");
      expect(label).toHaveTextContent(/not confirmed by the member/i);
      expect(label).not.toHaveTextContent("set by member");
      expect(label).not.toHaveTextContent("set by our team");
    }
  });

  it("a pin with no date says so instead of inventing one", async () => {
    await renderBlock({ home: { ...HOME, source: "member_pin", setAt: null }, live: null });
    expect(screen.getByTestId("sos-home-label")).toHaveTextContent("Home location (set by member)");
  });
});

describe("the distance line — the one an operator acts on", () => {
  it("reads in kilometres when the pendant is a kilometre from the door", async () => {
    await renderBlock({
      home: { ...HOME, source: "member_pin", setAt: "2026-06-03T09:30:00.000Z" },
      live: { ...AWAY, at: minutesAgo(2).toISOString() },
    });
    expect(screen.getByTestId("sos-home-distance")).toHaveTextContent(/Pendant is 1\.2 km from home/);
  });

  it("is absent when there is no fix to measure from", async () => {
    await renderBlock({ home: { ...HOME, source: "member_pin", setAt: null }, live: null });
    expect(screen.queryByTestId("sos-home-distance")).not.toBeInTheDocument();
  });

  it("is shown for a STALE fix too — that is when it matters most", async () => {
    await renderBlock({
      home: { ...HOME, source: "member_pin", setAt: null },
      live: { ...AWAY, at: minutesAgo(180).toISOString() },
    });
    expect(screen.getByTestId("sos-home-distance")).toHaveTextContent(/1\.2 km/);
  });
});

describe("the home block's own Map and Directions", () => {
  it("open Google at the HOME coordinates, not the pendant's", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await renderBlock({
      home: { ...HOME, source: "member_pin", setAt: null },
      live: { ...AWAY, at: minutesAgo(2).toISOString() },
    });

    fireEvent.click(screen.getByTestId("sos-home-map"));
    expect(open).toHaveBeenCalledWith(
      `https://www.google.com/maps?q=${HOME.lat},${HOME.lng}`,
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(screen.getByTestId("sos-home-directions"));
    expect(open).toHaveBeenLastCalledWith(
      `https://www.google.com/maps/dir/?api=1&destination=${HOME.lat},${HOME.lng}`,
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });
});

describe("SOSSituationPanel — the operator's live card", () => {
  const panelProps = {
    alertId: "a1",
    memberId: "m1",
    alertStatus: "active",
    acceptedAt: null,
    acceptedByName: null,
    isabellaLogs: [],
    participants: [],
    escalations: [],
  };

  async function renderPanel(extra: {
    receivedAt: string;
    locationLat: number | null;
    locationLng: number | null;
    locationAddress: string | null;
  }) {
    const { SOSSituationPanel } = await import("@/components/call-centre/sos/SOSSituationPanel");
    return wrap(<SOSSituationPanel {...panelProps} {...extra} />);
  }

  it("a FRESH fix stays the primary location and home is secondary", async () => {
    homeRow = memberPin();
    await renderPanel({
      receivedAt: minutesAgo(4).toISOString(),
      locationLat: AWAY.lat,
      locationLng: AWAY.lng,
      locationAddress: "Calle Larga 4",
    });

    expect(await screen.findByTestId("sos-home-location")).toHaveAttribute("data-home-primary", "false");
    // NEGATIVE: the card must not announce it is showing home while the fix is fresh.
    expect(screen.queryByTestId("sos-no-recent-fix")).not.toBeInTheDocument();
    expect(screen.getByTestId("sos-map-label")).toHaveTextContent("Last Known Location");
  });

  it("a fix older than half an hour: HOME becomes primary and the card says so in words", async () => {
    homeRow = memberPin();
    await renderPanel({
      receivedAt: minutesAgo(45).toISOString(),
      locationLat: AWAY.lat,
      locationLng: AWAY.lng,
      locationAddress: "Calle Larga 4",
    });

    expect(await screen.findByTestId("sos-no-recent-fix")).toHaveTextContent(
      "No recent pendant location — showing home",
    );
    expect(screen.getByTestId("sos-home-location")).toHaveAttribute("data-home-primary", "true");
    /*
      AND THE STALE FIX IS STILL THE MAP. The home pin must never be shown IN PLACE OF a pendant
      fix — an operator deciding whether the member went out needs to see where the pendant was.
    */
    expect(screen.getByTestId("sos-map-label")).toHaveTextContent("Last Known Location");
  });

  it("no fix at all: the map is the home pin, and the card says why", async () => {
    homeRow = memberPin();
    await renderPanel({
      receivedAt: minutesAgo(4).toISOString(),
      locationLat: null,
      locationLng: null,
      locationAddress: null,
    });

    expect(await screen.findByTestId("sos-no-recent-fix")).toBeInTheDocument();
    expect(screen.getByTestId("sos-map-label")).toHaveTextContent("Home location");
  });

  it("no fix and no pin: unchanged from before this feature — no banner, no home block", async () => {
    homeRow = null;
    await renderPanel({
      receivedAt: minutesAgo(4).toISOString(),
      locationLat: null,
      locationLng: null,
      locationAddress: null,
    });

    expect(screen.queryByTestId("sos-home-location")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sos-no-recent-fix")).not.toBeInTheDocument();
  });

  it("a STALE fix and NO pin keeps the fix primary — nothing replaces the only location we have", async () => {
    homeRow = null;
    await renderPanel({
      receivedAt: minutesAgo(300).toISOString(),
      locationLat: AWAY.lat,
      locationLng: AWAY.lng,
      locationAddress: "Calle Larga 4",
    });

    expect(screen.queryByTestId("sos-no-recent-fix")).not.toBeInTheDocument();
    expect(screen.getByTestId("sos-map-label")).toHaveTextContent("Last Known Location");
  });

  it("shows the distance between the pendant and the door when both exist", async () => {
    homeRow = memberPin();
    await renderPanel({
      receivedAt: minutesAgo(4).toISOString(),
      locationLat: AWAY.lat,
      locationLng: AWAY.lng,
      locationAddress: "Calle Larga 4",
    });
    expect(await screen.findByTestId("sos-home-distance")).toHaveTextContent(/1\.2 km/);
  });
});

describe("display only — what these panels did NOT gain", () => {
  const situation = () => read("src/components/call-centre/sos/SOSSituationPanel.tsx");
  const detail = () => read("src/components/call-centre/AlertDetailPanel.tsx");
  const block = () => read("src/components/call-centre/sos/HomeLocationBlock.tsx");
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("the home block cannot escalate, resolve, or touch an alert at all", () => {
    const code = codeOnly(block());
    /*
      MATCHED ON WHAT IT WOULD HAVE TO DO, not on words. The first version of this test forbade
      /resolve/i and failed on the type name `ResolvedHome` — an assertion that fires on
      vocabulary rather than behaviour is one somebody weakens rather than reads.
    */
    for (const forbidden of [
      /onEscalate|escalations|escalate\(/i,
      /onResolve|resolveAlert|\bresolve\(/i,
      /supabase/,
      /from\("alerts"\)/,
      /\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
      /functions\.invoke/,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
    // and the stripping worked, or the assertion above is vacuous
    expect(code).toMatch(/HomeLocationBlock/);
  });

  it("SOSSituationPanel gained a READ and nothing else — no new write, no new decision", () => {
    const code = codeOnly(situation());
    expect(code).toMatch(/useMemberHomeLocation/);
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("AlertDetailPanel's escalate and resolve handlers are untouched by this change", () => {
    const code = codeOnly(detail());
    // Still exactly the two the panel always had, still driven by the props it always had.
    expect(code).toMatch(/onEscalate\(alert\.id\)/);
    expect(code).toMatch(/onResolve\(/);
    // The home pin is read, never written, from this screen.
    const homeUse = code.slice(code.indexOf("useMemberHomeLocation"));
    expect(homeUse).not.toMatch(/home_lat:|home_location_source:/);
  });

  it("the reader is ONE hook, used by both cards — not a copy in each", () => {
    expect(situation()).toMatch(/from "@\/hooks\/useMemberHomeLocation"/);
    expect(detail()).toMatch(/from "@\/hooks\/useMemberHomeLocation"/);
    const hook = read("src/hooks/useMemberHomeLocation.ts");
    expect(hook).toMatch(/home_lat, home_lng, home_location_accuracy_m, home_location_source, home_location_set_at/);
    // A failed read must not read as "this member has no pin".
    expect(hook).toMatch(/if \(error\) throw error/);
  });

  it("the label logic exists in exactly one component, so the two cards cannot disagree", () => {
    for (const src of [situation(), detail()]) {
      expect(src).toMatch(/<HomeLocationBlock/);
      // Neither card builds its own label.
      expect(src).not.toMatch(/set by member on/);
    }
  });
});
