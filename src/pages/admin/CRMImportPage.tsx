/**
 * The KarmaCRM import screen.
 *
 * WHAT AN ADMIN SEES BEFORE PRESSING IMPORT, AND WHY IT IS THE POINT
 *
 * This page used to parse a file, write a batch row immediately, and then show eight columns of
 * the parsed CSV. Nothing on it said what the import would DO — and what it did was invent data
 * to satisfy NOT NULL columns: a placeholder email, 'N/A' for the phone and the address, 'TBD'
 * for a pendant's SIM, `status: 'active'` for all 431 rows, and 'N/A' as the phone of an
 * emergency contact the CRM had named without a number. That last one is a number an operator
 * would have been handed mid-SOS.
 *
 * So the screen now shows the PLAN: per row, whether it becomes a member, a CRM contact or
 * nothing, and the reason — with the parsed phones, contacts and IMEI beside it. The plan is the
 * same value the writer applies (`planRowWrites` → `applyRowPlan`), so the preview and the
 * import cannot disagree; and it is exportable as CSV, because 431 rows are read in a
 * spreadsheet, not in a browser table.
 *
 * NOTHING IS WRITTEN UNTIL IMPORT IS PRESSED. The batch row is created inside `importNext`,
 * not on file drop, so dropping a file to look at it leaves no trace.
 *
 * AND IT GOES IN A HANDFUL AT A TIME, NOT ALL 431 AT ONCE (Lee, 18 Sep 2026: "I wanted to be
 * able to add 10 uploading at a time so I can watch them and make sure they all imported
 * good"). The import used to run the whole file behind one progress bar and then report six
 * numbers — which tells you 402 rows worked and nothing about WHICH 29 did not, on a file
 * where the rows that fail are the ones with the messiest data and the most at stake.
 *
 * So the run stops at the end of every batch and shows that batch row by row — name, what
 * happened to it, and anything the writer complained about — and waits to be told to carry
 * on. Stopping is free: `applyRowPlan` is idempotent per row and the cursor is where it got
 * to, so pressing on after a look is the same as never having stopped, and walking away
 * leaves the rows already written exactly as they are.
 */
import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, AlertCircle, CheckCircle2, Users, UserX, Loader2, ArrowLeft,
  Download, ShieldOff, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { mapIceCsv, summarise, type MappedRow } from "@/lib/iceCrmImport";
import {
  planRowWrites, applyMode, summarisePlans, plansToCsv, applyRowPlan,
  type ImportMode, type RowPlan, type AppliedAction,
} from "@/lib/crmImportWriter";
import { createSupabaseImportDb, describeImportError, importRowPayload } from "@/lib/crmImportDb";
import CRMHistoryImportCard from "@/components/admin/CRMHistoryImportCard";

const PREVIEW_ROWS = 50;

/** How many rows one press of Import writes. 10 is Lee's number: a screenful he can read. */
const BATCH_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_BATCH_SIZE = 10;

type Results = Record<AppliedAction, number> & { failed: number };

const emptyResults = (): Results => ({
  created: 0, updated: 0, unchanged: 0, crm_contact: 0, skipped: 0, failed: 0,
});

/** One row of the just-finished batch, as it is shown back for checking. */
interface BatchOutcome {
  rowIndex: number;
  sourceId: string;
  name: string;
  action: AppliedAction | "failed";
  memberId: string | null;
  problems: string[];
}

const OUTCOME_LABEL: Record<BatchOutcome["action"], string> = {
  created: "Member created",
  updated: "Member filled in",
  unchanged: "Already up to date",
  crm_contact: "CRM contact",
  skipped: "Not imported",
  failed: "Failed",
};

