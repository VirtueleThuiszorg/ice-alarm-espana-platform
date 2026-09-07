import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isActionableGap, readinessGap, type ReadinessGap } from "@/lib/readinessGap";
import { MEMBER_NOTICE_TONE } from "@/lib/memberNoticeTone";

/**
 * THE READINESS NOTICE, IN THE HEADER — MEMBER_UX_RULES R3 and decision D10.
 *
 * D10: *"the readiness notice lives in the member header, left of Assistant / bell / language /
 * name. NEVER A STANDALONE BANNER."*
 *
 * It was a standalone banner: `MonitoringReadinessBar`, full-width, three paragraphs, mounted in
 * the content column below both headers. That shape has a cost R3 is answering — a full-width
 * amber block above the page reads as an interruption to be got past, and the member who gets
 * past it once gets past it every time. In the header it is part of the furniture: always there,
 * never in the way of the thing they came to do.
 *
 * ONE SENTENCE, per R3, and the sentence names WHICH of the two conditions is missing — the
 * three variants #195 wrote. The long-form body text is gone; a member who wants the detail gets
 * it on the contacts page, which is where the action is.
 *
 * WHAT DOES NOT CHANGE, because §5.1.2 of the operator-card spec is still binding:
 *   - renders ONLY on a settled gap. `undefined` means "not known yet" and renders NOTHING: a
 *     notice keyed on a falsy value flashes on every page load, and a warning people are
 *     trained to ignore is worse than no warning
 *   - a failed read stays unknown — neither a false all-clear nor a false alarm
 *   - not dismissible, not collapsible. A member who dismisses it is a member who stays
 *     unreachable, and the dismissal would be the last anybody heard of it
 *   - never a blocker. It informs; it gates no route and no control
 *
 * TWO PLACEMENTS, ONE COMPONENT. The desktop header has a 64px left slot that R3 reserves for
 * this and that was standing empty. A phone header has no room for a sentence at all, so on
 * mobile it sits directly beneath the fixed header — still layout chrome, not page content,
 * which is what D10's "standalone banner" is about. Truncating a life-safety sentence to make it
 * fit would be the wrong trade.
 */
export function MemberReadinessNotice({
  memberId,
  variant,
  className,
}: {
  memberId: string | null;
  /** `header` is the inline desktop form; `bar` is the full-width mobile one. */
  variant: "header" | "bar";
  className?: string;
}) {
  const { t } = useTranslation();
  const [gap, setGap] = useState<ReadinessGap | undefined>(undefined);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("member_monitoring_readiness")
        .select("monitoring_ready, emergency_contact_count, device_tested_at")
        .eq("member_id", memberId)
        .maybeSingle();
      if (cancelled || error || !data) return; // unknown, in both directions
      // `monitoring_ready` is the authority on WHETHER; the other two say WHICH. A disagreement
      // between them can never show a member a warning the view says is unwarranted.
      setGap(data.monitoring_ready === true ? "none" : readinessGap(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (gap === undefined || !isActionableGap(gap)) return null;

  /*
    ONE TASK AT A TIME, and for `both` it is the CONTACTS one.

    R3 allows one sentence, so a member missing both cannot be told about both. The contacts
    half is the one they can act on today — Q1 is operator-confirmed only, so there is nothing
    for them to press about the pendant — and once they have added a contact the sentence
    becomes the pendant one. Progressive rather than a list they cannot finish.
  */
  const sentence =
    gap === "pendant"
      ? t("clientDashboard.notReady.titlePendant", "We still need to test your pendant with you")
      : t("clientDashboard.notReady.title", "We still need your emergency contacts");

  /*
    THERE IS ALWAYS A ROUTE TO A HUMAN, and it is never a way to self-report a test.

    contacts  → the contacts page, where they add one themselves
    pendant   → Support, where the phone number is. Q1 (operator-confirmed only) means a member
                cannot record their own test, so this must not look like a control that does —
                the old bar said "we will call you" in its body, and that body is gone.
  */
  const action = gap === "pendant"
    ? { to: "/dashboard/support", label: t("support.title", "Support") }
    : {
        to: "/dashboard/contacts",
        label: t("clientDashboard.notReady.action", "Add your emergency contacts"),
      };

  /*
    Amber on cream, the colours R3 names. Not brand red — R2 reserves that, and this is a task
    rather than an emergency: the member's alarm works, and telling an 80-year-old otherwise in
    red is how you produce anxiety instead of an action. Shared with the membership notice, which
    makes the same argument about the same reader.
  */
  const tone = MEMBER_NOTICE_TONE;

  const body = (
    <>
      <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={variant === "header" ? "truncate" : undefined}>{sentence}</span>
      <NavLink
        to={action.to}
        data-testid="member-readiness-action"
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        {action.label}
      </NavLink>
    </>
  );

  if (variant === "header") {
    return (
      <div
        role="status"
        data-testid="member-readiness-notice"
        data-variant="header"
        data-gap={gap}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
          tone,
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="member-readiness-notice"
      data-variant="bar"
      data-gap={gap}
      className={cn(
        "flex w-full flex-wrap items-center gap-2 border-b-2 px-4 py-2 text-sm",
        tone,
        className,
      )}
    >
      {body}
    </div>
  );
}
