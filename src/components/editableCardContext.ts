import { createContext, useContext } from "react";

/**
 * A CARD'S LOCK STATE, so a FIELD can render itself differently when locked.
 *
 * WHY A CONTEXT AND NOT A PROP. `EditableCard` locks its body with one `<fieldset disabled>`,
 * which is exactly right for the staff record: an operator reading a member's file down the
 * phone wants the form's shape, greyed. It is the wrong answer for the member's own account.
 * MEMBER_UX_RULES R6 asks for the other one in as many words — *"Fields as label (13px
 * uppercase Slate) / value (16px Ink). Empty = 'Not added' + inline Add"* — and a 78-year-old
 * reading their own alarm account is not served by forty greyed input boxes.
 *
 * So a member-facing field has to know whether its card is unlocked. Threading a prop down is
 * what `MedicalFieldRow` used to do (`isEditing: boolean`), and a prop is a prop somebody
 * forgets on the seventeenth field — invisibly, because a field that never receives it looks
 * identical and simply stays read-only. The card is the container; it cannot be forgotten.
 *
 * IN ITS OWN MODULE because `react-refresh/only-export-components` fails a file that exports
 * both a component and a hook, and a warning is a warning the next reader learns to scroll
 * past.
 */
export interface EditableCardState {
  editing: boolean;
  /**
   * Unlock the card. Exposed so that R6's *inline Add* — the small button beside "Not added" —
   * can put the card into edit mode without a member having to find the Edit button in the
   * header and then find the field again.
   */
  startEditing: () => void;
}

export const EditableCardContext = createContext<EditableCardState | null>(null);

/**
 * The lock state of the card this field is drawn in.
 *
 * IT THROWS RATHER THAN DEFAULTING. A default of `editing: false` would render a permanently
 * read-only field that no Edit button reaches — invisible, and identical on screen to a field
 * whose data failed to load. A default of `editing: true` is worse: a field outside any card
 * would be silently live, which is the exact defect the card exists to end. Neither failure
 * can be seen by looking at the screen, so the mistake is made loud instead.
 */
export function useEditableCard(): EditableCardState {
  const state = useContext(EditableCardContext);
  if (!state) {
    throw new Error(
      "useEditableCard must be used inside an <EditableCard>. A lockable field outside a card " +
        "has no lock: wrap the section in <EditableCard> so one Edit/Save pair governs it.",
    );
  }
  return state;
}
