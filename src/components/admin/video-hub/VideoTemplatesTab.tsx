import { useTranslation } from "react-i18next";
import { Layout, Lock, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVideoTemplates } from "@/hooks/useVideoTemplates";
import { Skeleton } from "@/components/ui/skeleton";

interface VideoTemplatesTabProps {
  onSelectTemplate: (templateId: string) => void;
}

export function VideoTemplatesTab({ onSelectTemplate }: VideoTemplatesTabProps) {
  const { t } = useTranslation();
  const { templates, isLoading } = useVideoTemplates();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layout className="h-5 w-5" />
            {t("videoHub.tabs.templates")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("videoHub.templates.description")}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates?.map((template) => (
          <Card key={template.id} className="flex flex-col overflow-hidden">
            {/* Thumbnail area */}
            <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-primary/5">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 shadow-lg">
                  <Play className="h-6 w-6 text-primary" />
                </div>
              </div>
              {template.is_locked && (
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    {t("videoHub.templates.locked")}
                  </Badge>
                </div>
              )}
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="text-base line-clamp-1">{template.name}</CardTitle>
              <CardDescription className="line-clamp-2">{template.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              <div className="space-y-3">
                {/* Formats */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("videoHub.projects.format")}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.allowed_formats?.map((format: string) => (
                      <Badge key={format} variant="outline" className="text-xs">
                        {format === "9:16" ? t("videoHub.formats.portrait") : format === "16:9" ? t("videoHub.formats.landscape") : t("videoHub.formats.square")}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Durations */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("videoHub.projects.duration")}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.allowed_durations?.map((duration: number) => (
                      <Badge key={duration} variant="secondary" className="text-xs">
                        {duration}s
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("videoHub.projects.language")}</p>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">EN</Badge>
                    <Badge variant="outline" className="text-xs">ES</Badge>
                  </div>
                </div>
              </div>
            </CardContent>

            <div className="p-4 pt-0">
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => onSelectTemplate(template.id)}
              >
                {t("videoHub.templates.useTemplate")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
