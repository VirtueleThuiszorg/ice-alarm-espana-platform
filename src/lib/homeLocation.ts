/**
 * WHERE WE SEND HELP WHEN THE PENDANT CANNOT SAY — the rule, on its own, with nothing to
 * render it.
 *
 * An EV07B indoors usually has no GPS fix, and indoors is where falls happen. So the SOS card
 * has to answer a question with two possible answers and tell the operator WHICH ONE they are
 * looking at: the pendant's own last fix, or the front door the member confirmed themselves.
 *
 * THE DANGEROUS ANSWER IS THE MERGED ONE. "Here is a location" — with the two kinds of fact
 * blended, or with home quietly substituted when the fix is missing — sends an ambulance to a
 * house the member may have left two hours ago, and nothing on the screen said so. So this
 * module never returns "the location". It returns which one is PRIMARY, which is SECONDARY,
 * whether the card must say in words that there is no recent fix, and how far apart the two
 * are. The card renders both, always separately labelled.
 *
 * NO DECISION LOGIC LIVES HERE. Escalation, timers and who gets called are untouched by this
 * whole feature; this is display arithmetic and nothing else.
 */

/**
 * How fresh a pendant fix has to be to stay primary.
 *
 * Thirty minutes, and the number is a judgement about walking pace rather than about GPS: a
 * member who pressed the button can have moved a long way in half an hour, and beyond that the
 * fix stops being evidence of where they are now. Under it, the fix is still the best thing on
 * the screen — it is where the pendant actually was.
 */
export const LIVE_FIX_FRESH_MS = 30 * 60 * 1000;

/**
 * The worst browser accuracy we will store as a member's front door.
 *
 * A ±800 m fix — which is what a laptop on wifi gives — is a fix on the wrong street, and
 * storing it as a doorway is worse than storing nothing, because the SOS card would then show
 * a confident pin nobody should trust. 100 m is roughly "the right building or its neighbour",
 * which is the point at which a driver who is already on the street can find the door.
 *
 * Enforced in three places on purpose: this constant for the dialog, the same rule in
 * `member-self-service`, and a CHECK constraint on `members` so no future caller can bypass
 * either.
 */
export const MEMBER_GPS_MAX_ACCURACY_M = 100;

/** The `home_location_source` enum, mirrored for the client. */
export type HomeLocationSource =
  | "member_pin"
  | "member_gps"
  | "staff_pin"
  | "geocoded"
  | "imported";

export const HOME_LOCATION_SOURCES: readonly HomeLocationSource[] = [
  "member_pin",
  "member_gps",
  "staff_pin",
  "geocoded",
  "imported",
] as const;

/**
 * The two a MEMBER may claim, and the two a STAFF write may claim. Same split the database
 * trigger enforces — kept here so the UI never offers a control that the database will refuse.
 */
export const MEMBER_WRITABLE_SOURCES: readonly HomeLocationSource[] = ["member_pin", "member_gps"] as const;
export const STAFF_WRITABLE_SOURCES: readonly HomeLocationSource[] = ["staff_pin", "geocoded"] as const;

/**
 * Sources where a HUMAN WHO LIVES THERE has confirmed the pin.
 *
 * `geocoded` and `imported` are guesses off an address or a spreadsheet. They are worth showing
 * and they must not be described as confirmed, which is why the card's label is derived from
 * this list rather than from the presence of coordinates.
 */
export const CONFIRMED_HOME_SOURCES: readonly HomeLocationSource[] = [
  "member_pin",
  "member_gps",
  "staff_pin",
] as const;

export function isHomeLocationSource(value: unknown): value is HomeLocationSource {
  return typeof value === "string" && (HOME_LOCATION_SOURCES as readonly string[]).includes(value);
}

export interface Coords {
  lat: number;
  lng: number;
}

/** A pendant fix: the alert's own coordinates, or the device's last known ones. */
export interface LiveFixInput {
  lat?: number | null;
  lng?: number | null;
  /** When the fix was taken. NULL means we do not know, which is never "fresh". */
  at?: string | null;
  address?: string | null;
}

export interface HomeLocationInput {
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  setAt?: string | null;
  accuracyM?: number | null;
}

export interface ResolvedLiveFix extends Coords {
  at: string | null;
  address: string | null;
  /** Older than LIVE_FIX_FRESH_MS, or undated. Still shown — but never as the primary answer. */
  isStale: boolean;
}

export interface ResolvedHome extends Coords {
  source: HomeLocationSource;
  setAt: string | null;
  accuracyM: number | null;
  /** A person who lives there put the pin where it is. See CONFIRMED_HOME_SOURCES. */
  isConfirmed: boolean;
}

export interface SosLocationDisplay {
  /** Which block the card leads with. `none` means we genuinely have nothing. */
  primary: "live" | "home" | "none";
  live: ResolvedLiveFix | null;
  home: ResolvedHome | null;
  /**
   * The card must say, in words, that there is no recent pendant location and it is showing
   * the home pin instead. True only when home has actually taken over — a stale fix with no
   * home to fall back to is still the best we have, and telling the operator "showing home"
   * when there is no home would be a lie.
   */
  announceNoRecentFix: boolean;
  /** Straight-line metres between the pendant fix and the door, when both exist. */
  distanceMetres: number | null;
}

/**
 * Is this pair of numbers a place?
 *
 * `0, 0` is refused deliberately. It is a real coordinate in the Gulf of Guinea and it is also
 * what an uninitialised field, a failed parse and a zeroed GPS record all look like — and the
 * existing card code already treated it as absent by testing `lat && lng` for truthiness. No
 * member of a Spanish alarm service lives there; a nulled-out device does.
 */
