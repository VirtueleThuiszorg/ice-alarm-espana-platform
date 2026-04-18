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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Ban, Send, Loader2, Image as ImageIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { ScheduledContentItem } from "@/hooks/useScheduledContent";

interface ContentPreviewDialogProps {
  item: ScheduledContentItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onDisable: () => void;
  onPublish: () => void;
  isApproving?: boolean;
  isPublishing?: boolean;
}

export function ContentPreviewDialog({
  item,
  open,
  onOpenChange,
  onApprove,
  onDisable,
  onPublish,
  isApproving,
  isPublishing,
}: ContentPreviewDialogProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("mediaStrategy.contentPreview")}
            {item.is_approved && (
              <Badge className="bg-green-500/10 text-green-600">
                {t("mediaStrategy.approved")}
              </Badge>
            )}
            {item.is_disabled && (
              <Badge variant="outline" className="bg-muted">
                {t("mediaStrategy.disabled")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {t("mediaStrategy.scheduledFor")} {format(parseISO(item.scheduled_date), "EEEE, MMMM d, yyyy", { locale: dateLocale })} {t("common.at")} {item.scheduled_time}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.goal")}</p>
            <p className="font-medium text-sm">{item.goal?.name || "-"}</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.audience")}</p>
            <p className="font-medium text-sm">{item.audience?.name || "-"}</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.topic")}</p>
            <p className="font-medium text-sm truncate">{item.topic?.name || "-"}</p>
          </div>
          <div className="text-center p-2 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.imageStyle")}</p>
            <p className="font-medium text-sm">{item.image_style?.name || "-"}</p>
          </div>
        </div>

        <Tabs defaultValue="social" className="flex-1">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="social">{t("mediaStrategy.socialPost")}</TabsTrigger>
            <TabsTrigger value="blog">{t("mediaStrategy.blogContent")}</TabsTrigger>
            <TabsTrigger value="image">{t("mediaStrategy.image")}</TabsTrigger>
            <TabsTrigger value="spanish">{t("mediaStrategy.spanish")}</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[350px] mt-4">
            <TabsContent value="social" className="mt-0 space-y-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("mediaStrategy.socialPostText")}
                </h4>
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap">
                  {item.generated_post_text || t("mediaStrategy.notGenerated")}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="blog" className="mt-0 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("mediaStrategy.blogIntro")}
                </h4>
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap mb-4">
                  {item.generated_blog_intro || t("mediaStrategy.notGenerated")}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("mediaStrategy.blogContent")}
                </h4>
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                  {item.generated_blog_content || t("mediaStrategy.notGenerated")}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="mt-0 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("mediaStrategy.imagePrompt")}
                </h4>
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm mb-4">
                  {item.generated_image_prompt || t("mediaStrategy.notGenerated")}
                </div>
              </div>
              {item.generated_image_url ? (
                <div className="aspect-video rounded-lg overflow-hidden border">
                  <img
                    src={item.generated_image_url}
                    alt="Generated"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t("mediaStrategy.noImageGenerated")}</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="spanish" className="mt-0 space-y-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("mediaStrategy.spanishPostText")}
                </h4>
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap">
                  {item.generated_post_text_es || t("mediaStrategy.notGenerated")}
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {item.publish_error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {t("mediaStrategy.publishError")}: {item.publish_error}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!item.is_disabled && !item.is_approved && (
            <Button variant="outline" onClick={onDisable} className="gap-2">
              <Ban className="h-4 w-4" />
              {t("mediaStrategy.disable")}
            </Button>
          )}
          {!item.is_approved && !item.is_disabled && (
            <Button variant="secondary" onClick={onApprove} disabled={isApproving} className="gap-2">
              {isApproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("mediaStrategy.approve")}
            </Button>
          )}
          {item.is_approved && !item.is_disabled && (
            <Button onClick={onPublish} disabled={isPublishing} className="gap-2">
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("mediaStrategy.publishNow")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
