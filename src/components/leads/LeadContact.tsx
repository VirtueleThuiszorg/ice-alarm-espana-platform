import { Mail, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, hasValue, leadMailHref, leadTelHref } from "@/lib/leadDisplay";

/**
 * THE THREE WAYS A LEAD'S CONTACT DETAILS APPEAR ON A STAFF SCREEN, in one place so they cannot
 * disagree. `src/lib/leadDisplay.ts` says what the rules are and why; this renders them.
 *
 * Both Leads screens and the dashboard card had their own copy of "icon, then the value", which
 * is how the same missing-value bug appeared in four places at once.
 */

type Kind = "email" | "phone";

const ICONS = { email: Mail, phone: Phone } as const;

function hrefFor(kind: Kind, value: string | null | undefined) {
  return kind === "email" ? leadMailHref(value) : leadTelHref(value);
}

/**
 * A contact detail, as a link when there is one and as plain muted text when there is not.
 *
 * NEVER A LINK OVER NOTHING. `<a href="mailto:">` with an empty address looks exactly like a
 * working one — underline, pointer cursor, the lot — and does nothing when pressed. An operator
 * scanning a queue reads that as "this person has an email address", presses it, and gets
 * silence; the second time they assume the screen is broken.
 */
export function LeadContactValue({
  kind,
  value,
  className,
  onClick,
  linkify = true,
}: {
  kind: Kind;
  value: string | null | undefined;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /**
   * False where the value sits INSIDE something already clickable — a row that is itself a
   * <Link>, or a card with an onClick. An anchor inside an anchor is invalid markup, and a
   * mail link inside a clickable row fires both actions on one press. The Call and email
   * buttons beside the row are what act there.
   */
  linkify?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[kind];
  const href = linkify ? hrefFor(kind, value) : null;
  const label =
    kind === "email"
      ? t("leads.noEmail", "No email address")
      : t("leads.noPhone", "No phone number");

  if (!href && hasValue(value)) {
    // We hold it, it just is not a link here.
    return (
      <span className={cn("flex items-center gap-1", className)}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        {value}
      </span>
    );
  }

  if (!href) {
    return (
      <span
        className={cn("flex items-center gap-1 text-muted-foreground", className)}
        title={label}
        data-testid={`lead-${kind}-missing`}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <span aria-hidden="true">{EMPTY_VALUE}</span>
      </span>
    );
  }

  return (
    <a href={href} className={cn("flex items-center gap-1", className)} onClick={onClick}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {value}
    </a>
  );
}

/**
 * The Call / email button beside a lead.
 *
 * DISABLED WITH A REASON, rather than hidden. Hiding it would make two rows differ by a missing
 * button and leave the operator to work out which; the tooltip says why in as many words, and
 * `aria-disabled` plus the label carry the same to a screen reader.
 */
export function LeadContactButton({
  kind,
  value,
  size = "icon",
  variant = "outline",
  className,
  label,
}: {
  kind: Kind;
  value: string | null | undefined;
  size?: "icon" | "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  className?: string;
  /** Visible text beside the icon, for the full-width "Call Now" in the detail dialog. */
  label?: string;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[kind];
  const href = hrefFor(kind, value);
  const action =
    label ?? (kind === "email" ? t("leads.sendEmail", "Send an email") : t("leads.callLead", "Call"));
  const why =
    kind === "email"
      ? t("leads.noEmailOnFile", "No email address on this enquiry")
      : t("leads.noPhoneOnFile", "No phone number on this enquiry");
  const body = (
    <>
      <Icon className={label ? "h-4 w-4 mr-2" : "h-4 w-4"} />
      {label}
    </>
  );

  if (href) {
    return (
      <Button variant={variant} size={size} className={className} aria-label={action} asChild>
        <a href={href}>{body}</a>
      </Button>
    );
  }

  /*
    The wrapping span is not decoration: a disabled button emits no pointer events, so a tooltip
    attached straight to it never opens — the reason would be written and unreadable.
  */
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex", className)} tabIndex={0}>
            <Button
              variant={variant}
              size={size}
              className={className}
              disabled
              aria-label={`${action} — ${why}`}
              data-testid={`lead-${kind}-button-disabled`}
            >
              {body}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{why}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The lead's name, or the words that stand in for one — in muted type, so a list of enquiries
 * never reads as though several people are called "Name not given".
 */
export function LeadName({
  lead,
  className,
}: {
  lead: { first_name?: string | null; last_name?: string | null };
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = [lead.first_name, lead.last_name].filter(hasValue).map((p) => p.trim());
  if (parts.length > 0) return <span className={className}>{parts.join(" ")}</span>;
  return (
    <span
      className={cn("italic text-muted-foreground font-normal", className)}
      data-testid="lead-name-missing"
    >
      {t("leads.noName", "Name not given")}
    </span>
  );
}
