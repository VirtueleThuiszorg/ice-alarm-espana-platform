import { useTranslation } from "react-i18next";
import { ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * THE SPAM FLAG IS A GUESS, AND EVERYTHING HERE TREATS IT AS ONE.
 *
 * `public-submit` sets `suspected_spam` from three heuristics — a link in the message, a vendor
 * pitch, a message in a language other than the one the sender picked. Every one of them has a
 * real enquiry that trips it. The third especially: the next message written in Spanish with the
 * English flag selected will be a daughter in Almería who did not notice the picker.
 *
 * So the flag does exactly two things. It suppresses the bell — nobody is woken for a guess —
 * and it puts a muted badge on the row. It does NOT hide the enquiry, move it, or colour it red.
 * The row stays in the list staff already read, in the order it arrived, and one press clears
 * the flag.
 *
 * RED IS NOT AVAILABLE HERE (MEMBER_UX_RULES R1: red is for an alarm). A suspected marketing
 * email is not an alarm, and a screen that spends red on one has none left for the thing that
 * matters.
 */

/** The reasons, in the words a staff member reads, keyed by what the server writes. */
function reasonLabel(reason: string, t: (k: string, d: string) => string): string {
  switch (reason) {
    case "link_in_message":
      return t("leads.spam.linkInMessage", "The message contains a link");
    case "vendor_pitch":
      return t("leads.spam.vendorPitch", "Reads like a sales pitch to us, not an enquiry");
    case "language_mismatch":
      return t(
        "leads.spam.languageMismatch",
        "Written in a different language from the one selected",
      );
    default:
      // Never invent a sentence for a reason we do not recognise — show what the server said.
      return reason;
  }
}

export function LeadSpamBadge({
  suspected,
  reasons,
}: {
  suspected: boolean | null | undefined;
  reasons?: string[] | null;
}) {
  const { t } = useTranslation();
  if (!suspected) return null;

  const why = (reasons ?? []).map((r) => reasonLabel(r, t));
  const label = t("leads.spam.badge", "Possible spam");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-xs gap-1 text-muted-foreground border-muted-foreground/40"
            data-testid="lead-spam-badge"
          >
            <ShieldQuestion className="h-3 w-3" aria-hidden="true" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {/* The reasons, said plainly. A flag whose reason is not visible is one nobody can
              judge, so it gets believed — which is how a real enquiry stays flagged. */}
          {why.length > 0
            ? why.join(" · ")
            : t("leads.spam.noReason", "Flagged automatically; no reason was recorded")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** One press, and the enquiry is an ordinary one again. */
export function LeadNotSpamButton({
  suspected,
  onClear,
  size = "sm",
}: {
  suspected: boolean | null | undefined;
  onClear: () => void;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation();
  if (!suspected) return null;
  return (
    <Button
      variant="outline"
      size={size}
      onClick={onClear}
      data-testid="lead-not-spam"
      title={t("leads.spam.notSpamHint", "Clear the flag — this is a real enquiry")}
    >
      {t("leads.spam.notSpam", "Not spam")}
    </Button>
  );
}
