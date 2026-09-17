import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { membershipCondition, type MembershipCondition } from "@/lib/membershipCondition";

/**
 * "WHAT AN OPERATOR SEES" — a POINTER, and deliberately not the content.
 *
 * ── WHY THIS LINE EXISTS ────────────────────────────────────────────────────
 *
 * The Medical information page carries the best sentence in the product: *"This is exactly what
 * an operator sees the moment you press your pendant."* It is two clicks away, under My Account →
 * Medical information, and a member who has never gone looking has no idea it is there — or that
 * we hold anything at all.
 *
 * That sentence is what turns a form into a reason to fill it in. A member who understands that
 * an operator will read their conditions, their medication and how to get into their home has a
 * motive to keep it current. Nothing on Home said so.
 *
 * ── AND WHY IT RENDERS NO MEDICAL CONTENT WHATEVER ──────────────────────────
 *
 * Not a condition, not a medication, not an allergy, not the doctor, not the key-safe — and not a
 * COUNT of them either. Three reasons, and they are the point rather than a caveat:
 *
 *   - It is special-category data under GDPR. The Medical page is where it is presented, with its
 *     own framing and its own masking (the key-safe code sits behind a Show control).
 *   - Home is the page most likely to be read over a member's shoulder, propped on a kitchen
 *     table, or looked at by a visiting relative.
 *   - Home is also the page an admin previews (`isTemplatePreview`) and the page a staff member
 *     opens with `?memberId=`. A medical summary here widens who casually sees it.
 *
 * A pointer costs nothing and carries the whole benefit. The content stays one deliberate tap
 * away. `src/test/operatorSeesPointer.test.tsx` asserts the absence against the actual
 * `medical_information` column names, so that "improving" this into a summary fails a test rather
 * than shipping.
 *
 * NO COMPLETENESS SCORE, no percentage, no "4 of 17 fields filled". That reframes a safety record
 * as a chore with a progress bar, and the header's "Complete my details" already owns the
 * gap-filling job. This line's job is comprehension, not compliance.
 *
 * ── WHEN IT IS TRUE ─────────────────────────────────────────────────────────
 *
 * For every member who HAS a membership, whether or not they have filled anything in — an
 * operator sees the record either way, and a member with an empty one is precisely who needs to
 * know that. So it is not gated on the record having content. It IS gated on there being a
 * membership at all: to somebody who never joined, "if you press your pendant" is not yet true,
 * and a sentence about a service they have not bought is an advertisement dressed as reassurance.
 *
 * `unknown` renders it too. The claim is about how this service works, not about the state of one
 * subscription read, and staying silent because a query failed would hide a true sentence.
 */
export function OperatorSeesPointer({
  latestSubscription,
  member,
}: {
  latestSubscription: Parameters<typeof membershipCondition>[0];
  member?: Parameters<typeof membershipCondition>[1];
}) {
  const { t } = useTranslation();
  const condition: MembershipCondition = membershipCondition(latestSubscription, member);

  if (condition === "never_joined") return null;

  return (
    <div
      data-testid="operator-sees-pointer"
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        {/*
          A HEART AND NOT AN EYE, which is the obvious metaphor and is already taken: `Eye` paints
          the admin template-preview banner on this same page. The heart is what the nav puts
          beside Medical information, so the icon matches where the line goes.

          R2: no red. Nothing here is a warning — it is an explanation of how the service works.
        */}
        <Heart className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {/* R10's 16px floor. This is the sentence the whole line exists to deliver. */}
        <p className="text-base">
          {t(
            "dashboard.operatorSees",
            "If you press your pendant, our operator sees your medical details and how to reach you.",
          )}
        </p>
      </div>

      {/* R1: outline, never the page's primary button — Home keeps no red one. R11: 44px. */}
      <Button variant="outline" size="sm" className="touch-target shrink-0 self-start sm:self-auto" asChild>
        <Link to="/dashboard/medical" data-testid="operator-sees-action">
          {t("dashboard.operatorSeesAction", "Check what we'd tell them")}
        </Link>
      </Button>
    </div>
  );
}
