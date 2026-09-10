/**
 * READ-ONLY UNTIL SOMEBODY DECIDES TO EDIT.
 *
 * Every field of a member's record used to be a live input the moment the tab opened. A staff
 * member reading an address down the phone was one stray keypress from changing it; a tab left
 * open on a shared screen was an edit waiting to happen; and there was no moment at which
 * anybody decided "I am changing this now". For the address an ambulance is sent to and the
 * allergies read out to a crew, read-by-default is not a nicety.
 *
 * The assertions are about the DOM rather than the source, because "locked" is a property of
 * what a click does. A `disabled` prop somebody forgot on the forty-first input looks exactly
 * like one they remembered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
let updateError: { message: string } | null = null;
let medicalRow: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.maybeSingle = async () => ({ data: table === "medical_information" ? medicalRow : null, error: null });
    q.update = (payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return { eq: async () => ({ error: updateError }) };
    };
    q.insert = async (payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return { error: updateError };
    };
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    },
  };
});

const logged: Array<{ action: string; memberId: string; newValues?: Record<string, unknown> }> = [];
vi.mock("@/lib/auditLog", () => ({
  logMemberActivity: async (
    action: string,
    memberId: string,
    _old?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
  ) => {
    logged.push({ action, memberId, newValues });
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

vi.mock("@/components/admin/member-detail/PartnerAttributionCard", () => ({
  PartnerAttributionCard: () => null,
}));

import { ProfileTab } from "@/components/admin/member-detail/ProfileTab";
import { MedicalTab } from "@/components/admin/member-detail/MedicalTab";

const MEMBER = {
  id: "m1",
  first_name: "Mary",
  last_name: "Quinn",
  email: "mary@example.com",
  phone: "600111222",
  status: "active",
  address_line_1: "Calle Mayor 1",
  address_line_2: null,
  city: "Marbella",
  province: "Málaga",
  postal_code: "29601",
  country: "Spain",
  preferred_language: "en",
  date_of_birth: "1938-04-05",
  nie_dni: null,
  special_instructions: null,
};

beforeEach(() => {
  updates = [];
  updateError = null;
  medicalRow = null;
  logged.length = 0;
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterEach(cleanup);

const fields = (testId: string) => screen.getByTestId(`${testId}-fields`) as HTMLFieldSetElement;

describe("the profile card", () => {
  it("opens locked: every input is disabled and there is no Save", () => {
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    expect(fields("profile-card").disabled).toBe(true);
    expect(screen.getByTestId("profile-card-lock")).toBeTruthy();
    expect(screen.queryByTestId("profile-card-save")).toBeNull();
    // The inputs are still THERE and still readable — locked is not hidden.
    const inputs = fields("profile-card").querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(5);
    expect((inputs[0] as HTMLInputElement).value).toBe("Mary");
  });

  it("Edit unlocks the whole card at once", () => {
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    expect(fields("profile-card").disabled).toBe(false);
    expect(screen.queryByTestId("profile-card-lock")).toBeNull();
    expect(screen.getByTestId("profile-card-save")).toBeTruthy();
  });

  it("Save writes the record, an audit row, and locks again", async () => {
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    const city = fields("profile-card").querySelector('input[name="city"]') as HTMLInputElement;
    fireEvent.change(city, { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    await waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(updates[0].table).toBe("members");
    expect(updates[0].payload.city).toBe("Estepona");
    expect(logged[0]).toMatchObject({ action: "update", memberId: "m1" });
    await waitFor(() => expect(fields("profile-card").disabled).toBe(true));
  });

  it("a refused write leaves the card OPEN with what was typed still in it", async () => {
    updateError = { message: "activation is the payment webhook's job" };
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(fields("profile-card").querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Closing here would show the old value back and imply it had been saved.
    expect(fields("profile-card").disabled).toBe(false);
    expect(
      (fields("profile-card").querySelector('input[name="city"]') as HTMLInputElement).value,
    ).toBe("Estepona");
    // And the database's own sentence, not a generic failure.
    expect(String(toastError.mock.calls[0][0])).toContain("payment webhook");
  });

  it("Cancel on a changed card asks before discarding", async () => {
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(fields("profile-card").querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });
    fireEvent.click(screen.getByTestId("profile-card-cancel"));

    await waitFor(() => expect(screen.getByTestId("profile-card-discard")).toBeTruthy());
    // Still open, still editable, nothing thrown away yet.
    expect(fields("profile-card").disabled).toBe(false);

    fireEvent.click(screen.getByTestId("profile-card-discard"));
    await waitFor(() => expect(fields("profile-card").disabled).toBe(true));
    expect(updates).toHaveLength(0);
  });

  it("Cancel on an untouched card just closes — no dialog to dismiss for nothing", async () => {
    render(<ProfileTab member={MEMBER} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(fields("profile-card").disabled).toBe(true));
    expect(screen.queryByTestId("profile-card-discard")).toBeNull();
  });
});

describe("the medical card", () => {
  it("opens locked, chips and all", async () => {
    medicalRow = { id: "med1", allergies: ["Penicillin"], medications: [], medical_conditions: [] };
    render(<MedicalTab memberId="m1" />);
    await waitFor(() => expect(screen.getByTestId("medical-card-fields")).toBeTruthy());
    expect(fields("medical-card").disabled).toBe(true);
    // The chip's remove control is a real button, so the fieldset makes it inert. An <svg
    // onClick> would still have fired.
    /*
      `:disabled` is the assertion, not a click that does nothing. jsdom still dispatches a
      synthetic click to a disabled button's listeners where a browser suppresses activation
      entirely, so clicking here would prove the opposite of what a real one does. What
      matters is that the control IS in the disabled state — which an <svg onClick> can never
      be, and which is why the chip's remove control is a real button.
    */
    const remove = screen.getByLabelText("Remove Penicillin") as HTMLButtonElement;
    expect(remove.matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Add allergy").matches(":disabled")).toBe(true);
  });

  it("a chip added and then cancelled is warned about and put back", async () => {
    medicalRow = { id: "med1", allergies: ["Penicillin"], medications: [], medical_conditions: [] };
    render(<MedicalTab memberId="m1" />);
    await waitFor(() => expect(screen.getByTestId("medical-card-fields")).toBeTruthy());
    fireEvent.click(screen.getByTestId("medical-card-edit"));

    fireEvent.change(screen.getByPlaceholderText("Add allergy..."), {
      target: { value: "Shellfish" },
    });
    fireEvent.click(screen.getByLabelText("Add allergy"));
    await waitFor(() => expect(screen.getByText("Shellfish")).toBeTruthy());

    // The chip lists are state, not form fields — without the baseline this cancel would
    // discard the new allergy with no warning at all.
    fireEvent.click(screen.getByTestId("medical-card-cancel"));
    await waitFor(() => expect(screen.getByTestId("medical-card-discard")).toBeTruthy());
    fireEvent.click(screen.getByTestId("medical-card-discard"));
    await waitFor(() => expect(screen.queryByText("Shellfish")).toBeNull());
    expect(screen.getByText("Penicillin")).toBeTruthy();
  });

  it("Save records WHAT changed without copying the medical values into the audit log", async () => {
    medicalRow = { id: "med1", allergies: ["Penicillin"], medications: [], medical_conditions: [] };
    render(<MedicalTab memberId="m1" />);
    await waitFor(() => expect(screen.getByTestId("medical-card-fields")).toBeTruthy());
    fireEvent.click(screen.getByTestId("medical-card-edit"));
    fireEvent.click(screen.getByTestId("medical-card-save"));

    await waitFor(() => expect(logged.length).toBeGreaterThan(0));
    expect(logged[0].newValues).toMatchObject({ table: "medical_information" });
    expect(logged[0].newValues!.fields).toContain("allergies");
    // activity_logs is read by more people than this tab is.
    expect(JSON.stringify(logged[0].newValues)).not.toContain("Penicillin");
  });
});
