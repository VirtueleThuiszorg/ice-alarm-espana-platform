import { useState } from "react";
import { Lightbulb, Plus, Trash2, ChevronDown, ChevronRight, Bug, Sparkles, FileText, ListChecks, Clock, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminIdeas, type AdminIdea } from "@/hooks/useAdminIdeas";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const CATEGORY_META = [
  { value: "idea", key: "idea", icon: Lightbulb, color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/25 dark:text-yellow-400" },
  { value: "feature", key: "feature", icon: Sparkles, color: "bg-blue-500/15 text-blue-600 border-blue-500/25 dark:text-blue-400" },
  { value: "bug", key: "bug", icon: Bug, color: "bg-red-500/15 text-red-600 border-red-500/25 dark:text-red-400" },
  { value: "note", key: "note", icon: FileText, color: "bg-muted text-muted-foreground border-border" },
] as const;

const PRIORITY_META = [
  { value: "low", key: "low", color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  { value: "medium", key: "medium", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  { value: "high", key: "high", color: "bg-red-500/15 text-red-600 dark:text-red-400", dot: "bg-red-500" },
] as const;

interface IdeasNotepadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeasNotepad({ open, onOpenChange }: IdeasNotepadProps) {
  const { t } = useTranslation();
  const { ideas, createIdea, updateIdea, deleteIdea, isLoading } = useAdminIdeas();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AdminIdea["category"]>("idea");
  const [priority, setPriority] = useState<AdminIdea["priority"]>("medium");
  const [isChecklist, setIsChecklist] = useState(false);
  const [filterTab, setFilterTab] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredIdeas = ideas.filter((i) => filterTab === "all" || i.category === filterTab);
  const completedCount = ideas.filter((i) => i.is_checklist && i.completed).length;
  const totalChecklist = ideas.filter((i) => i.is_checklist).length;

  const handleAdd = () => {
    if (!title.trim()) return;
    createIdea.mutate(
      { title: title.trim(), content: content.trim(), category, priority, is_checklist: isChecklist },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setIsChecklist(false);
          setShowAddForm(false);
          toast.success(t("ideasNotepad.itemAdded", "Item added successfully"));
        },
      }
    );
  };

  const toggleComplete = (idea: AdminIdea) => {
    updateIdea.mutate({ id: idea.id, completed: !idea.completed });
  };

  const handleDelete = (id: string) => {
    deleteIdea.mutate(id, { onSuccess: () => toast.success(t("ideasNotepad.itemRemoved", "Item removed")) });
  };

  const getCategoryMeta = (cat: string) => CATEGORY_META.find((c) => c.value === cat) || CATEGORY_META[3];
  const getPriorityMeta = (p: string) => PRIORITY_META.find((pr) => pr.value === p) || PRIORITY_META[1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-7 pb-4 bg-gradient-to-b from-primary/10 via-accent to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              {t("ideasNotepad.title", "Ideas & Notes")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pl-12">
              {t("ideasNotepad.description", "Capture ideas, track bugs, plan features, and manage your app development checklist.")}
            </DialogDescription>
          </DialogHeader>

          {/* Stats strip */}
          <div className="flex items-center gap-6 mt-4 pl-12">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">{ideas.length}</span> {t("ideasNotepad.totalItems", "total items")}
            </div>
            {totalChecklist > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">{completedCount}/{totalChecklist}</span> {t("ideasNotepad.completed", "completed")}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Add button / form */}
        <div className="px-8 py-4">
          {!showAddForm ? (
            <Button onClick={() => setShowAddForm(true)} className="w-full justify-start gap-2 h-11 border-l-4 border-l-primary/50" variant="outline">
              <Plus className="h-4 w-4" />
              {t("ideasNotepad.addPlaceholder", "Add new idea, note, or checklist item...")}
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <Input
                placeholder={t("ideasNotepad.titlePlaceholder", "Title — What's on your mind?")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdd()}
                className="h-11 text-sm font-medium bg-background"
                autoFocus
              />
              <Textarea
                placeholder={t("ideasNotepad.detailsPlaceholder", "Add details, context, or steps...")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[80px] text-sm resize-none bg-background"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={category} onValueChange={(v) => setCategory(v as AdminIdea["category"])}>
                  <SelectTrigger className="w-[130px] h-9 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_META.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <c.icon className="h-3.5 w-3.5" /> {t(`ideasNotepad.categories.${c.key}`, c.value)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priority} onValueChange={(v) => setPriority(v as AdminIdea["priority"])}>
                  <SelectTrigger className="w-[120px] h-9 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_META.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                          {t(`ideasNotepad.priorities.${p.key}`, p.value)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch id="checklist-toggle" checked={isChecklist} onCheckedChange={setIsChecklist} />
                  <Label htmlFor="checklist-toggle" className="text-xs flex items-center gap-1.5 cursor-pointer">
                    <ListChecks className="h-3.5 w-3.5" /> {t("ideasNotepad.checklist", "Checklist")}
                  </Label>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setTitle(""); setContent(""); }}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button size="sm" onClick={handleAdd} disabled={!title.trim() || createIdea.isPending} className="px-5">
                    <Plus className="h-4 w-4 mr-1" /> {t("ideasNotepad.addItem", "Add Item")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="px-8">
          <Tabs value={filterTab} onValueChange={setFilterTab}>
            <TabsList className="h-9 w-full justify-start bg-accent">
              <TabsTrigger value="all" className="text-xs px-4 h-7 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                {t("ideasNotepad.all", "All")} ({ideas.length})
              </TabsTrigger>
              {CATEGORY_META.map((c) => {
                const count = ideas.filter((i) => i.category === c.value).length;
                const CIcon = c.icon;
                return (
                  <TabsTrigger key={c.value} value={c.value} className="text-xs px-4 h-7 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <CIcon className="h-3 w-3" />
                    {t(`ideasNotepad.categories.${c.key}`, c.value)} {count > 0 && <span className="text-muted-foreground">({count})</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Ideas List */}
        <ScrollArea className="flex-1 px-8 py-4 min-h-0">
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-16">{t("ideasNotepad.loadingItems", "Loading your items...")}</div>
          ) : filteredIdeas.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
                <Lightbulb className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t("ideasNotepad.noItems", "No items yet")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("ideasNotepad.noItemsHint", "Click the button above to add your first idea")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIdeas.map((idea) => {
                const catMeta = getCategoryMeta(idea.category);
                const priMeta = getPriorityMeta(idea.priority);
                const isExpanded = expandedId === idea.id;
                const CatIcon = catMeta.icon;

                return (
                  <div
                    key={idea.id}
                    className={cn(
                      "group border rounded-lg transition-all",
                      idea.completed ? "opacity-50 bg-muted/20" : "bg-background border-l-4 border-l-primary/20 hover:shadow-md hover:border-l-primary/60"
                    )}
                  >
                    <div className="flex items-start gap-3 p-4">
                      {idea.is_checklist && (
                        <Checkbox
                          checked={idea.completed}
                          onCheckedChange={() => toggleComplete(idea)}
                          className="mt-1 h-5 w-5"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                          className="flex items-start gap-2 w-full text-left"
                        >
                          {idea.content ? (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                          ) : <span className="w-4 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <span className={cn(
                              "text-sm font-medium leading-snug",
                              idea.completed && "line-through text-muted-foreground"
                            )}>
                              {idea.title}
                            </span>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-normal", catMeta.color)}>
                                <CatIcon className="h-3 w-3 mr-1" />
                                {t(`ideasNotepad.categories.${catMeta.key}`, catMeta.value)}
                              </Badge>
                              <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-normal gap-1", priMeta.color)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", priMeta.dot)} />
                                {t(`ideasNotepad.priorities.${priMeta.key}`, priMeta.value)}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                                <Clock className="h-3 w-3" />
                                {format(new Date(idea.created_at), "MMM d, HH:mm")}
                                {idea.staff && (idea.staff.first_name || idea.staff.last_name) && (
                                  <span className="ml-1.5 text-primary/70">
                                    · {[idea.staff.first_name, idea.staff.last_name].filter(Boolean).join(" ")}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </button>
                        {isExpanded && idea.content && (
                          <div className="mt-3 ml-6 pl-4 border-l-2 border-primary/30">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {idea.content}
                            </p>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => handleDelete(idea.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
