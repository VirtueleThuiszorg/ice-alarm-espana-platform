/**
 * THE MEMBER MARKING THEIR OWN FRONT DOOR — driven, not inspected.
 *
 * The load-bearing assertions are the refusals and what the Save button actually SENDS, because
 * those are the two places this feature can hurt somebody:
 *
 *   - a ±800 m browser fix stored as a doorway is a confident pin on the wrong street, and an
 *     operator would act on it. So the refusal must leave the pin WHERE IT WAS and send nothing.
 *   - the source travelling with the save has to be the truth. A fix the member then nudged is
 *     their own judgement (`member_pin`, no accuracy figure), not a GPS reading — and a staff
 *     correction is never a member confirmation, because the SOS card labels them differently.
 *
 * And one property with no visible symptom: the member's location is asked for ONCE, on a press.
 * Nothing here may watch it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nudgeCoords, round6, NUDGE_METRES } from "@/lib/homeLocation";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── doubles ────────────────────────────────────────────────────────────────
let invoked: Array<{ fn: string; body: Record<string, unknown> }> = [];
let memberUpdates: Array<Record<string, unknown>> = [];
let audit: Array<{ action: string; newValues: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        memberUpdates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    functions: {
      invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve({ data: { success: true }, error: null });
      },
    },
  },
}));

vi.mock("@/lib/auditLog", () => ({
  logMemberActivity: (action: string, _id: string, _old: unknown, newValues: unknown) => {
    audit.push({ action, newValues });
    return Promise.resolve();
  },
}));

// The picker centres on the geocoded postal address. Doubled so no test touches Nominatim.
vi.mock("@/lib/geocode", () => ({
  forwardGeocode: () => Promise.resolve({ lat: 37.388, lng: -2.148 }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * `t` handles BOTH call shapes the dialog uses — `t(key, "fallback")` and
 * `t(key, { defaultValue, metres })` — and interpolates. A mock that returned the options object
 * for the second shape would crash the render, and the accuracy refusal is written in that shape
 * precisely because it has a number in it.
 */
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
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name] ?? `{{${name}}}`));
    },
    i18n: { language: "en" },
  }),
}));

const PROFILE_NO_PIN = {
  id: "m1",
  address_line_1: "Calle A 1",
  city: "Albox",
  province: "Almeria",
  postal_code: "04800",
  home_lat: null,
  home_lng: null,
  home_location_source: null,
  home_location_set_at: null,
  home_location_accuracy_m: null,
};

const PROFILE_WITH_PIN = {
  ...PROFILE_NO_PIN,
  home_lat: 37.3881,
  home_lng: -2.1479,
  home_location_source: "member_pin",
  home_location_set_at: "2026-06-03T09:30:00.000Z",
};

/** A geolocation double that records how many times it was asked, and never watches. */
function installGeolocation(accuracy: number, coords = { latitude: 37.3882, longitude: -2.1478 }) {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({
      coords: { ...coords, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition);
  });
  const watchPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition, watchPosition, clearWatch: vi.fn() },
  });
  return { getCurrentPosition, watchPosition };
}

function installGeolocationDenial() {
  const getCurrentPosition = vi.fn((_s: PositionCallback, failure?: PositionErrorCallback) => {
    failure?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
  });
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
  });
  return { getCurrentPosition };
}

async function renderRow(profile: Record<string, unknown>) {
  const { HomeLocationRow } = await import("@/components/client/HomeLocationRow");
  return render(<HomeLocationRow profile={profile as never} />);
}

async function renderDialog(
  props: Partial<import("@/components/maps/SetHomeLocationDialog").SetHomeLocationDialogProps> = {},
) {
  const { SetHomeLocationDialog } = await import("@/components/maps/SetHomeLocationDialog");
  return render(
    <SetHomeLocationDialog
      open
      onOpenChange={() => {}}
      memberId="m1"
      actor="member"
      existing={null}
      address={{ line1: "Calle A 1", city: "Albox", province: "Almeria", postalCode: "04800" }}
      {...props}
    />,
  );
}

beforeEach(() => {
  invoked = [];
  memberUpdates = [];
  audit = [];
});
afterEach(() => cleanup());

