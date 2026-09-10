import { useState, useEffect } from "react";
import { Phone, Calendar, Clock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EditableCard } from "@/components/EditableCard";
import { logMemberActivity } from "@/lib/auditLog";
import { dbMessage } from "@/lib/dbMessage";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, addDays, addMonths } from "date-fns";

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi-weekly", label: "Bi-weekly (Every 2 weeks)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly (Every 3 months)" },
];

const getFrequencyLabel = (frequency: string) => {
  const option = frequencyOptions.find(opt => opt.value === frequency);
  return option?.label || "Monthly";
};

const calculateNextCallDate = (frequency: string, baseDate?: Date): Date => {
  const today = baseDate || new Date();
  switch (frequency) {
    case "daily":
      return addDays(today, 1);
    case "weekly":
      return addDays(today, 7);
    case "bi-weekly":
      return addDays(today, 14);
    case "quarterly":
      return addMonths(today, 3);
    case "monthly":
    default:
      return addMonths(today, 1);
  }
};

interface CourtesyCallsCardProps {
  memberId: string;
}

interface CompletedCall {
  id: string;
  title: string;
  completed_at: string | null;
}

export function CourtesyCallsCard({ memberId }: CourtesyCallsCardProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [nextCallDate, setNextCallDate] = useState<string | null>(null);
  const [completedCalls, setCompletedCalls] = useState<CompletedCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  /*
    THE LAST TWO CONTROLS ON THE RECORD THAT WROTE ON TOUCH.

    The switch and the frequency select each ran their own UPDATE the instant they moved — no
    Edit, no Save, no undo. Brushing the switch on a shared screen silently stopped a member's
    scheduled check-in calls, and nothing on the card said it had happened beyond a toast that
    was gone in three seconds. They are now a draft the operator commits, like every other
    field on this record.
  */
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftFrequency, setDraftFrequency] = useState<string>("monthly");

  useEffect(() => {
    fetchData();
  }, [memberId]);

  const fetchData = async () => {
    try {
      // Fetch member's courtesy call settings
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("courtesy_calls_enabled, courtesy_call_frequency, next_courtesy_call_date, created_at")
        .eq("id", memberId)
        .single();

      if (memberError) throw memberError;

      setIsEnabled(member?.courtesy_calls_enabled ?? true);
      setFrequency(member?.courtesy_call_frequency || "monthly");
      setDraftEnabled(member?.courtesy_calls_enabled ?? true);
      setDraftFrequency(member?.courtesy_call_frequency || "monthly");
      setNextCallDate(member?.next_courtesy_call_date || null);

      // Calculate next call date if not set
      if (!member?.next_courtesy_call_date && member?.created_at) {
        const freq = member?.courtesy_call_frequency || "monthly";
        const nextDate = calculateNextCallDate(freq);
        setNextCallDate(nextDate.toISOString().split("T")[0]);
      }

      // Fetch completed courtesy call tasks
      const { data: calls, error: callsError } = await supabase
        .from("tasks")
        .select("id, title, completed_at")
        .eq("member_id", memberId)
        .eq("task_type", "courtesy_call")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      if (callsError) throw callsError;
      setCompletedCalls(calls || []);
    } catch (error) {
      console.error("Error fetching courtesy call data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const save = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      /*
        ONE WRITE, BOTH FIELDS. Two separate updates meant a member could be left with calls
        enabled at the old frequency if the second one failed — and the next call date, which
        is what actually generates the task, belonged to neither of them.
      */
      const nextDate =
        draftEnabled && (draftFrequency !== frequency || !nextCallDate)
          ? calculateNextCallDate(draftFrequency).toISOString().split("T")[0]
          : nextCallDate;

      const { error } = await supabase
        .from("members")
        .update({
          courtesy_calls_enabled: draftEnabled,
          courtesy_call_frequency: draftFrequency,
          next_courtesy_call_date: draftEnabled ? nextDate : null,
        })
        .eq("id", memberId);

      if (error) throw error;

      await logMemberActivity(
        "update",
        memberId,
        { courtesy_calls_enabled: isEnabled, courtesy_call_frequency: frequency },
        { courtesy_calls_enabled: draftEnabled, courtesy_call_frequency: draftFrequency },
      );

      setIsEnabled(draftEnabled);
      setFrequency(draftFrequency);
      setNextCallDate(draftEnabled ? nextDate : null);
      toast.success(
        draftEnabled
          ? `Courtesy calls ${getFrequencyLabel(draftFrequency).toLowerCase()}`
          : "Courtesy calls turned off",
      );
      return true;
    } catch (error) {
      console.error("Error updating courtesy calls:", error);
      toast.error(dbMessage(error, "Failed to update courtesy calls"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <EditableCard
      testId="courtesy-card"
      title={
        <span className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Courtesy Calls
        </span>
      }
      description="Scheduled check-in calls. Read-only until you press Edit."
      isDirty={draftEnabled !== isEnabled || draftFrequency !== frequency}
      saving={isSaving}
      onSave={save}
      onCancel={() => {
        setDraftEnabled(isEnabled);
        setDraftFrequency(frequency);
      }}
    >
      <div className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="courtesy-calls-toggle" className="text-base">
              Enable Courtesy Calls
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically generate call tasks
            </p>
          </div>
          <Switch
            id="courtesy-calls-toggle"
            checked={draftEnabled}
            onCheckedChange={setDraftEnabled}
          />
        </div>

        {/* Frequency Selector */}
        {draftEnabled && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="frequency-select">Call Frequency</Label>
              <Select value={draftFrequency} onValueChange={setDraftFrequency}>
                <SelectTrigger id="frequency-select" className="w-full">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {frequencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <Separator />

        {/* Next Call Date */}
        {isEnabled && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Next Scheduled Call</p>
              <p className="text-lg font-semibold text-primary">
                {nextCallDate ? format(parseISO(nextCallDate), "MMMM d, yyyy") : "Not scheduled"}
              </p>
            </div>
          </div>
        )}

        {/* Call History */}
        {completedCalls.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Completed Calls
              </h4>
              <div className="space-y-2">
                {completedCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded"
                  >
                    <span className="text-muted-foreground">{call.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {call.completed_at
                        ? format(parseISO(call.completed_at), "MMM d, yyyy")
                        : "Unknown"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {completedCalls.length === 0 && isEnabled && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No courtesy calls completed yet
          </p>
        )}
      </div>
    </EditableCard>
  );
}
