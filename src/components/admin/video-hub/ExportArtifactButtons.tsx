import { useTranslation } from "react-i18next";
import { Download, Copy, FileVideo, FileText, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { VideoExport } from "@/hooks/useVideoExports";

interface ExportArtifactButtonsProps {
  export_: VideoExport;
  compact?: boolean;
}

export function ExportArtifactButtons({ export_, compact = false }: ExportArtifactButtonsProps) {
  const { t } = useTranslation();

  const handleDownload = (url: string | null, label: string) => {
    if (!url) {
      toast.error(t("videoHub.exports.notAvailable"));
      return;
    }
    window.open(url, "_blank");
    toast.success(t("videoHub.exports.downloading", { type: label }));
  };

  const handleCopyLink = async (url: string | null, label: string) => {
    if (!url) {
      toast.error(t("videoHub.exports.notAvailable"));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("videoHub.exports.linkCopied", { type: label }));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const artifacts = [
    { 
      key: "mp4", 
      url: export_.mp4_url, 
      label: "MP4", 
      icon: FileVideo,
      primary: true 
    },
    { 
      key: "thumbnail", 
      url: export_.thumbnail_url, 
      label: t("videoHub.exports.thumbnail", "Thumbnail"), 
      icon: Image,
      primary: false 
    },
    { 
      key: "vtt", 
      url: export_.vtt_url, 
      label: "VTT", 
      icon: FileText,
      primary: false 
    },
    { 
      key: "srt", 
      url: export_.srt_url, 
      label: "SRT", 
      icon: FileText,
      primary: false 
    },
  ];

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex gap-1">
          {artifacts.map((artifact) => {
            if (!artifact.url) return null;
            const Icon = artifact.icon;
            
            return (
              <div key={artifact.key} className="flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(artifact.url, artifact.label);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("videoHub.exports.download")} {artifact.label}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(artifact.url, artifact.label);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("videoHub.exports.copyLink")} {artifact.label}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => {
        if (!artifact.url) return null;
        const Icon = artifact.icon;
        
        return (
          <div key={artifact.key} className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium w-20">{artifact.label}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(artifact.url, artifact.label)}
            >
              <Download className="mr-1 h-3 w-3" />
              {t("videoHub.exports.download")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopyLink(artifact.url, artifact.label)}
            >
              <Copy className="mr-1 h-3 w-3" />
              {t("videoHub.exports.copyLink")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
