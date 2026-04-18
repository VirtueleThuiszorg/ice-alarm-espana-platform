import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Loader2, Plus, CheckCircle, Clock, AlertCircle,
  User, Calendar, Search, MoreHorizontal, Phone,
  ChevronLeft, ChevronRight, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, isToday, isPast, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { usePaginatedQuery } from "@/hooks/useSupabaseQuery";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  member_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  task_type: string | null;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  } | null;
  assigned_staff?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Staff {
  id: string;
  first_name: string;
  last_name: string;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
}

export default function TasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "normal",
    due_date: "",
    assigned_to: "",
    member_id: "",
  });
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Pre-filter tasks by tab (domain-specific logic)
  const tabFilteredTasks = useMemo(() => {
    switch (filter) {
      case "pending":
        return tasks.filter(t => t.status === "pending");
      case "in_progress":
        return tasks.filter(t => t.status === "in_progress");
      case "completed":
        return tasks.filter(t => t.status === "completed");
      case "mine":
        return tasks.filter(t => t.assigned_to === currentStaffId);
      case "overdue":
        return tasks.filter(t =>
          t.due_date && isPast(parseISO(t.due_date)) && t.status !== "completed"
        );
      case "courtesy_calls":
        return tasks.filter(t => t.task_type === "courtesy_call" && t.status !== "completed");
      default:
        return tasks;
    }
  }, [tasks, filter, currentStaffId]);

  // Use shared hook for search + pagination
  const {
    paginatedItems: displayedTasks,
    totalFiltered,
    page,
    setPage,
    totalPages,
  } = usePaginatedQuery<Task>({
    items: tabFilteredTasks,
    searchQuery,
    searchFields: ["title", "description"],
  });

  useEffect(() => {
    fetchCurrentStaff();
    fetchTasks();
    fetchStaff();
    fetchMembers();
  }, []);

  const fetchCurrentStaff = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", userData.user.id)
          .single();
        setCurrentStaffId(data?.id || null);
      }
    } catch (error) {
      console.error("Error fetching current staff:", error);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          member:members!tasks_member_id_fkey(id, first_name, last_name, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch assigned staff info
      const assignedStaffIds = data?.filter(t => t.assigned_to).map(t => t.assigned_to).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .in("id", assignedStaffIds);

      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);

      const tasksWithStaff = data?.map(task => ({
        ...task,
        assigned_staff: task.assigned_to ? staffMap.get(task.assigned_to) || null : null,
      })) || [];

      setTasks(tasksWithStaff as Task[]);
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

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .order("last_name");

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error("Task title is required");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .insert({
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          due_date: newTask.due_date || null,
          assigned_to: newTask.assigned_to || null,
          member_id: newTask.member_id || null,
          created_by: currentStaffId,
          status: "pending",
        });

      if (error) throw error;

      toast.success("Task created");
      setIsDialogOpen(false);
      setNewTask({
        title: "",
        description: "",
        priority: "normal",
        due_date: "",
        assigned_to: "",
        member_id: "",
      });
      fetchTasks();
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setIsSaving(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      const updateData: Record<string, string | null> = { status };
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", taskId);

      if (error) throw error;
      toast.success(`Task marked as ${status.replace("_", " ")}`);
      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;
      toast.success("Task deleted");
      setTaskToDelete(null);
      fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> {t("tasks.pending")}</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500"><AlertCircle className="w-3 h-3 mr-1" /> {t("tasks.inProgress")}</Badge>;
      case "completed":
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> {t("tasks.completed")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive">{t("tasks.highPriority")}</Badge>;
      case "normal":
        return null;
      case "low":
        return <Badge variant="outline">{t("tasks.lowPriority")}</Badge>;
      default:
        return null;
    }
  };

  const getDueDateBadge = (dueDate: string | null, status: string) => {
    if (!dueDate || status === "completed") return null;
    
    const date = parseISO(dueDate);
    if (isPast(date)) {
      return <Badge variant="destructive">{t("tasks.overdue")}</Badge>;
    }
    if (isToday(date)) {
      return <Badge className="bg-orange-500">{t("tasks.dueToday")}</Badge>;
    }
    return null;
  };

  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const overdueCount = tasks.filter(t => 
    t.due_date && isPast(parseISO(t.due_date)) && t.status !== "completed"
  ).length;
  const courtesyCallsCount = tasks.filter(t => 
    t.task_type === "courtesy_call" && t.status !== "completed"
  ).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("tasks.title")}</h1>
          <p className="text-muted-foreground">
            {pendingCount} pending, {inProgressCount} in progress
            {overdueCount > 0 && <span className="text-destructive ml-1">• {overdueCount} overdue</span>}
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("tasks.newTask")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">{t("tasks.pending")}</TabsTrigger>
            <TabsTrigger value="in_progress">{t("tasks.inProgress")}</TabsTrigger>
            <TabsTrigger value="completed">{t("tasks.completed")}</TabsTrigger>
            <TabsTrigger value="mine">My Tasks</TabsTrigger>
            <TabsTrigger value="courtesy_calls" className="text-primary">
              <Phone className="h-3 w-3 mr-1" />
              Courtesy Calls
              {courtesyCallsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {courtesyCallsCount}
                </Badge>
              )}
            </TabsTrigger>
            {overdueCount > 0 && (
              <TabsTrigger value="overdue" className="text-destructive">
                {t("tasks.overdue")} ({overdueCount})
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      {/* Task List */}
      <div className="grid gap-4">
        {displayedTasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">{t("tasks.noTasks")}</h3>
              <p className="text-muted-foreground">
                {filter === "all" ? "Create your first task to get started" : "No tasks match the current filter"}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayedTasks.map((task) => (
            <Card key={task.id} className={cn(
              task.status === "completed" && "opacity-60",
              task.task_type === "courtesy_call" && "border-l-4 border-l-primary"
            )}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {task.task_type === "courtesy_call" && (
                        <Badge variant="outline" className="text-primary border-primary">
                          <Phone className="w-3 h-3 mr-1" />
                          Courtesy Call
                        </Badge>
                      )}
                      {getStatusBadge(task.status)}
                      {getPriorityBadge(task.priority)}
                      {getDueDateBadge(task.due_date, task.status)}
                    </div>
                    <h3 className={cn(
                      "font-semibold",
                      task.status === "completed" && "line-through"
                    )}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      {task.member && (
                        <Link 
                          to={`/admin/members/${task.member.id}`}
                          className="flex items-center gap-1 hover:text-primary"
                        >
                          <User className="w-3 h-3" />
                          {task.member.first_name} {task.member.last_name}
                        </Link>
                      )}
                      {task.task_type === "courtesy_call" && task.member?.phone && (
                        <a 
                          href={`tel:${task.member.phone}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Phone className="w-3 h-3" />
                          {task.member.phone}
                        </a>
                      )}
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(parseISO(task.due_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {task.assigned_staff && (
                        <span className="flex items-center gap-1">
                          Assigned to: {task.assigned_staff.first_name} {task.assigned_staff.last_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {task.status !== "in_progress" && task.status !== "completed" && (
                        <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "in_progress")}>
                          Start Task
                        </DropdownMenuItem>
                      )}
                      {task.status !== "completed" && (
                        <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "completed")}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {t("tasks.markComplete")}
                        </DropdownMenuItem>
                      )}
                      {task.status === "completed" && (
                        <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "pending")}>
                          Reopen Task
                        </DropdownMenuItem>
                      )}
                      {task.member && (
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/members/${task.member.id}`}>
                            View Member
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setTaskToDelete(task)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Task
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalFiltered} results)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* New Task Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tasks.newTask")}</DialogTitle>
            <DialogDescription>
              Create a new task and optionally assign it to a staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tasks.taskTitle")} *</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Enter task title..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tasks.taskDescription")}</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Enter task description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("messages.priority")}</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(value) => setNewTask({ ...newTask, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("tasks.lowPriority")}</SelectItem>
                    <SelectItem value="normal">{t("tasks.normalPriority")}</SelectItem>
                    <SelectItem value="high">{t("tasks.highPriority")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("tasks.dueDate")}</label>
                <Input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tasks.assignTo")}</label>
              <Select
                value={newTask.assigned_to}
                onValueChange={(value) => setNewTask({ ...newTask, assigned_to: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.first_name} {staff.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Related Member (optional)</label>
              <Select
                value={newTask.member_id}
                onValueChange={(value) => setNewTask({ ...newTask, member_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.first_name} {member.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={createTask} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("tasks.addTask")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Task Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the task &quot;{taskToDelete?.title}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => taskToDelete && deleteTask(taskToDelete.id)}
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
