import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, Download, Filter, Phone, MessageSquare, Mail,
  Bell, CheckCircle, FileText, CreditCard, Settings,
  Smartphone, AlertTriangle, ThumbsUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isToday, isYesterday } from "date-fns";

interface Interaction {
  id: string;
  interaction_type: string;
  description: string | null;
  metadata: any;
  created_at: string | null;
  staff: {
    first_name: string;
    last_name: string;
  } | null;
}

const interactionConfig: Record<string, { icon: any; label: string; color: string }> = {
  call_inbound: { icon: Phone, label: "Inbound Call", color: "text-blue-500" },
  call_outbound: { icon: Phone, label: "Outbound Call", color: "text-green-500" },
  sms_sent: { icon: MessageSquare, label: "SMS Sent", color: "text-purple-500" },
  sms_received: { icon: MessageSquare, label: "SMS Received", color: "text-purple-400" },
  whatsapp_sent: { icon: MessageSquare, label: "WhatsApp Sent", color: "text-green-600" },
  whatsapp_received: { icon: MessageSquare, label: "WhatsApp Received", color: "text-green-500" },
  email_sent: { icon: Mail, label: "Email Sent", color: "text-orange-500" },
  email_received: { icon: Mail, label: "Email Received", color: "text-orange-400" },
  alert_received: { icon: Bell, label: "SOS Alert", color: "text-destructive" },
  alert_resolved: { icon: CheckCircle, label: "Alert Resolved", color: "text-alert-resolved" },
  note_added: { icon: FileText, label: "Note Added", color: "text-muted-foreground" },
  profile_updated: { icon: Settings, label: "Profile Updated", color: "text-blue-400" },
  payment_received: { icon: CreditCard, label: "Payment Received", color: "text-green-500" },
  payment_failed: { icon: CreditCard, label: "Payment Failed", color: "text-destructive" },
  subscription_changed: { icon: CreditCard, label: "Subscription Changed", color: "text-yellow-500" },
  device_assigned: { icon: Smartphone, label: "Device Assigned", color: "text-blue-500" },
  device_issue: { icon: Smartphone, label: "Device Issue", color: "text-orange-500" },
  complaint: { icon: AlertTriangle, label: "Complaint", color: "text-destructive" },
  feedback: { icon: ThumbsUp, label: "Feedback", color: "text-green-500" },
};

interface ActivityTabProps {
  memberId: string;
}

export function ActivityTab({ memberId }: ActivityTabProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    fetchInteractions();
  }, [memberId]);

  const fetchInteractions = async () => {
    try {
      const { data, error } = await supabase
        .from("member_interactions")
        .select(`
          *,
          staff:staff_id (first_name, last_name)
        `)
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setInteractions(data || []);
    } catch (error) {
      console.error("Error fetching interactions:", error);
      toast.error("Failed to load activity timeline");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredInteractions = typeFilter === "all"
    ? interactions
    : interactions.filter((i) => {
        if (typeFilter === "calls") return i.interaction_type.includes("call");
        if (typeFilter === "messages") return i.interaction_type.includes("sms") || i.interaction_type.includes("whatsapp") || i.interaction_type.includes("email");
        if (typeFilter === "alerts") return i.interaction_type.includes("alert");
        if (typeFilter === "payments") return i.interaction_type.includes("payment") || i.interaction_type.includes("subscription");
        return i.interaction_type === typeFilter;
      });

  const groupedInteractions = filteredInteractions.reduce((groups, interaction) => {
    const date = new Date(interaction.created_at ?? "");
    let dateKey: string;
    
    if (isToday(date)) {
      dateKey = "TODAY";
    } else if (isYesterday(date)) {
      dateKey = "YESTERDAY";
    } else {
      dateKey = format(date, "MMMM d, yyyy").toUpperCase();
    }
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(interaction);
    return groups;
  }, {} as Record<string, Interaction[]>);

  const exportCSV = () => {
    const headers = ["Date", "Time", "Type", "Description", "Staff"];
    const rows = interactions.map((i) => [
      format(new Date(i.created_at ?? ""), "yyyy-MM-dd"),
      format(new Date(i.created_at ?? ""), "HH:mm:ss"),
      interactionConfig[i.interaction_type]?.label || i.interaction_type,
      i.description || "",
      i.staff ? `${i.staff.first_name} ${i.staff.last_name}` : "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `member-activity-${memberId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>Complete history of all interactions with this member</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="calls">Calls</SelectItem>
              <SelectItem value="messages">Messages</SelectItem>
              <SelectItem value="alerts">Alerts</SelectItem>
              <SelectItem value="payments">Payments</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {interactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6">
              {Object.entries(groupedInteractions).map(([dateKey, dateInteractions]) => (
                <div key={dateKey}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">{dateKey}</h4>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
                    
                    <div className="space-y-4">
                      {dateInteractions.map((interaction) => {
                        const config = interactionConfig[interaction.interaction_type] || {
                          icon: FileText,
                          label: interaction.interaction_type,
                          color: "text-muted-foreground",
                        };
                        const Icon = config.icon;

                        return (
                          <div key={interaction.id} className="flex gap-4 relative">
                            {/* Timeline dot */}
                            <div className={`relative z-10 w-6 h-6 rounded-full bg-background border-2 flex items-center justify-center ${config.color}`}>
                              <Icon className="h-3 w-3" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 pb-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-sm">{config.label}</p>
                                  {interaction.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {interaction.description}
                                    </p>
                                  )}
                                  {interaction.staff && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      By: {interaction.staff.first_name} {interaction.staff.last_name}
                                    </p>
                                  )}
                                  {interaction.metadata?.duration && (
                                    <Badge variant="outline" className="mt-1 text-xs">
                                      Duration: {interaction.metadata.duration}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(interaction.created_at ?? ""), "HH:mm")}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
