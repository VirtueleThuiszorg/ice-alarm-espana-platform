/**
 * WHAT A MEMBER SEES WHEN THEY OPEN THE LINK — rendered, because that is the claim.
 *
 * The old page rendered nine tokens. A token asking for a date of birth or a postal code
 * produced a page that did not mention them, and no test could tell, because every test the
 * page had was about the token being valid rather than about what appeared underneath.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let validateResponse: Record<string, unknown> = {};
let submitted: Array<{ name: string; body: Record<string, unknown> }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
        submitted.push({ name, body: opts.body });
        if (name === "validate-member-update-token") return { data: validateResponse, error: null };
        return { data: { success: true, outcome: "recorded" }, error: null };
      },
    },
  },
}));

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams("token=abc")],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => (typeof def === "string" ? def : key),
    i18n: { changeLanguage: () => {} },
  }),
}));

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));

import MemberUpdatePage from "@/pages/MemberUpdatePage";

const ALL_REQUESTED = [
  "first_name",
  "last_name",
  "date_of_birth",
  "nie_dni",
  "address_line_1",
  "city",
  "province",
  "postal_code",
  "phone",
  "email",
  "blood_type",
  "allergies",
  "medications",
  "doctor_name",
  "doctor_phone",
  "hospital_preference",
  "emergency_contact",
];

beforeEach(() => {
  submitted = [];
  validateResponse = {
    valid: true,
    requestedFields: ALL_REQUESTED,
    member: {
      id: "m1",
      first_name: "Mary",
      last_name: "Quinn",
      email: "mary@example.com",
      phone: "",
      nie_dni: null,
      address_line_1: "Calle Mayor 1",
      city: "",
      province: "",
      postal_code: "",
      date_of_birth: "1938-04-05",
      preferred_language: "en",
    },
    medical: { blood_type: null, allergies: ["Penicillin"] },
    emergencyContacts: [],
  };
});
afterEach(cleanup);

async function open() {
  render(<MemberUpdatePage />);
  await waitFor(() => expect(screen.getByTestId("update-field-first_name")).toBeTruthy());
}

describe("the member's update page", () => {
  it("renders every field the token asked for, in its group", async () => {
    await open();
    for (const key of ALL_REQUESTED.filter((k) => k !== "emergency_contact")) {
      expect(screen.getByTestId(`update-field-${key}`)).toBeTruthy();
    }
    for (const group of ["identity", "address", "contact", "medical"]) {
      expect(screen.getByTestId(`update-group-${group}`)).toBeTruthy();
    }
    // The contact editor is a repeated block, not a field.
    expect(screen.queryByTestId("update-field-emergency_contact")).toBeNull();
    expect(screen.getByText("Emergency Contacts")).toBeTruthy();
  });

  it("shows only what was asked for", async () => {
    validateResponse = { ...validateResponse, requestedFields: ["nie_dni"] };
    render(<MemberUpdatePage />);
    await waitFor(() => expect(screen.getByTestId("update-field-nie_dni")).toBeTruthy());
    expect(screen.queryByTestId("update-field-postal_code")).toBeNull();
    expect(screen.queryByTestId("update-group-medical")).toBeNull();
  });

  it("says why each one is needed, in the member's own words", async () => {
    await open();
    expect(screen.getByText(/Where the ambulance goes/)).toBeTruthy();
    expect(screen.getByText(/Read out to the ambulance crew/)).toBeTruthy();
  });

  it("pre-fills what we already hold, including list fields", async () => {
    await open();
    const firstName = screen.getByTestId("update-field-first_name").querySelector("input")!;
    expect((firstName as HTMLInputElement).value).toBe("Mary");
    const allergies = screen.getByTestId("update-field-allergies").querySelector("textarea")!;
    expect((allergies as HTMLTextAreaElement).value).toBe("Penicillin");
    const city = screen.getByTestId("update-field-city").querySelector("input")!;
    expect((city as HTMLInputElement).value).toBe("");
  });

  it("uses a phone keypad for a phone and a date control for a date", async () => {
    await open();
    expect(
      screen.getByTestId("update-field-phone").querySelector("input")!.getAttribute("type"),
    ).toBe("tel");
    expect(
      screen.getByTestId("update-field-date_of_birth").querySelector("input")!.getAttribute("type"),
    ).toBe("date");
    expect(
      screen.getByTestId("update-field-email").querySelector("input")!.getAttribute("type"),
    ).toBe("email");
  });

  it("submits what was typed, split by table, and nothing blank", async () => {
    await open();
    fireEvent.change(screen.getByTestId("update-field-city").querySelector("input")!, {
      target: { value: "Marbella" },
    });
    fireEvent.change(screen.getByTestId("update-field-medications").querySelector("textarea")!, {
      target: { value: "Aspirin, Metformin" },
    });
    fireEvent.click(screen.getByText("Submit Update"));

    await waitFor(() =>
      expect(submitted.some((s) => s.name === "submit-member-update")).toBe(true),
    );
    const body = submitted.find((s) => s.name === "submit-member-update")!.body as {
      member: Record<string, unknown>;
      medical: Record<string, unknown>;
    };
    expect(body.member.city).toBe("Marbella");
    expect(body.member.first_name).toBe("Mary");
    expect(body.medical.medications).toEqual(["Aspirin", "Metformin"]);
    // Never touched, never sent — the endpoint must not receive a blank for it.
    expect("province" in body.member).toBe(false);
    expect("blood_type" in body.medical).toBe(false);
  });
});
