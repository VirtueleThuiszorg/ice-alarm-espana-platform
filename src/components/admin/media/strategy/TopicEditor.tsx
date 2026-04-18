import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { MediaGoal, MediaTopic } from "@/hooks/useMediaStrategy";

interface TopicEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic?: MediaTopic | null;
  goals: MediaGoal[];
  onSave: (data: { name: string; description?: string; goal_ids?: string[]; is_active?: boolean }) => Promise<void>;
  isLoading?: boolean;
}

export function TopicEditor({
  open,
  onOpenChange,
  topic,
  goals,
  onSave,
  isLoading,
}: TopicEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (topic) {
      setName(topic.name);
      setDescription(topic.description || "");
      setSelectedGoals(topic.goal_ids || []);
      setIsActive(topic.is_active);
    } else {
      setName("");
      setDescription("");
      setSelectedGoals([]);
      setIsActive(true);
    }
  }, [topic, open]);

  const handleSave = async () => {
    await onSave({
      name,
      description: description || undefined,
      goal_ids: selectedGoals,
      is_active: topic ? isActive : undefined,
    });
    onOpenChange(false);
  };

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{topic ? t("common.edit") : t("common.create")} {t("mediaStrategy.topic")}</DialogTitle>
          <DialogDescription>
            {topic ? t("mediaStrategy.editItemDescription") : t("mediaStrategy.createItemDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("common.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("mediaStrategy.topicNamePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("common.description")} ({t("common.optional")})</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("mediaStrategy.topicDescriptionPlaceholder")}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("mediaStrategy.linkedGoals")} ({t("common.optional")})</Label>
            <div className="border rounded-lg p-3 space-y-2 max-h-[150px] overflow-y-auto">
              {goals.filter((g) => g.is_active).map((goal) => (
                <div key={goal.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`goal-${goal.id}`}
                    checked={selectedGoals.includes(goal.id)}
                    onCheckedChange={() => toggleGoal(goal.id)}
                  />
                  <label
                    htmlFor={`goal-${goal.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {goal.name}
                  </label>
                </div>
              ))}
              {goals.filter((g) => g.is_active).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("mediaStrategy.noActiveGoals")}</p>
              )}
            </div>
          </div>
          {topic && (
            <div className="flex items-center justify-between">
              <Label htmlFor="active">{t("common.active")}</Label>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !name.trim()}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
