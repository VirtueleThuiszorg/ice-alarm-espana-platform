import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  Clock, 
  MessageSquare, 
  CheckCircle, 
  ClipboardList,
  Phone,
  ArrowRight,
  FileText,
  Plus,
  Cake,
  WifiOff
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import i18n from "@/i18n";
import { LeadsWidget } from "@/components/dashboard/LeadsWidget";
import { ShiftReportModal } from "@/components/call-centre/ShiftReportModal";
import { PendantLiveStatusModal } from "@/components/call-centre/PendantLiveStatusModal";
import { EV07BLiveStatusCard } from "@/components/call-centre/EV07BLiveStatusCard";
import { DeviceIssuesQueue } from "@/components/call-centre/DeviceIssuesQueue";
import { DeviceOfflineAlertsCard } from "@/components/call-centre/DeviceOfflineAlertsCard";
import { MyShiftsWidget } from "@/components/call-centre/MyShiftsWidget";
import { MyHolidaysWidget } from "@/components/call-centre/MyHolidaysWidget";
import { PendingCoversWidget } from "@/components/call-centre/PendingCoversWidget";
import { useOpsRealtime } from "@/hooks/useOpsRealtime";

interface AlertStats {
  incoming: number;
  inProgress: number;
  resolvedToday: number;
}

interface ActiveAlert {
  id: string;
  alert_type: string;
  status: string;
  received_at: string;
  member: {
    first_name: string;
    last_name: string;
  };
  claimed_by: string | null;
}

interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  member?: {
    first_name: string;
    last_name: string;
  };
}

interface CourtesyCall {
  id: string;
  title: string;
  due_date: string;
  status: string;
  member_id: string;
  member: {
    first_name: string;
    last_name: string;
    phone: string;
  };
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  conversation: {
    member: {
      first_name: string;
      last_name: string;
    };
    subject: string | null;
  };
}

interface ShiftNote {
  id: string;
  note_content: string;
  created_at: string;
  staff?: {
    first_name: string;
    last_name: string;
  };
}

interface BirthdayMember {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
}

