import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, subDays } from "date-fns";
import {
  Clock,
  AlertTriangle,
  MessageSquare,
  FileText,
  CheckCircle,
  Flag,
  User,
  Filter,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface ShiftNote {
  id: string;
  noteContent: string;
  requiresFollowup: boolean;
  followupCompleted: boolean;
  createdAt: Date;
  memberName?: string;
}

interface AlertHandled {
  id: string;
  alertType: string;
  status: string;
  receivedAt: Date;
  resolvedAt?: Date;
  memberName: string;
}

interface MessageThread {
  id: string;
  subject: string;
  lastMessageAt: Date;
  memberName: string;
  messageCount: number;
}

interface StaffStats {
  totalShiftNotes: number;
  alertsHandled: number;
  messagesResponded: number;
  followupsCompleted: number;
}

export default function ShiftHistoryPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffInfo, setStaffInfo] = useState<{ firstName: string; lastName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days">("7days");
  const [selectedTab, setSelectedTab] = useState("overview");

  // Data states
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  const [alertsHandled, setAlertsHandled] = useState<AlertHandled[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThread[]>([]);
  const [stats, setStats] = useState<StaffStats>({
    totalShiftNotes: 0,
    alertsHandled: 0,
    messagesResponded: 0,
    followupsCompleted: 0,
  });

  useEffect(() => {
    fetchStaffId();
  }, [user?.id]);

  useEffect(() => {
    if (staffId) {
      fetchAllData();
    }
  }, [staffId, dateRange]);

  const fetchStaffId = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("staff")
      .select("id, first_name, last_name")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("Error fetching staff:", error);
      return;
    }

    setStaffId(data.id);
    setStaffInfo({ firstName: data.first_name, lastName: data.last_name });
  };

  const getDateRangeStart = () => {
    const days = dateRange === "7days" ? 7 : dateRange === "30days" ? 30 : 90;
    return subDays(new Date(), days);
  };

  const fetchAllData = async () => {
    if (!staffId) return;
    setIsLoading(true);

    const startDate = getDateRangeStart().toISOString();

    try {
      await Promise.all([
        fetchShiftNotes(startDate),
        fetchAlertsHandled(startDate),
        fetchMessageThreads(startDate),
        fetchStats(startDate),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: t("common.error", "Error"), description: t("shiftHistory.failedToLoad", "Failed to load shift history"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchShiftNotes = async (startDate: string) => {
    const { data, error } = await supabase
      .from("shift_notes")
      .select(`
        id,
        note_content,
        requires_followup,
        followup_completed,
        created_at,
        member:member_id (first_name, last_name)
      `)
      .eq("staff_id", staffId!)
      .gte("created_at", startDate)
      .order("created_at", { ascending: false });

    if (error) throw error;

    setShiftNotes(
      (data || []).map((note: any) => ({
        id: note.id,
        noteContent: note.note_content,
        requiresFollowup: note.requires_followup,
        followupCompleted: note.followup_completed,
        createdAt: new Date(note.created_at),
        memberName: note.member ? `${note.member.first_name} ${note.member.last_name}` : undefined,
      }))
    );
  };

  const fetchAlertsHandled = async (startDate: string) => {
    const { data, error } = await supabase
      .from("alerts")
      .select(`
        id,
        alert_type,
        status,
        received_at,
        resolved_at,
        member:member_id (first_name, last_name)
      `)
      .eq("claimed_by", staffId!)
      .gte("received_at", startDate)
      .order("received_at", { ascending: false });

    if (error) throw error;

    setAlertsHandled(
      (data || []).map((alert: any) => ({
        id: alert.id,
        alertType: alert.alert_type,
        status: alert.status,
        receivedAt: new Date(alert.received_at),
        resolvedAt: alert.resolved_at ? new Date(alert.resolved_at) : undefined,
        memberName: alert.member ? `${alert.member.first_name} ${alert.member.last_name}` : "Unknown",
      }))
    );
  };

  const fetchMessageThreads = async (startDate: string) => {
    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id,
        subject,
        last_message_at,
        member:member_id (first_name, last_name),
        messages (id)
      `)
      .eq("assigned_to", staffId!)
      .gte("last_message_at", startDate)
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    setMessageThreads(
      (data || []).map((conv: any) => ({
        id: conv.id,
        subject: conv.subject || "No Subject",
        lastMessageAt: new Date(conv.last_message_at),
        memberName: conv.member ? `${conv.member.first_name} ${conv.member.last_name}` : "Unknown",
        messageCount: conv.messages?.length || 0,
      }))
    );
  };

  const fetchStats = async (startDate: string) => {
    const [notesRes, alertsRes, followupsRes] = await Promise.all([
      supabase
        .from("shift_notes")
        .select("id", { count: "exact" })
        .eq("staff_id", staffId!)
        .gte("created_at", startDate),
      supabase
        .from("alerts")
        .select("id", { count: "exact" })
        .eq("claimed_by", staffId!)
        .gte("received_at", startDate),
      supabase
        .from("shift_notes")
        .select("id", { count: "exact" })
        .eq("staff_id", staffId!)
        .eq("followup_completed", true)
        .gte("created_at", startDate),
    ]);

    setStats({
      totalShiftNotes: notesRes.count || 0,
      alertsHandled: alertsRes.count || 0,
      messagesResponded: messageThreads.length,
      followupsCompleted: followupsRes.count || 0,
    });
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case "sos_button":
        return <AlertTriangle className="w-4 h-4 text-alert-sos" />;
      case "fall_detected":
        return <Activity className="w-4 h-4 text-alert-fall" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getAlertTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      sos_button: t("callCentre.alertTypes.sos", "SOS"),
      fall_detected: t("callCentre.alertTypes.fall", "Fall"),
      low_battery: t("callCentre.alertTypes.lowBattery", "Battery"),
      geo_fence: t("callCentre.alertTypes.geoFence", "Geo-fence"),
      check_in: t("callCentre.alertTypes.checkIn", "Check-in"),
      manual: t("callCentre.alertTypes.manual", "Manual"),
    };
    return labels[type] || type;
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-background/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-6 h-6" />
              {t("shiftHistory.title", "My Shift History")}
            </h1>
            <p className="text-muted-foreground">
              {staffInfo ? `${staffInfo.firstName} ${staffInfo.lastName}` : t("shiftHistory.loading", "Loading history...")} • {t("shiftHistory.subtitle", "Activity log and performance")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">{t("shiftHistory.last7Days", "Last 7 Days")}</SelectItem>
                <SelectItem value="30days">{t("shiftHistory.last30Days", "Last 30 Days")}</SelectItem>
                <SelectItem value="90days">{t("shiftHistory.last90Days", "Last 90 Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("shiftHistory.shiftNotes", "Shift Notes")}</p>
                  <p className="text-2xl font-bold">{stats.totalShiftNotes}</p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("shiftHistory.alertsHandled", "Alerts Handled")}</p>
                  <p className="text-2xl font-bold">{stats.alertsHandled}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("shiftHistory.conversations", "Conversations")}</p>
                  <p className="text-2xl font-bold">{messageThreads.length}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("shiftHistory.followupsDone", "Follow-ups Done")}</p>
                  <p className="text-2xl font-bold">{stats.followupsCompleted}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-12">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="w-4 h-4" />
              {t("shiftHistory.overview", "Overview")}
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("shiftHistory.shiftNotes", "Shift Notes")}
              <Badge variant="secondary" className="ml-1">{shiftNotes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t("shiftHistory.alertsHandled", "Alerts Handled")}
              <Badge variant="secondary" className="ml-1">{alertsHandled.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              {t("shiftHistory.conversations", "Conversations")}
              <Badge variant="secondary" className="ml-1">{messageThreads.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">{t("shiftHistory.loading", "Loading history...")}</div>
            ) : (
              <>
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Recent Alerts */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5" />
                          {t("shiftHistory.recentAlerts", "Recent Alerts")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {alertsHandled.slice(0, 5).map((alert) => (
                          <div key={alert.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                              {getAlertTypeIcon(alert.alertType)}
                              <div>
                                <p className="font-medium text-sm">{alert.memberName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(alert.receivedAt, "dd MMM, HH:mm")}
                                </p>
                              </div>
                            </div>
                            <Badge variant={alert.status === "resolved" ? "default" : "secondary"}>
                              {getAlertTypeBadge(alert.alertType)}
                            </Badge>
                          </div>
                        ))}
                        {alertsHandled.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">{t("shiftHistory.noAlerts", "No alerts in this period")}</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Recent Notes */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          {t("shiftHistory.recentNotes", "Recent Shift Notes")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {shiftNotes.slice(0, 5).map((note) => (
                          <div
                            key={note.id}
                            className={`p-2 rounded-lg bg-muted/50 ${
                              note.requiresFollowup && !note.followupCompleted ? "border-l-2 border-l-alert-battery" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm line-clamp-2">{note.noteContent}</p>
                              {note.requiresFollowup && (
                                <Badge
                                  variant={note.followupCompleted ? "default" : "destructive"}
                                  className="shrink-0"
                                >
                                  {note.followupCompleted ? (
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                  ) : (
                                    <Flag className="w-3 h-3 mr-1" />
                                  )}
                                  {note.followupCompleted ? t("shiftHistory.done", "Done") : t("shiftHistory.followup", "Follow-up")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(note.createdAt, "dd MMM, HH:mm")}
                              {note.memberName && ` • Re: ${note.memberName}`}
                            </p>
                          </div>
                        ))}
                        {shiftNotes.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">{t("shiftHistory.noNotes", "No notes in this period")}</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Shift Notes Tab */}
                <TabsContent value="notes" className="mt-0 space-y-4">
                  {shiftNotes.map((note) => (
                    <Card
                      key={note.id}
                      className={note.requiresFollowup && !note.followupCompleted ? "border-l-4 border-l-alert-battery" : ""}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm">{note.noteContent}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                {format(note.createdAt, "dd MMM yyyy, HH:mm")}
                              </Badge>
                              {note.memberName && (
                                <Badge variant="secondary" className="text-xs">
                                  <User className="w-3 h-3 mr-1" />
                                  {note.memberName}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {note.requiresFollowup && (
                            <Badge variant={note.followupCompleted ? "default" : "destructive"}>
                              {note.followupCompleted ? (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {t("shiftHistory.completed", "Completed")}
                                </>
                              ) : (
                                <>
                                  <Flag className="w-3 h-3 mr-1" />
                                  {t("shiftHistory.needsFollowup", "Needs Follow-up")}
                                </>
                              )}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {shiftNotes.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>{t("shiftHistory.noNotesFound", "No shift notes found in this period")}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Alerts Tab */}
                <TabsContent value="alerts" className="mt-0 space-y-4">
                  {alertsHandled.map((alert) => (
                    <Card key={alert.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              {getAlertTypeIcon(alert.alertType)}
                            </div>
                            <div>
                              <p className="font-medium">{alert.memberName}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {format(alert.receivedAt, "dd MMM yyyy, HH:mm")}
                                {alert.resolvedAt && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      {t("shiftHistory.resolvedIn", "Resolved in {{minutes}} min", { minutes: Math.round((alert.resolvedAt.getTime() - alert.receivedAt.getTime()) / 60000) })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{getAlertTypeBadge(alert.alertType)}</Badge>
                            <Badge
                              className={
                                alert.status === "resolved"
                                  ? "bg-alert-resolved text-alert-resolved-foreground"
                                  : alert.status === "in_progress"
                                  ? "bg-alert-claimed"
                                  : ""
                              }
                            >
                              {alert.status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {alertsHandled.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>{t("shiftHistory.noAlertsFound", "No alerts handled in this period")}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Messages Tab */}
                <TabsContent value="messages" className="mt-0 space-y-4">
                  {messageThreads.map((thread) => (
                    <Card key={thread.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <MessageSquare className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{thread.subject}</p>
                              <p className="text-sm text-muted-foreground">
                                {thread.memberName} • {thread.messageCount} {t("shiftHistory.messages", "messages")}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" />
                            {format(thread.lastMessageAt, "dd MMM, HH:mm")}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {messageThreads.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>{t("shiftHistory.noConversations", "No conversations in this period")}</p>
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
