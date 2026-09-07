import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useMemberReadinessGap } from "@/hooks/useMemberReadinessGap";
import { isActionableGap, READINESS_GAP_STAFF } from "@/lib/readinessGap";

interface MemberContextPanelProps {
  memberId: string;
  className?: string;
}

/**
 * WHAT THE OPERATOR NEEDS TO KNOW ABOUT THIS MEMBER BEFORE THEY REPLY — WP6 G8.
 *
 * *"member context panel showing readiness state."* One fact, because it is the one that changes
 * what an operator says: **is this member actually monitored?**
 *
 * An operator answering "my pendant is beeping" from somebody whose pendant has never been
 * tested is having a different conversation from one answering the same words from a member who
 * is fully covered — and today nothing on this screen tells them which. The readiness queue
 * exists on the admin surface; the operator replying to the message cannot see it.
 *
 * IT READS THE VIEW AND NOTHING ELSE. READINESS_MODEL.md §2: `member_monitoring_readiness` is
 * the answer and surfaces read it. A panel that re-derived readiness from `orders` would be the
 * third opinion in a product where a wrong all-clear is the failure that matters.
 *
 * `unknown` IS SHOWN, NOT HIDDEN. A failed or missing read renders as "could not be read", with
 * the harness's own instruction — do not treat it as ready or unready. Rendering nothing would
 * be indistinguishable from "ready", which is the false all-clear.
 *
 * IT CARRIES NO LINK OF ITS OWN. The thread header two lines above it already links to the
 * member record; a second route to the same page is not context, it is clutter.
 *
 * IT DOES NOT OFFER TO FIX ANYTHING. No "mark as tested" button: Q1 is operator-confirmed on the
 * member record, where somebody sits when they phone a member to walk them through a test, and
 * a second place to record it is a second place to record it wrongly.
 */
export function MemberContextPanel({ memberId, className }: MemberContextPanelProps) {
  const { t } = useTranslation();
  const { data: gap, isLoading } = useMemberReadinessGap(memberId);

  if (isLoading || gap === undefined) return null;

  const ready = gap === "none";
  const actionable = isActionableGap(gap);
  const wording = ready ? null : READINESS_GAP_STAFF[gap];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50"
          : actionable
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50"
            : "border-muted bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      {ready ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      ) : actionable ? (
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <HelpCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {ready
            ? t("operatorContext.ready", "Monitoring ready")
            : t(wording!.key, wording!.fallback)}
        </p>
        {!ready && <p className="text-xs mt-0.5">{t(wording!.work.key, wording!.work.fallback)}</p>}
      </div>
    </div>
  );
}