// ── the row ────────────────────────────────────────────────────────────────
describe("the Home location row on the member's own account page", () => {
  it("with no pin: one large button and nothing else to think about", async () => {
    await renderRow(PROFILE_NO_PIN);
    expect(screen.getByTestId("home-location-set")).toBeInTheDocument();
    expect(screen.queryByTestId("home-location-change")).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-location-open-maps")).not.toBeInTheDocument();
    // No map is mounted for a member who has not set one — nothing to load and nothing to see.
    expect(screen.queryByTestId("home-location-set-at")).not.toBeInTheDocument();
  });

  it("says what it is FOR, in the member's own words, not what a pin is", async () => {
    await renderRow(PROFILE_NO_PIN);
    expect(
      screen.getByText(/where we send help if your pendant cannot tell us where you are/i),
    ).toBeInTheDocument();
  });

  it("with a pin: the DATE it was set is on screen, not hidden in a tooltip", async () => {
    await renderRow(PROFILE_WITH_PIN);
    expect(screen.getByTestId("home-location-set-at")).toHaveTextContent("3 June 2026");
  });

  it("with a pin: Open in Maps and Change, and no Set button", async () => {
    await renderRow(PROFILE_WITH_PIN);
    expect(screen.getByTestId("home-location-open-maps")).toBeInTheDocument();
    expect(screen.getByTestId("home-location-change")).toBeInTheDocument();
    expect(screen.queryByTestId("home-location-set")).not.toBeInTheDocument();
  });

  it("Open in Maps goes to the coordinates, in a new tab, with no referrer", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await renderRow(PROFILE_WITH_PIN);
    fireEvent.click(screen.getByTestId("home-location-open-maps"));
    expect(open).toHaveBeenCalledWith(
      "https://www.google.com/maps?q=37.3881,-2.1479",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("coordinates with no source are NOT treated as a pin — an unlabelled pin cannot be shown honestly", async () => {
    await renderRow({ ...PROFILE_WITH_PIN, home_location_source: null });
    expect(screen.getByTestId("home-location-set")).toBeInTheDocument();
  });
});

// ── the dialog ─────────────────────────────────────────────────────────────
describe("the dialog", () => {
  it("leads with the sentence that says what the pin is for", async () => {
    await renderDialog();
    expect(
      screen.getByText(
        /this is where we send help if your pendant cannot tell us where you are/i,
      ),
    ).toBeInTheDocument();
  });

  it("asks the browser for a position only when the button is pressed, and only once", async () => {
    const { getCurrentPosition, watchPosition } = installGeolocation(25);
    await renderDialog();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("home-location-use-current"));
    await waitFor(() => expect(screen.getByTestId("home-location-accuracy")).toBeInTheDocument());

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    // NEVER TRACKED. A watch would turn a one-off confirmation into surveillance.
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("shows the accuracy in metres when the fix is good enough", async () => {
    installGeolocation(23.6);
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));
    await waitFor(() =>
      expect(screen.getByTestId("home-location-accuracy")).toHaveTextContent("24 metres"),
    );
  });

  it("REFUSES a fix worse than 100 m with the plain instruction, and does not move the pin", async () => {
    installGeolocation(800);
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));

    const refusal = await screen.findByTestId("home-location-accuracy-refused");
    expect(refusal).toHaveTextContent(/please stand at your front door and try again/i);
    expect(refusal).toHaveTextContent("800 metres");
    expect(refusal).toHaveAttribute("role", "alert");

    // The pin has not been moved to the bad fix: the coordinates on screen are still the
    // geocoded address, not 37.3882 / -2.1478.
    await waitFor(() =>
      expect(screen.getByTestId("home-location-coords")).toHaveTextContent("37.388000, -2.148000"),
    );
    expect(screen.queryByTestId("home-location-accuracy")).not.toBeInTheDocument();
  });

  it("a refused fix cannot be saved as a GPS reading — Save sends the geocoded pin as member_pin", async () => {
    installGeolocation(800);
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));
    await screen.findByTestId("home-location-accuracy-refused");

    fireEvent.click(screen.getByTestId("home-location-save"));
    await waitFor(() => expect(invoked).toHaveLength(1));
    expect(invoked[0].body.source).toBe("member_pin");
    expect(invoked[0].body.accuracy_m).toBeNull();
    // and NOT the 800 m fix's coordinates
    expect(invoked[0].body.lat).toBe(37.388);
  });

  it("says so plainly when the device refuses permission, and still offers the map", async () => {
    installGeolocationDenial();
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));
    const message = await screen.findByTestId("home-location-gps-unavailable");
    expect(message).toHaveTextContent(/did not allow us to read your location/i);
    expect(message).toHaveTextContent(/you can still place the pin on the map/i);
  });

  it("Save sends member_gps WITH the accuracy when the browser's fix was accepted and untouched", async () => {
    installGeolocation(30);
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));
    await waitFor(() => expect(screen.getByTestId("home-location-accuracy")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("home-location-save"));
    await waitFor(() => expect(invoked).toHaveLength(1));

    expect(invoked[0].fn).toBe("member-self-service");
    expect(invoked[0].body).toMatchObject({
      action: "save_home_location",
      source: "member_gps",
      accuracy_m: 30,
      lat: 37.3882,
      lng: -2.1478,
    });
  });

  it("NUDGING A GPS FIX MAKES IT THE MEMBER'S OWN PIN — member_pin, and no accuracy claimed", async () => {
    installGeolocation(30);
    await renderDialog();
    fireEvent.click(screen.getByTestId("home-location-use-current"));
    await waitFor(() => expect(screen.getByTestId("home-location-accuracy")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("home-location-nudge-north"));
    fireEvent.click(screen.getByTestId("home-location-save"));
    await waitFor(() => expect(invoked).toHaveLength(1));

    expect(invoked[0].body.source).toBe("member_pin");
    expect(invoked[0].body.accuracy_m).toBeNull();
    // and the coordinates really moved north
    expect(invoked[0].body.lat as number).toBeGreaterThan(37.3882);
  });

  it("offers all four nudge directions, as a labelled group a keyboard can reach", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("home-location-nudge")).toBeInTheDocument());
    const group = screen.getByTestId("home-location-nudge");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveAttribute("aria-label");
    for (const direction of ["north", "south", "east", "west"]) {
      expect(screen.getByTestId(`home-location-nudge-${direction}`)).toBeInTheDocument();
    }
  });

  it("STAFF write staff_pin straight to the member row, and never through the member function", async () => {
    await renderDialog({ actor: "staff", existing: { lat: 37.4, lng: -2.2 } });
    fireEvent.click(screen.getByTestId("home-location-save"));

    await waitFor(() => expect(memberUpdates).toHaveLength(1));
    expect(memberUpdates[0]).toMatchObject({
      home_lat: 37.4,
      home_lng: -2.2,
      home_location_source: "staff_pin",
      home_location_accuracy_m: null,
    });
    // A staff correction is not a member confirmation, and must not travel on the member's route.
    expect(invoked).toHaveLength(0);
    expect(audit).toEqual([{ action: "home_location_set", newValues: { source: "staff_pin" } }]);
  });

  it("staff cannot smuggle a member source through this dialog — the write names staff_pin literally", () => {
    const src = read("src/components/maps/SetHomeLocationDialog.tsx");
    const from = src.indexOf('.from("members")');
    const staffBranch = src.slice(from, src.indexOf("logMemberActivity", from));
    expect(staffBranch).toMatch(/home_location_source: "staff_pin"/);
    expect(staffBranch).not.toMatch(/member_pin|member_gps/);
  });

  it("Save is disabled until there is somewhere to save", async () => {
    // No address to geocode and no existing pin: nothing to save, so the button must refuse.
    await renderDialog({ address: null });
    expect(screen.getByTestId("home-location-save")).toBeDisabled();
    // and there is nothing to nudge either — the whole map block is absent, not empty
    expect(screen.queryByTestId("home-location-nudge")).not.toBeInTheDocument();
  });
});

