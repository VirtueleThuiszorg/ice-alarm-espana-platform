import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Video, Youtube, ExternalLink, AlertCircle, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVideoExports, VideoExport } from "@/hooks/useVideoExports";
import { useVideoProjects } from "@/hooks/useVideoProjects";
import { useVideoRenders } from "@/hooks/useVideoRenders";
import { useYouTubeIntegration } from "@/hooks/useYouTubeIntegration";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { toast } from "sonner";
import { LanguageBadge, FormatBadge } from "./VideoBadges";
import { YouTubePublishDialog } from "./YouTubePublishDialog";
import { VideoPreviewDialog } from "./VideoPreviewDialog";
import { ExportArtifactButtons } from "./ExportArtifactButtons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Filters {
  language: string;
  format: string;
  status: string;
}

interface VideoExportsTabProps {
  searchQuery: string;
  filters: Filters;
}

export function VideoExportsTab({ searchQuery, filters }: VideoExportsTabProps) {
  const { t, i18n } = useTranslation();
  const { exports, isLoading } = useVideoExports();
  const { projects } = useVideoProjects();
  const { latestRenderByProject } = useVideoRenders();
  const { isConnected: youtubeConnected, publish: publishToYouTube, isPublishing } = useYouTubeIntegration();

  const [selectedExport, setSelectedExport] = useState<VideoExport | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  // Fetch YouTube defaults
  const { data: youtubeDefaults } = useQuery({
    queryKey: ["youtube-default-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "settings_youtube_default_visibility",
          "settings_youtube_default_tags",
          "settings_youtube_default_description_footer",
        ]);
      if (error) throw error;

      const map: Record<string, string> = {};
      data?.forEach((s) => {
        const key = s.key.replace("settings_youtube_default_", "");
        map[key] = s.value;
      });
      return map;
    },
    enabled: youtubeConnected,
  });

  // Memoized project lookup map for O(1) access
  const projectMap = useMemo(() => {
    if (!projects) return new Map();
    return new Map(projects.map(p => [p.id, p]));
  }, [projects]);

  // Get render status for a project
  const getRenderStatus = (projectId: string) => {
    const render = latestRenderByProject.get(projectId);
    return render?.status || null;
  };

  // Memoized filtered exports
  const filteredExports = useMemo(() => {
    if (!exports) return [];

    return exports.filter(exp => {
      const project = projectMap.get(exp.project_id);
      if (!project) return false;

      // Search filter
      if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Language filter
      if (filters.language !== "all" && project.language !== filters.language) {
        return false;
      }

      // Format filter - check export format, not project format
      if (filters.format !== "all" && exp.format !== filters.format) {
        return false;
      }

      return true;
    });
  }, [exports, projectMap, searchQuery, filters]);

  const handlePublishClick = (exp: VideoExport) => {
    const project = projectMap.get(exp.project_id);
    // Only approved projects can be published to YouTube
    if (project?.status !== "approved") {
      toast.error(t("videoHub.youtube.mustBeApproved", "Project must be approved before publishing to YouTube"));
      return;
    }
    setSelectedExport(exp);
    setShowPublishDialog(true);
  };

  const handlePublish = async (data: {
    title: string;
    description: string;
    visibility: "public" | "unlisted" | "private";
    tags?: string;
    playlist_id?: string;
    made_for_kids: boolean;
  }) => {
    if (!selectedExport) return;

    await publishToYouTube({
      video_export_id: selectedExport.id,
      ...data,
    });
  };

  const getRenderStatusBadge = (status: string | null) => {
    switch (status) {
      case "done":
        return <Badge className="bg-status-active text-white">{t("videoHub.statuses.done")}</Badge>;
      case "running":
        return <Badge className="bg-amber-500 text-white">{t("videoHub.statuses.running")}</Badge>;
      case "queued":
        return <Badge variant="secondary">{t("videoHub.statuses.queued")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("videoHub.statuses.failed")}</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getYouTubeStatusBadge = (status: string | null) => {
    switch (status) {
      case "published":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("videoHub.youtube.statuses.published")}</Badge>;
      case "uploading":
        return <Badge variant="secondary">{t("videoHub.youtube.statuses.uploading")}</Badge>;
      case "queued":
        return <Badge variant="outline">{t("videoHub.youtube.statuses.queued")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("videoHub.youtube.statuses.failed")}</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!exports?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Download className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium">{t("videoHub.exports.noExports")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("videoHub.exports.noExportsDesc")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      {/* YouTube Not Connected Banner */}
      {!youtubeConnected && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("videoHub.youtube.notConnected", "YouTube Not Connected")}</AlertTitle>
          <AlertDescription>
            {t("videoHub.youtube.notConnectedDesc", "Connect your YouTube channel to publish videos directly.")}{" "}
            <Link to="/admin/settings#communications/social" className="text-primary underline hover:no-underline">
              {t("videoHub.youtube.connectInSettings", "Connect in Admin Settings")}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t("videoHub.tabs.exports")}
          </CardTitle>
          <CardDescription>
            {filteredExports.length} {t("videoHub.exports.available")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("videoHub.exports.thumbnail")}</TableHead>
                <TableHead>{t("videoHub.projects.name")}</TableHead>
                <TableHead>{t("videoHub.projects.format")}</TableHead>
                <TableHead>{t("videoHub.projects.language")}</TableHead>
                <TableHead>{t("videoHub.exports.dateCreated")}</TableHead>
                <TableHead>{t("videoHub.projects.render")}</TableHead>
                <TableHead>YouTube</TableHead>
                <TableHead>{t("videoHub.exports.files", "Files")}</TableHead>
                <TableHead className="text-right">{t("videoHub.projects.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExports.map((exp) => {
                const project = projectMap.get(exp.project_id);
                const renderStatus = getRenderStatus(exp.project_id);
                const isApproved = project?.status === "approved";

                return (
                  <TableRow
                    key={exp.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedExport(exp);
                      setShowPreviewDialog(true);
                    }}
                  >
                    <TableCell>
                      <div className="relative group">
                        {exp.thumbnail_url ? (
                          <img
                            src={exp.thumbnail_url}
                            alt="Thumbnail"
                            className="h-12 w-20 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-20 items-center justify-center rounded bg-muted">
                            <Video className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        {/* Play overlay on hover */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{project?.name || "-"}</TableCell>
                    <TableCell>
                      <FormatBadge format={exp.format} />
                    </TableCell>
                    <TableCell>
                      {project ? <LanguageBadge language={project.language} /> : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(exp.created_at), "MMM d, yyyy", { locale: i18n.language === "es" ? es : enGB })}
                    </TableCell>
                    <TableCell>
                      {getRenderStatusBadge(renderStatus)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getYouTubeStatusBadge(exp.youtube_status)}
                        {exp.youtube_url && (
                          <a
                            href={exp.youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {exp.youtube_error && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-destructive">
                                {exp.youtube_error.slice(0, 15)}...
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">{exp.youtube_error}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ExportArtifactButtons export_={exp} compact />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePublishClick(exp)}
                          disabled={!youtubeConnected || !isApproved || exp.youtube_status === "published" || exp.youtube_status === "uploading"}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Youtube className="mr-1 h-4 w-4" />
                          {exp.youtube_status === "published"
                            ? t("videoHub.youtube.published", "Published")
                            : t("videoHub.youtube.publishButton", "Publish")
                          }
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* YouTube Publish Dialog */}
      {selectedExport && (
        <YouTubePublishDialog
          open={showPublishDialog}
          onOpenChange={setShowPublishDialog}
          projectName={projectMap.get(selectedExport.project_id)?.name || "Untitled"}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          defaults={youtubeDefaults}
        />
      )}

      {/* Video Preview Dialog */}
      <VideoPreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        export_={selectedExport}
        projectName={selectedExport ? (projectMap.get(selectedExport.project_id)?.name || "Untitled") : ""}
        projectLanguage={selectedExport ? (projectMap.get(selectedExport.project_id)?.language || "en") : "en"}
      />
    </TooltipProvider>
  );
}
