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
import {
  applyHistoryPlan,
  resolvePlaceable,
  type HistoryApplyResult,
} from "@/lib/karmaHistoryWriter";
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
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [running, setRunning] = useState<HistoryApplyResult | null>(null);
  const [lastBatch, setLastBatch] = useState<BatchLine[] | null>(null);
  /*
    PROGRESS IS A SET OF PEOPLE, NOT AN INDEX, and that is the fix for the bug Lee found.

    A counter into `plan.crmContactIds` walks the order the JSON happens to mention people.
    Step 1 walks the CSV in row order. Those are two unrelated orders, so "the next 10 people"
    here had nothing to do with the ten rows step 1 had just written — seven of Lee's first ten
    came back "not in the platform" while their contact rows sat further down the CSV.

    Holding the people already written, and asking the database before every press which of the
    rest can be placed, makes the two sides track each other without either knowing the other's
    order. Import ten more contacts and ten more people become available here.
  */
  const [done, setDone] = useState<Set<string>>(new Set());
  const [placeable, setPlaceable] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const summary = useMemo(() => (plan ? summariseHistory(plan) : null), [plan]);
  const volumes = useMemo(() => (plan ? volumeByContact(plan) : []), [plan]);
  const volumeOf = useMemo(
    () => new Map(volumes.map((v) => [v.crmContactId, v])),
    [volumes]
  );
  /** The people who can be written now and have not been. */
  const queue = useMemo(() => placeable.filter((id) => !done.has(id)), [placeable, done]);
  const remaining = queue.length;

  /** Ask the database who can be placed. Cheap, batched, and run before every press. */
  const refreshPlaceable = useCallback(
    async (target: HistoryPlan) => {
      setChecking(true);
      try {
        const found = await resolvePlaceable(createSupabaseHistoryDb(supabase), target.crmContactIds);
        setPlaceable(found.placeable);
        setWaiting(found.waiting);
        return found;
      } finally {
        setChecking(false);
      }
    },
    []
  );

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
      setDone(new Set());
      const found = await refreshPlaceable(parsed);
      toast.success(
        `Read ${parsed.notes.length + parsed.tasks.length} records for ${found.placeable.length} people already in the platform. Nothing has been written yet.`
      );
    } catch (error) {
      // No PII: the parser's own message, never a record's contents.
      console.error("CRM history import: could not read the file", error);
      setPlan(null);
      toast.error("Could not read that file");
    }
  }, [refreshPlaceable]);

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
    setDone(new Set());
    setPlaceable([]);
    setWaiting([]);
    setRunning(null);
    setLastBatch(null);
  };

  /** Write the next `count` people, then stop. */
  const importNext = async (count: number) => {
    if (!plan) return;
    setImporting(true);
    setProgress(0);

    /* Re-asked every press, so this batch is ten people who exist NOW — including any whose
       contact row step 1 wrote since the last press. */
    const found = await refreshPlaceable(plan);
    const next = found.placeable.filter((id) => !done.has(id)).slice(0, count);
    if (next.length === 0) {
      setImporting(false);
      toast.info(
        found.waiting.length > 0
          ? `Nothing to write yet — ${found.waiting.length} people are still waiting for their contact row.`
          : "Every person in this file is already imported."
      );
      return;
    }
    const slice = next.map(
      (id) => volumeOf.get(id) ?? { crmContactId: id, name: id, notes: 0, tasks: 0 }
    );

    try {
      const applied = await applyHistoryPlan(
        createSupabaseHistoryDb(supabase),
        planForContacts(plan, slice.map((v) => v.crmContactId)),
        { onProgress: (done, total) => setProgress(total === 0 ? 100 : (done / total) * 100) }
      );

      setLastBatch(
        slice.map((v) => ({
          ...v,
          /* Should now always be false — the batch was resolved a moment ago — but it stays on
             the line rather than being assumed away: a contact deleted between the check and
             the write must show as skipped, not silently vanish from the count. */
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
      const written = new Set([...done, ...next]);
      setDone(written);
      /* "Finished" means every person this file can reach is written, not that the cursor hit
         the end of a list — people waiting for their contact row are not a finished import. */
      if (written.size >= found.placeable.length && found.waiting.length === 0) setResult(applied);

      queryClient.invalidateQueries({ queryKey: ["member-notes"] });
      queryClient.invalidateQueries({ queryKey: ["courtesy-calls"] });

      const left = found.placeable.length - written.size;
      if (applied.unplaced > 0) {
        toast.warning(
          `${slice.length} people done — ${applied.unplaced} record(s) had nobody to attach to`
        );
      } else {
        toast.success(
          `${slice.length} people done: ${applied.notesCreated.toLocaleString()} notes, ${applied.tasksCreated.toLocaleString()} calls. ${left} ready, ${found.waiting.length} waiting on step 1.`
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

        {file && summary && done.size === 0 && !result && (
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
              <Stat
                value={summary.contacts}
                label="People"
                hint={
                  checking
                    ? "checking who is in the platform…"
                    : `${placeable.length} ready now, ${waiting.length} waiting on step 1`
                }
              />
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
                  : `${done.size} of ${done.size + remaining} people done — so far`}
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
                  {running.unplacedContactIds.length} karmaCRM contact(s) that disappeared between
                  the check and the write:{" "}
                  {running.unplacedContactIds.slice(0, UNPLACED_SHOWN).join(", ")}
                  {running.unplacedContactIds.length > UNPLACED_SHOWN
                    ? ` and ${running.unplacedContactIds.length - UNPLACED_SHOWN} more`
                    : ""}
                  . Press again — nothing already written is duplicated.
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
                {done.size} of {done.size + remaining} people written
                {waiting.length > 0 ? `, ${waiting.length} still waiting on step 1` : ""}
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

        {/* The people this file knows about whose contact row has not been imported yet. NOT a
            failure and NOT an error: their rows are further down the CSV, and every press
            re-asks the database, so they join the queue as step 1 reaches them. */}
        {file && waiting.length > 0 && !importing && (
          <div
            className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm"
            data-testid="history-waiting"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-700 dark:text-yellow-500" />
            <div>
              <p className="font-medium">
                {waiting.length} {waiting.length === 1 ? "person is" : "people are"} waiting for
                their contact row
              </p>
              <p className="text-muted-foreground">
                Their records are in this file, but step 1 has not created them yet. They are not
                skipped and nothing is lost — finish the contacts import and press again, and
                they join the queue. Each press checks afresh.
              </p>
            </div>
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
                {done.size === 0 ? "Cancel" : "Stop here"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void refreshPlaceable(plan!)}
                disabled={checking || !plan}
                data-testid="history-recheck"
              >
                Check again
              </Button>
              <Button
                variant="outline"
                onClick={() => void importNext(Number.MAX_SAFE_INTEGER)}
                disabled={remaining === 0}
                data-testid="import-history-rest"
              >
                Import the {remaining} ready
              </Button>
              <Button
                onClick={() => void importNext(batchSize)}
                disabled={remaining === 0}
                data-testid="start-history-import"
              >
                <PhoneCall className="h-4 w-4 mr-2" />
                Import next {Math.min(batchSize, remaining)}{" "}
                {Math.min(batchSize, remaining) === 1 ? "person" : "people"}
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
