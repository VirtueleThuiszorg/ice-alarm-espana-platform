import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAIMemory, useCreateMemory, useDeleteMemory, useUpdateMemory } from "@/hooks/useAIAgents";
import type { AIAgent } from "@/hooks/useAIAgents";

interface AITrainingTabProps { agent: AIAgent; }

export function AITrainingTab({ agent }: AITrainingTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: memories, isLoading } = useAIMemory(agent.id);
  const createMemory = useCreateMemory();
  const updateMemory = useUpdateMemory();
  const deleteMemory = useDeleteMemory();

  const trainingEntries = useMemo(
    () => (memories?.filter((m) => m.tags?.includes("training")) || []),
    [memories],
  );

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(5);

  const isSaving = createMemory.isPending || updateMemory.isPending;

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setImportance(5);
  };

  const openForCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openForEdit = (id: string) => {
    const target = trainingEntries.find((m) => m.id === id);
    if (!target) return;
    setEditingId(target.id);
    setTitle(target.title);
    setContent(target.content);
    setImportance(target.importance ?? 5);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;

    try {
      if (editingId) {
        await updateMemory.mutateAsync({
          memoryId: editingId,
          updates: { title: title.trim(), content: content.trim(), importance },
        });
        toast({ title: t("common.saved", "Saved") });
      } else {
        await createMemory.mutateAsync({
          scope: "agent",
          agent_id: agent.id,
          scope_id: null,
          title: title.trim(),
          content: content.trim(),
          importance,
          tags: ["training"],
        });
        toast({ title: t("common.created", "Created") });
      }

      setOpen(false);
      resetForm();
    } catch {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory.mutateAsync(id);
      toast({ title: t("common.deleted", "Deleted") });
    } catch {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("ai.trainingData", "Training Data")}</CardTitle>
            <CardDescription>{t("ai.trainingDataDesc", "Q&A pairs and examples that help train this agent.")}</CardDescription>
          </div>

          <Dialog open={open} onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={openForCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t("ai.addTraining", "Add Training")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? t("ai.editTraining", "Edit Training") : t("ai.addTraining", "Add Training")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder={t("ai.trainingTitlePlaceholder", "Question / Scenario title")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  placeholder={t("ai.trainingContentPlaceholder", "Answer / Example response")}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                />
                <div>
                  <label className="text-sm">
                    {t("ai.importance", "Importance")}: {importance}
                  </label>
                  <Slider value={[importance]} onValueChange={(v) => setImportance(v[0])} min={1} max={10} step={1} />
                </div>
                <Button onClick={handleSave} disabled={!title.trim() || !content.trim() || isSaving}>
                  {t("common.save", "Save")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
        ) : trainingEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("ai.noTrainingData", "No training data added yet. Click 'Add Training' to create a Q&A pair.")}
          </p>
        ) : (
          <div className="space-y-3">
            {trainingEntries.map((e) => (
              <div key={e.id} className="p-3 border rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium break-words">{e.title}</p>
                      <Badge variant="outline" className="gap-1">
                        <Star className="h-3 w-3" />
                        <span>{e.importance}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{e.content}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openForEdit(e.id)}
                      aria-label={t("common.edit", "Edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(e.id)}
                      disabled={deleteMemory.isPending}
                      aria-label={t("common.delete", "Delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
