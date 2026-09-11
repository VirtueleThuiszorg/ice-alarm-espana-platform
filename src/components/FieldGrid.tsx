import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * HOW A FIELD LOOKS ON A MEMBER'S RECORD — one treatment, both surfaces.
 *
 * WHAT WAS WRONG. Lee, reviewing the live page: *"too much white-on-white."* On the profile tab
 * the label and the value were the same size, the same weight and nearly the same colour, four
 * rows deep in a grid with no lines in it — so a card of fifteen fields read as thirty
 * interchangeable lines of grey text, and finding "postal code" meant reading all of them.
 * The read-mode CSS from #328 had stripped the input chrome, which was right, and had left
 * nothing in its place to say which half of a pair was the question and which the answer.
 *
 * THE FIX IS HIERARCHY, NOT DECORATION: a small muted caption, the value beneath it at full
 * contrast, and a hairline between rows so the eye can count them.
 *
 * ── ONE PLACE, AND WHY IT IS THIS PLACE ─────────────────────────────────────
 *
 * The staff record and the member's own pages already shared `EditableCard`. They now share the
 * label treatment too, through `FIELD_LABEL_CLASS`: `FieldLabel` (the member portal's R6 field)
 * and every `FormLabel` inside a `FieldGrid` (the staff record) render the same string. Two
 * surfaces cannot drift apart on a constant they both import.
 *
 * ── THE LABEL IS UPPERCASE, AND THAT WAS NOT A FRESH CHOICE ─────────────────
 *
 * The brief says "uppercase or sentence case — pick one and use it everywhere". It was already
 * picked: MEMBER_UX_RULES R6 specifies *"13px uppercase Slate"* and the member portal has
 * shipped it. Choosing sentence case here would have meant either two answers on one record, or
 * restyling the member's account to match a staff screen. So: R6's, unchanged, moved into a
 * constant so the staff record can import rather than re-type it.
 *
 * It is 0.8125rem rather than the brief's `text-xs`, for the reason R10 gives — in rem, so the
 * A/A control moves it. A `text-xs` (0.75rem) label is also below R10's floor for a label.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * The brief asks for an empty value to render "—". It does not, and this is the one place the
 * letter of the brief is not followed. The product already answers that exact question:
 * `NotAdded` renders "Not added" with an inline Add beside it, R6's rule, shipped and tested on
 * the member portal — and this grid is shared with that portal, so rendering "—" would either
 * regress it or give one record two ways of saying "there is nothing here". The brief's actual
 * requirement is "never blank space"; "Not added" meets it and says more. Flagged rather than
 * quietly substituted.
 */

/**
 * THE label. Imported by `FieldLabel` and by every `FormLabel` inside a `FieldGrid`, so there
 * is exactly one definition of what a field's caption looks like anywhere in the product.
 */
export const FIELD_LABEL_CLASS =
  "text-[0.8125rem] font-medium uppercase tracking-wide text-muted-foreground";

/**
 * A responsive two-column field grid with a hairline between rows.
 *
 * THE DIVIDERS ARE IN CSS, NOT ON EACH CHILD, and that is what makes this usable without
 * rewriting twelve tabs: the children stay ordinary `FormField`s. The rule (`.field-grid` in
 * index.css) also handles the part that cannot be expressed on a child at all — in two columns
 * the top border must be suppressed for the first TWO items, not the first one, and which
 * items those are changes at the breakpoint.
 *
 * `gap-y-0` is deliberate: the row's breathing space is its own padding, so the hairline sits
 * between two rows rather than floating in a gap belonging to neither.
 */
export function FieldGrid({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("field-grid grid min-w-0 grid-cols-1 gap-x-8 gap-y-0 md:grid-cols-2", className)}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * A group heading inside a card — "Address", "Emergency contact".
 *
 * SUBDUED ON PURPOSE. It is a signpost between two runs of fields, not a second card title, and
 * a card with three headings all competing with its own title is the white-on-white complaint
 * in a different key. The top spacing is part of the component because a heading whose spacing
 * is left to the caller is a heading with a different gap above it on every tab.
 */
export function FieldSection({
  title,
  children,
  className,
  testId,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("min-w-0 pt-6 first:pt-0", className)} data-testid={testId}>
      <h4 className="mb-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </h4>
      {children}
    </section>
  );
}
