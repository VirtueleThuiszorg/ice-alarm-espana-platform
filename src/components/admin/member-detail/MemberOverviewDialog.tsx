import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Loader2, Printer, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MemberDocumentView } from "@/components/MemberDocumentView";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useMemberOverview } from "@/hooks/useMemberOverview";
import { useMemberDocumentChrome } from "@/hooks/useMemberDocumentChrome";
import { overviewAsDocumentSections, overviewFactCount } from "@/lib/memberOverview";
import {
  documentInitials,
  memberDocumentAsPrintHtml,
  memberDocumentAsText,
  type MemberDocument,
} from "@/lib/memberDocument";
import { memberStatusPresentation } from "@/lib/statusLabel";

/**
 * "WHAT DO WE ACTUALLY KNOW ABOUT HER?" — the whole record as one document.
 *
 * READ-ONLY BY CONSTRUCTION: there is no form here, no save, no field that takes focus. Editing
 * happens on the tabs, behind Edit, where the audit row is written. A dialog that both summarises
 * and edits would be a second write path into every table on the record.
 *
 * EMPTY FIELDS ARE NOT SHOWN. `buildMemberOverview` drops them, and a section with nothing in it
 * disappears with them — see that module for why a sheet of dashes is the worse answer.
 *
 * ── IT IS A DOCUMENT, ON SCREEN AND ON PAPER ────────────────────────────────
 *
 * What is rendered here is a `MemberDocument` — masthead, member strip, sections, company block,
 * confidentiality notice — and Print hands the SAME model to `memberDocumentAsPrintHtml`. What a
 * staff member reads on screen is what comes out of the printer, because it is one model and not
 * two layouts. See `src/lib/memberDocument.ts`.
 */
interface MemberOverviewDialogProps {
  memberId: string;
  memberName: string;
}

export function MemberOverviewDialog({ memberId, memberName }: MemberOverviewDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /*
    OFF EVERY TIME THE DIALOG OPENS, not remembered.

    A remembered "yes, print the NIE" would be set once by whoever needed it for one call and
    then silently applied to every printout that operator ever makes. The decision is per sheet,
    so the state is per sheet.
  */
  const [includeIdentityNumbers, setIncludeIdentityNumbers] = useState(false);

  const { data, isLoading } = useMemberOverview(memberId, open);
  const { data: staff } = useCurrentStaff();
  const chrome = useMemberDocumentChrome();

  const sections = useMemo(() => data?.sections ?? [], [data]);
  const factCount = overviewFactCount(sections);
  const subjectName = data?.subject?.name?.trim() || memberName;

  const doc = useMemo<MemberDocument>(
    () => ({
      title: chrome.title,
      subject: {
        name: subjectName,
        initials: documentInitials(subjectName),
        photoUrl: data?.subject?.photoUrl ?? null,
        /*
          NO MEMBER NUMBER EXISTS. The brief asked for one "if we have one" — `members` has no
          such column, and `crm_source_id` is the old CRM's primary key, not something a member
          has ever been told. Printing it would invent an identifier that means nothing to
          anybody who rings up quoting it. Recorded here rather than faked.
        */
        memberNumber: null,
        status: data?.subject?.status
          ? t(
              memberStatusPresentation(data.subject.status).key,
              memberStatusPresentation(data.subject.status).fallback,
            )
          : null,
      },
      factCount: t("adminMemberDetail.overview.factCount", "{{count}} details on file", {
        count: factCount,
      }),
      meta: chrome.metaPrintedBy(
        [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || null,
      ),
      company: chrome.company,
      confidentiality: chrome.confidentiality,
      sections: overviewAsDocumentSections(sections, {
        includeIdentityNumbers,
        redactedLabel: chrome.redacted,
      }),
    }),
    [chrome, data, factCount, includeIdentityNumbers, sections, staff, subjectName, t],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(memberDocumentAsText(doc));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard permission refusal is not a failure to build the sheet — say what to do.
      toast.error(
        t("adminMemberDetail.overview.copyFailed", "Could not copy — select the text and copy it"),
      );
    }
  };

  /**
   * Print from an off-screen iframe rather than `window.open`.
   *
   * A popup is blocked often enough that the button would sometimes do nothing at all, with no
   * way for the person pressing it to tell why. An iframe in the current document always exists.
   */
  const print = () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", `${subjectName} — ${chrome.title}`);
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc_ = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc_ || !win) {
      frame.remove();
      toast.error(t("adminMemberDetail.overview.printFailed", "Could not open the print view"));
      return;
    }
    doc_.open();
    doc_.write(memberDocumentAsPrintHtml(doc));
    doc_.close();
    win.focus();
    win.print();
    // Removed after the print dialog has taken its snapshot; removing it synchronously cancels
    // the print in some browsers.
    window.setTimeout(() => frame.remove(), 1000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setIncludeIdentityNumbers(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="member-overview-trigger">
          <ScrollText className="mr-2 h-4 w-4" />
          {t("adminMemberDetail.overview.open", "Overview")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("adminMemberDetail.overview.heading", "{{name}} — member record", {
              name: subjectName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "adminMemberDetail.overview.subtitle",
              "Everything on file for this member. Fields we do not hold are left out.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="outline" size="sm" onClick={copy} disabled={factCount === 0}>
            <Copy className="mr-2 h-4 w-4" />
            {copied
              ? t("adminMemberDetail.overview.copied", "Copied")
              : t("adminMemberDetail.overview.copy", "Copy as text")}
          </Button>
          <Button variant="outline" size="sm" onClick={print} disabled={factCount === 0}>
            <Printer className="mr-2 h-4 w-4" />
            {t("adminMemberDetail.overview.print", "Print / Save as PDF")}
          </Button>
          {/*
            The tick box sits BESIDE Print, not in a settings menu, because it changes what
            leaves the building on the next press of that button and has to be visible at the
            moment of pressing it.
          */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={includeIdentityNumbers}
              onCheckedChange={(v) => setIncludeIdentityNumbers(v === true)}
              data-testid="member-overview-identity-numbers"
            />
            {t("adminMemberDetail.overview.includeIdentityNumbers", "Include identity numbers")}
          </label>
          <span className="text-sm text-muted-foreground" data-testid="member-overview-count">
            {t("adminMemberDetail.overview.factCount", "{{count}} details on file", {
              count: factCount,
            })}
          </span>
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sections.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t(
                "adminMemberDetail.overview.empty",
                "We hold nothing for this member yet. Use Missing info to ask them for it.",
              )}
            </p>
          ) : (
            <MemberDocumentView doc={doc} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
