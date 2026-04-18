import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Download, ExternalLink, Subtitles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoExport } from "@/hooks/useVideoExports";

interface VideoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  export_: VideoExport | null;
  projectName: string;
  projectLanguage?: string;
}

export function VideoPreviewDialog({
  open,
  onOpenChange,
  export_,
  projectName,
  projectLanguage = "en"
}: VideoPreviewDialogProps) {
  const { t } = useTranslation();
  const [showCaptions, setShowCaptions] = useState(true);

  if (!export_) return null;

  const hasVideo = !!export_.mp4_url;
  const hasCaptions = !!export_.vtt_url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            {projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Player */}
          {hasVideo ? (
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={export_.mp4_url!}
                controls
                autoPlay={false}
                className="w-full h-full"
                crossOrigin="anonymous"
              >
                {/* VTT Captions Track */}
                {hasCaptions && showCaptions && (
                  <track
                    kind="captions"
                    src={export_.vtt_url!}
                    srcLang={projectLanguage}
                    label={projectLanguage === "es" ? "Subtítulos" : "Captions"}
                    default
                  />
                )}
              </video>
            </div>
          ) : (
            <div className="flex items-center justify-center aspect-video bg-muted rounded-lg">
              <p className="text-muted-foreground">
                {t("videoHub.exports.videoNotAvailable", "Video not available")}
              </p>
            </div>
          )}

          {/* Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Captions Toggle */}
              {hasCaptions && (
                <Button
                  variant={showCaptions ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowCaptions(!showCaptions)}
                >
                  <Subtitles className="mr-1 h-4 w-4" />
                  {showCaptions ? t("common.on", "On") : t("common.off", "Off")}
                </Button>
              )}

              {/* Status Badges */}
              {export_.youtube_status === "published" && (
                <Badge className="bg-alert-resolved text-alert-resolved-foreground">
                  {t("videoHub.youtube.published")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Download Buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(export_.mp4_url!, "_blank")}
                disabled={!hasVideo}
              >
                <Download className="mr-1 h-4 w-4" />
                MP4
              </Button>

              {hasCaptions && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(export_.vtt_url!, "_blank")}
                >
                  <Download className="mr-1 h-4 w-4" />
                  VTT
                </Button>
              )}

              {export_.srt_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(export_.srt_url!, "_blank")}
                >
                  <Download className="mr-1 h-4 w-4" />
                  SRT
                </Button>
              )}

              {/* Open in new tab */}
              {hasVideo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(export_.mp4_url!, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* YouTube Info */}
          {export_.youtube_url && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">YouTube:</span>
              <a
                href={export_.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {export_.youtube_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
