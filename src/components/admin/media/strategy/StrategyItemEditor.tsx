import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface StrategyItemEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  item?: {
    id: string;
    name: string;
    description?: string | null;
    is_active?: boolean;
    ai_prompt_hint?: string | null;
  } | null;
  onSave: (data: { name: string; description?: string; ai_prompt_hint?: string; is_active?: boolean }) => Promise<void>;
  isLoading?: boolean;
  showAiPrompt?: boolean;
  requireDescription?: boolean;
}

export function StrategyItemEditor({
  open,
  onOpenChange,
  title,
  item,
  onSave,
  isLoading,
  showAiPrompt,
  requireDescription,
}: StrategyItemEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiPromptHint, setAiPromptHint] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Reset form when item changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(item?.name || "");
      setDescription(item?.description || "");
      setAiPromptHint(item?.ai_prompt_hint || "");
      setIsActive(item?.is_active ?? true);
    }
  }, [item, open]);

  const handleSave = async () => {
    await onSave({
      name,
      description: description || undefined,
      ai_prompt_hint: showAiPrompt ? aiPromptHint || undefined : undefined,
      is_active: item ? isActive : undefined,
    });
    onOpenChange(false);
  };

  const isValid = name.trim() && (!requireDescription || description.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{item ? t("common.edit") : t("common.create")} {title}</DialogTitle>
          <DialogDescription>
            {item ? t("mediaStrategy.editItemDescription") : t("mediaStrategy.createItemDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("common.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("mediaStrategy.namePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t("common.description")} {!requireDescription && `(${t("common.optional")})`}
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("mediaStrategy.descriptionPlaceholder")}
              rows={3}
            />
          </div>
          {showAiPrompt && (
            <div className="space-y-2">
              <Label htmlFor="aiPrompt">{t("mediaStrategy.aiPromptHint")}</Label>
              <Textarea
                id="aiPrompt"
                value={aiPromptHint}
                onChange={(e) => setAiPromptHint(e.target.value)}
                placeholder={t("mediaStrategy.aiPromptPlaceholder")}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">{t("mediaStrategy.aiPromptHelp")}</p>
            </div>
          )}
          {item && (
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
          <Button onClick={handleSave} disabled={isLoading || !isValid}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
