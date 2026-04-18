import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, History, ExternalLink, Filter, FileText, Facebook, Instagram } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { usePublishingHistory, HistoryFilters } from "@/hooks/usePublishingHistory";
import { useMediaGoals, useMediaAudiences } from "@/hooks/useMediaStrategy";

export function PublishingHistorySection() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const [filters, setFilters] = useState<HistoryFilters>({
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const { items, isLoading, stats } = usePublishingHistory(filters);
  const { goals } = useMediaGoals();
  const { audiences } = useMediaAudiences();

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "blog":
        return <FileText className="h-4 w-4" />;
      case "facebook":
        return <Facebook className="h-4 w-4 text-blue-500" />;
      case "instagram":
        return <Instagram className="h-4 w-4 text-pink-500" />;
      default:
        return null;
    }
  };

  const getPlatformLink = (platform: string, externalId: string | null) => {
    if (!externalId) return null;
    switch (platform) {
      case "blog":
        return `https://icealarm.es/blog/${externalId}`;
      case "facebook":
        return `https://facebook.com/${externalId}`;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("mediaStrategy.publishingHistory")}
            </CardTitle>
            <CardDescription>{t("mediaStrategy.publishingHistoryDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.totalPublished")}</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{stats.blogPosts}</p>
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.blogPosts")}</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{stats.facebookPosts}</p>
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.facebookPosts")}</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{stats.instagramPosts}</p>
            <p className="text-xs text-muted-foreground">{t("mediaStrategy.instagramPosts")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("common.filters")}</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("mediaStrategy.startDate")}</Label>
            <Input
              type="date"
              value={filters.startDate || ""}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-36 h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("mediaStrategy.endDate")}</Label>
            <Input
              type="date"
              value={filters.endDate || ""}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-36 h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("mediaStrategy.goal")}</Label>
            <Select
              value={filters.goalId || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, goalId: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("mediaStrategy.audience")}</Label>
            <Select
              value={filters.audienceId || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, audienceId: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {audiences.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("mediaStrategy.platform")}</Label>
            <Select
              value={filters.platform || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, platform: v === "all" ? undefined : v as any }))}
            >
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="blog">{t("mediaStrategy.platforms.blog")}</SelectItem>
                <SelectItem value="facebook">{t("mediaStrategy.platforms.facebook")}</SelectItem>
                <SelectItem value="instagram">{t("mediaStrategy.platforms.instagram")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* History Table */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("mediaStrategy.noPublishingHistory")}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("mediaStrategy.publishedAt")}</TableHead>
                  <TableHead>{t("mediaStrategy.platform")}</TableHead>
                  <TableHead>{t("mediaStrategy.goal")}</TableHead>
                  <TableHead>{t("mediaStrategy.audience")}</TableHead>
                  <TableHead>{t("mediaStrategy.topic")}</TableHead>
                  <TableHead>{t("mediaStrategy.imageStyle")}</TableHead>
                  <TableHead className="text-right">{t("common.link")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const link = getPlatformLink(item.platform, item.external_post_id);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{format(parseISO(item.published_at), "MMM d, yyyy", { locale: dateLocale })}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(item.published_at), "HH:mm", { locale: dateLocale })}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {getPlatformIcon(item.platform)}
                          {t(`mediaStrategy.platforms.${item.platform}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.goal?.name || "-"}</Badge>
                      </TableCell>
                      <TableCell>{item.audience?.name || "-"}</TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {item.topic?.name || "-"}
                      </TableCell>
                      <TableCell>{item.image_style?.name || "-"}</TableCell>
                      <TableCell className="text-right">
                        {link && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                          >
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
