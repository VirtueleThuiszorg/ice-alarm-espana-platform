import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { usePublishedPosts, PublishedPostWithMetrics } from "@/hooks/usePublishedPosts";
import { PublishedOverviewCard } from "./PublishedOverviewCard";
import { PublishedPostCard } from "./PublishedPostCard";
import { RepurposeDialog } from "./RepurposeDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function PublishedPostsSection() {
  const { t } = useTranslation();
  const {
    posts,
    isLoading,
    aggregatedMetrics,
    refreshMetrics,
    refreshAllMetrics,
    isRefreshing,
    isRefreshingAll,
    needsAutoRefresh,
    connectionStatus,
    testConnection,
    unpublishPost,
    isUnpublishing,
  } = usePublishedPosts();

  const [refreshingPostId, setRefreshingPostId] = useState<string | null>(null);
  const [unpublishingPostId, setUnpublishingPostId] = useState<string | null>(null);
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);
  const [repurposePost, setRepurposePost] = useState<PublishedPostWithMetrics | null>(null);

  // Auto-refresh if metrics are stale (only once per component mount)
  useEffect(() => {
    if (!hasAutoRefreshed && !isLoading && needsAutoRefresh()) {
      setHasAutoRefreshed(true);
      refreshAllMetrics();
    }
  }, [isLoading, needsAutoRefresh, hasAutoRefreshed, refreshAllMetrics]);

  const handleRefreshSingle = async (postId: string) => {
    setRefreshingPostId(postId);
    try {
      await refreshMetrics(postId);
    } finally {
      setRefreshingPostId(null);
    }
  };

  const handleUnpublish = async (postId: string) => {
    setUnpublishingPostId(postId);
    try {
      await unpublishPost(postId);
    } finally {
      setUnpublishingPostId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("mediaManager.published.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Token Expired Warning Banner */}
      {connectionStatus === "token_expired" && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("mediaManager.published.tokenExpired.title")}</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span>{t("mediaManager.published.tokenExpired.description")}</span>
            <Button asChild variant="outline" size="sm" className="w-fit gap-1">
              <Link to="/admin/settings">
                {t("mediaManager.published.tokenExpired.goToSettings")}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Overview Card */}
      <PublishedOverviewCard
        metrics={aggregatedMetrics}
        onRefreshAll={refreshAllMetrics}
        isRefreshing={isRefreshingAll}
        connectionStatus={connectionStatus}
        onTestConnection={testConnection}
      />

      {/* Posts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post) => (
          <PublishedPostCard
            key={post.id}
            post={post}
            onRefresh={handleRefreshSingle}
            onUnpublish={handleUnpublish}
            onRepurpose={(post) => setRepurposePost(post)}
            isRefreshing={refreshingPostId === post.id || isRefreshing}
            isUnpublishing={unpublishingPostId === post.id || isUnpublishing}
            hasError={connectionStatus === "token_expired"}
          />
        ))}
      </div>

      {/* Repurpose Dialog */}
      <RepurposeDialog
        open={!!repurposePost}
        onOpenChange={(open) => !open && setRepurposePost(null)}
        post={repurposePost}
      />
    </div>
  );
}
