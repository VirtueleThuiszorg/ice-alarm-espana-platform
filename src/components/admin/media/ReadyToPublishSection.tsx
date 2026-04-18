import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Eye, Rocket, ImageOff, Sparkles } from "lucide-react";
import { SocialPost } from "@/hooks/useSocialPosts";

interface ReadyToPublishSectionProps {
  posts: SocialPost[];
  isLoading: boolean;
  onPreview: (post: SocialPost) => void;
  onPublish: (postId: string) => void;
  publishingId: string | null;
}

export function ReadyToPublishSection({
  posts,
  isLoading,
  onPreview,
  onPublish,
  publishingId,
}: ReadyToPublishSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-[280px]">
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (posts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            {t("mediaManager.readyToPublish.empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-status-active/30 bg-status-active/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-status-active" />
          <CardTitle className="text-lg">
            {t("mediaManager.readyToPublish.title")} ({posts.length})
          </CardTitle>
        </div>
        <CardDescription>
          {t("mediaManager.readyToPublish.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 pb-4">
            {posts.map((post) => (
              <Card
                key={post.id}
                className="min-w-[300px] max-w-[300px] flex-shrink-0 bg-card"
              >
                <CardContent className="p-4 space-y-3">
                  {/* Image Thumbnail */}
                  {post.image_url ? (
                    <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                      <img
                        src={post.image_url}
                        alt="Post thumbnail"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
                      <ImageOff className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Topic */}
                  <p className="font-medium truncate text-sm">
                    {post.topic || t("mediaManager.untitled")}
                  </p>

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-1">
                    {post.goal && (
                      <Badge variant="secondary" className="text-xs">
                        {t(`mediaManager.goals.${post.goal}`)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {post.language === "both"
                        ? "🇬🇧🇪🇸"
                        : post.language === "en"
                        ? "🇬🇧"
                        : "🇪🇸"}
                    </Badge>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => onPreview(post)}
                    >
                      <Eye className="h-4 w-4" />
                      {t("mediaManager.readyToPublish.preview")}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => onPublish(post.id)}
                      disabled={publishingId === post.id}
                    >
                      <Rocket className="h-4 w-4" />
                      {t("mediaManager.readyToPublish.publishNow")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