export default function StaffDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Enable realtime updates for devices and alerts
  useOpsRealtime();
  
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>("");
  const [stats, setStats] = useState<AlertStats>({ incoming: 0, inProgress: 0, resolvedToday: 0 });
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [myTasksCount, setMyTasksCount] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayMember[]>([]);
  const [courtesyCalls, setCourtesyCalls] = useState<CourtesyCall[]>([]);
  const [isCompletingCall, setIsCompletingCall] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Locale-aware date formatting
  const dateLocale = i18n.language === 'es' ? es : enGB;
  const currentDate = format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale });

  // Fetch staff ID and name on mount
  useEffect(() => {
    const fetchStaffId = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('staff')
        .select('id, first_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setStaffId(data.id);
        setStaffName(data.first_name || '');
      }
    };
    fetchStaffId();
  }, [user?.id]);

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time subscriptions
    const alertsChannel = supabase
      .channel('dashboard-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlertStats();
        fetchActiveAlerts();
      })
      .subscribe();

    const messagesChannel = supabase
      .channel('dashboard-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchUnreadMessages();
        fetchRecentMessages();
      })
      .subscribe();

    const membersChannel = supabase
      .channel('dashboard-members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        fetchBirthdays();
      })
      .subscribe();

    const tasksChannel = supabase
      .channel('dashboard-courtesy-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchCourtesyCalls();
      })
      .subscribe();

    // Subscribe to device updates for realtime EV-07B status
    const devicesChannel = supabase
      .channel('dashboard-devices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        // Device updates are handled by the individual EV-07B components
        // which have their own realtime subscriptions
      })
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(devicesChannel);
    };
  }, [staffId]);

  const fetchDashboardData = async () => {
    try {
      await Promise.all([
        fetchAlertStats(),
        fetchActiveAlerts(),
        fetchUnreadMessages(),
        fetchRecentMessages(),
        fetchMyTasks(),
        fetchShiftNotes(),
        fetchBirthdays(),
        fetchCourtesyCalls()
      ]);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      toast.error(t("staffDashboard.fetchError", "Failed to load dashboard data"));
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchAlertStats = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [incomingRes, inProgressRes, resolvedRes] = await Promise.all([
      supabase.from('alerts').select('id', { count: 'exact' }).eq('status', 'incoming'),
      supabase.from('alerts').select('id', { count: 'exact' }).eq('status', 'in_progress'),
      supabase.from('alerts').select('id', { count: 'exact' }).eq('status', 'resolved').gte('resolved_at', today.toISOString())
    ]);

    if (incomingRes.error || inProgressRes.error || resolvedRes.error) {
      throw new Error("Failed to fetch alert stats");
    }

    setStats({
      incoming: incomingRes.count || 0,
      inProgress: inProgressRes.count || 0,
      resolvedToday: resolvedRes.count || 0
    });
  };

  const fetchActiveAlerts = async () => {
    const { data } = await supabase
      .from('alerts')
      .select(`
        id,
        alert_type,
        status,
        received_at,
        claimed_by,
        member:members(first_name, last_name)
      `)
      .in('status', ['incoming', 'in_progress'])
      .order('received_at', { ascending: false })
      .limit(5);

    setActiveAlerts((data as any[]) || []);
  };

  const fetchUnreadMessages = async () => {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('is_read', false)
      .eq('sender_type', 'member');

    setUnreadMessages(count || 0);
  };

  const fetchRecentMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        conversation:conversations(
          subject,
          member:members(first_name, last_name)
        )
      `)
      .eq('sender_type', 'member')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5);

    setRecentMessages((data as any[]) || []);
  };

  const fetchMyTasks = async () => {
    if (!staffId) return;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const { data, count } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        due_date,
        priority,
        member:members(first_name, last_name)
      `, { count: 'exact' })
      .eq('assigned_to', staffId)
      .neq('status', 'completed')
      .lte('due_date', today.toISOString())
      .order('due_date', { ascending: true })
      .limit(5);

    setMyTasks((data as any[]) || []);
    setMyTasksCount(count || 0);
  };

  const fetchShiftNotes = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('shift_notes')
      .select(`
        id,
        note_content,
        created_at,
        staff:staff(first_name, last_name)
      `)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    setShiftNotes((data as any[]) || []);
  };

  const fetchBirthdays = async () => {
    // Use optimized database function instead of loading all members
    const { data, error } = await supabase.rpc('get_todays_birthdays');
    
    if (!error && data) {
      setBirthdays(data);
    }
  };

  const fetchCourtesyCalls = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        due_date,
        status,
        member_id,
        member:members(first_name, last_name, phone)
      `)
      .eq('task_type', 'courtesy_call')
      .neq('status', 'completed')
      .order('due_date', { ascending: true })
      .limit(5);

    if (!error && data) {
      setCourtesyCalls((data as any[]) || []);
    }
  };

  const handleCompleteCourtesyCall = async (taskId: string) => {
    setIsCompletingCall(taskId);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        })
        .eq('id', taskId);

      if (error) throw error;
      fetchCourtesyCalls();
    } catch (error) {
      console.error('Error completing courtesy call:', error);
    } finally {
      setIsCompletingCall(null);
    }
  };

  const handleClaimAlert = async (alertId: string) => {
    if (!staffId) return;

    await supabase
      .from('alerts')
      .update({
        status: 'in_progress',
        claimed_by: staffId,
        claimed_at: new Date().toISOString()
      })
      .eq('id', alertId);

    navigate('/call-centre/alerts');
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'sos_button':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'fall_detected':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'device_offline':
        return <WifiOff className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAlertLabel = (type: string) => {
    switch (type) {
      case 'sos_button': return t('alerts.sos', 'SOS');
      case 'fall_detected': return t('alerts.fallDetected');
      case 'low_battery': return t('alerts.lowBattery');
      case 'geo_fence': return t('alerts.geoFenceAlert');
      case 'check_in': return t('alerts.checkIn');
      case 'device_offline': return t('alerts.deviceOffline', 'Device Offline');
      default: return type;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('staffDashboard.welcomeBack')}, {staffName || t('common.staff')}
          </h1>
          <p className="text-sm text-muted-foreground capitalize">{currentDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <PendantLiveStatusModal />
          <ShiftReportModal />
        </div>
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: t('staffDashboard.incomingAlerts'), value: stats.incoming, icon: AlertTriangle, active: stats.incoming > 0, activeColor: 'text-destructive', activeBg: 'bg-destructive/10', to: '/call-centre/alerts' },
          { label: t('staffDashboard.inProgress'), value: stats.inProgress, icon: Clock, active: stats.inProgress > 0, activeColor: 'text-orange-500', activeBg: 'bg-orange-500/10', to: '/call-centre/alerts' },
          { label: t('staffDashboard.unreadMessages'), value: unreadMessages, icon: MessageSquare, active: unreadMessages > 0, activeColor: 'text-primary', activeBg: 'bg-primary/10', to: '/call-centre/messages' },
          { label: t('staffDashboard.resolvedToday'), value: stats.resolvedToday, icon: CheckCircle, active: false, activeColor: 'text-emerald-600', activeBg: 'bg-emerald-500/10', to: undefined },
          { label: t('staffDashboard.myTasksDue'), value: myTasksCount, icon: ClipboardList, active: myTasksCount > 0, activeColor: 'text-blue-500', activeBg: 'bg-blue-500/10', to: '/call-centre/tasks' },
        ].map((stat, i) => (
          <Card
            key={i}
            className={`shadow-sm transition-all ${stat.to ? 'cursor-pointer hover:shadow-md' : ''}`}
            onClick={() => stat.to && navigate(stat.to)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${stat.active ? stat.activeBg : 'bg-muted'}`}>
                <stat.icon className={`h-4 w-4 ${stat.active ? stat.activeColor : 'text-muted-foreground'}`} />
              </div>
              <div className="min-w-0">
                {dashboardLoading ? (
                  <Skeleton className="h-7 w-8 mb-0.5" />
                ) : (
                  <p className={`text-xl font-bold leading-none ${stat.active ? stat.activeColor : ''}`}>{stat.value}</p>
                )}
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Priority Row: Active Alerts + EV-07B Fleet */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Active Alerts */}
        <Card className={`shadow-sm ${activeAlerts.length > 0 ? 'border-destructive/30' : ''}`}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t('staffDashboard.activeAlerts')}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/call-centre/alerts">
                  {t('staffDashboard.viewQueue')} <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {activeAlerts.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-emerald-500" />
                <p className="text-sm">{t('staffDashboard.noActiveAlerts')}</p>
              </div>
            ) : (
              activeAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getAlertIcon(alert.alert_type)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getAlertLabel(alert.alert_type)} — {alert.member?.first_name} {alert.member?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(alert.received_at), 'HH:mm')} • {alert.status === 'incoming' ? t('common.incoming') : t('common.inProgress')}
                      </p>
                    </div>
                  </div>
                  {alert.status === 'incoming' && (
                    <Button size="sm" className="h-7 text-xs shrink-0 ml-2" onClick={() => handleClaimAlert(alert.id)}>
                      {t('staffDashboard.claim')}
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* EV-07B Fleet — Compact combined view */}
        <div className="space-y-4">
          <EV07BLiveStatusCard />
          <div className="grid grid-cols-2 gap-4">
            <DeviceOfflineAlertsCard />
            <DeviceIssuesQueue />
          </div>
        </div>
      </div>

      {/* Action Row: Courtesy Calls + Tasks */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Courtesy Calls */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                {t('staffDashboard.courtesyCalls')}
                {courtesyCalls.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{courtesyCalls.length}</Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/call-centre/tasks?filter=courtesy_call">
                  {t('staffDashboard.viewAll')} <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {courtesyCalls.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-emerald-500" />
                <p className="text-sm">{t('staffDashboard.noCourtesyCallsDue')}</p>
              </div>
            ) : (
              courtesyCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div
                    className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/call-centre/members/${call.member_id}`)}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{call.member?.first_name} {call.member?.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {call.member?.phone} • {call.due_date ? format(new Date(call.due_date), 'MMM d') : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${call.member?.phone}`; }}
                      title={t('common.call')}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                      onClick={() => handleCompleteCourtesyCall(call.id)}
                      disabled={isCompletingCall === call.id}
                      title={t('common.markComplete')}
                    >
                      {isCompletingCall === call.id ? (
                        <Clock className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* My Tasks */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t('staffDashboard.myTasksDue')}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/call-centre/tasks">
                  {t('staffDashboard.viewAll')} <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {myTasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-emerald-500" />
                <p className="text-sm">{t('staffDashboard.noTasksDueToday')}</p>
              </div>
            ) : (
              myTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.member && (
                        <p className="text-xs text-muted-foreground truncate">
                          {task.member.first_name} {task.member.last_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    className="shrink-0 ml-2 text-xs"
                    variant={task.priority === 'high' || task.priority === 'urgent' ? 'destructive' : 'secondary'}
                  >
                    {task.priority}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comms Row: Messages + Leads */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Messages */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t('staffDashboard.recentMessages')}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/call-centre/messages">
                  {t('staffDashboard.viewAll')} <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {recentMessages.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <MessageSquare className="h-6 w-6 mx-auto mb-1.5" />
                <p className="text-sm">{t('staffDashboard.noUnreadMessages')}</p>
              </div>
            ) : (
              recentMessages.map((message) => (
                <Link
                  key={message.id}
                  to="/call-centre/messages"
                  className="block p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {message.conversation?.member?.first_name} {message.conversation?.member?.last_name}
                    </span>
                    {message.conversation?.subject && (
                      <span className="text-xs text-muted-foreground truncate">— {message.conversation.subject}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 pl-[22px]">{message.content}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 pl-[22px]">
                    {format(new Date(message.created_at), 'MMM d, HH:mm')}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Leads Widget */}
        <LeadsWidget variant="staff" />
      </div>

      {/* Rota & Holidays Row */}
      <div className="grid md:grid-cols-3 gap-4">
        <MyShiftsWidget staffId={staffId || undefined} />
        <MyHolidaysWidget staffId={staffId || undefined} />
        <PendingCoversWidget staffId={staffId || undefined} />
      </div>

      {/* Info Row: Birthdays + Shift Notes */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Today's Birthdays */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-500" />
                {t('staffDashboard.todaysBirthdays')}
              </CardTitle>
              {birthdays.length > 0 && (
                <Badge className="bg-pink-500/10 text-pink-600 border-pink-500/20 text-xs">
                  {birthdays.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {birthdays.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Cake className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-sm">{t('staffDashboard.noBirthdaysToday')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {birthdays.slice(0, 5).map((member) => {
                  const dob = new Date(member.date_of_birth);
                  const age = new Date().getFullYear() - dob.getFullYear();
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2.5 border rounded-lg bg-pink-500/5 border-pink-500/15 cursor-pointer hover:bg-pink-500/10 transition-colors"
                      onClick={() => navigate(`/call-centre/members/${member.id}`)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-pink-500/15 flex items-center justify-center shrink-0">
                          <Cake className="h-3.5 w-3.5 text-pink-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{member.first_name} {member.last_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('staffDashboard.turningXToday', { age })}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${member.phone}`; }}
                        title={t('staffDashboard.callToWishHappyBirthday')}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shift Notes — spans 2 columns */}
        <Card className="shadow-sm md:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t('staffDashboard.todaysShiftNotes')}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/call-centre/shift-notes">
                  <Plus className="h-3 w-3 mr-1" /> {t('staffDashboard.addNote')}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {shiftNotes.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-sm">{t('staffDashboard.noShiftNotesYetToday')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shiftNotes.map((note) => (
                  <div key={note.id} className="flex gap-3 p-2.5 border rounded-lg">
                    <p className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                      {format(new Date(note.created_at), 'HH:mm')}
                    </p>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {note.staff?.first_name} {note.staff?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{note.note_content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
