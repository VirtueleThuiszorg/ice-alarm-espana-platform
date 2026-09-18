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
 *
 * AND LIKE STEP 1, IT GOES A HANDFUL AT A TIME — but a handful of PEOPLE, not of
 * records. 10 people is something Lee can look at and recognise; 10 records is a
 * fragment of somebody's file with no way to tell whether the rest arrived. Batching
 * by person also keeps a stop honest: every note and every call belonging to a name
 * is written in the same press, so a name that came back clean is a file that is
 * complete, and the next press starts at the next name.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, CheckCircle2, MessageSquare, PhoneCall, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseKarmaHistory,
  planForContacts,
  summariseHistory,
  volumeByContact,
  type HistoryPlan,
} from "@/lib/karmaHistoryImport";
import { applyHistoryPlan, type HistoryApplyResult } from "@/lib/karmaHistoryWriter";
import { createSupabaseHistoryDb } from "@/lib/crmImportDb";

/** How many unplaced contact ids to name before saying "and N more". */
const UNPLACED_SHOWN = 10;

/** People per press. Matches step 1's default for the same reason: a screenful. */
const BATCH_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_BATCH_SIZE = 10;

/** One person in the batch just written, as it is shown back for checking. */
interface BatchLine {
  crmContactId: string;
  name: string;
  notes: number;
  tasks: number;
  unplaced: boolean;
}

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
  /* `cursor` counts PEOPLE done, not records — see the header. */
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState<HistoryApplyResult | null>(null);
  const [lastBatch, setLastBatch] = useState<BatchLine[] | null>(null);

  const summary = useMemo(() => (plan ? summariseHistory(plan) : null), [plan]);
  const volumes = useMemo(() => (plan ? volumeByContact(plan) : []), [plan]);
  const remaining = volumes.length - cursor;

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
    setCursor(0);
    setRunning(null);
    setLastBatch(null);
  };

  /** Write the next `count` people, then stop. */
  const importNext = async (count: number) => {
    if (!plan || cursor >= volumes.length) return;
    setImporting(true);
    setProgress(0);
    const end = Math.min(cursor + count, volumes.length);
    const slice = volumes.slice(cursor, end);

    try {
      const applied = await applyHistoryPlan(
        createSupabaseHistoryDb(supabase),
        planForContacts(plan, slice.map((v) => v.crmContactId)),
        { onProgress: (done, total) => setProgress(total === 0 ? 100 : (done / total) * 100) }
      );

      setLastBatch(
        slice.map((v) => ({
          ...v,
          unplaced: applied.unplacedContactIds.includes(v.crmContactId),
        }))
      );
      /* The running total is the sum of the batches, so stopping half way still shows how
         much of the file is in. Problems accumulate for the same reason — a batch that had
         trouble must not be erased by a later one that did not. */
      setRunning((prev) =>
        prev
          ? {
              ...applied,
              notesCreated: prev.notesCreated + applied.notesCreated,
              notesAlreadyPresent: prev.notesAlreadyPresent + applied.notesAlreadyPresent,
              tasksCreated: prev.tasksCreated + applied.tasksCreated,
              tasksAlreadyPresent: prev.tasksAlreadyPresent + applied.tasksAlreadyPresent,
              unplaced: prev.unplaced + applied.unplaced,
              unplacedContactIds: [...prev.unplacedContactIds, ...applied.unplacedContactIds],
              toMembers: prev.toMembers + applied.toMembers,
              toCrmContacts: prev.toCrmContacts + applied.toCrmContacts,
              problems: [...prev.problems, ...applied.problems],
            }
          : applied
      );
      setCursor(end);
      if (end >= volumes.length) setResult(applied);

      queryClient.invalidateQueries({ queryKey: ["member-notes"] });
      queryClient.invalidateQueries({ queryKey: ["courtesy-calls"] });

      if (applied.unplaced > 0) {
        toast.warning(
          `${slice.length} people done — ${applied.unplaced} record(s) had nobody to attach to`
        );
      } else {
        toast.success(
          `${slice.length} people done: ${applied.notesCreated.toLocaleString()} notes, ${applied.tasksCreated.toLocaleString()} calls. ${volumes.length - end} people left.`
        );
      }
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

        {file && summary && cursor === 0 && !result && (
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

        {running && !importing && (
          <div className="space-y-4" data-testid="history-result">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              <h3 className="font-medium">
                {result
                  ? "History imported"
                  : `${cursor} of ${volumes.length} people done — so far`}
              </h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                value={running.notesCreated}
                label="Notes written"
                hint={
                  running.notesAlreadyPresent > 0
                    ? `${running.notesAlreadyPresent.toLocaleString()} were already there`
                    : undefined
                }
              />
              <Stat
                value={running.tasksCreated}
                label="Calls written"
                hint={
                  running.tasksAlreadyPresent > 0
                    ? `${running.tasksAlreadyPresent.toLocaleString()} were already there`
                    : undefined
                }
              />
              <Stat value={running.toMembers} label="On member files" />
              <Stat
                value={running.toCrmContacts}
                label="On CRM contacts"
                hint="cancelled, deceased and prospects"
              />
            </div>
            {running.unplaced > 0 && (
              <div className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-500">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {running.unplaced.toLocaleString()} record(s) belong to{" "}
                  {running.unplacedContactIds.length} karmaCRM contact(s) that are not in the
                  platform: {running.unplacedContactIds.slice(0, UNPLACED_SHOWN).join(", ")}
                  {running.unplacedContactIds.length > UNPLACED_SHOWN
                    ? ` and ${running.unplacedContactIds.length - UNPLACED_SHOWN} more`
                    : ""}
                  . Import the contacts CSV and run this again — nothing already written is
                  duplicated.
                </p>
              </div>
            )}
            {running.problems.length > 0 && (
              <ul className="text-sm text-yellow-700 dark:text-yellow-500 space-y-1">
                {running.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* The people just written, by name and by how much each brought. This is what
            "watch them and make sure they all imported good" actually needs: a line per
            person, small enough to read, while the next press is still a decision. */}
        {lastBatch && lastBatch.length > 0 && !importing && (
          <div className="rounded-lg border" data-testid="history-last-batch">
            <div className="border-b px-4 py-3">
              <p className="font-medium">The {lastBatch.length} just written</p>
              <p className="text-sm text-muted-foreground">
                People {cursor - lastBatch.length + 1} to {cursor} of {volumes.length}
              </p>
            </div>
            <ul className="divide-y">
              {lastBatch.map((line) => (
                <li
                  key={line.crmContactId}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                  data-testid={`history-batch-${line.crmContactId}`}
                >
                  <span className="font-medium truncate">{line.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {line.unplaced ? (
                      <span className="text-yellow-700 dark:text-yellow-500">
                        not in the platform — nothing written
                      </span>
                    ) : (
                      <>
                        {line.notes.toLocaleString()} note{line.notes === 1 ? "" : "s"} ·{" "}
                        {line.tasks.toLocaleString()} call{line.tasks === 1 ? "" : "s"}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {file && summary && !result && !importing && (
          <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="history-batch-size">People per press</Label>
              <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
                <SelectTrigger
                  id="history-batch-size"
                  className="w-[150px]"
                  data-testid="history-batch-size"
                >
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
                onClick={() => void importNext(volumes.length)}
                disabled={summary.notes + summary.tasks === 0}
                data-testid="import-history-rest"
              >
                Import the remaining {remaining}
              </Button>
              <Button
                onClick={() => void importNext(batchSize)}
                disabled={summary.notes + summary.tasks === 0}
                data-testid="start-history-import"
              >
                <PhoneCall className="h-4 w-4 mr-2" />
                Import next {Math.min(batchSize, remaining)} {remaining === 1 ? "person" : "people"}
              </Button>
            </div>
          </div>
        )}

        {result && !importing && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={reset}>Import another file</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
