import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { VideoRender } from "@/hooks/useVideoRenders";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  
  switch (status) {
    case "draft":
      return <Badge variant="secondary">{t("videoHub.statuses.draft")}</Badge>;
    case "rendering":
      return <Badge className="bg-amber-500 text-white animate-pulse">{t("videoHub.statuses.rendering")}</Badge>;
    case "approved":
      return <Badge className="bg-status-active text-status-active-foreground">{t("videoHub.statuses.approved")}</Badge>;
    case "archived":
      return <Badge variant="outline">{t("videoHub.statuses.archived")}</Badge>;
    case "queued":
      return <Badge variant="secondary">{t("videoHub.statuses.queued")}</Badge>;
    case "running":
      return <Badge className="bg-amber-500 text-white">{t("videoHub.statuses.running")}</Badge>;
    case "failed":
      return <Badge variant="destructive">{t("videoHub.statuses.failed")}</Badge>;
    case "done":
      return <Badge className="bg-status-active text-white">{t("videoHub.statuses.done")}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

interface LanguageBadgeProps {
  language: string;
}

export function LanguageBadge({ language }: LanguageBadgeProps) {
  switch (language) {
    case "en":
      return <Badge variant="outline">EN</Badge>;
    case "es":
      return <Badge variant="outline">ES</Badge>;
    case "both":
      return (
        <div className="flex gap-1">
          <Badge variant="outline">EN</Badge>
          <Badge variant="outline">ES</Badge>
        </div>
      );
    default:
      return <Badge variant="outline">{language}</Badge>;
  }
}

interface FormatBadgeProps {
  format: string | null | undefined;
}

export function FormatBadge({ format }: FormatBadgeProps) {
  const { t } = useTranslation();
  const formatLabels: Record<string, string> = {
    "9:16": t("videoHub.formats.portrait"),
    "16:9": t("videoHub.formats.landscape"),
    "1:1": t("videoHub.formats.square"),
  };
  if (!format) return <Badge variant="outline">-</Badge>;
  return <Badge variant="secondary">{formatLabels[format] || format}</Badge>;
}

interface RenderProgressBadgeProps {
  render: VideoRender | null | undefined;
}

export const RenderProgressBadge = React.memo(function RenderProgressBadge({ render }: RenderProgressBadgeProps) {
  const { t } = useTranslation();
  
  if (!render) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }
  
  if (render.status === "queued") {
    return <Badge variant="secondary">⏳ {t("videoHub.statuses.queued")}</Badge>;
  }
  
  if (render.status === "running") {
    return (
      <div className="flex items-center gap-2 min-w-[100px]">
        <Progress value={render.progress} className="h-2 w-16" />
        <span className="text-xs text-muted-foreground">{render.progress}%</span>
      </div>
    );
  }
  
  if (render.status === "done") {
    return <Badge className="bg-status-active text-white">✓ {t("videoHub.statuses.done")}</Badge>;
  }
  
  if (render.status === "failed") {
    return <Badge variant="destructive">✗ {t("videoHub.statuses.failed")}</Badge>;
  }
  
  return null;
});
