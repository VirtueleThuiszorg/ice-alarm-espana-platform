import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Copy, Loader2, Phone, PhoneOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MemberDocumentView } from "@/components/MemberDocumentView";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useMemberDocumentChrome } from "@/hooks/useMemberDocumentChrome";
import { useMemberOverview } from "@/hooks/useMemberOverview";
import { supabase } from "@/integrations/supabase/client";
import {
  CALL_CHECKLIST,
  OUTCOME_OPTIONS,
  formatCallDuration,
  isReached,
  type CallOutcome,
} from "@/lib/courtesyCall";
import { dbMessage } from "@/lib/dbMessage";
import { documentInitials, type MemberDocument } from "@/lib/memberDocument";
import { overviewAsDocumentSections, overviewFactCount } from "@/lib/memberOverview";
import { telHref } from "@/lib/phone";
import { memberStatusPresentation } from "@/lib/statusLabel";

/**
 * THE COURTESY CALL, AS A PLACE TO WORK RATHER THAN A ROW TO TICK.
 *
 * Before this, a courtesy call on the dashboard was a row that navigated away to the member page
 * and a `tel:` button, and "complete" set `tasks.status = 'completed'`. Nothing about the
 * conversation was written down, so the next operator opened the record a month later and found a
 * completed task with a generated title and no content. Every call started from nothing, and a
 * member who had not answered three months running looked exactly like one who was fine.
 *
 * ── WHAT IS ON SCREEN, AND WHY IT IS SIDE BY SIDE ───────────────────────────
 *
 * LEFT is the member's record — the same `MemberDocument` the branded Overview renders (#448),
 * not a second summary written for this dialog. An operator asking "is anything different?"
 * needs what we hold in front of them while they ask it, and a dialog that made them navigate
 * away to find out is the thing being replaced.
 *
 * RIGHT is the call: the number, a timer, the five questions, the notes, how it ended. Nothing
 * on the right needs the left to be read first, so the operator can start talking immediately
 * and fill the record in as they go.
 *
 * ── THE NOTES SURVIVE THE BROWSER ───────────────────────────────────────────
 *
 * `tasks.draft_notes` is written every ten seconds. Not localStorage: a dropped browser during a
 * call with a vulnerable person is exactly when losing the notes costs most, and localStorage
 * does not survive the operator moving to another machine — which is what somebody does when
 * their browser has just died mid-call.
 *
 * ── ONE WRITE AT THE END ────────────────────────────────────────────────────
 *
 * Closing calls `close_courtesy_call`, which writes the note, settles the task, moves the
 * member's next-call date and raises the next call in ONE transaction. Four client writes with
 * no transaction is how you get a next-call date pointing at a call that was never recorded.
 */

export interface CourtesyCallDialogProps {
  /** The `tasks` row being worked. `null` closes the dialog. */
  taskId: string | null;
  memberId: string | null;
  memberName: string;
  memberPhone?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful close, so the list behind can refresh. */
  onClosed?: () => void;
}

interface PreviousCall {
  id: string;
  created_at: string | null;
  content: string;
  staff_name: string | null;
  outcome: string | null;
}

/** How often the draft is written while a call is live. */
const AUTOSAVE_MS = 10_000;

/** The first line of a note is "[outcome] …" — read the outcome back off it for the badge. */
const outcomeFromContent = (content: string): string | null =>
  content.match(/^\[([a-z_]+)\]/)?.[1] ?? null;