export function isUsableCoords(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Metres between two points on the earth. Haversine — sub-metre over the distances involved. */
export function haversineMetres(a: Coords, b: Coords): number {
  const R = 6_371_008.8; // mean earth radius, metres (IUGG)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * "1.2 km" / "340 m", as parts so the caller can translate the unit.
 *
 * Rounded to something an operator can act on, not to the metre: under a kilometre to the
 * nearest ten metres, above it to one decimal place. "pendant is 1.2 km from home" answers
 * "do I send help to the house?"; "1183.47 m" does not answer it any better.
 */
export function formatDistance(metres: number): { value: string; unit: "m" | "km" } {
  if (!Number.isFinite(metres) || metres < 0) return { value: "0", unit: "m" };
  if (metres < 1000) return { value: String(Math.round(metres / 10) * 10), unit: "m" };
  return { value: (Math.round(metres / 100) / 10).toFixed(1), unit: "km" };
}

/**
 * Metres the pin moves per nudge press. Roughly the width of a Spanish town house, which is the
 * unit that matters when the question is "is the pin on my door or my neighbour's".
 */
export const NUDGE_METRES = 5;

/** Degrees of latitude per metre — constant. Longitude is scaled by cos(lat) below. */
const DEG_PER_METRE_LAT = 1 / 111_320;

/** Six decimals — ~11 cm, and exactly what `numeric(9,6)` stores. Anything beyond it is noise. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Move a pin a fixed step in one direction.
 *
 * WHY THIS LIVES HERE AND NOT IN THE MAP COMPONENT. It was in `HomeLocationMap.tsx`, and the
 * dialog imported it — which meant the dialog statically imported the module it was also trying
 * to `lazy()`, and rollup said so: *"dynamic import will not move module into another chunk"*.
 * Leaflet then shipped in the main bundle, which is the opposite of the intent. Pure arithmetic
 * belongs beside the rest of the pure arithmetic; the component keeps only the Leaflet.
 */
export function nudgeCoords(
  from: Coords,
  direction: "north" | "south" | "east" | "west",
  metres: number = NUDGE_METRES,
): Coords {
  const dLat = metres * DEG_PER_METRE_LAT;
  // A degree of longitude shrinks towards the poles. At Almería's latitude it is ~88 km, so
  // ignoring the cosine would make an "east" press move noticeably further than a "north" one.
  const dLng = dLat / Math.max(0.01, Math.cos((from.lat * Math.PI) / 180));
  switch (direction) {
    case "north": return { lat: round6(from.lat + dLat), lng: from.lng };
    case "south": return { lat: round6(from.lat - dLat), lng: from.lng };
    case "east":  return { lat: from.lat, lng: round6(from.lng + dLng) };
    case "west":  return { lat: from.lat, lng: round6(from.lng - dLng) };
  }
}

/** The dialog's refusal, as a function so the dialog and the server agree on the number. */
export function isAcceptableMemberGpsAccuracy(accuracyM: unknown): boolean {
  return typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM > 0
    && accuracyM <= MEMBER_GPS_MAX_ACCURACY_M;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * THE STATE MACHINE. Four inputs — a fix or not, fresh or not, a home pin or not — and the
 * five outcomes they produce.
 *
 *   fix + fresh                  → primary live.   Home is secondary if it exists.
 *   fix + stale + home           → primary HOME, and the card says so in words. The stale fix
 *                                  stays on screen: it is where the pendant was, and an
 *                                  operator deciding whether the member went out needs it.
 *   fix + stale + no home        → primary live, flagged stale. Substituting nothing for
 *                                  something would remove the only location we have.
 *   no fix + home                → primary HOME, and the card says so in words.
 *   no fix + no home             → none. Unchanged from today: the card falls back to the
 *                                  typed postal address, which it reads for itself.
 */
export function resolveSosLocation(
  input: { live?: LiveFixInput | null; home?: HomeLocationInput | null },
  now: number = Date.now(),
): SosLocationDisplay {
  const liveIn = input.live ?? null;
  const homeIn = input.home ?? null;

  let live: ResolvedLiveFix | null = null;
  if (liveIn && isUsableCoords(liveIn.lat, liveIn.lng)) {
    const at = parseTime(liveIn.at);
    live = {
      lat: liveIn.lat as number,
      lng: liveIn.lng as number,
      at: liveIn.at ?? null,
      address: liveIn.address ?? null,
      // An undated fix is stale. We cannot tell an operator it is current when nothing says so.
      isStale: at === null || now - at >= LIVE_FIX_FRESH_MS,
    };
  }

  let home: ResolvedHome | null = null;
  if (homeIn && isUsableCoords(homeIn.lat, homeIn.lng) && isHomeLocationSource(homeIn.source)) {
    home = {
      lat: homeIn.lat as number,
      lng: homeIn.lng as number,
      source: homeIn.source,
      setAt: homeIn.setAt ?? null,
      accuracyM: typeof homeIn.accuracyM === "number" ? homeIn.accuracyM : null,
      isConfirmed: (CONFIRMED_HOME_SOURCES as readonly string[]).includes(homeIn.source),
    };
  }

  const liveIsPrimary = !!live && (!live.isStale || !home);
  const primary: SosLocationDisplay["primary"] = liveIsPrimary ? "live" : home ? "home" : "none";

  return {
    primary,
    live,
    home,
    announceNoRecentFix: primary === "home",
    distanceMetres: live && home ? haversineMetres(live, home) : null,
  };
}
