import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Youtube, Loader2 } from "lucide-react";

interface YouTubePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onPublish: (data: {
    title: string;
    description: string;
    visibility: "public" | "unlisted" | "private";
    tags?: string;
    playlist_id?: string;
    made_for_kids: boolean;
  }) => Promise<void>;
  isPublishing: boolean;
  defaults?: {
    visibility?: string;
    tags?: string;
    description_footer?: string;
  };
}

export function YouTubePublishDialog({
  open,
  onOpenChange,
  projectName,
  onPublish,
  isPublishing,
  defaults,
}: YouTubePublishDialogProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState(
    defaults?.description_footer
      ? `\n\n${defaults.description_footer}`
      : ""
  );
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">(
    (defaults?.visibility as "public" | "unlisted" | "private") || "unlisted"
  );
  const [tags, setTags] = useState(defaults?.tags || "");
  const [madeForKids, setMadeForKids] = useState(false);

  // Reset form state when dialog opens or project changes
  useEffect(() => {
    if (open) {
      setTitle(projectName);
      setDescription(
        defaults?.description_footer
          ? `\n\n${defaults.description_footer}`
          : ""
      );
      setVisibility(
        (defaults?.visibility as "public" | "unlisted" | "private") || "unlisted"
      );
      setTags(defaults?.tags || "");
      setMadeForKids(false);
    }
  }, [open, projectName, defaults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await onPublish({
      title,
      description,
      visibility,
      tags: tags || undefined,
      made_for_kids: madeForKids,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-600" />
            {t("videoHub.youtube.publishTitle", "Publish to YouTube")}
          </DialogTitle>
          <DialogDescription>
            {t("videoHub.youtube.publishDescription", "Configure video details before publishing to YouTube")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("videoHub.youtube.title", "Title")} *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("videoHub.youtube.titlePlaceholder", "Video title")}
              required
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">{title.length}/100</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("videoHub.youtube.description", "Description")} *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("videoHub.youtube.descriptionPlaceholder", "Video description...")}
              required
              rows={4}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground">{description.length}/5000</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">{t("videoHub.youtube.visibility", "Visibility")} *</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t("videoHub.youtube.public", "Public")}</SelectItem>
                <SelectItem value="unlisted">{t("videoHub.youtube.unlisted", "Unlisted")}</SelectItem>
                <SelectItem value="private">{t("videoHub.youtube.private", "Private")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">{t("videoHub.youtube.tags", "Tags")} ({t("common.optional", "optional")})</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ice alarm, elderly care, spain"
            />
            <p className="text-xs text-muted-foreground">
              {t("videoHub.youtube.tagsHelp", "Comma-separated tags")}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>{t("videoHub.youtube.madeForKids", "Made for kids")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("videoHub.youtube.madeForKidsHelp", "Required by YouTube. Set to ON if content is directed to children.")}
              </p>
            </div>
            <Switch
              checked={madeForKids}
              onCheckedChange={setMadeForKids}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPublishing}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={isPublishing || !title || !description}>
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("videoHub.youtube.publishing", "Publishing...")}
                </>
              ) : (
                <>
                  <Youtube className="mr-2 h-4 w-4" />
                  {t("videoHub.youtube.publish", "Publish")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
