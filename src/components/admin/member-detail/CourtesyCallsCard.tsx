import { useState, useEffect } from "react";
import { Phone, Calendar, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      setFrequency((member as any)?.courtesy_call_frequency || "monthly");
      setNextCallDate(member?.next_courtesy_call_date || null);

      // Calculate next call date if not set
      if (!member?.next_courtesy_call_date && member?.created_at) {
        const freq = (member as any)?.courtesy_call_frequency || "monthly";
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

  const handleToggle = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("members")
        .update({ courtesy_calls_enabled: enabled })
        .eq("id", memberId);

      if (error) throw error;

      setIsEnabled(enabled);
      toast.success(enabled ? "Courtesy calls enabled" : "Courtesy calls disabled");
    } catch (error) {
      console.error("Error updating courtesy call setting:", error);
      toast.error("Failed to update setting");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFrequencyChange = async (newFrequency: string) => {
    setIsSaving(true);
    try {
      const newNextDate = calculateNextCallDate(newFrequency);
      
      const { error } = await supabase
        .from("members")
        .update({ 
          courtesy_call_frequency: newFrequency,
          next_courtesy_call_date: newNextDate.toISOString().split("T")[0]
        } as any)
        .eq("id", memberId);

      if (error) throw error;

      setFrequency(newFrequency);
      setNextCallDate(newNextDate.toISOString().split("T")[0]);
      toast.success(`Courtesy call frequency set to ${getFrequencyLabel(newFrequency).toLowerCase()}`);
    } catch (error) {
      console.error("Error updating courtesy call frequency:", error);
      toast.error("Failed to update frequency");
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Courtesy Calls
        </CardTitle>
        <CardDescription>
          Scheduled check-in calls based on your selected frequency
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isSaving}
          />
        </div>

        {/* Frequency Selector */}
        {isEnabled && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="frequency-select">Call Frequency</Label>
              <Select
                value={frequency}
                onValueChange={handleFrequencyChange}
                disabled={isSaving}
              >
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
      </CardContent>
    </Card>
  );
}
