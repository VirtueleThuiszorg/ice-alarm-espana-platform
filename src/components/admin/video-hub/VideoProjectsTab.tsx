import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, MoreHorizontal, Copy, CheckCircle, Archive, ExternalLink, Video, Trash2, RefreshCw, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useVideoProjects, VideoProject } from "@/hooks/useVideoProjects";
import { useVideoTemplates } from "@/hooks/useVideoTemplates";
import { useVideoRenders } from "@/hooks/useVideoRenders";
import { useVideoExports } from "@/hooks/useVideoExports";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, LanguageBadge, FormatBadge, RenderProgressBadge } from "./VideoBadges";
import { VideoRenderDetailDialog } from "./VideoRenderDetailDialog";
import { RenderVariantButtons } from "./RenderVariantButtons";

interface Filters {
  language: string;
  format: string;
  status: string;
}

interface VideoProjectsTabProps {
  searchQuery: string;
  filters: Filters;
  onCreateNew: () => void;
  onEditProject: (project: VideoProject) => void;
}

export function VideoProjectsTab({ searchQuery, filters, onCreateNew, onEditProject }: VideoProjectsTabProps) {
  const { t, i18n } = useTranslation();
  const { projects, isLoading, duplicateProject, updateProjectStatus, deleteProject, isDeleting } = useVideoProjects();
  const { templates } = useVideoTemplates();
  const { latestRenderByProject } = useVideoRenders();
  const { exports, exportsByProjectAndFormat } = useVideoExports();

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<string | null>(null);

  // Render detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);

  // Get latest export for a project
  const getLatestExport = useCallback((projectId: string) => {
    if (!exports) return null;
    return exports.find(e => e.project_id === projectId);
  }, [exports]);

  // Auto-render on approve
  const handleApproveAndRender = useCallback(async (projectId: string) => {
    try {
      // Update status to approved
      await updateProjectStatus(projectId, "approved");

      // Check if render exists
      const existingRender = latestRenderByProject.get(projectId);
      if (!existingRender) {
        setIsRendering(projectId);
        // Auto-queue render
        const { data, error } = await supabase.functions.invoke('video-render-queue', {
          body: { project_id: projectId }
        });

        if (error) {
          console.error("Render queue error:", error);
          toast.error(error.message || t("videoHub.create.renderFailed"));
        } else if (data?.error) {
          console.error("Render queue returned error:", data.error);
          toast.error(data.error);
        } else {
          toast.success(data?.message || t("videoHub.projects.approvedAndQueued"));
        }
        setIsRendering(null);
      } else {
        toast.success(t("videoHub.projects.approved"));
      }
    } catch (error: any) {
      console.error("Approve error:", error);
      toast.error(error?.message || t("videoHub.create.renderFailed"));
      setIsRendering(null);
    }
  }, [updateProjectStatus, latestRenderByProject, t]);

  // Retry render action (for failed renders)
  const handleRetryRender = useCallback(async (projectId: string) => {
    try {
      setIsRendering(projectId);
      const { data, error } = await supabase.functions.invoke('video-render-queue', {
        body: { project_id: projectId }
      });

      if (error) {
        console.error("Render queue error:", error);
        toast.error(error.message || t("videoHub.create.renderFailed"));
      } else if (data?.error) {
        console.error("Render queue returned error:", data.error);
        toast.error(data.error);
      } else {
        toast.success(data?.message || t("videoHub.create.renderQueued"));
      }
    } catch (error: any) {
      console.error("Retry render error:", error);
      toast.error(error?.message || t("videoHub.create.renderFailed"));
    } finally {
      setIsRendering(null);
    }
  }, [t]);

  // Handle duplicate
  const handleDuplicate = useCallback(async (projectId: string) => {
    try {
      await duplicateProject(projectId);
      toast.success(t("videoHub.projects.duplicated", "Project duplicated"));
    } catch (error) {
      console.error("Duplicate error:", error);
      toast.error(t("common.error"));
    }
  }, [duplicateProject, t]);

  // Open latest export
  const handleOpenLatestExport = useCallback((projectId: string) => {
    const latestExport = getLatestExport(projectId);
    if (latestExport?.mp4_url) {
      window.open(latestExport.mp4_url, "_blank");
    } else {
      toast.error(t("videoHub.exports.notAvailable", "No export available"));
    }
  }, [getLatestExport, t]);

  // Memoized template lookup map
  const templateMap = useMemo(() => {
    if (!templates) return new Map<string, { name: string; allowed_formats?: string[] }>();
    return new Map(templates.map(t => [t.id, { name: t.name, allowed_formats: t.allowed_formats }]));
  }, [templates]);

  const getTemplateName = (templateId: string | null) => {
    if (!templateId) return "-";
    return templateMap.get(templateId)?.name || "-";
  };

  const getTemplateAllowedFormats = (templateId: string | null) => {
    if (!templateId) return null;
    return templateMap.get(templateId)?.allowed_formats || null;
  };

  // Memoized filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    return projects.filter(project => {
      // Search filter
      if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Status filter (from global filters)
      if (filters.status !== "all" && project.status !== filters.status) {
        return false;
      }
      // Format filter (from global filters)
      if (filters.format !== "all" && project.format !== filters.format) {
        return false;
      }
      // Language filter (from global filters)
      if (filters.language !== "all" && project.language !== filters.language) {
        return false;
      }
      return true;
    });
  }, [projects, searchQuery, filters]);

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      await deleteProject(projectToDelete);
      toast.success(t("videoHub.projects.deleted"));
    } catch (error) {
      toast.error(t("common.error"));
    } finally {
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
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
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!projects?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium">{t("videoHub.projects.noProjects")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("videoHub.projects.createFirst")}</p>
          <Button className="mt-6" onClick={onCreateNew}>
            {t("videoHub.newVideo")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {t("videoHub.tabs.projects")}
              </CardTitle>
              <CardDescription>
                {filteredProjects.length} {t("videoHub.projects.name").toLowerCase()}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("videoHub.projects.name")}</TableHead>
                <TableHead>{t("videoHub.projects.template")}</TableHead>
                <TableHead>{t("videoHub.projects.language")}</TableHead>
                <TableHead>{t("videoHub.projects.format")}</TableHead>
                <TableHead>{t("videoHub.projects.duration")}</TableHead>
                <TableHead>{t("videoHub.projects.status")}</TableHead>
                <TableHead>{t("videoHub.projects.render")}</TableHead>
                <TableHead>{t("videoHub.variants.title", "Variants")}</TableHead>
                <TableHead>{t("videoHub.projects.lastEdited")}</TableHead>
                <TableHead className="w-12">{t("videoHub.projects.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    {t("common.noResults", "No matching results. Try adjusting your filters.")}
                  </TableCell>
                </TableRow>
              ) : filteredProjects.map((project) => {
                const latestRender = latestRenderByProject.get(project.id);
                const renderFailed = latestRender?.status === "failed";
                const projectExports = exportsByProjectAndFormat.get(project.id);

                return (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedProject(project);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell>{getTemplateName(project.template_id)}</TableCell>
                    <TableCell><LanguageBadge language={project.language} /></TableCell>
                    <TableCell><FormatBadge format={project.format} /></TableCell>
                    <TableCell>{project.duration}s</TableCell>
                    <TableCell><StatusBadge status={project.status} /></TableCell>
                    <TableCell>
                      <RenderProgressBadge render={latestRender} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <RenderVariantButtons
                        projectId={project.id}
                        projectStatus={project.status}
                        existingExports={projectExports}
                        allowedFormats={getTemplateAllowedFormats(project.template_id)}
                        onRenderQueued={() => {
                          toast.success(t("videoHub.variants.queued", { format: project.format }));
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(project.updated_at), "MMM d, yyyy", { locale: i18n.language === "es" ? es : enGB })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditProject(project)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("videoHub.projects.open")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(project.id)}>
                            <Copy className="mr-2 h-4 w-4" />
                            {t("videoHub.projects.duplicate")}
                          </DropdownMenuItem>

                          {/* Open Latest Export */}
                          {projectExports && projectExports.size > 0 && (
                            <DropdownMenuItem onClick={() => handleOpenLatestExport(project.id)}>
                              <Download className="mr-2 h-4 w-4" />
                              {t("videoHub.projects.openExport", "Open Latest Export")}
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          {project.status === "draft" && (
                            <DropdownMenuItem
                              onClick={() => handleApproveAndRender(project.id)}
                              disabled={isRendering === project.id}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              {t("videoHub.projects.approve")}
                            </DropdownMenuItem>
                          )}

                          {/* Retry Render (for failed) */}
                          {renderFailed && (
                            <DropdownMenuItem
                              onClick={() => handleRetryRender(project.id)}
                              disabled={isRendering === project.id}
                              className="text-amber-600"
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              {t("videoHub.projects.retryRender", "Retry Render")}
                            </DropdownMenuItem>
                          )}

                          {/* Re-render (for non-failed) */}
                          {!renderFailed && (
                            <DropdownMenuItem
                              onClick={() => handleRetryRender(project.id)}
                              disabled={isRendering === project.id}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              {t("videoHub.projects.rerender")}
                            </DropdownMenuItem>
                          )}

                          {project.status !== "archived" && (
                            <DropdownMenuItem onClick={() => updateProjectStatus(project.id, "archived")}>
                              <Archive className="mr-2 h-4 w-4" />
                              {t("videoHub.projects.archive")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(project.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("videoHub.projects.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("videoHub.projects.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("videoHub.projects.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("videoHub.projects.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Render Detail Dialog */}
      <VideoRenderDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        project={selectedProject}
        render={selectedProject ? latestRenderByProject.get(selectedProject.id) : null}
        onRerender={(projectId) => {
          handleRetryRender(projectId);
        }}
        onViewExport={(projectId) => {
          handleOpenLatestExport(projectId);
          setDetailDialogOpen(false);
        }}
        isRerendering={isRendering === selectedProject?.id}
      />
    </>
  );
}
