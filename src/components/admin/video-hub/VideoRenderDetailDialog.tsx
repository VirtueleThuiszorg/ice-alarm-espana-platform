import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import type { VideoProject } from "@/hooks/useVideoProjects";
import type { VideoRender } from "@/hooks/useVideoRenders";
import { cn } from "@/lib/utils";

interface VideoRenderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: VideoProject | null;
  render: VideoRender | null | undefined;
  onRerender: (projectId: string) => void;
  onViewExport: (projectId: string) => void;
  isRerendering: boolean;
}

const RENDER_STAGES = [
  { key: "queued", progressMax: 0 },
  { key: "initializing", progressMax: 10 },
  { key: "generating", progressMax: 30 },
  { key: "processing", progressMax: 50 },
  { key: "compositing", progressMax: 70 },
  { key: "encoding", progressMax: 90 },
  { key: "finalizing", progressMax: 100 },
];

export function VideoRenderDetailDialog({
  open,
  onOpenChange,
  project,
  render,
  onRerender,
  onViewExport,
  isRerendering,
}: VideoRenderDetailDialogProps) {
  const { t } = useTranslation();

  const currentStageIndex = useMemo(() => {
    if (!render?.stage) return 0;
    const idx = RENDER_STAGES.findIndex((s) => s.key === render.stage);
    return idx >= 0 ? idx : 0;
  }, [render?.stage]);

  const getStageStatus = (index: number) => {
    if (!render) return "pending";
    if (render.status === "done") return "completed";
    if (render.status === "failed") return index <= currentStageIndex ? "completed" : "pending";
    if (index < currentStageIndex) return "completed";
    if (index === currentStageIndex) return "current";
    return "pending";
  };

  const StageIcon = ({ status }: { status: string }) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-status-active" />;
    }
    if (status === "current") {
      return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />;
    }
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  if (!project) return null;

  const isComplete = render?.status === "done";
  const isFailed = render?.status === "failed";
  const isRunning = render?.status === "running" || render?.status === "queued";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("videoHub.renderDetail.title")}</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isComplete
                  ? t("videoHub.renderDetail.completed")
                  : isFailed
                  ? t("videoHub.statuses.failed")
                  : t("videoHub.renderDetail.current")}
              </span>
              <span className="font-medium">{render?.progress ?? 0}%</span>
            </div>
            <Progress
              value={render?.progress ?? 0}
              className={cn("h-2", isFailed && "bg-destructive/20")}
            />
          </div>

          {/* Stage Timeline */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("videoHub.renderDetail.timeline")}
            </h4>
            <div className="space-y-1">
              {RENDER_STAGES.map((stage, index) => {
                const status = getStageStatus(index);
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      "flex items-center gap-3 py-1.5 px-2 rounded-md text-sm",
                      status === "current" && "bg-amber-500/10",
                      status === "completed" && "text-muted-foreground"
                    )}
                  >
                    <StageIcon status={status} />
                    <span>{t(`videoHub.renderDetail.stages.${stage.key}`)}</span>
                    {status === "current" && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {t("videoHub.renderDetail.current")}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {isFailed && render?.error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{render.error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            {isComplete && (
              <Button variant="outline" onClick={() => onViewExport(project.id)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("videoHub.renderDetail.viewExport")}
              </Button>
            )}
            <Button
              variant={isComplete || isFailed ? "default" : "outline"}
              onClick={() => onRerender(project.id)}
              disabled={isRerendering || isRunning}
            >
              {isRerendering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t("videoHub.renderDetail.rerender")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
