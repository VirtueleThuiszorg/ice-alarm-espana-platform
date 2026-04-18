import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VideoExport } from "@/hooks/useVideoExports";

interface RenderVariantButtonsProps {
  projectId: string;
  projectStatus: string;
  existingExports: Map<string, VideoExport> | undefined;
  allowedFormats?: string[] | null;
  onRenderQueued?: () => void;
}

const FORMAT_KEYS = [
  { key: "9:16", label: "9:16", tooltipKey: "videoHub.variants.portraitTooltip" },
  { key: "16:9", label: "16:9", tooltipKey: "videoHub.variants.landscapeTooltip" },
  { key: "1:1", label: "1:1", tooltipKey: "videoHub.variants.squareTooltip" },
];

export function RenderVariantButtons({
  projectId,
  projectStatus,
  existingExports,
  allowedFormats,
  onRenderQueued
}: RenderVariantButtonsProps) {
  const { t } = useTranslation();
  const [renderingFormat, setRenderingFormat] = useState<string | null>(null);

  const handleRenderVariant = async (format: string) => {
    setRenderingFormat(format);
    try {
      const { data, error } = await supabase.functions.invoke('video-render-queue', {
        body: { project_id: projectId, format_override: format }
      });

      if (error) {
        console.error("Render variant error:", error);
        toast.error(error.message || t("videoHub.create.renderFailed"));
      } else if (data?.error) {
        console.error("Render variant returned error:", data.error);
        toast.error(data.error);
      } else {
        toast.success(data?.message || t("videoHub.variants.queued", { format }));
        onRenderQueued?.();
      }
    } catch (error: any) {
      console.error("Render variant error:", error);
      toast.error(error?.message || t("videoHub.create.renderFailed"));
    } finally {
      setRenderingFormat(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {FORMAT_KEYS.map((format) => {
          const hasExport = existingExports?.has(format.key);
          const isRendering = renderingFormat === format.key;
          const isFormatAllowed = !allowedFormats || allowedFormats.includes(format.key);

          return (
            <Tooltip key={format.key}>
              <TooltipTrigger asChild>
                <Button
                  variant={hasExport ? "outline" : "secondary"}
                  size="sm"
                  onClick={() => handleRenderVariant(format.key)}
                  disabled={isRendering || projectStatus === "rendering" || !isFormatAllowed}
                  className="gap-1"
                >
                  {isRendering ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Video className="h-3 w-3" />
                  )}
                  {format.label}
                  {hasExport && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      ✓
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t(format.tooltipKey)}</p>
                {hasExport && (
                  <p className="text-xs text-muted-foreground">
                    {t("videoHub.variants.alreadyRendered")}
                  </p>
                )}
                {!isFormatAllowed && (
                  <p className="text-xs text-destructive">
                    {t("videoHub.validation.formatNotAllowed")}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
