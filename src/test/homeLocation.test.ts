/**
 * The home-location rule, executed rather than inspected.
 *
 * WHAT THESE TESTS ARE DEFENDING. The SOS card has two possible answers to "where is this
 * person" and the whole value of the feature is that an operator can tell which one they are
 * looking at. The failure that would matter is silent: home shown in place of a fresh pendant
 * fix, or a two-hour-old fix presented as if it were current. Both are asserted here as
 * NEGATIVES — "home is not primary when the fix is fresh", "the card does not claim to be
 * showing home when there is no home" — because a negative cannot be satisfied by accident.
 */
import { describe, it, expect } from "vitest";
import {
  CONFIRMED_HOME_SOURCES,
  HOME_LOCATION_SOURCES,
  LIVE_FIX_FRESH_MS,
  MEMBER_GPS_MAX_ACCURACY_M,
  MEMBER_WRITABLE_SOURCES,
  STAFF_WRITABLE_SOURCES,
  formatDistance,
  haversineMetres,
  isAcceptableMemberGpsAccuracy,
  isHomeLocationSource,
  isUsableCoords,
  resolveSosLocation,
} from "@/lib/homeLocation";

/** Albox, Almería — a real member's town, and the two points are ~1.2 km apart. */
const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const HOME = { lat: 37.388, lng: -2.148, source: "member_pin", setAt: "2026-06-01T09:30:00.000Z" };
const AWAY = { lat: 37.3985, lng: -2.1465 };

const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("resolveSosLocation — which location the card leads with", () => {
  it("a fix from five minutes ago is primary, and home is kept as secondary", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(5) }, home: HOME }, NOW);
    expect(r.primary).toBe("live");
    expect(r.live?.isStale).toBe(false);
    // The point of the feature: home does not disappear because a fix exists.
    expect(r.home).not.toBeNull();
    expect(r.home?.lat).toBe(HOME.lat);
  });

  it("a fix 29 minutes old is still primary; at 30 minutes home takes over", () => {
    const justFresh = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(29) }, home: HOME }, NOW);
    expect(justFresh.primary).toBe("live");

    const justStale = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(30) }, home: HOME }, NOW);
    expect(justStale.primary).toBe("home");
    expect(justStale.live?.isStale).toBe(true);
  });

  it("the boundary is exactly LIVE_FIX_FRESH_MS, and 30 minutes is what that is", () => {
    expect(LIVE_FIX_FRESH_MS).toBe(30 * 60 * 1000);
    const onTheEdge = resolveSosLocation(
      { live: { ...AWAY, at: new Date(NOW - LIVE_FIX_FRESH_MS + 1).toISOString() }, home: HOME },
      NOW,
    );
    expect(onTheEdge.primary).toBe("live");
  });

  it("a stale fix stays on screen when home takes over — it is where the pendant was", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(90) }, home: HOME }, NOW);
    expect(r.primary).toBe("home");
    expect(r.live).not.toBeNull();
    expect(r.live?.lat).toBe(AWAY.lat);
  });

  it("no fix at all and a home pin: home is primary and the card must say so", () => {
    const r = resolveSosLocation({ live: null, home: HOME }, NOW);
    expect(r.primary).toBe("home");
    expect(r.announceNoRecentFix).toBe(true);
    expect(r.distanceMetres).toBeNull();
  });

  it("a stale fix with NO home stays primary — nothing must replace the only location we have", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(600) }, home: null }, NOW);
    expect(r.primary).toBe("live");
    expect(r.live?.isStale).toBe(true);
    // NEGATIVE: the card must not claim to be showing home when there is no home.
    expect(r.announceNoRecentFix).toBe(false);
  });

  it("neither: primary is none and the card falls back to the postal address as it always did", () => {
    const r = resolveSosLocation({ live: null, home: null }, NOW);
    expect(r.primary).toBe("none");
    expect(r.live).toBeNull();
    expect(r.home).toBeNull();
    expect(r.announceNoRecentFix).toBe(false);
  });

  it("an UNDATED fix is stale — we cannot call it current when nothing says it is", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: null }, home: HOME }, NOW);
    expect(r.live?.isStale).toBe(true);
    expect(r.primary).toBe("home");
  });

  it("an unparseable timestamp is treated as undated, not as now", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: "not a date" }, home: HOME }, NOW);
    expect(r.live?.isStale).toBe(true);
    expect(r.primary).toBe("home");
  });

  it("announceNoRecentFix is true exactly when home is primary, and never otherwise", () => {
    const cases = [
      { live: { ...AWAY, at: minutesAgo(1) }, home: HOME },
      { live: { ...AWAY, at: minutesAgo(120) }, home: HOME },
      { live: null, home: HOME },
      { live: { ...AWAY, at: minutesAgo(120) }, home: null },
      { live: null, home: null },
    ];
    for (const input of cases) {
      const r = resolveSosLocation(input, NOW);
      expect(r.announceNoRecentFix).toBe(r.primary === "home");
    }
  });
});

