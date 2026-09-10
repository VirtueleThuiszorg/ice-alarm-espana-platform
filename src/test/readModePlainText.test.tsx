/**
 * A LOCKED CARD MUST READ AS A RECORD, NOT AS A SWITCHED-OFF FORM.
 *
 * `<fieldset disabled>` stops the typing and does nothing about the look: a disabled input is
 * still an input — a border, a box, a placeholder, a chevron. The brief asks for READ-ONLY BY
 * DEFAULT as *"plain text, no input chrome"*, and a member record that looks like a greyed-out
 * form is not that.
 *
 * TWO HALVES, BOTH PINNED. jsdom applies no stylesheet, so a rendering test can prove the hook
 * is on the element and nothing about what it does; the CSS is asserted against `index.css`
 * itself, the same way `helpers/contrast.ts` checks the palette. Either half alone passes
 * while the feature is broken — the class with no rule, or the rule with nothing carrying it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configure, render, screen, cleanup, fireEvent } from "@testing-library/react";

configure({ getElementError: (message) => new Error(message ?? "element not found") });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

import { EditableCard } from "@/components/EditableCard";

const CSS = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** The declarations of the read-mode block, whitespace-flattened. */
function readModeRule(): string {
  const start = CSS.indexOf(".editable-card-fields:disabled input,");
  expect(start, "the read-mode rule is missing from index.css").toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start)).replace(/\s+/g, " ");
}

afterEach(cleanup);

describe("the hook is on the element", () => {
  it("every card's fieldset carries the read-mode class", () => {
    render(
      <EditableCard testId="c" title="Profile" onSave={() => true}>
        <input aria-label="city" />
      </EditableCard>,
    );
    const fieldset = screen.getByTestId("c-fields");
    expect(fieldset.className).toContain("editable-card-fields");
    // The class alone does nothing: `:disabled` is what selects read mode.
    expect((fieldset as HTMLFieldSetElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("c-edit"));
    expect((screen.getByTestId("c-fields") as HTMLFieldSetElement).disabled).toBe(false);
    // The class stays; the selector stops matching. Edit mode is untouched by any of this.
    expect(screen.getByTestId("c-fields").className).toContain("editable-card-fields");
  });

  it("a locked card is the same for every mode that has fields", () => {
    render(
      <EditableCard
        testId="locked"
        mode="locked"
        title="Current plan"
        lockedReason="Set by the payment path."
      >
        <input aria-label="plan" />
      </EditableCard>,
    );
    expect(screen.getByTestId("locked-fields").className).toContain("editable-card-fields");
  });
});

describe("the rule that gives it meaning", () => {
  it("strips the input chrome", () => {
    const rule = readModeRule();
    expect(rule).toMatch(/border-color:\s*transparent/);
    expect(rule).toMatch(/background-color:\s*transparent/);
    expect(rule).toMatch(/box-shadow:\s*none/);
    expect(rule).toMatch(/padding-left:\s*0/);
  });

  it("keeps the VALUE at full contrast, which a browser would not", () => {
    /*
      A disabled control is greyed by the UA. WCAG 1.4.3 exempts disabled controls, and that
      exemption is for things you cannot use — not for the primary way of reading a medical
      record down the phone.
    */
    const rule = readModeRule();
    expect(rule).toMatch(/color:\s*hsl\(var\(--foreground\)\)/);
    expect(rule).toMatch(/-webkit-text-fill-color:\s*hsl\(var\(--foreground\)\)/);
    expect(rule).toMatch(/opacity:\s*1/);
  });

  it("covers the three things a field can be, not just <input>", () => {
    // A textarea and a shadcn Select trigger are as much "input chrome" as an input is; a
    // rule that only names `input` leaves the medical notes in a box on a locked card.
    const selectors = CSS.slice(
      CSS.indexOf(".editable-card-fields:disabled input,"),
      CSS.indexOf("{", CSS.indexOf(".editable-card-fields:disabled input,")),
    );
    expect(selectors).toContain("textarea");
    expect(selectors).toContain('[role="combobox"]');
  });

  it("hides what would be read as data or as a control that is not there", () => {
    const flat = CSS.replace(/\s+/g, " ");
    // "e.g. Penicillin, Shellfish" looks exactly like a recorded allergy once the box is gone.
    expect(flat).toMatch(/\.editable-card-fields:disabled input::placeholder[^{]*\{[^}]*color: transparent/);
    // The select chevron and the date picker's icon both promise a control that is not there.
    expect(flat).toMatch(/\.editable-card-fields:disabled \[role="combobox"\] svg[^{]*\{[^}]*display: none/);
    expect(flat).toContain("::-webkit-calendar-picker-indicator");
  });

  it("is scoped to the card — it must not reach the rest of the app", () => {
    /*
      The member portal and the public site share these controls. A rule that dropped the
      `.editable-card-fields` prefix would flatten every disabled input in the product.
    */
    const start = CSS.indexOf("── READ MODE LOOKS LIKE READING");
    const section = CSS.slice(start, start + 3000);
    const selectorLines = section
      .split("\n")
      .filter((line) => line.includes(":disabled") && line.trim().endsWith(","));
    expect(selectorLines.length).toBeGreaterThan(0);
    for (const line of selectorLines) {
      expect(line, line).toContain(".editable-card-fields");
    }
  });
});
