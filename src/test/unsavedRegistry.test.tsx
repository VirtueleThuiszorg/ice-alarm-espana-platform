/**
 * THE REGISTRY ITSELF — what counts as "at risk", in a DOM small enough to reason about.
 *
 * `unsavedTabChange.test.tsx` proves the member record asks before leaving a tab. This proves
 * the rule underneath it: a card is only at risk while it is OPEN. A form can hold a dirty
 * flag with its card shut, and blocking navigation on that is a page nobody can leave for a
 * reason nobody can see.
 *
 * NO PROVIDER STATE, WHICH IS WHY THIS IS SAFE TO WRITE. An earlier version of the provider
 * re-rendered on every registration; a harness like this one then locked the event loop on
 * the first keystroke. The registry is a ref that is read at navigation time, and nothing
 * renders from it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { configure, render, screen, cleanup, fireEvent } from "@testing-library/react";

configure({ getElementError: (message) => new Error(message ?? "element not found") });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

import { UnsavedChangesProvider, useUnsavedChanges } from "@/components/UnsavedChanges";
import { EditableCard } from "@/components/EditableCard";

/** Reads the registry the way the page does: in a handler, at the moment of navigating. */
function Leave() {
  const unsaved = useUnsavedChanges();
  return (
    <button
      data-testid="leave"
      onClick={(e) => {
        (e.currentTarget as HTMLButtonElement).dataset.blocked = unsaved?.hasUnsaved()
          ? "true"
          : "false";
      }}
    >
      Leave
    </button>
  );
}

function ask() {
  const button = screen.getByTestId("leave");
  fireEvent.click(button);
  return button.dataset.blocked;
}

afterEach(cleanup);

describe("what counts as unsaved", () => {
  it("a DIRTY but CLOSED card does not block", () => {
    render(
      <UnsavedChangesProvider>
        <Leave />
        <EditableCard testId="c" title="Profile" isDirty onSave={() => true}>
          <input aria-label="city" />
        </EditableCard>
      </UnsavedChangesProvider>,
    );
    // Never opened. `isDirty` alone must not be what decides.
    expect(ask()).toBe("false");
  });

  it("an OPEN but untouched card does not block", () => {
    render(
      <UnsavedChangesProvider>
        <Leave />
        <EditableCard testId="c" title="Profile" isDirty={false} onSave={() => true}>
          <input aria-label="city" />
        </EditableCard>
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByTestId("c-edit"));
    expect(ask()).toBe("false");
  });

  it("an OPEN and dirty card blocks", () => {
    render(
      <UnsavedChangesProvider>
        <Leave />
        <EditableCard testId="c" title="Profile" isDirty onSave={() => true}>
          <input aria-label="city" />
        </EditableCard>
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByTestId("c-edit"));
    expect(ask()).toBe("true");
  });

  it("two cards: one open edit is enough, and closing it clears the page", () => {
    render(
      <UnsavedChangesProvider>
        <Leave />
        <EditableCard testId="a" title="A" isDirty onSave={() => true}>
          <input aria-label="a" />
        </EditableCard>
        <EditableCard testId="b" title="B" isDirty onSave={() => true}>
          <input aria-label="b" />
        </EditableCard>
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByTestId("a-edit"));
    fireEvent.click(screen.getByTestId("b-edit"));
    expect(ask()).toBe("true");

    // Each card registers under its own id — one closing must not clear the other's claim.
    fireEvent.click(screen.getByTestId("a-cancel"));
    fireEvent.click(screen.getByTestId("a-discard"));
    expect(ask()).toBe("true");

    fireEvent.click(screen.getByTestId("b-cancel"));
    fireEvent.click(screen.getByTestId("b-discard"));
    expect(ask()).toBe("false");
  });

  it("unmounting a card clears its claim — that is what a tab change does", () => {
    const { rerender } = render(
      <UnsavedChangesProvider>
        <Leave />
        <EditableCard testId="c" title="Profile" isDirty onSave={() => true}>
          <input aria-label="city" />
        </EditableCard>
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByTestId("c-edit"));
    expect(ask()).toBe("true");

    rerender(
      <UnsavedChangesProvider>
        <Leave />
      </UnsavedChangesProvider>,
    );
    expect(ask()).toBe("false");
  });

  it("a card outside a provider still works — no throw, no registration", () => {
    render(
      <EditableCard testId="lonely" title="Profile" isDirty onSave={() => true}>
        <input aria-label="city" />
      </EditableCard>,
    );
    fireEvent.click(screen.getByTestId("lonely-edit"));
    expect((screen.getByTestId("lonely-fields") as HTMLFieldSetElement).disabled).toBe(false);
  });
});
