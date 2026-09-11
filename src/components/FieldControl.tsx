import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEditableCard } from "@/components/editableCardContext";
/*
 * FieldLabel and NotAdded MOVED to FieldGrid, and are re-exported here so the member portal's
 * imports keep working. They had to move: FieldRow needs both, FieldGrid cannot import from this
 * file without a cycle, and a second copy of "what an empty field says" is the exact drift these
 * primitives exist to prevent.
 */
import { FieldLabel, NotAdded } from "@/components/FieldGrid";

export { FieldLabel, NotAdded };

/**
 * R6 IN ONE COMPONENT: a field is its label and its value until its card is unlocked.
 *
 * *"Read-only by default. Edit per section, then Save. Fields as label (13px uppercase Slate) /
 * value (16px Ink). Empty = 'Not added' + inline Add. Never 'contact support to change'."*
 *
 * WHY THE MEMBER PORTAL DOES NOT USE THE FIELDSET. `EditableCard` locks its body with one
 * `<fieldset disabled>` and that is the right answer for the staff record — an operator reading
 * a file down the phone wants the form's shape, greyed. R6 asks for the other answer for the
 * member's own account, and the two are not a compromise to split: the same argument
 * `MEMBER_UX_RULES` R11 makes about type size ("the correct presentation for one reader is the
 * wrong presentation for the other"). A card whose fields are `FieldControl`s therefore passes
 * `disableFieldsWhenLocked={false}`, because a disabled fieldset wrapped around plain text is a
 * group assistive technology announces as unavailable for nothing.
 */

export interface FieldControlProps {
  /**
   * The value as the member reads it when locked. `null` / `""` renders "Not added".
   *
   * ALREADY FORMATTED, because a date of birth reads as "4 March 1948" and not as
   * `1948-03-04`, and only the caller knows which — the same reason `LockedIdentityField` takes
   * a `ReactNode` rather than a raw column value.
   */
  read: ReactNode | null | undefined;
  /**
   * The input. Mounted ONLY in edit mode: a disabled input still sits in the tab order in some
   * browsers, and R6 does not ask for a greyed box, it asks for the value.
   */
  children?: ReactNode;
  /**
   * Suppress the inline Add beside an empty value — for a card whose empty state is already
   * explained above it, where a second Add is a second thing to read.
   */
  hideInlineAdd?: boolean;
  className?: string;
  testId?: string;
}

export function FieldControl({
  read,
  children,
  hideInlineAdd = false,
  className,
  testId,
}: FieldControlProps) {
  const { t } = useTranslation();
  const { editing, startEditing } = useEditableCard();

  if (editing && children) {
    return (
      <div className={className} data-testid={testId} data-locked="false">
        {children}
      </div>
    );
  }

  // `read` can legitimately be `0` or `false`, so emptiness is tested rather than falsiness —
  // a battery reading of 0 is a fact, not a missing value.
  const empty =
    read === null ||
    read === undefined ||
    (typeof read === "string" && read.trim().length === 0);

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-testid={testId}
      data-locked="true"
    >
      {empty ? (
        <>
          <NotAdded />
          {/*
            R6's INLINE ADD: *"Empty = 'Not added' + inline Add."* Without it a member who finds
            an empty field has to scroll up, find Edit, and then find the field again. Rendered
            only when there IS an editor to reach, so it never appears beside a value nobody can
            supply here.
          */}
          {children && !hideInlineAdd && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={startEditing}
              data-testid={testId ? `${testId}-inline-add` : undefined}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("common.add", "Add")}
            </Button>
          )}
        </>
      ) : (
        /* 16px Ink — R6's value, and R10's body floor. `whitespace-pre-wrap` so a multi-line
           note reads as it was typed rather than as one run-on paragraph. */
        <span className="whitespace-pre-wrap text-base">{read}</span>
      )}
    </div>
  );
}