// ── the pin arithmetic ─────────────────────────────────────────────────────
describe("nudging the pin", () => {
  it("moves the stated number of metres north and south", () => {
    const from = { lat: 37.388, lng: -2.148 };
    const north = nudgeCoords(from, "north");
    // 5 m of latitude is 4.4916e-5 degrees, and the stored value is that rounded to six
    // decimals — asserted exactly rather than approximately, so the rounding is part of the
    // contract instead of a tolerance somebody can widen later.
    expect(north.lat).toBe(round6(from.lat + NUDGE_METRES / 111_320));
    expect(north.lat - from.lat).toBeCloseTo(NUDGE_METRES / 111_320, 6);
    expect(north.lng).toBe(from.lng);
    expect(nudgeCoords(from, "south").lat).toBeLessThan(from.lat);
  });

  it("scales longitude by the cosine of the latitude, so east moves as far as north", () => {
    const from = { lat: 37.388, lng: -2.148 };
    const east = nudgeCoords(from, "east");
    const dLngDegrees = east.lng - from.lng;
    const metresEast = dLngDegrees * 111_320 * Math.cos((from.lat * Math.PI) / 180);
    expect(metresEast).toBeCloseTo(NUDGE_METRES, 1);
  });

  it("rounds to six decimals — what numeric(9,6) stores, and ~11 cm", () => {
    expect(round6(37.38812345678)).toBe(37.388123);
    expect(String(nudgeCoords({ lat: 37.388, lng: -2.148 }, "west").lng).split(".")[1].length)
      .toBeLessThanOrEqual(6);
  });
});

