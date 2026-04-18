import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  RefreshCw,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  Loader2,
  Clock,
  Image as ImageIcon,
  AlertCircle,
  MoreVertical,
  Trash2,
  Sparkles
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { PublishedPostWithMetrics } from "@/hooks/usePublishedPosts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UnpublishPostDialog } from "./UnpublishPostDialog";

interface PublishedPostCardProps {
  post: PublishedPostWithMetrics;
  onRefresh: (postId: string) => void;
  onUnpublish: (postId: string) => Promise<void>;
  onRepurpose?: (post: PublishedPostWithMetrics) => void;
  isRefreshing: boolean;
  isUnpublishing: boolean;
  hasError?: boolean;
}

export function PublishedPostCard({
  post,
  onRefresh,
  onUnpublish,
  onRepurpose,
  isRefreshing,
  isUnpublishing,
  hasError
}: PublishedPostCardProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);

  const facebookUrl = post.facebook_post_id
    ? `https://facebook.com/${post.facebook_post_id}`
    : null;

  const handleUnpublish = async () => {
    await onUnpublish(post.id);
    setShowUnpublishDialog(false);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const metricsAge = post.metrics?.fetched_at
    ? formatDistanceToNow(new Date(post.metrics.fetched_at), { addSuffix: true, locale: dateLocale })
    : null;

  return (
    <Card className={`flex flex-col overflow-hidden ${hasError ? "ring-1 ring-destructive/30" : ""}`}>
      {/* Image or Placeholder */}
      <div className="relative aspect-video bg-muted">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt={post.topic || "Post image"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        {/* Language badge */}
        <Badge variant="secondary" className="absolute top-2 left-2">
          {t(`mediaManager.languages.${post.language}`)}
        </Badge>
        {/* Error badge */}
        {hasError && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="absolute top-2 right-2 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {t("mediaManager.published.metricsError")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("mediaManager.published.tokenExpired.description")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <CardContent className="flex-1 p-4 space-y-3">
        {/* Topic */}
        <h3 className="font-semibold line-clamp-2">
          {post.topic || t("mediaManager.untitled")}
        </h3>

        {/* Published date */}
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {post.published_at
            ? format(new Date(post.published_at), "PPp", { locale: dateLocale })
            : format(new Date(post.created_at), "MMM d, yyyy", { locale: dateLocale })}
        </p>

        {/* Engagement Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Heart className="h-4 w-4 text-rose-500" />
            <span className="font-medium">
              {formatNumber(post.metrics?.reactions_total || 0)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("mediaManager.published.metrics.reactions")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-blue-500" />
            <span className="font-medium">
              {formatNumber(post.metrics?.comments_count || 0)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("mediaManager.published.metrics.comments")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Share2 className="h-4 w-4 text-green-500" />
            <span className="font-medium">
              {formatNumber(post.metrics?.shares_count || 0)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("mediaManager.published.metrics.shares")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-amber-500" />
            <span className="font-medium">
              {formatNumber(post.metrics?.impressions || 0)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("mediaManager.published.metrics.reach")}
            </span>
          </div>
        </div>

        {/* Last updated */}
        {metricsAge && (
          <p className="text-xs text-muted-foreground">
            {t("mediaManager.published.lastUpdated")}: {metricsAge}
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          onClick={() => onRefresh(post.id)}
          disabled={isRefreshing || isUnpublishing}
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("mediaManager.published.refresh")}
        </Button>
        {facebookUrl && (
          <Button
            variant="default"
            size="sm"
            className="flex-1 gap-1"
            onClick={() => window.open(facebookUrl, "_blank")}
            disabled={isUnpublishing}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("mediaManager.published.viewOnFacebook")}
          </Button>
        )}
        
        {/* Dropdown menu with Unpublish option */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="px-2"
              disabled={isUnpublishing}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRepurpose && (
              <DropdownMenuItem onClick={() => onRepurpose(post)}>
                <Sparkles className="h-4 w-4 mr-2" />
                {t("mediaManager.repurpose.button")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowUnpublishDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("mediaManager.unpublish.button")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>

      {/* Unpublish Confirmation Dialog */}
      <UnpublishPostDialog
        open={showUnpublishDialog}
        onOpenChange={setShowUnpublishDialog}
        onConfirm={handleUnpublish}
        isLoading={isUnpublishing}
        postTopic={post.topic || undefined}
      />
    </Card>
  );
}
