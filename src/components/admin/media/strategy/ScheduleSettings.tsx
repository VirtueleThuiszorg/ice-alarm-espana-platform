import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Save } from "lucide-react";
import { MediaScheduleSettings } from "@/hooks/useMediaStrategy";

interface ScheduleSettingsProps {
  settings: MediaScheduleSettings | null | undefined;
  isLoading: boolean;
  onSave: (data: Partial<Omit<MediaScheduleSettings, "id" | "created_at" | "updated_at">>) => Promise<void>;
  isSaving?: boolean;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = typeof DAYS[number];
type ActiveDaysMap = { [K in DayKey]: boolean };

export function ScheduleSettings({ settings, isLoading, onSave, isSaving }: ScheduleSettingsProps) {
  const { t } = useTranslation();
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [activeDays, setActiveDays] = useState<ActiveDaysMap>({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  });
  const [rules, setRules] = useState({
    goal_hours: 48,
    audience_hours: 24,
    topic_days: 7,
    no_consecutive_style: true,
  });
  const [autoPublish, setAutoPublish] = useState(false);

  useEffect(() => {
    if (settings) {
      setPostsPerDay(settings.posts_per_day);
      setActiveDays(settings.active_days);
      setRules(settings.anti_repetition_rules);
      setAutoPublish(settings.auto_publish_enabled ?? false);
    }
  }, [settings]);

  const handleSave = async () => {
    await onSave({
      posts_per_day: postsPerDay,
      active_days: activeDays,
      anti_repetition_rules: rules,
      auto_publish_enabled: autoPublish,
    });
  };

  const toggleDay = (day: DayKey) => {
    setActiveDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mediaStrategy.scheduleSettings")}</CardTitle>
        <CardDescription>{t("mediaStrategy.scheduleSettingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Posts Per Day */}
        <div className="space-y-3">
          <Label className="text-base">{t("mediaStrategy.postsPerDay")}</Label>
          <RadioGroup
            value={postsPerDay.toString()}
            onValueChange={(v) => setPostsPerDay(parseInt(v))}
            className="flex gap-4"
          >
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center space-x-2">
                <RadioGroupItem value={n.toString()} id={`ppd-${n}`} />
                <Label htmlFor={`ppd-${n}`} className="cursor-pointer">
                  {n} {t("mediaStrategy.postPerDay", { count: n })}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Active Days */}
        <div className="space-y-3">
          <Label className="text-base">{t("mediaStrategy.activeDays")}</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <Button
                key={day}
                type="button"
                variant={activeDays[day] ? "default" : "outline"}
                size="sm"
                onClick={() => toggleDay(day)}
                className="w-12"
              >
                {t(`mediaStrategy.days.${day}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Anti-Repetition Rules */}
        <div className="space-y-4">
          <Label className="text-base">{t("mediaStrategy.antiRepetitionRules")}</Label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-hours">{t("mediaStrategy.goalCooldown")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="goal-hours"
                  type="number"
                  min={0}
                  value={rules.goal_hours}
                  onChange={(e) => setRules((r) => ({ ...r, goal_hours: parseInt(e.target.value) || 0 }))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t("common.hours")}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience-hours">{t("mediaStrategy.audienceCooldown")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="audience-hours"
                  type="number"
                  min={0}
                  value={rules.audience_hours}
                  onChange={(e) => setRules((r) => ({ ...r, audience_hours: parseInt(e.target.value) || 0 }))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t("common.hours")}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-days">{t("mediaStrategy.topicCooldown")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="topic-days"
                  type="number"
                  min={0}
                  value={rules.topic_days}
                  onChange={(e) => setRules((r) => ({ ...r, topic_days: parseInt(e.target.value) || 0 }))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t("common.days")}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="no-consecutive-style">{t("mediaStrategy.noConsecutiveStyle")}</Label>
              <Switch
                id="no-consecutive-style"
                checked={rules.no_consecutive_style}
                onCheckedChange={(checked) => setRules((r) => ({ ...r, no_consecutive_style: checked }))}
              />
            </div>
          </div>
        </div>

        {/* Auto-Publish */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("mediaStrategy.autoPublish")}</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("mediaStrategy.autoPublishDesc")}
              </p>
            </div>
            <Switch
              checked={autoPublish}
              onCheckedChange={setAutoPublish}
            />
          </div>
          {autoPublish && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded text-xs text-yellow-700 dark:text-yellow-400">
              {t("mediaStrategy.autoPublishWarning")}
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.saveChanges")}
        </Button>
      </CardContent>
    </Card>
  );
}
