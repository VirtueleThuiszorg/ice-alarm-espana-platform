import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { StrategyItemEditor } from "./StrategyItemEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface StrategyItem {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  ai_prompt_hint?: string | null;
}

interface StrategyItemListProps {
  title: string;
  description: string;
  items: StrategyItem[];
  isLoading: boolean;
  onCreate: (data: { name: string; description?: string; ai_prompt_hint?: string }) => Promise<void>;
  onUpdate: (data: { id: string; name?: string; description?: string; ai_prompt_hint?: string; is_active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isCreating?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
  showAiPrompt?: boolean;
  requireDescription?: boolean;
}

export function StrategyItemList({
  title,
  description,
  items,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  isCreating,
  isUpdating,
  isDeleting: _isDeleting,
  showAiPrompt,
  requireDescription,
}: StrategyItemListProps) {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StrategyItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingItem(null);
    setEditorOpen(true);
  };

  const handleEdit = (item: StrategyItem) => {
    setEditingItem(item);
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

  const handleSave = async (data: { name: string; description?: string; ai_prompt_hint?: string; is_active?: boolean }) => {
    if (editingItem) {
      await onUpdate({ id: editingItem.id, ...data });
    } else {
      await onCreate(data);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
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
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("mediaStrategy.noItemsYet")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">
                    {item.description || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.is_active !== false ? "default" : "secondary"}>
                      {item.is_active !== false ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? (
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

      <StrategyItemEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={title}
        item={editingItem}
        onSave={handleSave}
        isLoading={isCreating || isUpdating}
        showAiPrompt={showAiPrompt}
        requireDescription={requireDescription}
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
