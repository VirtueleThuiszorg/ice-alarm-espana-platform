import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2,
  Check,
  Eye,
  Send,
  RefreshCw,
  Ban,
  CheckCircle,
  FileText,
  Facebook,
  Instagram,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { useScheduledContent, ScheduledContentItem } from "@/hooks/useScheduledContent";
import { ContentPreviewDialog } from "./ContentPreviewDialog";

export function ContentReviewSection() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<ScheduledContentItem | null>(null);

  const {
    items,
    isLoading,
    approveSlot,
    disableSlot,
    enableSlot,
    publishSlot,
    togglePublishTarget,
    isApproving,
    isPublishing,
  } = useScheduledContent("ready");

  // Filter to show only planned or ready items (not yet published)
  const reviewableItems = items.filter(
    (item) => item.status === "ready" || item.status === "generating"
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(reviewableItems.map((i) => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkApprove = async () => {
    await Promise.allSettled(Array.from(selectedIds).map((id) => approveSlot(id)));
    setSelectedIds(new Set());
  };

  const handleBulkPublish = async () => {
    const publishable = Array.from(selectedIds).filter((id) => {
      const item = reviewableItems.find((i) => i.id === id);
      return item?.is_approved && !item.is_disabled;
    });
    await Promise.allSettled(publishable.map((id) => publishSlot(id)));
    setSelectedIds(new Set());
  };

  const getStatusBadge = (item: ScheduledContentItem) => {
    if (item.is_disabled) {
      return <Badge variant="outline" className="bg-muted">{t("mediaStrategy.disabled")}</Badge>;
    }
    if (item.status === "generating") {
      return <Badge variant="secondary">{t("mediaStrategy.generating")}</Badge>;
    }
    if (item.is_approved) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{t("mediaStrategy.approved")}</Badge>;
    }
    return <Badge variant="outline">{t("mediaStrategy.pendingReview")}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("mediaStrategy.contentReview")}
            </CardTitle>
            <CardDescription>{t("mediaStrategy.contentReviewDescription")}</CardDescription>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={isApproving}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {t("mediaStrategy.approveSelected")} ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkPublish}
                  disabled={isPublishing}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  {t("mediaStrategy.publishSelected")}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reviewableItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("mediaStrategy.noContentToReview")}</p>
            <p className="text-sm">{t("mediaStrategy.generateContentFirst")}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === reviewableItems.length && reviewableItems.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>{t("mediaStrategy.dateTime")}</TableHead>
                  <TableHead>{t("mediaStrategy.topic")}</TableHead>
                  <TableHead>{t("mediaStrategy.goal")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("mediaStrategy.publishTo")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewableItems.map((item) => (
                  <TableRow key={item.id} className={item.is_disabled ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(checked) => handleSelect(item.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        <p>{format(parseISO(item.scheduled_date), "EEE, MMM d", { locale: dateLocale })}</p>
                        <p className="text-xs text-muted-foreground">{item.scheduled_time}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {item.topic?.name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.goal?.name || "-"}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(item)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={item.publish_to_blog ? "text-primary" : "text-muted-foreground"}
                          onClick={() => togglePublishTarget({ id: item.id, target: "publish_to_blog", value: !item.publish_to_blog })}
                          title={t("mediaStrategy.platforms.blog")}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={item.publish_to_facebook ? "text-blue-500" : "text-muted-foreground"}
                          onClick={() => togglePublishTarget({ id: item.id, target: "publish_to_facebook", value: !item.publish_to_facebook })}
                          title={t("mediaStrategy.platforms.facebook")}
                        >
                          <Facebook className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={item.publish_to_instagram ? "text-pink-500" : "text-muted-foreground"}
                          onClick={() => togglePublishTarget({ id: item.id, target: "publish_to_instagram", value: !item.publish_to_instagram })}
                          title={t("mediaStrategy.platforms.instagram")}
                          disabled
                        >
                          <Instagram className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewItem(item)}
                          title={t("common.preview")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!item.is_approved && !item.is_disabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => approveSlot(item.id)}
                            disabled={isApproving}
                            title={t("mediaStrategy.approve")}
                          >
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                        {item.is_disabled ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => enableSlot(item.id)}
                            title={t("mediaStrategy.enable")}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => disableSlot(item.id)}
                            title={t("mediaStrategy.disable")}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                        {item.is_approved && !item.is_disabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => publishSlot(item.id)}
                            disabled={isPublishing}
                            title={t("mediaStrategy.publishNow")}
                          >
                            <Send className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {previewItem && (
        <ContentPreviewDialog
          item={previewItem}
          open={!!previewItem}
          onOpenChange={(open) => !open && setPreviewItem(null)}
          onApprove={() => {
            approveSlot(previewItem.id);
            setPreviewItem(null);
          }}
          onDisable={() => {
            disableSlot(previewItem.id);
            setPreviewItem(null);
          }}
          onPublish={() => {
            publishSlot(previewItem.id);
            setPreviewItem(null);
          }}
          isApproving={isApproving}
          isPublishing={isPublishing}
        />
      )}
    </Card>
  );
}
