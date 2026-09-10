/**
 * THE SHARED LOCK — one shell for the member portal and the staff record.
 *
 * `EditableCard` was written for the staff CRM (#301), lived in
 * `src/components/admin/member-detail/`, and moved to `src/components/EditableCard.tsx` in
 * #310 so both surfaces could mount it. Two copies of a lock is one copy that gets the next
 * fix.
 *
 * What THIS suite covers is the half the member portal needed and the staff record did not:
 * `FieldControl`, the context that drives it, and `disableFieldsWhenLocked`.
 *
 * WHAT IS ASSERTED HERE, and why each one is not obvious:
 *
 *   1. It opens LOCKED. The whole point, and the one property that a refactor of the header
 *      buttons could silently invert.
 *   2. Save re-locks — but ONLY when the save actually happened. `onSave` returning `false` is
 *      how a validation failure or a refused write says so, and closing the card on that would
 *      throw away what somebody typed and tell them it was saved.
 *   3. Cancel with changes ASKS. Without the dirty check the discard dialog either never
 *      appears (data lost silently) or always appears (which trains people to dismiss it).
 *   4. Cancel with NO changes does not ask, for the same reason.
 *   5. `FieldControl` renders text when locked and the input when not — MEMBER_UX_RULES R6, and
 *      the difference between the two audiences. The staff record keeps greyed inputs via
 *      `fieldset disabled`; a member reads their own account as label and value.
 *   6. A field outside a card THROWS rather than defaulting. A default of `editing: false` is
 *      an unreachable read-only field; `editing: true` is a silently live one. Neither is
 *      visible on screen, so the mistake is made loud.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EditableCard } from "@/components/EditableCard";
import { FieldControl } from "@/components/FieldControl";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

afterEach(cleanup);

const TID = "card";

function Harness({
  onSave = () => true,
  isDirty = false,
  onCancel,
  read = "Calle Mayor 1",
}: {
  onSave?: () => boolean | Promise<boolean>;
  isDirty?: boolean;
  onCancel?: () => void;
  read?: string | null;
}) {
  return (
    <EditableCard
      testId={TID}
      title="Address"
      isDirty={isDirty}
      onSave={onSave}
      onCancel={onCancel}
      disableFieldsWhenLocked={false}
    >
      <FieldControl testId="field" read={read}>
        <input aria-label="Address line 1" defaultValue={read ?? ""} />
      </FieldControl>
    </EditableCard>
  );
}

describe("the card opens locked", () => {
  it("shows Edit, and neither Save nor Cancel", () => {
    render(<Harness />);
    expect(screen.getByTestId(`${TID}-edit`)).toBeVisible();
    expect(screen.queryByTestId(`${TID}-save`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-cancel`)).toBeNull();
  });

  it("carries a padlock, which is the only thing on screen that says so", () => {
    render(<Harness />);
    expect(screen.getByTestId(`${TID}-lock`)).toBeTruthy();
  });

  it("the padlock goes when it is unlocked — otherwise it would be furniture", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    expect(screen.queryByTestId(`${TID}-lock`)).toBeNull();
  });
});

describe("FieldControl — R6, text until it is not", () => {
  it("renders the value as text while locked, and no input at all", () => {
    render(<Harness />);
    const field = screen.getByTestId("field");
    expect(field).toHaveTextContent("Calle Mayor 1");
    expect(field.querySelector("input"), "a locked field has no input").toBeNull();
    expect(field).toHaveAttribute("data-locked", "true");
  });

  it("renders the input once the card is unlocked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    expect(screen.getByLabelText("Address line 1")).toBeVisible();
    expect(screen.getByTestId("field")).toHaveAttribute("data-locked", "false");
  });

  it("an empty value says 'Not added' rather than rendering a blank line", () => {
    // A blank line is indistinguishable from a field that failed to load.
    render(<Harness read={null} />);
    expect(screen.getByTestId("not-added")).toBeVisible();
  });

  it("a blank STRING is empty too — an imported row can carry \"\" in a NOT NULL column", () => {
    render(<Harness read="   " />);
    expect(screen.getByTestId("not-added")).toBeVisible();
  });

  it("the empty state offers an inline Add that unlocks the card it is in", () => {
    // R6: *"Empty = 'Not added' + inline Add."* Without it a member has to scroll up, find
    // Edit, and then find the field again.
    render(<Harness read={null} />);
    fireEvent.click(screen.getByTestId("field-inline-add"));
    expect(screen.getByLabelText("Address line 1")).toBeVisible();
  });

  it("no inline Add on a field with a value — there is nothing to add", () => {
    render(<Harness />);
    expect(screen.queryByTestId("field-inline-add")).toBeNull();
  });
});

describe("Save", () => {
  it("calls onSave and re-locks the card", async () => {
    const onSave = vi.fn(() => true);
    render(<Harness onSave={onSave} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-save`));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId(`${TID}-edit`)).toBeVisible());
  });

  it("STAYS OPEN when onSave returns false — a refused write must not look like a saved one", async () => {
    /*
      The load-bearing case. `false` is how a validation failure or an RLS refusal says the
      write did not happen; re-locking on it would discard what the person typed and show them
      a read-only card that looks saved.
    */
    render(<Harness onSave={() => false} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-save`));
    await waitFor(() => expect(screen.getByTestId(`${TID}-save`)).toBeVisible());
    expect(screen.queryByTestId(`${TID}-edit`)).toBeNull();
  });

  it("awaits an async onSave before deciding", async () => {
    render(<Harness onSave={() => Promise.resolve(false)} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-save`));
    await waitFor(() => expect(screen.getByTestId(`${TID}-save`)).toBeVisible());
  });
});

