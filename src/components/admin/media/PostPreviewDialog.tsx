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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, Edit, ImageOff, RefreshCw, AlertCircle } from "lucide-react";
import { SocialPost } from "@/hooks/useSocialPosts";
import { cn } from "@/lib/utils";

interface PostPreviewDialogProps {
  post: SocialPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: () => void;
  onRetry?: () => void;
  onEdit: () => void;
  isPublishing: boolean;
  isRetrying?: boolean;
}

export function PostPreviewDialog({
  post,
  open,
  onOpenChange,
  onPublish,
  onRetry,
  onEdit,
  isPublishing,
  isRetrying,
}: PostPreviewDialogProps) {
  const { t } = useTranslation();

  if (!post) return null;

  const canPublish = post.status === "approved";
  const isFailed = post.status === "failed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("mediaManager.preview.title")}</DialogTitle>
          <DialogDescription>
            {t("mediaManager.preview.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4">
          {/* Error Alert for Failed Posts */}
          {isFailed && post.error_message && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <strong>{t("mediaManager.errors.publishFailed")}:</strong> {post.error_message}
              </AlertDescription>
            </Alert>
          )}

          {/* Image Preview */}
          {post.image_url ? (
            <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
              <img
                src={post.image_url}
                alt="Post preview"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <ImageOff className="h-12 w-12 mx-auto mb-2" />
                <p className="text-sm">{t("mediaManager.preview.noImage")}</p>
              </div>
            </div>
          )}

          {/* Metadata Badges */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("mediaManager.preview.metadata")}
            </p>
            <div className="flex flex-wrap gap-2">
              {post.goal && (
                <Badge variant="secondary">
                  {t(`mediaManager.goals.${post.goal}`)}
                </Badge>
              )}
              {post.target_audience && (
                <Badge variant="secondary">
                  {t(`mediaManager.audiences.${post.target_audience}`)}
                </Badge>
              )}
              <Badge variant="secondary">
                {t(`mediaManager.languages.${post.language}`)}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  post.status === "approved" &&
                    "bg-status-active/10 text-status-active border-status-active/20",
                  post.status === "draft" && "bg-muted text-muted-foreground",
                  post.status === "published" &&
                    "bg-primary/10 text-primary border-primary/20",
                  post.status === "failed" &&
                    "bg-destructive/10 text-destructive border-destructive/20"
                )}
              >
                {t(`mediaManager.statuses.${post.status}`)}
              </Badge>
            </div>
          </div>

          {/* Post Text */}
          <ScrollArea className="h-[200px] rounded-lg border p-4 bg-muted/30">
            <div className="whitespace-pre-wrap text-sm">
              {post.post_text || (
                <span className="text-muted-foreground italic">
                  {t("mediaManager.postTextPlaceholder")}
                </span>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("mediaManager.preview.close")}
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            {t("mediaManager.preview.editFirst")}
          </Button>
          {isFailed && onRetry ? (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              variant="default"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t("mediaManager.actions.retry")}
            </Button>
          ) : (
            <Button
              onClick={onPublish}
              disabled={!canPublish || isPublishing}
              title={
                !canPublish
                  ? t("mediaManager.mustBeApproved")
                  : t("mediaManager.preview.publishNow")
              }
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {t("mediaManager.preview.publishNow")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
