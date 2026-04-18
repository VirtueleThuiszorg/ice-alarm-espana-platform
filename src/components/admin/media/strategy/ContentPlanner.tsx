import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Loader2, Wand2, Trash2, AlertCircle, Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { format, addDays, parseISO } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { useContentCalendar } from "@/hooks/useContentCalendar";
import { useScheduledContent } from "@/hooks/useScheduledContent";
import { MediaGoal, MediaAudience, MediaTopic, MediaImageStyle, MediaScheduleSettings } from "@/hooks/useMediaStrategy";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ContentPlannerProps {
  goals: MediaGoal[];
  audiences: MediaAudience[];
  topics: MediaTopic[];
  imageStyles: MediaImageStyle[];
  scheduleSettings: MediaScheduleSettings | null | undefined;
}

interface PlannedSlot {
  scheduled_date: string;
  scheduled_time: string;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
  social_post_id: string | null;
  notes: string | null;
  status: "planned";
}

export function ContentPlanner({
  goals,
  audiences,
  topics,
  imageStyles,
  scheduleSettings,
}: ContentPlannerProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<PlannedSlot[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const { items, isLoading, bulkInsert, clearCalendar, isBulkInserting, isClearing } = useContentCalendar(startDate, endDate);
  const { generateContent, isGenerating: isGeneratingContent } = useScheduledContent();

  const activeGoals = goals.filter((g) => g.is_active);
  const activeAudiences = audiences.filter((a) => a.is_active);
  const activeTopics = topics.filter((t) => t.is_active);
  const activeStyles = imageStyles.filter((s) => s.is_active);

  // AI-powered calendar generation
  const generatePlan = async () => {
    if (!scheduleSettings) {
      toast({ title: t("common.error"), description: t("mediaStrategy.errors.configureSettingsFirst"), variant: "destructive" });
      return;
    }

    if (activeGoals.length === 0 || activeAudiences.length === 0 || activeStyles.length === 0) {
      toast({ title: t("common.error"), description: t("mediaStrategy.errors.addGoalsAudiencesStyles"), variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setPreview([]);

    try {
      // Call AI to generate the plan
      const { data, error } = await supabase.functions.invoke("generate-content-plan", {
        body: {
          start_date: startDate,
          end_date: endDate,
          posts_per_day: scheduleSettings.posts_per_day,
          active_days: scheduleSettings.active_days,
          anti_repetition_rules: scheduleSettings.anti_repetition_rules,
          goals: activeGoals.map((g) => ({ id: g.id, name: g.name })),
          audiences: activeAudiences.map((a) => ({ id: a.id, name: a.name })),
          topics: activeTopics.map((t) => ({ id: t.id, name: t.name, goal_ids: t.goal_ids })),
          image_styles: activeStyles.map((s) => ({ id: s.id, name: s.name })),
        },
      });

      if (error) throw error;

      if (data?.plan) {
        setPreview(data.plan);
        toast({ title: t("mediaStrategy.planGenerated"), description: t("mediaStrategy.postsPlanned", { count: data.plan.length }) });
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
      toast({ title: t("mediaStrategy.generationFailed"), description: err instanceof Error ? err.message : t("mediaStrategy.errors.unknownError"), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Save preview to database
  const savePlan = async () => {
    if (preview.length === 0) return;

    try {
      await bulkInsert(preview);
      setPreview([]);
    } catch (err) {
      console.error("Failed to save plan:", err);
    }
  };

  // Clear and regenerate
  const handleClearCalendar = () => {
    setClearConfirmOpen(true);
  };

  const handleConfirmClear = async () => {
    await clearCalendar({ start: startDate, end: endDate });
    setPreview([]);
    setSelectedIds(new Set());
    setClearConfirmOpen(false);
  };

  const handleSelectSlot = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const plannedItems = items.filter((i) => i.status === "planned");
      setSelectedIds(new Set(plannedItems.map((i) => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleGenerateContent = async () => {
    if (selectedIds.size === 0) {
      toast({ title: t("mediaStrategy.selectSlots"), description: t("mediaStrategy.selectSlotsToGenerate"), variant: "destructive" });
      return;
    }
    await generateContent(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const goalsMap = new Map(goals.map((g) => [g.id, g]));
  const audiencesMap = new Map(audiences.map((a) => [a.id, a]));
  const topicsMap = new Map(topics.map((t) => [t.id, t]));
  const stylesMap = new Map(imageStyles.map((s) => [s.id, s]));

  const displayItems = preview.length > 0 ? preview : items;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("mediaStrategy.contentPlanner")}
            </CardTitle>
            <CardDescription>{t("mediaStrategy.contentPlannerDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range & Controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>{t("mediaStrategy.startDate")}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("mediaStrategy.endDate")}</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={generatePlan} disabled={isGenerating} className="gap-2">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {t("mediaStrategy.generatePlan")}
          </Button>
          {preview.length > 0 && (
            <Button onClick={savePlan} disabled={isBulkInserting} variant="default">
              {isBulkInserting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("mediaStrategy.savePlan")} ({preview.length})
            </Button>
          )}
          {items.length > 0 && preview.length === 0 && (
            <>
              <Button onClick={handleClearCalendar} disabled={isClearing} variant="outline" className="text-destructive">
                {isClearing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {t("mediaStrategy.clearCalendar")}
              </Button>
              {selectedIds.size > 0 && (
                <Button onClick={handleGenerateContent} disabled={isGeneratingContent} className="gap-2">
                  {isGeneratingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t("mediaStrategy.generateContent")} ({selectedIds.size})
                </Button>
              )}
            </>
          )}
        </div>

        {/* Status Info */}
        {preview.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm">{t("mediaStrategy.previewMode")}</span>
          </div>
        )}

        {/* Calendar Table */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t("mediaStrategy.noPlannedContent")}</p>
            <p className="text-sm">{t("mediaStrategy.clickGenerateToPlan")}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.length === 0 && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size > 0 && selectedIds.size === items.filter((i) => i.status === "planned").length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>{t("mediaStrategy.dateTime")}</TableHead>
                  <TableHead>{t("mediaStrategy.goal")}</TableHead>
                  <TableHead>{t("mediaStrategy.audience")}</TableHead>
                  <TableHead>{t("mediaStrategy.topic")}</TableHead>
                  <TableHead>{t("mediaStrategy.imageStyle")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item, idx) => {
                  const goal = item.goal_id ? goalsMap.get(item.goal_id) : null;
                  const audience = item.audience_id ? audiencesMap.get(item.audience_id) : null;
                  const topic = item.topic_id ? topicsMap.get(item.topic_id) : null;
                  const style = item.image_style_id ? stylesMap.get(item.image_style_id) : null;
                  const isPlannedItem = "id" in item && item.status === "planned";

                  return (
                    <TableRow key={"id" in item ? item.id : `preview-${idx}`}>
                      {preview.length === 0 && (
                        <TableCell>
                          {isPlannedItem && "id" in item && (
                            <Checkbox
                              checked={selectedIds.has(item.id)}
                              onCheckedChange={(checked) => handleSelectSlot(item.id, !!checked)}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div>
                          <p>{format(parseISO(item.scheduled_date), "EEE, MMM d", { locale: dateLocale })}</p>
                          <p className="text-xs text-muted-foreground">{item.scheduled_time}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{goal?.name || "-"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{audience?.name || "-"}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {topic?.name || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5">
                          {style?.name || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "published"
                              ? "default"
                              : item.status === "ready"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {t(`mediaStrategy.calendarStatus.${item.status}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t("mediaStrategy.clearCalendar")}
        description={t("mediaStrategy.clearCalendarConfirm")}
        onConfirm={handleConfirmClear}
        destructive
        confirmLabel={t("mediaStrategy.clearCalendar")}
      />
    </Card>
  );
}
