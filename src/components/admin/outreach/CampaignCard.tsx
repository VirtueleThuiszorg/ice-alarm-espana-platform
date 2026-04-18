import { useTranslation } from "react-i18next";
import { Campaign } from "@/hooks/useOutreachCampaigns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause, 
  Pencil, 
  Trash2, 
  Users, 
  Mail, 
  MessageSquare, 
  CheckCircle,
  Globe,
  Target,
  Calendar,
  MoreVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CampaignCardProps {
  campaign: Campaign;
  onEdit: (campaign: Campaign) => void;
  onDelete: (campaign: Campaign) => void;
  onToggleStatus: (campaign: Campaign) => void;
  isUpdating?: boolean;
}

export function CampaignCard({ 
  campaign, 
  onEdit, 
  onDelete, 
  onToggleStatus,
  isUpdating 
}: CampaignCardProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;

  const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ReactNode }> = {
    active: { 
      color: "text-green-700 dark:text-green-400", 
      bgColor: "bg-green-100 dark:bg-green-900/30",
      icon: <Play className="h-3 w-3" />
    },
    paused: { 
      color: "text-amber-700 dark:text-amber-400", 
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      icon: <Pause className="h-3 w-3" />
    },
    draft: { 
      color: "text-muted-foreground", 
      bgColor: "bg-muted",
      icon: <Pencil className="h-3 w-3" />
    },
    completed: { 
      color: "text-blue-700 dark:text-blue-400", 
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      icon: <CheckCircle className="h-3 w-3" />
    },
  };

  const status = statusConfig[campaign.status || "draft"] || statusConfig.draft;

  const stats = [
    { label: t("outreach.campaigns.stats.leads"), value: campaign.leads_count, icon: Users },
    { label: t("outreach.campaigns.stats.sent"), value: campaign.emails_sent, icon: Mail },
    { label: t("outreach.campaigns.stats.replies"), value: campaign.replies_count, icon: MessageSquare },
    { label: t("outreach.campaigns.stats.conversions"), value: campaign.conversions_count, icon: CheckCircle },
  ];

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      campaign.status === "paused" && "opacity-75"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate">{campaign.name}</h3>
              <Badge 
                variant="outline" 
                className={cn("flex items-center gap-1", status.color, status.bgColor)}
              >
                {status.icon}
                {t(`outreach.campaigns.status.${campaign.status}`)}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {campaign.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onToggleStatus(campaign)}
                    disabled={isUpdating}
                  >
                    {campaign.status === "active" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {campaign.status === "active" 
                    ? t("outreach.campaigns.pause")
                    : t("outreach.campaigns.activate")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(campaign)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleStatus(campaign)}>
                  {campaign.status === "active" ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      {t("outreach.campaigns.pause")}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {t("outreach.campaigns.activate")}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(campaign)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div 
              key={stat.label} 
              className="flex flex-col items-center p-2 rounded-lg bg-muted/50"
            >
              <stat.icon className="h-4 w-4 text-muted-foreground mb-1" />
              <span className="text-lg font-semibold">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Campaign Details */}
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            {t(`outreach.leads.pipeline.${campaign.pipeline_type}`)}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            {t(`common.languages.${campaign.default_language}`)}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            {t(`outreach.campaigns.tones.${campaign.email_tone}`)}
          </Badge>
          {campaign.follow_up_enabled && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {campaign.max_emails_per_lead}x {t("outreach.campaigns.followUps")}
            </Badge>
          )}
        </div>

        {/* Target Locations */}
        {campaign.target_locations && campaign.target_locations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {campaign.target_locations.slice(0, 3).map((location, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {location}
              </Badge>
            ))}
            {campaign.target_locations.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{campaign.target_locations.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {t("common.created")}: {format(new Date(campaign.created_at), "dd MMM yyyy", { locale: dateLocale })}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => onEdit(campaign)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            {t("common.edit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
