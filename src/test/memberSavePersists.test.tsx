/**
 * SAVE, THEN READ IT BACK — the half of "locked until Edit" that the other suites do not cover.
 *
 * `memberLockedUntilEdit.test.tsx` proves Save WRITES: it asserts the update payload. That is
 * not the same claim as the brief's — *"after Save the value persists on reload"* — and the
 * gap between them is a real bug class:
 *
 *   · a form that writes a column nothing reads back (a rename on one side only);
 *   · a card that re-locks showing the value it had BEFORE the save, because it reset itself
 *     from stale props rather than from what came back;
 *   · a save that appears to work and is gone the next time anybody opens the record.
 *
 * THE FAKE IS NOT A STUB THAT RECORDS CALLS. It holds a row, applies the update to it, and
 * serves the updated row to the next read — the minimum needed for "persists" to mean
 * anything. The "reload" is a real unmount, then a fresh mount fed from that row, exactly as
 * `MemberDetailPage` feeds this tab from its own fetch.
 *
 * AT THE TAB, NOT THE WHOLE PAGE. An earlier version rendered `MemberDetailPage` four times
 * over. That is a large DOM for a claim about one card, and a big DOM is what turns a failed
 * query into a multi-second `prettyDOM` dump — the thing that made an earlier suite in this
 * series stall the runner instead of failing. What the page adds is one assertion (that it
 * re-reads after a save), and that is kept below by watching `onUpdate`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configure, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

configure({ getElementError: (message) => new Error(message ?? "element not found") });

/** THE ROW, which survives between mounts exactly as a database row would. */
let stored: Record<string, unknown>;
let updates = 0;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.update = (payload: Record<string, unknown>) => ({
      eq: async () => {
        if (table === "members") {
          updates += 1;
          // What a database does: keep it. Anything the form did not send stays as it was.
          stored = { ...stored, ...payload };
        }
        return { error: null };
      },
    });
    return q;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

vi.mock("@/lib/auditLog", () => ({ logMemberActivity: async () => {} }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));
vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
vi.mock("@/components/admin/member-detail/PartnerAttributionCard", () => ({
  PartnerAttributionCard: () => null,
}));

import { ProfileTab } from "@/components/admin/member-detail/ProfileTab";

type Member = Parameters<typeof ProfileTab>[0]["member"];

const fields = () => screen.getByTestId("profile-card-fields") as HTMLFieldSetElement;
const field = (name: string) =>
  fields().querySelector(`input[name="${name}"]`) as HTMLInputElement;

let reReads = 0;

/** Open the card as a fresh visit would: mounted from whatever the row now says. */
function openCard() {
  render(<ProfileTab member={stored as unknown as Member} onUpdate={() => (reReads += 1)} />);
  expect(screen.getByTestId("profile-card-fields")).toBeTruthy();
}

beforeEach(() => {
  updates = 0;
  reReads = 0;
  stored = {
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
});
afterEach(cleanup);

describe("a saved value survives", () => {
  it("is on the card after Save, not the value it had before", async () => {
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    await waitFor(() => expect(fields().disabled).toBe(true));
    expect(field("city").value).toBe("Estepona");
    expect(stored.city).toBe("Estepona");
  });

  it("is still there when the record is opened again — the reload", async () => {
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.change(field("nie_dni"), { target: { value: "X1234567A" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    cleanup();
    openCard();
    expect(field("city").value).toBe("Estepona");
    expect(field("nie_dni").value).toBe("X1234567A");
    expect(fields().disabled).toBe(true);
  });

  it("writes the whole card, so a field nobody touched is not blanked", async () => {
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    cleanup();
    openCard();
    // The failure this catches: a save that sends only the dirty field, and a record that
    // loses everything the form did not name.
    expect(field("first_name").value).toBe("Mary");
    expect(field("postal_code").value).toBe("29601");
    expect(field("address_line_1").value).toBe("Calle Mayor 1");
  });

  it("tells the page to re-read, so the rest of it is not stale", async () => {
    /*
      The card shows its own form state, so it looks right whether or not anything re-read.
      Everything ELSE on the record — the name in the header, the badges, the missing-info
      count — is built from the page's fetch, and without this they keep showing the record as
      it was before the save until somebody reloads.
    */
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    await waitFor(() => expect(reReads).toBe(1));
  });

  it("does not ask about discarding when there is nothing left to discard", async () => {
    /*
      After a save the form must be told that what it holds IS the record now. Left dirty, the
      very next Edit → Cancel throws up "Discard your changes?" over an edit the operator
      already saved — and a warning that cries wolf is a warning people click through.
    */
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(fields().disabled).toBe(true));
    expect(screen.queryByTestId("profile-card-discard")).toBeNull();
  });

  it("a discarded edit changes nothing, and nothing is written", async () => {
    openCard();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(screen.getByTestId("profile-card-discard")).toBeTruthy());
    fireEvent.click(screen.getByTestId("profile-card-discard"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    /*
      PUT BACK ON THE SCREEN, not merely absent from the database. Without this the card sits
      there showing "Estepona" over a record that says Marbella — read out loud, that is the
      wrong address, and no remount is coming to correct it.
    */
    expect(field("city").value).toBe("Marbella");
    expect(updates).toBe(0);
    expect(stored.city).toBe("Marbella");

    cleanup();
    openCard();
    expect(field("city").value).toBe("Marbella");
  });
});
