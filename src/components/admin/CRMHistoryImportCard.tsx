/**
 * Step 2 of the karmaCRM migration: the notes and the courtesy calls.
 *
 * The contacts CSV and the history JSON are two files because karmaCRM gives them
 * out as two files — its export contains "contacts, companies, deals, cases, and
 * tasks" and the timeline is not in that list; it comes from the API instead. They
 * are also two STEPS, and deliberately so: a note has to attach to a member or a
 * CRM contact, so the contacts import has to have run first. Running this before
 * that does not corrupt anything, it just reports every record as unplaced.
 *
 * Like step 1, this screen shows the plan before it writes anything. Dropping the
 * file parses it in the browser and shows what would happen; nothing reaches the
 * database until Import is pressed.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, CheckCircle2, MessageSquare, PhoneCall, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseKarmaHistory,
  summariseHistory,
  type HistoryPlan,
} from "@/lib/karmaHistoryImport";
import { applyHistoryPlan, type HistoryApplyResult } from "@/lib/karmaHistoryWriter";
import { createSupabaseHistoryDb } from "@/lib/crmImportDb";

/** How many unplaced contact ids to name before saying "and N more". */
const UNPLACED_SHOWN = 10;

function Stat({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="text-center p-4 bg-card border rounded-lg">
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function CRMHistoryImportCard() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<HistoryPlan | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<HistoryApplyResult | null>(null);

  const summary = useMemo(() => (plan ? summariseHistory(plan) : null), [plan]);

  const processFile = useCallback(async (selected: File) => {
    setFile(selected);
    setResult(null);
    setProgress(0);
    try {
      const parsed = parseKarmaHistory(await selected.text());
      if (parsed.notes.length === 0 && parsed.tasks.length === 0) {
        setPlan(null);
        toast.error(parsed.problems[0] ?? "No notes or calls in that file");
        return;
      }
      setPlan(parsed);
      toast.success(
        `Read ${parsed.notes.length + parsed.tasks.length} records. Nothing has been written yet.`
      );
    } catch (error) {
      // No PII: the parser's own message, never a record's contents.
      console.error("CRM history import: could not read the file", error);
      setPlan(null);
      toast.error("Could not read that file");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (dropped && dropped.name.toLowerCase().endsWith(".json")) void processFile(dropped);
      else toast.error("Please upload the history JSON file");
    },
    [processFile]
  );

  const reset = () => {
    setFile(null);
    setPlan(null);
    setResult(null);
    setProgress(0);
  };

  const startImport = async () => {
    if (!plan) return;
    setImporting(true);
    setProgress(0);
    try {
      const applied = await applyHistoryPlan(createSupabaseHistoryDb(supabase), plan, {
        onProgress: (done, total) => setProgress(total === 0 ? 100 : (done / total) * 100),
      });
      setResult(applied);
      queryClient.invalidateQueries({ queryKey: ["member-notes"] });
      queryClient.invalidateQueries({ queryKey: ["courtesy-calls"] });
      toast.success(
        `${applied.notesCreated.toLocaleString()} notes and ${applied.tasksCreated.toLocaleString()} calls imported`
      );
    } catch (error) {
      console.error("CRM history import failed", error);
      toast.error("History import failed before it finished");
    } finally {
      setImporting(false);
      setProgress(100);
    }
  };

  return (
    <Card data-testid="history-import">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Step 2 — notes and call history
        </CardTitle>
        <CardDescription>
          The karmaCRM timeline, which its CSV export does not contain. Run the contacts import
          above first: a note has to attach to a member or a CRM contact, and this reports any it
          cannot place rather than guessing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!file && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
            onClick={() => document.getElementById("history-file-input")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Drop the history JSON here</h3>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse. Nothing is written until you press Import.
            </p>
            <input
              id="history-file-input"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void processFile(selected);
              }}
            />
            <Button variant="outline">Select file</Button>
          </div>
        )}

        {file && summary && !result && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                value={summary.notes}
                label="Notes"
                hint={summary.calls > 0 ? `${summary.calls} logged as phone calls` : undefined}
              />
              <Stat
                value={summary.tasks}
                label="Calls and tasks"
                hint={`${summary.courtesyCalls.toLocaleString()} courtesy calls`}
              />
              <Stat value={summary.contacts} label="People" />
              <Stat
                value={summary.skipped}
                label="Not imported"
                hint="birthdays and created-on markers"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.earliest?.slice(0, 10)} to {summary.latest?.slice(0, 10)} — each record keeps
              its own date, so the file reads as it did in karmaCRM.
            </p>
            {plan && plan.skipped.length > 0 && (
              <ul className="text-sm text-muted-foreground space-y-1">
                {plan.skipped.map((s) => (
                  <li key={s.kind}>
                    {s.count.toLocaleString()} × {s.kind} — {s.reason}
                  </li>
                ))}
              </ul>
            )}
            {plan && plan.problems.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-500">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <ul className="space-y-1">
                  {plan.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {importing && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Importing history…</span>
            </div>
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">{Math.round(progress)}% complete</p>
          </div>
        )}

        {result && (
          <div className="space-y-4" data-testid="history-result">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              <h3 className="font-medium">History imported</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                value={result.notesCreated}
                label="Notes written"
                hint={
                  result.notesAlreadyPresent > 0
                    ? `${result.notesAlreadyPresent.toLocaleString()} were already there`
                    : undefined
                }
              />
              <Stat
                value={result.tasksCreated}
                label="Calls written"
                hint={
                  result.tasksAlreadyPresent > 0
                    ? `${result.tasksAlreadyPresent.toLocaleString()} were already there`
                    : undefined
                }
              />
              <Stat value={result.toMembers} label="On member files" />
              <Stat
                value={result.toCrmContacts}
                label="On CRM contacts"
                hint="cancelled, deceased and prospects"
              />
            </div>
            {result.unplaced > 0 && (
              <div className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-500">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {result.unplaced.toLocaleString()} record(s) belong to{" "}
                  {result.unplacedContactIds.length} karmaCRM contact(s) that are not in the
                  platform: {result.unplacedContactIds.slice(0, UNPLACED_SHOWN).join(", ")}
                  {result.unplacedContactIds.length > UNPLACED_SHOWN
                    ? ` and ${result.unplacedContactIds.length - UNPLACED_SHOWN} more`
                    : ""}
                  . Import the contacts CSV and run this again — nothing already written is
                  duplicated.
                </p>
              </div>
            )}
            {result.problems.length > 0 && (
              <ul className="text-sm text-yellow-700 dark:text-yellow-500 space-y-1">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {file && !importing && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              {result ? "Import another file" : "Cancel"}
            </Button>
            {!result && summary && (
              <Button
                onClick={startImport}
                disabled={summary.notes + summary.tasks === 0}
                data-testid="start-history-import"
              >
                <PhoneCall className="h-4 w-4 mr-2" />
                Import {(summary.notes + summary.tasks).toLocaleString()} records
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
