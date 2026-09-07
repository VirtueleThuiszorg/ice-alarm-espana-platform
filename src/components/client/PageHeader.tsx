import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * THE ONE PAGE SHELL — MEMBER_UX_RULES R5.
 *
 * *"28px Archivo 700 title + 16px Slate subtitle. Every page is composed from `PageHeader`,
 * `Card`, `EmptyState` — DELETE EVERY HAND-ROLLED HEADER."*
 *
 * All eight member pages hand-rolled the same block:
 *
 *     <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 *       <div>
 *         <h1 className="text-2xl md:text-3xl font-bold tracking-tight">…</h1>
 *         <p className="text-muted-foreground mt-1">…</p>
 *
 * Eight copies of a header is eight places a type-size decision has to be repeated, and R10's
 * 16px floor is exactly the sort of decision that gets applied to six of them. It is also why
 * `SubscriptionPage` had two different headers in one file — one for the loaded state and one
 * for the empty one, which had no subtitle.
 *
 * WHY 28px AND NOT `text-3xl`. R5 says 28px. Tailwind's `text-3xl` is 30px and `text-2xl` is
 * 24px, and the pages used `text-2xl md:text-3xl` — so on a phone, where most of these members
 * read, the title was 24px rather than 28px. `text-[28px]` is the size the rule names; the
 * responsive step-down is gone deliberately, because the rule does not have one and a smaller
 * title on a small screen is the wrong way round for this reader.
 *
 * ONE H1 PER PAGE. `as` exists for the rare page that needs a second header inside a section
 * (`SupportPage` has one), so that converting a page cannot introduce a second `<h1>` and break
 * the heading order a screen reader announces.
 */
export interface PageHeaderProps {
  title: ReactNode;
  /** 16px Slate. Omitted rather than empty when a page genuinely has nothing to add. */
  subtitle?: ReactNode;
  /**
   * The page's action. R1: ONE red button per page, maximum — so this slot takes whatever the
   * page's single primary action is, and everything else on the page is Ink or outline.
   */
  action?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  action,
  as: Heading = "h1",
  className,
}: PageHeaderProps) {
  return (
    <div
      data-testid="page-header"
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-[28px] font-bold leading-tight tracking-tight">{title}</Heading>
        {subtitle && (
          /* 16px, R10's floor, and Slate rather than the muted grey the pages used — R5 names
             the colour, and `text-muted-foreground` resolves differently in dark mode. */
          <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