// ── properties with no visible symptom ─────────────────────────────────────
describe("properties the screen cannot show", () => {
  const dialog = () => read("src/components/maps/SetHomeLocationDialog.tsx");
  const map = () => read("src/components/maps/HomeLocationMap.tsx");
  const row = () => read("src/components/client/HomeLocationRow.tsx");

  /**
   * CODE, NOT PROSE. These files explain in comments that they do not watch the member's
   * position, and a substring scan would match the explanation and pass on a file that did.
   * Comments are stripped first — the same mistake this codebase records having made three
   * times in `textSizeControl.test.ts`.
   */
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("nothing watches the member's position, anywhere in this feature", () => {
    for (const src of [dialog(), map(), row()]) {
      const code = codeOnly(src);
      expect(code).not.toMatch(/watchPosition/);
      // and the stripping really worked, or the assertion above is vacuous
      expect(code).toMatch(/getCurrentPosition|navigator|HomeLocationMap/);
    }
    // the prose in at least one of them DOES mention it, which is why stripping is needed
    expect(dialog()).toMatch(/watchPosition/);
  });

  it("the browser is asked for a fresh reading, never a cached one", () => {
    expect(dialog()).toMatch(/maximumAge: 0/);
  });

  it("the map is lazy-loaded from both callers — Leaflet is not on the first paint", () => {
    expect(dialog()).toMatch(/lazy\(\(\) => import\("@\/components\/maps\/HomeLocationMap"\)\)/);
    expect(row()).toMatch(/lazy\(\(\) => import\("@\/components\/maps\/HomeLocationMap"\)\)/);
  });

  it("the preview is not draggable and the picker is — the two are not the same map twice", () => {
    expect(row()).toMatch(/interactive=\{false\}/);
    expect(dialog()).toMatch(/\n\s+interactive\n/);
    expect(map()).toMatch(/draggable: interactive/);
    expect(map()).toMatch(/dragging: interactive/);
  });

  it("tiles come from OpenStreetMap, attributed, with no API key anywhere", () => {
    expect(map()).toMatch(/tile\.openstreetmap\.org/);
    expect(map()).toMatch(/openstreetmap\.org\/copyright/);
    expect(map()).not.toMatch(/api[_-]?key|apiKey|VITE_[A-Z_]*MAPS/i);
  });

  it("no member-facing part of this feature pins a font size in px", () => {
    for (const src of [dialog(), map(), row()]) {
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{[^}]*"([^"]*)"[^}]*\})/g)) {
        expect(m[1] ?? m[2] ?? "").not.toMatch(/text-\[\d+(\.\d+)?px\]/);
      }
    }
  });

  it("the row appears on the member's own account page, in the address card", () => {
    const page = read("src/pages/client/ProfilePage.tsx");
    expect(page).toMatch(/<HomeLocationRow/);
    expect(page.indexOf("<HomeLocationRow")).toBeGreaterThan(page.indexOf("profile.addressEmergencyNote"));
  });

  it("the pin is NOT a field of the profile form — it saves on its own", () => {
    const page = read("src/pages/client/ProfilePage.tsx");
    const schema = page.slice(page.indexOf("const profileSchema"), page.indexOf("type ProfileFormData"));
    expect(schema).not.toMatch(/home_lat|home_lng|home_location/);
    // and the page's own Save must not write them either
    const submit = page.slice(page.indexOf("const onSubmit"), page.indexOf("if (isLoading)"));
    expect(submit).not.toMatch(/home_lat|home_lng|home_location/);
  });
});