export default function CRMImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mapped, setMapped] = useState<MappedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMode, setImportMode] = useState<ImportMode>("members_and_contacts");
  const [importComplete, setImportComplete] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  /* The batched run. `cursor` is how far through `plans` the import has got and is the only
     thing that decides what the next press writes; `batchId` is created once, on the first
     press, so every batch of one file lands in one audit batch rather than pretending to be
     separate imports. */
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [cursor, setCursor] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [tally, setTally] = useState<Results>(emptyResults());
  const [lastBatch, setLastBatch] = useState<BatchOutcome[] | null>(null);

  /* The plan is derived, never stored. Storing it alongside the mode is how a screen ends up
     showing the plan for the mode the admin selected two clicks ago. */
  const plans: RowPlan[] = useMemo(
    () => mapped.map(planRowWrites).map((p) => applyMode(p, importMode)),
    [mapped, importMode]
  );
  const planSummary = useMemo(() => (plans.length > 0 ? summarisePlans(plans) : null), [plans]);
  const rowSummary = useMemo(() => (mapped.length > 0 ? summarise(mapped) : null), [mapped]);

  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setImportComplete(false);
    setResults(null);
    try {
      const text = await selectedFile.text();
      const rows = mapIceCsv(text);
      if (rows.length === 0) {
        setMapped([]);
        toast.error("That CSV has a header but no rows");
        return;
      }
      setMapped(rows);
      toast.success(`Read ${rows.length} rows. Nothing has been written yet.`);
    } catch (error) {
      // No PII: the filename and the parser's own message, never a row's contents.
      console.error("CRM import: could not read the file", error);
      setMapped([]);
      toast.error("Could not read that CSV file");
    }
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && droppedFile.name.toLowerCase().endsWith(".csv")) {
        void processFile(droppedFile);
      } else {
        toast.error("Please upload a CSV file");
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) void processFile(selectedFile);
    },
    [processFile]
  );

  const exportPreview = useCallback(() => {
    const blob = new Blob([plansToCsv(plans)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-import-preview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plans]);

  const reset = () => {
    setFile(null);
    setMapped([]);
    setImportComplete(false);
    setResults(null);
    setImportProgress(0);
    setCursor(0);
    setBatchId(null);
    setTally(emptyResults());
    setLastBatch(null);
  };

  const nameOf = (plan: RowPlan) =>
    [plan.parsedMember.first_name, plan.parsedMember.last_name].filter(Boolean).join(" ") ||
    plan.sourceId;

  /**
   * Write the next `count` rows, then stop.
   *
   * The audit trail for the WHOLE file is written on the first press, not per batch: it is
   * the record of what was in the file, and a row nobody ever got to is still a row somebody
   * may need to look at. Only the writing of members and contacts is batched.
   */
  const importNext = async (count: number) => {
    if (plans.length === 0 || !file || cursor >= plans.length) return;
    setImporting(true);
    setImportProgress(0);
    const db = createSupabaseImportDb(supabase);
    let announce: { kind: "success" | "warning" | "error"; text: string } | null = null;

    try {
      let id = batchId;
      if (!id) {
        const { data: batch, error: batchError } = await supabase
          .from("crm_import_batches")
          .insert({ filename: file.name, total_rows: plans.length, status: "importing", source: "karmacrm" })
          .select("id")
          .single();
        if (batchError) throw batchError;
        id = batch.id;
        setBatchId(id);

        /* `raw` here omits the redacted columns — see importRowPayload. */
        const payloads = plans.map((plan, i) => importRowPayload(id!, i, mapped[i], plan));
        for (let i = 0; i < payloads.length; i += 100) {
          const { error } = await supabase.from("crm_import_rows").insert(payloads.slice(i, i + 100));
          if (error) throw error;
        }
      }

      const end = Math.min(cursor + count, plans.length);
      const outcomes: BatchOutcome[] = [];
      const running = { ...tally };

      for (let i = cursor; i < end; i++) {
        setImportProgress(((i - cursor) / (end - cursor)) * 100);
        const plan = plans[i];
        try {
          const applied = await applyRowPlan(db, plan);
          running[applied.action] += 1;
          outcomes.push({
            rowIndex: i,
            sourceId: plan.sourceId,
            name: nameOf(plan),
            action: applied.action,
            memberId: applied.memberId,
            problems: applied.problems,
          });
          await supabase
            .from("crm_import_rows")
            .update({
              import_status: applied.action === "skipped" ? "skipped" : "imported",
              imported_member_id: applied.memberId,
              // Both, so the audit row points at whatever this run actually made. Recording
              // only the member id left every CRM contact unlinked to the row that created it.
              imported_crm_contact_id: applied.crmContactId,
              error_message: applied.problems.length > 0 ? applied.problems.join("; ") : null,
            })
            .eq("batch_id", id)
            .eq("row_index", i);
        } catch (error) {
          running.failed += 1;
          /* NOT `instanceof Error`. A PostgREST failure is a plain object, so that test was
             false for every database error and threw away the only useful thing. */
          const message = describeImportError(error);
          outcomes.push({
            rowIndex: i,
            sourceId: plan.sourceId,
            name: nameOf(plan),
            action: "failed",
            memberId: null,
            problems: [message],
          });
          console.error(`CRM import: row ${i} failed`, error);
          await supabase
            .from("crm_import_rows")
            .update({ import_status: "failed", error_message: message })
            .eq("batch_id", id)
            .eq("row_index", i);
        }
      }

      setTally(running);
      setLastBatch(outcomes);
      setCursor(end);

      if (end >= plans.length) {
        await supabase
          .from("crm_import_batches")
          .update({
            // The enum has no 'completed_with_errors': a batch with failures is 'failed', and
            // the per-row error_message says which rows. Reporting it 'completed' would hide them.
            status: running.failed > 0 ? "failed" : "completed",
            imported_rows: running.created + running.updated + running.crm_contact,
            failed_rows: running.failed,
            skipped_rows: running.skipped + running.unchanged,
          })
          .eq("id", id);
        setResults(running);
        setImportComplete(true);
      }

      // The import writes members, contacts, devices and CRM profiles straight through the
      // Supabase client, so nothing tells React Query its cached lists are out of date.
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });

      const failedHere = outcomes.filter((o) => o.action === "failed").length;
      /* Deliberately NOT a toast call inside the try. A toast that throws — a stubbed
         notifier, a missing level — would otherwise be caught below and reported as "the
         import failed", when every row it claims to have lost is already written. The
         batch's own success is decided before anything is announced. */
      announce =
        failedHere > 0
          ? { kind: "warning", text: `${end - cursor} rows done, ${failedHere} failed — check the list below` }
          : { kind: "success", text: `${end - cursor} rows done. ${plans.length - end} left.` };
    } catch (error) {
      console.error("CRM import failed", error);
      announce = { kind: "error", text: "Import failed before it finished — see the batch record" };
    } finally {
      setImporting(false);
      setImportProgress(100);
    }

    if (announce) {
      try {
        const notify = toast[announce.kind] ?? toast.message ?? toast.success;
        notify(announce.text);
      } catch (error) {
        // The rows are written either way. A notifier that cannot speak is worth a line in
        // the console and nothing more — certainly not an unhandled rejection that looks,
        // from the outside, exactly like the import having fallen over.
        console.error("CRM import: could not show the batch result", error);
      }
    }
  };

  const remaining = plans.length - cursor;

  const previewRows = plans.slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back to admin">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("adminCRMImport.title", "CRM Import")}</h1>
          <p className="text-muted-foreground">
            {t("adminCRMImport.subtitle", "Import contacts from KarmaCRM CSV exports")}
          </p>
        </div>
      </div>

      {!file && (
        <Card>
          <CardContent className="pt-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer"
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Step 1 — drop the contacts CSV here</h3>
              <p className="text-muted-foreground mb-4">
                or click to browse. Nothing is written until you press Import.
              </p>
              <input id="file-input" type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
              <Button variant="outline">Select File</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {file && planSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">File</p>
                  <p className="font-medium truncate max-w-[150px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{planSummary.total} rows</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Become members</p>
                  <p className="text-2xl font-bold" data-testid="summary-members">{planSummary.members}</p>
                  <p className="text-xs text-muted-foreground">
                    pending review, billed outside Stripe — confirm each one on their record
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-sm text-muted-foreground">CRM contacts</p>
                  <p className="text-2xl font-bold" data-testid="summary-crm-contacts">{planSummary.crmContacts}</p>
                  <p className="text-xs text-muted-foreground">a gap somebody can fill</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <UserX className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Not imported</p>
                  <p className="text-2xl font-bold" data-testid="summary-skipped">{planSummary.skipped}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* What the import will NOT be carrying. Counted, so a deliberate strip and a column that
          was simply empty are distinguishable. */}
      {rowSummary && Object.keys(rowSummary.discardedSensitive).length > 0 && (
        <Card data-testid="discarded-sensitive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldOff className="h-4 w-4" />
              Discarded before anything was stored
            </CardTitle>
            <CardDescription>
              These columns never reach the platform — not the member record, and not the import's
              own copy of the row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {Object.entries(rowSummary.discardedSensitive).map(([column, count]) => (
                <li key={column}>
                  <span className="font-medium">{column}</span> — held by {count} row{count === 1 ? "" : "s"}, discarded
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {file && planSummary && !importing && !importComplete && (
        <Card>
          <CardHeader>
            <CardTitle>What to do with rows that cannot be members</CardTitle>
            <CardDescription>
              A row becomes a member only when all nine required columns are really present. The
              rest are a record of what is missing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <RadioGroupItem value="members_and_contacts" id="mode-both" />
                <div>
                  <Label htmlFor="mode-both" className="font-medium cursor-pointer">
                    Keep them as CRM contacts (recommended)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Each one carries the reason it is not a member, so it can be finished later.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 border rounded-lg mt-2">
                <RadioGroupItem value="members_only" id="mode-members" />
                <div>
                  <Label htmlFor="mode-members" className="font-medium cursor-pointer">
                    Import complete members only
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    The rest are left out entirely. Nothing records why.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {importing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Importing…</span>
              </div>
              <Progress value={importProgress} />
              <p className="text-sm text-muted-foreground">{Math.round(importProgress)}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {importComplete && results && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              <h3 className="text-lg font-medium text-green-800 dark:text-green-200">Import complete</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {([
                ["created", "Members created"],
                ["updated", "Members filled in"],
                ["unchanged", "Already up to date"],
                ["crm_contact", "CRM contacts"],
                ["skipped", "Not imported"],
                ["failed", "Failed"],
              ] as const).map(([key, label]) => (
                <div key={key} className="text-center p-4 bg-card border rounded-lg">
                  <p className="text-2xl font-bold" data-testid={`result-${key}`}>{results[key]}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => navigate("/admin/members")}>View Members</Button>
              <Button variant="outline" onClick={reset}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The before-you-press preview, which is only useful before you press: once the run has
          started the batch results below are the thing to read, and 50 rows of plan above them
          is just scrolling. */}
      {plans.length > 0 && cursor === 0 && !importing && !importComplete && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>What this import will do</CardTitle>
              <CardDescription>
                Row by row, before anything is written
                {plans.length > PREVIEW_ROWS
                  ? ` — first ${PREVIEW_ROWS} of ${plans.length} shown; export for all of them`
                  : ""}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={exportPreview} data-testid="export-preview">
              <Download className="h-4 w-4 mr-2" />
              Export preview (CSV)
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Why not a member</TableHead>
                    <TableHead>Date of birth</TableHead>
                    <TableHead>Phones</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Emergency contacts</TableHead>
                    <TableHead>Pendant IMEI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((p) => (
                    <TableRow key={p.sourceId} data-testid={`preview-row-${p.sourceId}`}>
                      <TableCell>
                        <Badge
                          variant={
                            p.outcome === "member" ? "default" : p.outcome === "crm_contact" ? "secondary" : "outline"
                          }
                        >
                          {p.outcome === "member" ? "member" : p.outcome === "crm_contact" ? "CRM contact" : "skipped"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {[p.parsedMember.first_name, p.parsedMember.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px]">
                        {p.blockers.length > 0 ? p.blockers.join(", ") : "—"}
                        {p.warnings.length > 0 && (
                          <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
                            {p.warnings.join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{p.parsedMember.date_of_birth ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {p.parsedMember.phone ?? "—"}
                        {p.extraPhones.length > 0 && (
                          <p className="text-xs text-muted-foreground">+ {p.extraPhones.join(", ")}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        {[p.parsedMember.address_line_1, p.parsedMember.city, p.parsedMember.postal_code]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.contacts.length === 0 && p.contactsWithoutPhone.length === 0 && "—"}
                        {p.contacts.map((c) => (
                          <p key={`${c.contact_name}-${c.phone}`} className="whitespace-nowrap">
                            {c.contact_name} ({c.relationship}) {c.phone}
                          </p>
                        ))}
                        {p.contactsWithoutPhone.map((c) => (
                          <p key={c} className="text-xs text-yellow-700 dark:text-yellow-500">
                            {c} — no number, kept as a note
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="text-sm">{p.device?.imei ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {planSummary && Object.keys(planSummary.blockerCounts).length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium mb-2">Why rows are not members, across the whole file</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {Object.entries(planSummary.blockerCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <li key={reason}>
                        {count} × {reason}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {file && planSummary && !importing && !importComplete && (
        <Card>
          <CardHeader>
            <CardTitle>
              {cursor === 0 ? "Import, a few at a time" : `${cursor} of ${plans.length} done`}
            </CardTitle>
            <CardDescription>
              {cursor === 0
                ? "Each press writes one batch and then stops, so you can check them before going on. Stopping costs nothing — the next press carries on from where this one ended."
                : `${remaining} row${remaining === 1 ? "" : "s"} still to go. Nothing already written is touched again.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <Label htmlFor="batch-size">Rows per press</Label>
                <Select
                  value={String(batchSize)}
                  onValueChange={(v) => setBatchSize(Number(v))}
                >
                  <SelectTrigger id="batch-size" className="w-[140px]" data-testid="batch-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCH_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} at a time</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={reset}>
                  {cursor === 0 ? "Cancel" : "Stop here"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void importNext(plans.length)}
                  disabled={planSummary.members + planSummary.crmContacts === 0}
                  data-testid="import-rest"
                >
                  Import the remaining {remaining}
                </Button>
                <Button
                  onClick={() => void importNext(batchSize)}
                  disabled={planSummary.members + planSummary.crmContacts === 0}
                  data-testid="start-import"
                >
                  Import next {Math.min(batchSize, remaining)}
                </Button>
              </div>
            </div>
            {cursor > 0 && (
              <div className="mt-4 space-y-2">
                <Progress value={(cursor / plans.length) * 100} />
                <p className="text-sm text-muted-foreground tabular-nums">
                  {tally.created} created · {tally.updated} filled in · {tally.crm_contact} CRM
                  contacts · {tally.unchanged} already up to date · {tally.skipped} not imported ·{" "}
                  {tally.failed} failed
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* The whole point of batching: the batch just written, row by row, while it is still
          small enough to read. A tally of six numbers says 402 worked; this says which. */}
      {lastBatch && lastBatch.length > 0 && !importing && (
        <Card data-testid="last-batch">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />
              The {lastBatch.length} just written — rows {lastBatch[0].rowIndex + 1} to{" "}
              {lastBatch[lastBatch.length - 1].rowIndex + 1}
            </CardTitle>
            <CardDescription>
              Check these before going on. Anything marked Failed is still in the file and can be
              re-run once the cause is fixed — re-importing a row that worked changes nothing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>What happened</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastBatch.map((o) => (
                    <TableRow key={o.sourceId} data-testid={`batch-row-${o.sourceId}`}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {o.rowIndex + 1}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {o.memberId ? (
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:no-underline"
                            onClick={() => navigate(`/admin/members/${o.memberId}`)}
                          >
                            {o.name}
                          </button>
                        ) : (
                          o.name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            o.action === "failed"
                              ? "destructive"
                              : o.action === "created" || o.action === "updated"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {OUTCOME_LABEL[o.action]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[320px]">
                        {o.problems.length > 0 ? o.problems.join(" · ") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Always visible, and not gated on step 1 having a file loaded in THIS session:
          the contacts import is usually run once, days before the history file arrives. */}
      <CRMHistoryImportCard />
    </div>
  );
}