describe("Cancel, and the changes it would lose", () => {
  it("with NO changes it just closes — asking every time trains people to dismiss it", () => {
    const onCancel = vi.fn();
    render(<Harness isDirty={false} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-cancel`));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(`${TID}-edit`)).toBeVisible();
  });

  it("with changes it ASKS, and does not discard until the answer is Discard", async () => {
    const onCancel = vi.fn();
    render(<Harness isDirty onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-cancel`));

    // Asked, and nothing discarded yet.
    expect(await screen.findByText(/Discard your changes\?/i)).toBeVisible();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId(`${TID}-save`)).toBeVisible();

    fireEvent.click(screen.getByTestId(`${TID}-discard`));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId(`${TID}-edit`)).toBeVisible());
  });

  it("'Keep editing' leaves the card open with the changes still in it", async () => {
    const onCancel = vi.fn();
    render(<Harness isDirty onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId(`${TID}-edit`));
    fireEvent.click(screen.getByTestId(`${TID}-cancel`));
    fireEvent.click(await screen.findByText(/Keep editing/i));
    await waitFor(() => expect(screen.queryByText(/Discard your changes\?/i)).toBeNull());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId(`${TID}-save`)).toBeVisible();
  });
});

describe("leaving the page with unsaved changes", () => {
  it("registers a beforeunload warning only while dirty AND editing", () => {
    /*
      The in-app Cancel is guarded above; this covers the ways out the component cannot see —
      the back button, a closed tab, a link to another page. It has to be REMOVED when clean,
      because a browser warning on a card nobody changed is the same false alarm as an
      always-on discard dialog.
    */
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    try {
      const { unmount } = render(<Harness isDirty />);
      expect(add.mock.calls.some(([e]) => e === "beforeunload")).toBe(false);

      fireEvent.click(screen.getByTestId(`${TID}-edit`));
      expect(add.mock.calls.some(([e]) => e === "beforeunload")).toBe(true);

      unmount();
      expect(remove.mock.calls.some(([e]) => e === "beforeunload")).toBe(true);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it("does not register one for a card with no changes", () => {
    const add = vi.spyOn(window, "addEventListener");
    try {
      render(<Harness isDirty={false} />);
      fireEvent.click(screen.getByTestId(`${TID}-edit`));
      expect(add.mock.calls.some(([e]) => e === "beforeunload")).toBe(false);
    } finally {
      add.mockRestore();
    }
  });
});

describe("the fieldset, which is the staff record's way of locking", () => {
  it("is disabled while locked when the card asks for it", () => {
    render(
      <EditableCard testId="staffish" title="Record" onSave={() => true}>
        <input aria-label="Notes" />
      </EditableCard>,
    );
    const fields = screen.getByTestId("staffish-fields");
    expect(fields.tagName).toBe("FIELDSET");
    expect(fields).toBeDisabled();
    expect(screen.getByLabelText("Notes")).toBeDisabled();
  });

  it("and is not a fieldset at all when the fields lock themselves", () => {
    // A disabled fieldset wrapped around plain text is a group assistive technology announces
    // as unavailable for nothing.
    render(<Harness />);
    expect(screen.getByTestId(`${TID}-fields`).tagName).not.toBe("FIELDSET");
  });
});

describe("a lockable field outside any card", () => {
  it("throws, rather than guessing whether it is locked", () => {
    /*
      `editing: false` as a default would render a field no Edit button can reach; `true` would
      render a silently live one, which is the defect this component exists to end. Both look
      identical to a correct field on screen.
    */
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<FieldControl read="x" />)).toThrow(/inside an <EditableCard>/);
    } finally {
      quiet.mockRestore();
    }
  });
});

describe("one component, both surfaces", () => {
  it("the staff record and the member portal import the SAME card", async () => {
    /*
      The point of the shared location (#310). A second copy beside either surface is the thing
      this asserts against: a bug in the discard guard must be one bug in one place, and two
      self-consistent shells disagree within a month about what Cancel does with an unsaved
      change without either looking wrong.

      `memberLockedUntilEdit.test.tsx` guards the other half — that there is exactly ONE
      `export function EditableCard` under `src`, and that it is not inside a surface folder.
    */
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
    for (const file of [
      "src/components/admin/member-detail/ProfileTab.tsx",
      "src/components/admin/member-detail/MedicalTab.tsx",
      "src/pages/client/ProfilePage.tsx",
      "src/pages/client/MedicalInfoPage.tsx",
    ]) {
      expect(read(file), file).toMatch(/from "@\/components\/EditableCard"/);
    }
  });

  it("the member's cards do NOT get the fieldset, and the staff record's do", () => {
    /*
      The one deliberate difference between the two surfaces, and the reason it is a prop rather
      than a fork. R6 wants a member's field to be its VALUE when locked, not a greyed box; the
      staff record wants the form's shape. R11 makes the same argument about type size, and
      calls it out as not a compromise to split.
    */
    const member = read("src/pages/client/ProfilePage.tsx");
    const medical = read("src/pages/client/MedicalInfoPage.tsx");
    for (const [name, src] of [["Profile", member], ["Medical", medical]] as const) {
      expect(src, `${name} must opt out of the fieldset`).toContain(
        "disableFieldsWhenLocked",
      );
    }
    // The staff tabs do not pass it, so they keep the default.
    for (const tab of ["ProfileTab", "MedicalTab"]) {
      expect(
        read(`src/components/admin/member-detail/${tab}.tsx`),
        `${tab} must keep the fieldset`,
      ).not.toContain("disableFieldsWhenLocked");
    }
  });
});
