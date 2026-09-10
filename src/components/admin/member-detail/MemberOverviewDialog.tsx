import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Loader2, Printer, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemberOverview } from "@/hooks/useMemberOverview";
import {
  overviewAsPrintHtml,
  overviewAsText,
  overviewFactCount,
} from "@/lib/memberOverview";

/**
 * "WHAT DO WE ACTUALLY KNOW ABOUT HER?" — the whole record on one read-only sheet.
 *
 * READ-ONLY BY CONSTRUCTION: there is no form here, no save, no field that takes focus. Editing
 * happens on the tabs, behind Edit, where the audit row is written. A dialog that both summarises
 * and edits would be a second write path into every table on the record.
 *
 * EMPTY FIELDS ARE NOT SHOWN. `buildMemberOverview` drops them, and a section with nothing in it
 * disappears with them — see that module for why a sheet of dashes is the worse answer.
 */
interface MemberOverviewDialogProps {
  memberId: string;
  memberName: string;
}

export function MemberOverviewDialog({ memberId, memberName }: MemberOverviewDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useMemberOverview(memberId, open);

  const sections = data?.sections ?? [];
  const factCount = overviewFactCount(sections);
  const heading = t("adminMemberDetail.overview.heading", "{{name}} — member record", {
    name: memberName,
  });
  const printedOn = t("adminMemberDetail.overview.printedOn", "Printed {{date}}", {
    date: new Date().toLocaleString("en-GB"),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(overviewAsText(sections, heading));
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
    frame.setAttribute("title", heading);
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      toast.error(t("adminMemberDetail.overview.printFailed", "Could not open the print view"));
      return;
    }
    doc.open();
    doc.write(overviewAsPrintHtml(sections, heading, printedOn));
    doc.close();
    win.focus();
    win.print();
    // Removed after the print dialog has taken its snapshot; removing it synchronously cancels
    // the print in some browsers.
    window.setTimeout(() => frame.remove(), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="member-overview-trigger">
          <ScrollText className="mr-2 h-4 w-4" />
          {t("adminMemberDetail.overview.open", "Overview")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {t(
              "adminMemberDetail.overview.subtitle",
              "Everything on file for this member. Fields we do not hold are left out.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copy} disabled={factCount === 0}>
            <Copy className="mr-2 h-4 w-4" />
            {copied
              ? t("adminMemberDetail.overview.copied", "Copied")
              : t("adminMemberDetail.overview.copy", "Copy as text")}
          </Button>
          <Button variant="outline" size="sm" onClick={print} disabled={factCount === 0}>
            <Printer className="mr-2 h-4 w-4" />
            {t("adminMemberDetail.overview.print", "Print")}
          </Button>
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
            <div className="space-y-6">
              {sections.map((s) => (
                <section key={s.key} data-testid={`member-overview-section-${s.key}`}>
                  <h3 className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.title}
                  </h3>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(140px,32%)_1fr]">
                    {s.rows.map((r) => (
                      <div key={r.label} className="contents">
                        <dt className="text-sm text-muted-foreground">{r.label}</dt>
                        <dd className="text-sm break-words">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
