import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { 
  Loader2, Plus, CheckCircle, Edit, Trash2,
  AlertTriangle, Calendar, User, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isPast, isToday } from "date-fns";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assigned_to: z.string().optional(),
  due_date: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  assigned_staff: {
    first_name: string;
    last_name: string;
  } | null;
  created_by_staff: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Staff {
  id: string;
  first_name: string;
  last_name: string;
}

interface TasksTabProps {
  memberId: string;
}

export function TasksTab({ memberId }: TasksTabProps) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "normal",
      assigned_to: "",
      due_date: "",
    },
  });

  useEffect(() => {
    fetchTasks();
    fetchStaff();
  }, [memberId]);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("member_id", memberId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: false });

      if (error) throw error;
      
      // Fetch staff names
      const staffIds = [...new Set([
        ...data?.filter(t => t.assigned_to).map(t => t.assigned_to).filter((x): x is string => x !== null) || [],
        ...data?.filter(t => t.created_by).map(t => t.created_by).filter((x): x is string => x !== null) || []
      ])];
      const { data: staffData } = await supabase.from("staff").select("id, first_name, last_name").in("id", staffIds);
      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);
      setTasks((data?.map(t => ({
        ...t,
        assigned_staff: t.assigned_to ? staffMap.get(t.assigned_to) || null : null,
        created_by_staff: t.created_by ? staffMap.get(t.created_by) || null : null
      })) || []) as Task[]);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("is_active", true);

      if (error) throw error;
      setStaffList(data || []);
    } catch (error) {
      console.error("Error fetching staff:", error);
    }
  };

  const openAddDialog = () => {
    setEditingTask(null);
    form.reset({
      title: "",
      description: "",
      priority: "normal",
      assigned_to: "",
      due_date: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    form.reset({
      title: task.title,
      description: task.description || "",
      priority: task.priority as any,
      assigned_to: "", // We'd need the ID here
      due_date: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: TaskFormValues) => {
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();

      const taskData = {
        title: data.title,
        description: data.description || null,
        priority: data.priority,
        assigned_to: data.assigned_to || null,
        due_date: data.due_date || null,
      };

      if (editingTask) {
        const { error } = await supabase
          .from("tasks")
          .update(taskData)
          .eq("id", editingTask.id);
        if (error) throw error;
        toast.success(t("tasks.taskUpdated"));
      } else {
        const { error } = await supabase
          .from("tasks")
          .insert({
            ...taskData,
            member_id: memberId,
            created_by: staffData?.id,
          });
        if (error) throw error;
        toast.success(t("tasks.taskCreated"));
      }

      setIsDialogOpen(false);
      fetchTasks();
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error(t("tasks.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString() 
        })
        .eq("id", taskId);

      if (error) throw error;
      toast.success(t("tasks.taskCompleted"));
      fetchTasks();
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error(t("tasks.completeFailed"));
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm(t("tasks.deleteConfirm"))) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;
      toast.success(t("tasks.taskDeleted"));
      fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error(t("tasks.deleteFailed"));
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive">{t("tasks.priorities.urgent")}</Badge>;
      case "high":
        return <Badge className="bg-orange-500">{t("tasks.priorities.high")}</Badge>;
      case "normal":
        return <Badge variant="secondary">{t("tasks.priorities.normal")}</Badge>;
      case "low":
        return <Badge variant="outline">{t("tasks.priorities.low")}</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const completedTasks = tasks.filter((t) => t.status === "completed");

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
          <CardTitle>{t("tasks.title")}</CardTitle>
          <CardDescription>{t("tasks.subtitle")}</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {t("tasks.newTask")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTask ? t("tasks.editTask") : t("tasks.createTask")}</DialogTitle>
              <DialogDescription>
                {editingTask ? t("tasks.updateTask") : t("tasks.createNewTask")}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tasks.taskTitle")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("tasks.taskTitlePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tasks.descriptionOptional")}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t("tasks.taskDetailsPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("tasks.priority")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">{t("tasks.priorities.low")}</SelectItem>
                            <SelectItem value="normal">{t("tasks.priorities.normal")}</SelectItem>
                            <SelectItem value="high">{t("tasks.priorities.high")}</SelectItem>
                            <SelectItem value="urgent">{t("tasks.priorities.urgent")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="assigned_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("tasks.assignTo")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("common.search") + "..."} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {staffList.map((staff) => (
                              <SelectItem key={staff.id} value={staff.id}>
                                {staff.first_name} {staff.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tasks.dueDateOptional")}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingTask ? t("common.update") : t("common.create")} {t("tasks.title").slice(0, -1)}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pending Tasks */}
        {pendingTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>{t("tasks.noPendingTasks")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{t("tasks.pending")}</h4>
            {pendingTasks.map((task) => {
              const isOverdue = task.due_date && isPast(new Date(task.due_date));
              const isDueToday = task.due_date && isToday(new Date(task.due_date));

              return (
                <div
                  key={task.id}
                  className={`p-4 border rounded-lg ${isOverdue ? "border-destructive bg-destructive/5" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getPriorityBadge(task.priority)}
                        <h4 className="font-medium">{task.title}</h4>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {task.due_date && (
                          <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : isDueToday ? "text-yellow-600" : ""}`}>
                            {isOverdue && <AlertTriangle className="h-3 w-3" />}
                            <Calendar className="h-3 w-3" />
                            {isOverdue ? t("tasks.overdue") + " " : isDueToday ? t("tasks.dueToday") + " " : t("tasks.due") + " "}
                            {format(new Date(task.due_date), "MMM d, h:mm a")}
                          </span>
                        )}
                        {task.assigned_staff && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assigned_staff.first_name} {task.assigned_staff.last_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-alert-resolved hover:text-alert-resolved"
                        onClick={() => completeTask(task.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {t("tasks.done")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(task)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span>{t("tasks.completed")} ({completedTasks.length})</span>
                {showCompleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {completedTasks.map((task) => (
                <div key={task.id} className="p-4 border rounded-lg bg-muted/30 opacity-70">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-alert-resolved" />
                    <span className="line-through">{task.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Completed {task.completed_at && format(new Date(task.completed_at), "MMM d")}
                    </span>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
