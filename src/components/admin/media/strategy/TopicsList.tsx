import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { TopicEditor } from "./TopicEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MediaGoal, MediaTopic } from "@/hooks/useMediaStrategy";

interface TopicsListProps {
  topics: MediaTopic[];
  goals: MediaGoal[];
  isLoading: boolean;
  onCreate: (data: { name: string; description?: string; goal_ids?: string[] }) => Promise<void>;
  onUpdate: (data: { id: string; name?: string; description?: string; goal_ids?: string[]; is_active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isCreating?: boolean;
  isUpdating?: boolean;
}

export function TopicsList({
  topics,
  goals,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  isCreating,
  isUpdating,
}: TopicsListProps) {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<MediaTopic | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const goalsMap = new Map(goals.map((g) => [g.id, g.name]));

  const handleCreate = () => {
    setEditingTopic(null);
    setEditorOpen(true);
  };

  const handleEdit = (topic: MediaTopic) => {
    setEditingTopic(topic);
    setEditorOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeletingId(deleteTargetId);
    try {
      await onDelete(deleteTargetId);
    } finally {
      setDeletingId(null);
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const handleSave = async (data: { name: string; description?: string; goal_ids?: string[]; is_active?: boolean }) => {
    if (editingTopic) {
      await onUpdate({ id: editingTopic.id, ...data });
    } else {
      await onCreate(data);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("mediaStrategy.topics")}</CardTitle>
            <CardDescription>{t("mediaStrategy.topicsDescription")}</CardDescription>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("mediaStrategy.noItemsYet")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("mediaStrategy.linkedGoals")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium">
                    <div>
                      <p>{topic.name}</p>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {topic.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {topic.goal_ids?.map((gid) => (
                        <Badge key={gid} variant="outline" className="text-xs">
                          {goalsMap.get(gid) || gid}
                        </Badge>
                      ))}
                      {(!topic.goal_ids || topic.goal_ids.length === 0) && (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={topic.is_active ? "default" : "secondary"}>
                      {topic.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(topic)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(topic.id)}
                        disabled={deletingId === topic.id}
                      >
                        {deletingId === topic.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <TopicEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        topic={editingTopic}
        goals={goals}
        onSave={handleSave}
        isLoading={isCreating || isUpdating}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("common.deleteConfirmTitle")}
        description={t("common.deleteConfirm")}
        onConfirm={handleConfirmDelete}
        destructive
        confirmLabel={t("common.delete")}
      />
    </Card>
  );
}
