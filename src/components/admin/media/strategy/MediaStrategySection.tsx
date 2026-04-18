import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Users, MessageSquare, Image, Settings, Calendar, FileText, History } from "lucide-react";
import { useMediaGoals, useMediaAudiences, useMediaTopics, useMediaImageStyles, useMediaScheduleSettings } from "@/hooks/useMediaStrategy";
import { StrategyItemList } from "./StrategyItemList";
import { TopicsList } from "./TopicsList";
import { ScheduleSettings } from "./ScheduleSettings";
import { ContentPlanner } from "./ContentPlanner";
import { ContentReviewSection } from "./ContentReviewSection";
import { PublishingHistorySection } from "./PublishingHistorySection";
import { LeadInsightsCard } from "./LeadInsightsCard";

export function MediaStrategySection() {
  const { t } = useTranslation();

  // Data hooks
  const {
    goals,
    isLoading: isLoadingGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    isCreating: isCreatingGoal,
    isUpdating: isUpdatingGoal,
  } = useMediaGoals();

  const {
    audiences,
    isLoading: isLoadingAudiences,
    createAudience,
    updateAudience,
    deleteAudience,
    isCreating: isCreatingAudience,
    isUpdating: isUpdatingAudience,
  } = useMediaAudiences();

  const {
    topics,
    isLoading: isLoadingTopics,
    createTopic,
    updateTopic,
    deleteTopic,
    isCreating: isCreatingTopic,
    isUpdating: isUpdatingTopic,
  } = useMediaTopics();

  const {
    imageStyles,
    isLoading: isLoadingStyles,
    createImageStyle,
    updateImageStyle,
    deleteImageStyle,
    isCreating: isCreatingStyle,
    isUpdating: isUpdatingStyle,
  } = useMediaImageStyles();

  const {
    settings: scheduleSettings,
    isLoading: isLoadingSettings,
    updateSettings,
    isUpdating: isUpdatingSettings,
  } = useMediaScheduleSettings();

  return (
    <Tabs defaultValue="goals" className="space-y-4">
      <TabsList className="flex w-full overflow-x-auto lg:w-auto lg:inline-grid lg:grid-cols-8">
        <TabsTrigger value="goals" className="gap-2">
          <Target className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.goals")}</span>
        </TabsTrigger>
        <TabsTrigger value="audiences" className="gap-2">
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.audiences")}</span>
        </TabsTrigger>
        <TabsTrigger value="topics" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.topics")}</span>
        </TabsTrigger>
        <TabsTrigger value="styles" className="gap-2">
          <Image className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.imageStyles")}</span>
        </TabsTrigger>
        <TabsTrigger value="schedule" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.schedule")}</span>
        </TabsTrigger>
        <TabsTrigger value="planner" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.planner")}</span>
        </TabsTrigger>
        <TabsTrigger value="review" className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.review")}</span>
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2">
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">{t("mediaStrategy.history")}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="goals">
        <StrategyItemList
          title={t("mediaStrategy.goals")}
          description={t("mediaStrategy.goalsDescription")}
          items={goals}
          isLoading={isLoadingGoals}
          onCreate={createGoal}
          onUpdate={updateGoal}
          onDelete={deleteGoal}
          isCreating={isCreatingGoal}
          isUpdating={isUpdatingGoal}
        />
      </TabsContent>

      <TabsContent value="audiences">
        <StrategyItemList
          title={t("mediaStrategy.audiences")}
          description={t("mediaStrategy.audiencesDescription")}
          items={audiences}
          isLoading={isLoadingAudiences}
          onCreate={createAudience}
          onUpdate={updateAudience}
          onDelete={deleteAudience}
          isCreating={isCreatingAudience}
          isUpdating={isUpdatingAudience}
        />
      </TabsContent>

      <TabsContent value="topics" className="space-y-4">
        <LeadInsightsCard />
        <TopicsList
          topics={topics}
          goals={goals}
          isLoading={isLoadingTopics}
          onCreate={createTopic}
          onUpdate={updateTopic}
          onDelete={deleteTopic}
          isCreating={isCreatingTopic}
          isUpdating={isUpdatingTopic}
        />
      </TabsContent>

      <TabsContent value="styles">
        <StrategyItemList
          title={t("mediaStrategy.imageStyles")}
          description={t("mediaStrategy.imageStylesDescription")}
          items={imageStyles}
          isLoading={isLoadingStyles}
          onCreate={createImageStyle}
          onUpdate={updateImageStyle}
          onDelete={deleteImageStyle}
          isCreating={isCreatingStyle}
          isUpdating={isUpdatingStyle}
          showAiPrompt
          requireDescription
        />
      </TabsContent>

      <TabsContent value="schedule">
        <ScheduleSettings
          settings={scheduleSettings}
          isLoading={isLoadingSettings}
          onSave={updateSettings}
          isSaving={isUpdatingSettings}
        />
      </TabsContent>

      <TabsContent value="planner">
        <ContentPlanner
          goals={goals}
          audiences={audiences}
          topics={topics}
          imageStyles={imageStyles}
          scheduleSettings={scheduleSettings}
        />
      </TabsContent>

      <TabsContent value="review">
        <ContentReviewSection />
      </TabsContent>

      <TabsContent value="history">
        <PublishingHistorySection />
      </TabsContent>
    </Tabs>
  );
}