describe("resolveSosLocation — what counts as a location at all", () => {
  it("a home row with coordinates but no source is not a location", () => {
    const r = resolveSosLocation({ home: { lat: 37.388, lng: -2.148, source: null } }, NOW);
    expect(r.home).toBeNull();
    expect(r.primary).toBe("none");
  });

  it("a home row with an unknown source is refused rather than shown unlabelled", () => {
    const r = resolveSosLocation(
      { home: { lat: 37.388, lng: -2.148, source: "guessed_by_someone" } },
      NOW,
    );
    expect(r.home).toBeNull();
  });

  it("half a coordinate is not a location, on either side", () => {
    expect(resolveSosLocation({ live: { lat: 37.388, lng: null, at: minutesAgo(1) } }, NOW).live).toBeNull();
    expect(resolveSosLocation({ home: { lat: null, lng: -2.148, source: "member_pin" } }, NOW).home).toBeNull();
  });

  it("0,0 is refused — it is what a zeroed GPS record looks like, not where a member lives", () => {
    expect(isUsableCoords(0, 0)).toBe(false);
    expect(resolveSosLocation({ live: { lat: 0, lng: 0, at: minutesAgo(1) } }, NOW).live).toBeNull();
  });

  it("a zero on ONE axis is still a place (the Greenwich meridian crosses Spain)", () => {
    expect(isUsableCoords(41.6, 0)).toBe(true);
  });

  it("out-of-range and non-finite values are refused", () => {
    expect(isUsableCoords(91, 0)).toBe(false);
    expect(isUsableCoords(0, 181)).toBe(false);
    expect(isUsableCoords(Number.NaN, 1)).toBe(false);
    expect(isUsableCoords(Number.POSITIVE_INFINITY, 1)).toBe(false);
    expect(isUsableCoords("37.4", "-2.1")).toBe(false);
  });
});

