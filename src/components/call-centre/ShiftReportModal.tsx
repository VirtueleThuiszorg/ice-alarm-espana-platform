import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { es, enGB } from "date-fns/locale";
import i18n from "@/i18n";
import { FileText, AlertTriangle, Clock, MessageSquare, ClipboardList, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Alert {
  id: string;
  alert_type: string;
  status: string;
  received_at: string;
  member: {
    first_name: string;
    last_name: string;
  } | null;
}

interface ShiftNote {
  id: string;
  note_content: string;
  created_at: string;
  staff: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  status: string;
  member: {
    first_name: string;
    last_name: string;
  } | null;
}

export function ShiftReportModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const dateLocale = i18n.language === 'es' ? es : enGB;

  const fetchReportData = async () => {
    setLoading(true);
    
    // Update the generated timestamp each time modal opens
    setGeneratedAt(format(new Date(), "EEEE, d MMMM yyyy 'at' HH:mm", { locale: dateLocale }));
    
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      // Fetch alerts from last 12 hours
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('id, alert_type, status, received_at, member:members(first_name, last_name)')
        .gte('received_at', twelveHoursAgo)
        .order('received_at', { ascending: false });

      // Fetch shift notes from last 12 hours
      const { data: notesData } = await supabase
        .from('shift_notes')
        .select('id, note_content, created_at, staff:staff(first_name, last_name)')
        .gte('created_at', twelveHoursAgo)
        .order('created_at', { ascending: false });

      // Fetch tasks due today or overdue (not completed)
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, member:members(first_name, last_name)')
        .neq('status', 'completed')
        .lte('due_date', todayEnd.toISOString())
        .order('due_date', { ascending: true });

      setAlerts((alertsData as Alert[]) || []);
      setShiftNotes((notesData as ShiftNote[]) || []);
      setTasks((tasksData as Task[]) || []);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchReportData();
    }
  }, [open]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'sos_button':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'fall_detected':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAlertLabel = (type: string) => {
    switch (type) {
      case 'sos_button': return 'SOS';
      case 'fall_detected': return t('alerts.fallDetected');
      case 'low_battery': return t('alerts.lowBattery');
      case 'geo_fence': return t('alerts.geoFenceAlert');
      case 'check_in': return t('alerts.checkIn');
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge variant="outline" className="bg-status-active/20 text-status-active border-status-active">{t('alerts.resolved')}</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500">{t('alerts.inProgress')}</Badge>;
      default:
        return <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive">{t('alerts.incoming')}</Badge>;
    }
  };

  const getPriorityIndicator = (priority: string) => {
    switch (priority) {
      case 'high':
        return <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />;
      case 'urgent':
        return <span className="inline-block w-2 h-2 rounded-full bg-destructive" />;
      default:
        return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground" />;
    }
  };

  const isOverdue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDate) < today;
  };

  const overdueTasks = tasks.filter(task => isOverdue(task.due_date));
  const dueTodayTasks = tasks.filter(task => !isOverdue(task.due_date));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          {t('staffDashboard.generateShiftNote')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t('staffDashboard.shiftSummaryReport')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('staffDashboard.generatedAt')}: {generatedAt}
          </p>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(85vh-120px)]">
          <div className="px-6 pb-6 space-y-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : (
              <>
                {/* Last 12 Hours Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{t('staffDashboard.last12Hours')}</h3>
                  </div>
                  <Separator />

                  {/* Alerts */}
                  <Card className="shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="font-medium">{t('staffDashboard.alertsCount')} ({alerts.length})</span>
                      </div>
                      {alerts.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">{t('staffDashboard.noAlertsInPeriod')}</p>
                      ) : (
                        <div className="space-y-2">
                          {alerts.map((alert) => (
                            <div key={alert.id} className="flex items-center justify-between py-2 border-b last:border-0">
                              <div className="flex items-center gap-3">
                                {getAlertIcon(alert.alert_type)}
                                <div>
                                  <span className="font-medium">{getAlertLabel(alert.alert_type)}</span>
                                  {alert.member && (
                                    <span className="text-muted-foreground"> - {alert.member.first_name} {alert.member.last_name}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(alert.status)}
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(alert.received_at), { addSuffix: true, locale: dateLocale })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Shift Notes */}
                  <Card className="shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="font-medium">{t('staffDashboard.shiftNotesCount')} ({shiftNotes.length})</span>
                      </div>
                      {shiftNotes.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">{t('staffDashboard.noNotesInPeriod')}</p>
                      ) : (
                        <div className="space-y-2">
                          {shiftNotes.map((note) => (
                            <div key={note.id} className="py-2 border-b last:border-0">
                              <p className="text-sm">"{note.note_content}"</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {note.staff ? `${note.staff.first_name} ${note.staff.last_name}` : 'Staff'} • {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: dateLocale })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Tasks Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{t('staffDashboard.tasksDueOverdue')} ({tasks.length})</h3>
                  </div>
                  <Separator />

                  {tasks.length === 0 ? (
                    <Card className="shadow-sm">
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="h-8 w-8 text-status-active mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{t('staffDashboard.noTasksDue')}</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Overdue Tasks */}
                      {overdueTasks.length > 0 && (
                        <Card className="shadow-sm border-destructive/30">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                              <span className="font-medium text-destructive">{t('staffDashboard.overdueCount')} ({overdueTasks.length})</span>
                            </div>
                            <div className="space-y-2">
                              {overdueTasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                  <div className="flex items-center gap-3">
                                    {getPriorityIndicator('urgent')}
                                    <div>
                                      <span className="font-medium">{task.title}</span>
                                      {task.member && (
                                        <span className="text-muted-foreground"> - {task.member.first_name} {task.member.last_name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-xs text-destructive">
                                    {t('staffDashboard.wasDue')}: {format(new Date(task.due_date), 'd MMM', { locale: dateLocale })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Due Today Tasks */}
                      {dueTodayTasks.length > 0 && (
                        <Card className="shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                              <span className="font-medium">{t('staffDashboard.dueTodayCount')} ({dueTodayTasks.length})</span>
                            </div>
                            <div className="space-y-2">
                              {dueTodayTasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                  <div className="flex items-center gap-3">
                                    {getPriorityIndicator(task.priority)}
                                    <div>
                                      <span className="font-medium">{task.title}</span>
                                      {task.member && (
                                        <span className="text-muted-foreground"> - {task.member.first_name} {task.member.last_name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {task.priority}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