export function CourtesyCallDialog({
  taskId,
  memberId,
  memberName,
  memberPhone,
  open,
  onOpenChange,
  onClosed,
}: CourtesyCallDialogProps) {
  const { t } = useTranslation();
  const { data: staff } = useCurrentStaff();
  const chrome = useMemberDocumentChrome();
  const { data: overview, isLoading } = useMemberOverview(memberId, open);

  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [previous, setPrevious] = useState<PreviousCall[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

  /* The last text written to `draft_notes`, so the autosave is a no-op when nothing has changed
     rather than a write every ten seconds for the whole call. */
  const savedNotesRef = useRef("");
  const notesRef = useRef("");
  notesRef.current = notes;

  /* Reset per call. A dialog that remembered the last member's notes would put one member's
     conversation into another member's record — the worst possible carry-over here. */
  useEffect(() => {
    if (!open) return;
    setNotes("");
    setChecklist({});
    setOutcome(null);
    setNeedsFollowUp(false);
    setFollowUpDate("");
    setSeconds(0);
    setDraftSavedAt(null);
    savedNotesRef.current = "";
  }, [open, taskId]);

  /* Load any draft this task already carries, so a browser that died mid-call comes back to what
     was typed rather than to an empty box. */
  useEffect(() => {
    if (!open || !taskId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("draft_notes")
        .eq("id", taskId)
        .maybeSingle();
      if (cancelled) return;
      const draft = (data as { draft_notes?: string | null } | null)?.draft_notes;
      if (draft) {
        setNotes(draft);
        savedNotesRef.current = draft;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  /* Previous courtesy calls — the last six, so "she said the same thing last month" is visible
     rather than remembered. */
  useEffect(() => {
    if (!open || !memberId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("member_notes")
        .select("id, created_at, content, staff:staff(first_name, last_name)")
        .eq("member_id", memberId)
        .eq("note_type", "courtesy_call")
        .order("created_at", { ascending: false })
        .limit(6);
      if (cancelled || !data) return;
      setPrevious(
        (data as unknown as Array<Record<string, never>>).map((row) => {
          const r = row as unknown as {
            id: string;
            created_at: string | null;
            content: string;
            staff?: { first_name?: string | null; last_name?: string | null } | null;
          };
          return {
            id: r.id,
            created_at: r.created_at,
            content: r.content ?? "",
            staff_name:
              [r.staff?.first_name, r.staff?.last_name].filter(Boolean).join(" ") || null,
            outcome: outcomeFromContent(r.content ?? ""),
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memberId]);

  /* The timer starts when the dialog opens. It measures how long the operator has had the call
     open, which is the number they can actually act on — not a line the phone system gave us. */
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const saveDraft = useCallback(async () => {
    if (!taskId) return;
    const text = notesRef.current;
    if (text === savedNotesRef.current) return;
    const { error } = await supabase.from("tasks").update({ draft_notes: text }).eq("id", taskId);
    if (!error) {
      savedNotesRef.current = text;
      setDraftSavedAt(new Date());
    }
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(saveDraft, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [open, saveDraft]);

  const doc = useMemo<MemberDocument>(() => {
    const sections = overview?.sections ?? [];
    const subjectName = overview?.subject?.name?.trim() || memberName;
    return {
      title: chrome.title,
      subject: {
        name: subjectName,
        initials: documentInitials(subjectName),
        photoUrl: overview?.subject?.photoUrl ?? null,
        memberNumber: null,
        status: overview?.subject?.status
          ? t(
              memberStatusPresentation(overview.subject.status).key,
              memberStatusPresentation(overview.subject.status).fallback,
            )
          : null,
      },
      factCount: t("adminMemberDetail.overview.factCount", "{{count}} details on file", {
        count: overviewFactCount(sections),
      }),
      meta: chrome.metaPrintedBy(
        [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || null,
      ),
      company: chrome.company,
      confidentiality: chrome.confidentiality,
      /*
        IDENTITY NUMBERS STAY REDACTED. An operator asking how somebody is does not need their
        NIE, and this dialog is open on a shared call-centre screen for the length of a call —
        far longer than the Overview sheet somebody opens, reads and closes. The Overview makes
        it a per-sheet decision; here there is no reason to ever show them.
      */
      sections: overviewAsDocumentSections(sections, {
        includeIdentityNumbers: false,
        redactedLabel: chrome.redacted,
      }),
    };
  }, [chrome, overview, memberName, staff, t]);

  const closeCall = async () => {
    if (!taskId || !outcome) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("close_courtesy_call", {
        p_task_id: taskId,
        p_outcome: outcome,
        p_notes: notes,
        p_checklist: checklist,
        p_follow_up_at: needsFollowUp && followUpDate ? followUpDate : null,
      });
      if (error) throw error;

      toast.success(
        isReached(outcome)
          ? t("courtesyCall.closed", "Call recorded. Next call booked.")
          : t("courtesyCall.closedNoAnswer", "Attempt recorded. The call stays open for a retry."),
      );
      onClosed?.();
      onOpenChange(false);
    } catch (error) {
      // The notes are still in `draft_notes`, so a failed close never costs the operator what
      // they typed — which is why the draft is saved before this runs, not after.
      await saveDraft();
      toast.error(dbMessage(error, t("courtesyCall.closeFailed", "Could not record the call")));
    } finally {
      setSaving(false);
    }
  };

  /**
   * ESC ASKS. Half a call's notes are worth more than the keystroke that dismissed the dialog by
   * accident, and the draft is only written every ten seconds, so what is on screen can be newer
   * than what is stored.
   */
  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    const unsaved = notesRef.current !== savedNotesRef.current && notesRef.current.trim() !== "";
    if (unsaved) {
      const keep = window.confirm(
        t(
          "courtesyCall.confirmClose",
          "Save your notes as a draft before closing? Cancel to keep the call open.",
        ),
      );
      if (!keep) return;
      void saveDraft();
    }
    onOpenChange(false);
  };

  const dial = telHref(memberPhone);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        SIZE. Full screen below 1024 — an operator on a laptop should not work a call in a
        letterbox — then a real dialog at 85vh, and two columns only at 1280 where 60% is still
        wide enough to read a record in.
      */}
      <DialogContent
        data-testid="courtesy-call-dialog"
        className="h-screen w-screen max-w-none rounded-none p-0 lg:h-[85vh] lg:w-auto lg:rounded-lg xl:max-w-[66vw] xl:min-w-[900px]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t("courtesyCall.title", "Courtesy call")} — {memberName}
          </DialogTitle>
          <DialogDescription>
            {t(
              "courtesyCall.subtitle",
              "What you write here goes into the member's history and books the next call.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="courtesy-call-columns"
          className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-5"
        >
          {/* ── LEFT: the record, 60% at 1280 ───────────────────────────── */}
          <section
            data-testid="courtesy-call-record"
            className="min-h-0 border-b xl:col-span-3 xl:border-b-0 xl:border-r"
          >
            <ScrollArea className="h-full">
              <div className="space-y-6 p-6">
                {isLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <MemberDocumentView doc={doc} />
                )}

                <Separator />

                <div data-testid="courtesy-previous-calls">
                  <h3 className="mb-3 text-sm font-semibold">
                    {t("courtesyCall.previous", "Previous courtesy calls")}
                  </h3>
                  {previous.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("courtesyCall.previousNone", "No courtesy calls recorded yet.")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {previous.map((call) => (
                        <li key={call.id} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {call.created_at
                                ? format(parseISO(call.created_at), "d MMM yyyy")
                                : "—"}
                            </span>
                            {call.staff_name && <span>· {call.staff_name}</span>}
                            {call.outcome && (
                              <Badge variant="secondary" className="text-[10px]">
                                {call.outcome.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-3 whitespace-pre-line">
                            {call.content.replace(/^\[[a-z_]+\]\s*/, "")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
          </section>

          {/* ── RIGHT: the call, 40% at 1280 ────────────────────────────── */}
          <section data-testid="courtesy-call-panel" className="min-h-0 xl:col-span-2">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-6">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("courtesyCall.number", "Number")}
                  </p>
                  <p className="select-all text-2xl font-semibold tabular-nums">
                    {memberPhone || t("courtesyCall.noNumber", "No number on file")}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button asChild={!!dial} disabled={!dial} className="flex-1" size="lg">
                      {dial ? (
                        <a href={dial} data-testid="courtesy-call-dial">
                          <Phone className="mr-2 h-4 w-4" />
                          {t("courtesyCall.call", "Call")}
                        </a>
                      ) : (
                        <span>
                          <PhoneOff className="mr-2 h-4 w-4" />
                          {t("courtesyCall.call", "Call")}
                        </span>
                      )}
                    </Button>
                    {memberPhone && (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => {
                          void navigator.clipboard?.writeText(memberPhone);
                          toast.success(t("courtesyCall.copied", "Number copied"));
                        }}
                        title={t("courtesyCall.copy", "Copy number")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <span
                      data-testid="courtesy-call-timer"
                      className="min-w-[4rem] text-right text-lg font-medium tabular-nums text-muted-foreground"
                    >
                      {formatCallDuration(seconds)}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    {t("courtesyCall.checklist", "While you are on the call")}
                  </h3>
                  <div className="space-y-3">
                    {CALL_CHECKLIST.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`check-${item.id}`}
                          checked={!!checklist[item.id]}
                          onCheckedChange={(v) =>
                            setChecklist((c) => ({ ...c, [item.id]: v === true }))
                          }
                        />
                        <Label htmlFor={`check-${item.id}`} className="text-sm font-normal">
                          {t(item.key, item.fallback)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <Label htmlFor="courtesy-notes" className="text-sm font-semibold">
                      {t("courtesyCall.notes", "Notes")}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {draftSavedAt
                        ? t("courtesyCall.draftSaved", "Draft saved {{time}}", {
                            time: format(draftSavedAt, "HH:mm:ss"),
                          })
                        : t("courtesyCall.draftAuto", "Saves automatically")}
                    </span>
                  </div>
                  <Textarea
                    id="courtesy-notes"
                    data-testid="courtesy-call-notes"
                    rows={6}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => void saveDraft()}
                    placeholder={t(
                      "courtesyCall.notesPlaceholder",
                      "What did they say? Anything that has changed?",
                    )}
                  />
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    {t("courtesyCall.outcome.title", "How did the call end?")}
                  </h3>
                  <RadioGroup
                    value={outcome ?? ""}
                    onValueChange={(v) => setOutcome(v as CallOutcome)}
                  >
                    {OUTCOME_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center gap-3">
                        <RadioGroupItem value={option.value} id={`outcome-${option.value}`} />
                        <Label
                          htmlFor={`outcome-${option.value}`}
                          className="text-sm font-normal"
                        >
                          {t(option.key, option.fallback)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {outcome && !isReached(outcome) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(
                        "courtesyCall.staysOpen",
                        "Nobody was reached, so this call stays open and a retry is raised for tomorrow.",
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="courtesy-followup" className="text-sm font-semibold">
                      {t("courtesyCall.followUp", "Needs follow-up")}
                    </Label>
                    <Switch
                      id="courtesy-followup"
                      checked={needsFollowUp}
                      onCheckedChange={setNeedsFollowUp}
                    />
                  </div>
                  {needsFollowUp && (
                    <Input
                      type="date"
                      data-testid="courtesy-followup-date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  )}
                </div>

                <Button
                  data-testid="courtesy-close-call"
                  className="w-full"
                  size="lg"
                  disabled={!outcome || saving}
                  onClick={closeCall}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("courtesyCall.close", "Close call")}
                </Button>
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