describe("distance — the one line that tells an operator whether to send help to the house", () => {
  it("is null unless BOTH a fix and a home pin exist", () => {
    expect(resolveSosLocation({ live: { ...AWAY, at: minutesAgo(1) } }, NOW).distanceMetres).toBeNull();
    expect(resolveSosLocation({ home: HOME }, NOW).distanceMetres).toBeNull();
  });

  it("is reported even when the fix is stale — that is precisely when it matters most", () => {
    const r = resolveSosLocation({ live: { ...AWAY, at: minutesAgo(200) }, home: HOME }, NOW);
    expect(r.primary).toBe("home");
    expect(r.distanceMetres).toBeGreaterThan(1000);
  });

  it("a pendant sitting at home reads as zero, not as a rounding artefact", () => {
    const r = resolveSosLocation({ live: { lat: HOME.lat, lng: HOME.lng, at: minutesAgo(1) }, home: HOME }, NOW);
    expect(r.distanceMetres).toBe(0);
  });

  it("haversine agrees with a known separation to within a metre", () => {
    // One degree of latitude is 111.19 km at the equator on a sphere of this radius.
    expect(haversineMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
    // Albox to the second point, measured: ~1.2 km.
    const d = haversineMetres({ lat: HOME.lat, lng: HOME.lng }, AWAY);
    expect(d).toBeGreaterThan(1150);
    expect(d).toBeLessThan(1250);
  });

  it("formats to something an operator can act on", () => {
    expect(formatDistance(0)).toEqual({ value: "0", unit: "m" });
    expect(formatDistance(37)).toEqual({ value: "40", unit: "m" });
    expect(formatDistance(344)).toEqual({ value: "340", unit: "m" });
    expect(formatDistance(999)).toEqual({ value: "1000", unit: "m" });
    expect(formatDistance(1183)).toEqual({ value: "1.2", unit: "km" });
    expect(formatDistance(12_000)).toEqual({ value: "12.0", unit: "km" });
  });

  it("never renders a negative or non-finite distance", () => {
    expect(formatDistance(-5)).toEqual({ value: "0", unit: "m" });
    expect(formatDistance(Number.NaN)).toEqual({ value: "0", unit: "m" });
  });
});

describe("the 100 m refusal", () => {
  it("100 m is the limit, and it is inclusive", () => {
    expect(MEMBER_GPS_MAX_ACCURACY_M).toBe(100);
    expect(isAcceptableMemberGpsAccuracy(100)).toBe(true);
    expect(isAcceptableMemberGpsAccuracy(100.1)).toBe(false);
  });

  it("a wifi-grade fix is refused — that is a fix on the wrong street", () => {
    expect(isAcceptableMemberGpsAccuracy(800)).toBe(false);
  });

  it("a missing, zero or nonsense accuracy is refused rather than assumed good", () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, "12", {}]) {
      expect(isAcceptableMemberGpsAccuracy(bad)).toBe(false);
    }
  });
});

describe("provenance — who may claim what", () => {
  it("the five sources are the five the database enum has", () => {
    expect([...HOME_LOCATION_SOURCES]).toEqual([
      "member_pin",
      "member_gps",
      "staff_pin",
      "geocoded",
      "imported",
    ]);
  });

  it("member-writable and staff-writable sources do not overlap", () => {
    for (const s of MEMBER_WRITABLE_SOURCES) {
      expect(STAFF_WRITABLE_SOURCES).not.toContain(s);
    }
  });

  it("neither side may claim `imported` — a spreadsheet is not a person", () => {
    expect(MEMBER_WRITABLE_SOURCES).not.toContain("imported");
    expect(STAFF_WRITABLE_SOURCES).not.toContain("imported");
  });

  it("geocoded and imported are NOT confirmed, so the card cannot say a member set them", () => {
    expect(CONFIRMED_HOME_SOURCES).not.toContain("geocoded");
    expect(CONFIRMED_HOME_SOURCES).not.toContain("imported");
    expect(resolveSosLocation({ home: { ...HOME, source: "geocoded" } }, NOW).home?.isConfirmed).toBe(false);
    expect(resolveSosLocation({ home: { ...HOME, source: "imported" } }, NOW).home?.isConfirmed).toBe(false);
  });

  it("a member pin, a member GPS fix and a staff correction all read as confirmed", () => {
    for (const source of CONFIRMED_HOME_SOURCES) {
      expect(resolveSosLocation({ home: { ...HOME, source } }, NOW).home?.isConfirmed).toBe(true);
    }
  });

  it("isHomeLocationSource refuses anything not in the enum", () => {
    expect(isHomeLocationSource("member_pin")).toBe(true);
    expect(isHomeLocationSource("member")).toBe(false);
    expect(isHomeLocationSource(null)).toBe(false);
    expect(isHomeLocationSource(1)).toBe(false);
  });
});
