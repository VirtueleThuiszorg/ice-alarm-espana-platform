/**
 * STAFF CORRECTING A PIN OVER THE PHONE — and the two things that must not blur.
 *
 *   1. A STAFF CORRECTION IS NOT A MEMBER CONFIRMATION. The SOS card labels them differently,
 *      and it can only do that if the write says `staff_pin`. `guard_member_home_location()`
 *      refuses a member source from a staff write, so this is belt and braces — but a UI that
 *      tried would be a bug even with the database catching it.
 *   2. "USE MY CURRENT LOCATION" IS THE MEMBER'S BUTTON ONLY. An operator pressing it from the
 *      office would place the pin on the office, and the trigger would faithfully record that
 *      as a staff correction of the member's front door — because that is exactly what it would
 *      be. The control must not exist on the staff surface at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The RAW columns, as PostgREST returns them. An earlier version of this file handed the mock
 * the hook's already-mapped shape (`lat`/`lng`/`source`), so `useMemberHomeLocation` mapped
 * `undefined` out of it and every "has a pin" assertion failed while the "no pin" one passed —
 * a green empty state over a fixture that was there all along.
 */
const row = (over: Record<string, unknown> = {}) => ({
  home_lat: 37.388,
  home_lng: -2.148,
  home_location_accuracy_m: null,
  home_location_source: "member_pin",
  home_location_set_at: null,
  ...over,
});

let homeRow: Record<string, unknown> | null = null;
let memberUpdates: Array<Record<string, unknown>> = [];
let audit: Array<{ action: string; newValues: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: homeRow, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => {
        memberUpdates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    functions: { invoke: () => Promise.resolve({ data: { success: true }, error: null }) },
  },
}));

vi.mock("@/lib/auditLog", () => ({
  logMemberActivity: (action: string, _id: string, _old: unknown, newValues: unknown) => {
    audit.push({ action, newValues });
    return Promise.resolve();
  },
}));

vi.mock("@/lib/geocode", () => ({
  forwardGeocode: () => Promise.resolve({ lat: 37.3886, lng: -2.1487 }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
      return text.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(vars[n] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

async function renderCard() {
  const { StaffHomeLocationCard } = await import(
    "@/components/admin/member-detail/StaffHomeLocationCard"
  );
  return wrap(
    <StaffHomeLocationCard
      memberId="m1"
      address={{ line1: "Calle A 1", city: "Albox", province: "Almeria", postalCode: "04800" }}
    />,
  );
}

beforeEach(() => {
  homeRow = null;
  memberUpdates = [];
  audit = [];
});
afterEach(() => cleanup());

describe("the staff card on the member record", () => {
  it("says plainly when there is no pin, and what happens instead", async () => {
    await renderCard();
    expect(await screen.findByTestId("staff-home-location-none")).toHaveTextContent(
      /will fall back to the postal address/i,
    );
    expect(screen.getByTestId("staff-home-location-edit")).toHaveTextContent("Set the pin");
    // Nothing to open in Maps yet.
    expect(screen.queryByTestId("staff-home-location-map")).not.toBeInTheDocument();
  });

  /*
    ONE RENDER PER TEST. An earlier version called `cleanup()` mid-test and re-rendered with a
    different row; the second render's query never resolved in time and both halves reported
    "element not found" — a harness failure that reads exactly like the component being broken.
  */
  it("a member's own pin reads as confirmed BY THE MEMBER", async () => {
    homeRow = row({ home_location_set_at: "2026-06-03T09:30:00.000Z" });
    await renderCard();
    expect(await screen.findByTestId("staff-home-location-source")).toHaveTextContent(
      "Confirmed by the member",
    );
    expect(screen.getByTestId("staff-home-location-date")).toHaveTextContent("3 Jun 2026");
  });

  it("a CRM-imported coordinate reads as NOT CONFIRMED — which is the whole point", async () => {
    homeRow = row({ home_location_source: "imported" });
    await renderCard();
    const badge = await screen.findByTestId("staff-home-location-source");
    expect(badge).toHaveTextContent(/not confirmed/i);
    expect(badge).not.toHaveTextContent(/Confirmed by the member/);
  });

  it("a geocoded coordinate reads as not confirmed either", async () => {
    homeRow = row({ home_location_source: "geocoded" });
    await renderCard();
    expect(await screen.findByTestId("staff-home-location-source")).toHaveTextContent(
      /not confirmed/i,
    );
  });

  it("shows the accuracy of a member's GPS fix", async () => {
    homeRow = row({ home_location_source: "member_gps", home_location_accuracy_m: 18.4 });
    await renderCard();
    expect(await screen.findByTestId("staff-home-location-coords")).toHaveTextContent("±18 m");
  });

  it("and claims no accuracy for a dragged pin, which has none", async () => {
    homeRow = row();
    await renderCard();
    expect(await screen.findByTestId("staff-home-location-coords")).not.toHaveTextContent("±");
  });

  it("a correction writes staff_pin and an attributed audit row", async () => {
    homeRow = row();
    await renderCard();
    fireEvent.click(await screen.findByTestId("staff-home-location-edit"));
    fireEvent.click(await screen.findByTestId("home-location-save"));

    await waitFor(() => expect(memberUpdates).toHaveLength(1));
    expect(memberUpdates[0]).toMatchObject({
      home_location_source: "staff_pin",
      home_location_accuracy_m: null,
    });
    // NEVER a member source from a staff surface.
    expect(memberUpdates[0].home_location_source).not.toBe("member_pin");
    expect(audit).toEqual([{ action: "home_location_set", newValues: { source: "staff_pin" } }]);
  });
});

describe("the dialog knows which surface it is on", () => {
  async function renderDialog(actor: "member" | "staff") {
    const { SetHomeLocationDialog } = await import("@/components/maps/SetHomeLocationDialog");
    return wrap(
      <SetHomeLocationDialog
        open
        onOpenChange={() => {}}
        memberId="m1"
        actor={actor}
        existing={{ lat: 37.388, lng: -2.148 }}
      />,
    );
  }

  it("offers the browser fix to the MEMBER", async () => {
    await renderDialog("member");
    expect(screen.getByTestId("home-location-use-current")).toBeInTheDocument();
  });

  it("does NOT offer it to STAFF — it would pin the office, and record that as the front door", async () => {
    await renderDialog("staff");
    expect(screen.queryByTestId("home-location-use-current")).not.toBeInTheDocument();
    // The map and its nudge controls are still there: staff place the pin from what the member
    // is telling them on the phone.
    await waitFor(() => expect(screen.getByTestId("home-location-nudge")).toBeInTheDocument());
  });

  it("tells staff, in the dialog, that this is recorded as OUR correction", async () => {
    await renderDialog("staff");
    expect(
      screen.getByText(/not as the member's own confirmation/i),
    ).toBeInTheDocument();
  });

  it("and tells the member what it is for, in their own terms", async () => {
    await renderDialog("member");
    expect(
      screen.getByText(/where we send help if your pendant cannot tell us where you are/i),
    ).toBeInTheDocument();
  });
});
