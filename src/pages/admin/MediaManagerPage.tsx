import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Check, Send, Search, Sparkles, Image as ImageIcon, Play, Trash2, Edit, Eye, RefreshCw, AlertCircle, Wand2, Settings, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { useSocialPosts, useSocialPost, SocialPost, SocialPostStatus, CreateSocialPostData } from "@/hooks/useSocialPosts";
import { useSocialPostImages } from "@/hooks/useSocialPostImages";
import { useMediaDraft, MediaDraftOutput } from "@/hooks/useMediaDraft";
import { useBrandedImageGenerator } from "@/hooks/useBrandedImageGenerator";
import { useAIImageGenerator, IMAGE_STYLE_OPTIONS, ImageStyle } from "@/hooks/useAIImageGenerator";
import { useApprovedPosts, usePostMetrics } from "@/hooks/usePostMetrics";
import { checkPostCompliance, ComplianceWarning } from "@/lib/complianceChecker";
import { ComplianceWarningDialog } from "@/components/admin/media/ComplianceWarningDialog";
import { PostMetricsBar } from "@/components/admin/media/PostMetricsBar";
import { ReadyToPublishSection } from "@/components/admin/media/ReadyToPublishSection";
import { PostPreviewDialog } from "@/components/admin/media/PostPreviewDialog";
import { PublishedPostsSection } from "@/components/admin/media/PublishedPostsSection";
import { MediaStrategySection } from "@/components/admin/media/strategy/MediaStrategySection";
import { MediaHelpDialog } from "@/components/admin/media/MediaHelpDialog";
import { PartnerDistributionSection } from "@/components/admin/media/PartnerDistributionSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
const GOAL_VALUES = ["brand_awareness", "lead_generation", "engagement", "education", "promotion"] as const;
const AUDIENCE_VALUES = ["expats_spain", "elderly_care", "family_caregivers", "healthcare_pros", "general"] as const;
const LANGUAGE_VALUES = ["en", "es", "both"] as const;

const STATUS_COLORS: Record<SocialPostStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-status-active/10 text-status-active border-status-active/20",
  published: "bg-primary/10 text-primary border-primary/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function MediaManagerPage() {
  const { t, i18n } = useTranslation();
  const [mainTab, setMainTab] = useState<"posts" | "strategy">("posts");
  const [statusFilter, setStatusFilter] = useState<SocialPostStatus | "all">("all");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);
  const [publishingFromQueue, setPublishingFromQueue] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  
  // Form state
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState<"en" | "es" | "both">("both");
  const [postText, setPostText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [aiOutput, setAiOutput] = useState<MediaDraftOutput | null>(null);
  const [complianceWarnings, setComplianceWarnings] = useState<ComplianceWarning[]>([]);
  const [showComplianceDialog, setShowComplianceDialog] = useState(false);
  const [imageStyle, setImageStyle] = useState<ImageStyle>("senior_active");
  // Partner distribution state (derived: partner_enabled = audience !== "none")
  const [partnerAudience, setPartnerAudience] = useState<"none" | "all" | "selected">("none");
  const [partnerSelectedIds, setPartnerSelectedIds] = useState<string[]>([]);

  const { posts, isLoading, createDraft, updateDraft, approvePost, retryPost, publishPost, deletePost, isCreating, isUpdating, isApproving, isRetrying, isPublishing } = useSocialPosts(statusFilter);
  const { data: selectedPost } = useSocialPost(selectedPostId);
  const { uploadImage, isUploading } = useSocialPostImages();
  const { generateDraft, isGenerating } = useMediaDraft();
  const { generateImage: generateBrandedImage, isGenerating: isGeneratingBrandedImage } = useBrandedImageGenerator();
  const { generateImage: generateAIImage, isGenerating: isGeneratingAIImage } = useAIImageGenerator();
  
  // Ready to Publish data
  const { data: approvedPosts = [], isLoading: isLoadingApproved } = useApprovedPosts();
  const { data: metrics, isLoading: isLoadingMetrics } = usePostMetrics();

  // Load selected post into form
  const handleSelectPost = (post: SocialPost) => {
    setSelectedPostId(post.id);
    setGoal(post.goal || "");
    setAudience(post.target_audience || "");
    setTopic(post.topic || "");
    setLanguage(post.language);
    setPostText(post.post_text || "");
    setImageUrl(post.image_url || "");
    // Partner distribution - derive audience from post data
    const derivedAudience = post.partner_enabled 
      ? (post.partner_audience || "all") 
      : "none";
    setPartnerAudience(derivedAudience as "none" | "all" | "selected");
    setPartnerSelectedIds(post.partner_selected_partner_ids || []);
  };

  const handleClearForm = () => {
    setSelectedPostId(null);
    setGoal("");
    setAudience("");
    setTopic("");
    setLanguage("both");
    setPostText("");
    setImageUrl("");
    // Reset partner distribution
    setPartnerAudience("none");
    setPartnerSelectedIds([]);
  };

  const handleSaveDraft = async () => {
    try {
      const data: CreateSocialPostData = {
        goal: goal || undefined,
        target_audience: audience || undefined,
        topic: topic || undefined,
        language,
        post_text: postText || undefined,
        image_url: imageUrl || undefined,
        // Partner distribution - derive enabled from audience
        partner_enabled: partnerAudience !== "none",
        partner_audience: partnerAudience,
        partner_selected_partner_ids: partnerAudience === "selected" ? partnerSelectedIds : undefined,
      };

      if (selectedPostId) {
        await updateDraft({ id: selectedPostId, data });
      } else {
        const newPost = await createDraft(data);
        setSelectedPostId(newPost.id);
      }
    } catch (error) {
      console.error("Save draft error:", error);
    }
  };

  const handleApprove = async () => {
    if (!selectedPostId) return;
    
    // Check compliance before approving
    const result = checkPostCompliance(postText);
    
    if (!result.isCompliant) {
      // Show warning dialog
      setComplianceWarnings(result.warnings);
      setShowComplianceDialog(true);
      return;
    }
    
    // Compliant - proceed with approval
    await approvePost(selectedPostId);
  };

  const handleForceApprove = async () => {
    if (selectedPostId) {
      await approvePost(selectedPostId);
      setShowComplianceDialog(false);
      setComplianceWarnings([]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadImage(file);
      if (url) setImageUrl(url);
    } catch (error) {
      console.error("Image upload error:", error);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    await deletePost(deleteTargetId);
    if (selectedPostId === deleteTargetId) handleClearForm();
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  // AI workflow handlers
  const handleResearch = async () => {
    try {
      const output = await generateDraft({
        topic,
        goal,
        target_audience: audience,
        language,
        post_id: selectedPostId || undefined,
        workflow_type: "research",
      });
      if (output) {
        setAiOutput(output);
      }
    } catch (error) {
      console.error("Research error:", error);
    }
  };

  // Helper: apply AI output to post text based on selected language
  const applyAIOutput = (output: MediaDraftOutput) => {
    setAiOutput(output);
    if (language === "en") {
      setPostText(output.post_en);
    } else if (language === "es") {
      setPostText(output.post_es);
    } else {
      setPostText(`🇬🇧 ENGLISH:\n${output.post_en}\n\n---\n\n🇪🇸 ESPAÑOL:\n${output.post_es}`);
    }
  };

  const handleWriteDraft = async () => {
    try {
      const output = await generateDraft({
        topic,
        goal,
        target_audience: audience,
        language,
        post_id: selectedPostId || undefined,
        workflow_type: "write",
      });
      if (output) applyAIOutput(output);
    } catch (error) {
      console.error("Write draft error:", error);
    }
  };

  const handleFullWorkflow = async () => {
    try {
      const output = await generateDraft({
        topic,
        goal,
        target_audience: audience,
        language,
        post_id: selectedPostId || undefined,
        workflow_type: "full",
      });
      if (output) applyAIOutput(output);
    } catch (error) {
      console.error("Full workflow error:", error);
    }
  };

  // Ready to Publish handlers
  const handlePublishFromQueue = async (postId: string) => {
    setPublishingFromQueue(postId);
    try {
      await publishPost(postId);
    } finally {
      setPublishingFromQueue(null);
    }
  };

  const handlePublishFromPreview = async () => {
    if (!previewPost) return;
    setPublishingFromQueue(previewPost.id);
    try {
      await publishPost(previewPost.id);
      setPreviewPost(null);
    } finally {
      setPublishingFromQueue(null);
    }
  };

  const handleRetryFromPreview = async () => {
    if (!previewPost) return;
    await retryPost(previewPost.id);
    setPreviewPost(null);
  };

  const handleEditFromPreview = () => {
    if (!previewPost) return;
    handleSelectPost(previewPost);
    setPreviewPost(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("mediaManager.title")}</h1>
          <p className="text-muted-foreground">{t("mediaManager.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            {t("mediaManager.help.howToUse")}
          </Button>
          <Button
            variant={mainTab === "posts" ? "default" : "outline"}
            onClick={() => setMainTab("posts")}
          >
            {t("mediaManager.statuses.all")}
          </Button>
          <Button
            variant={mainTab === "strategy" ? "default" : "outline"}
            onClick={() => setMainTab("strategy")}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            {t("mediaStrategy.schedule")}
          </Button>
        </div>
      </div>

      <MediaHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {mainTab === "strategy" ? (
        <MediaStrategySection />
      ) : (
        <>
          {/* Post Metrics Bar */}
          <PostMetricsBar metrics={metrics} isLoading={isLoadingMetrics} />

          {/* Ready to Publish Section */}
          <ReadyToPublishSection
            posts={approvedPosts}
            isLoading={isLoadingApproved}
            onPreview={setPreviewPost}
            onPublish={handlePublishFromQueue}
            publishingId={publishingFromQueue}
          />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Create/Edit Draft */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selectedPostId ? t("mediaManager.editDraft") : t("mediaManager.createDraft")}</span>
              {selectedPostId && (
                <Button variant="ghost" size="sm" onClick={handleClearForm}>
                  {t("mediaManager.newDraft")}
                </Button>
              )}
            </CardTitle>
            <CardDescription>{t("mediaManager.configureParams")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("mediaManager.goal")}</Label>
                <Select value={goal} onValueChange={setGoal}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("mediaManager.selectGoal")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {GOAL_VALUES.map((g) => (
                      <SelectItem key={g} value={g}>{t(`mediaManager.goals.${g}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("mediaManager.targetAudience")}</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("mediaManager.selectAudience")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {AUDIENCE_VALUES.map((a) => (
                      <SelectItem key={a} value={a}>{t(`mediaManager.audiences.${a}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("mediaManager.topic")}</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("mediaManager.topicPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("mediaManager.language")}</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "es" | "both")}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {LANGUAGE_VALUES.map((l) => (
                    <SelectItem key={l} value={l}>{t(`mediaManager.languages.${l}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button 
                variant="outline" 
                disabled={isGenerating || !topic}
                onClick={handleResearch}
                className="gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t("mediaManager.research")}
              </Button>
              <Button 
                variant="outline" 
                disabled={isGenerating || !topic}
                onClick={handleWriteDraft}
                className="gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t("mediaManager.writeDraft")}
              </Button>
              <Button 
                variant="outline" 
                disabled={isGeneratingBrandedImage || !aiOutput?.image_text}
                onClick={async () => {
                  if (!aiOutput?.image_text) {
                    return;
                  }
                  const url = await generateBrandedImage({
                    imageText: {
                      headline: aiOutput.image_text.headline,
                      subheadline: aiOutput.image_text.subheadline,
                      cta: aiOutput.image_text.cta || t("common.learnMore"),
                    },
                  });
                  if (url) {
                    setImageUrl(url);
                  }
                }}
                className="gap-2"
                title={!aiOutput?.image_text ? t("mediaManager.runAIFirst") : t("mediaManager.generateBrandedImage")}
              >
                {isGeneratingBrandedImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {t("mediaManager.quickBrandImage")}
              </Button>
              <Button 
                variant="outline" 
                disabled={isGenerating || !topic}
                onClick={handleFullWorkflow}
                className="gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("mediaManager.fullWorkflow")}
              </Button>
            </div>

            {/* AI Image Generation Section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <Label className="text-sm font-medium">{t("mediaManager.aiImageGeneration")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={imageStyle} onValueChange={(v) => setImageStyle(v as ImageStyle)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("mediaManager.selectImageStyle")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {IMAGE_STYLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  disabled={isGeneratingAIImage || (!topic && imageStyle !== "from_post_text") || (imageStyle === "from_post_text" && !postText)}
                  onClick={async () => {
                    const url = await generateAIImage({
                      style: imageStyle,
                      topic,
                      imageText: aiOutput?.image_text,
                      postId: selectedPostId || undefined,
                      postText: imageStyle === "from_post_text" ? postText : undefined,
                    });
                    if (url) {
                      setImageUrl(url);
                    }
                  }}
                  className="gap-2"
                  title={imageStyle === "from_post_text" && !postText ? t("mediaManager.generatePostTextFirst") : undefined}
                >
                  {isGeneratingAIImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {t("mediaManager.generateAIImage")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("mediaManager.aiImageDescription")}
              </p>
            </div>

            {/* AI Output Preview */}
            {aiOutput && (
              <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("mediaManager.aiResearchSummary")}</p>
                <p className="text-sm">{aiOutput.research.topic_insights}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {aiOutput.hashtags_en.slice(0, 5).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
                {aiOutput.image_text && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">{t("mediaManager.suggestedImageText")}</p>
                    <p className="text-sm font-semibold">{aiOutput.image_text.headline}</p>
                    <p className="text-xs text-muted-foreground">{aiOutput.image_text.subheadline}</p>
                  </div>
                )}
              </div>
            )}

            {!topic && (
              <p className="text-xs text-muted-foreground text-center">
                {t("mediaManager.enterTopicToEnable")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Draft Preview */}
        <Card>
          <CardHeader>
            <CardTitle>{t("mediaManager.draftPreview")}</CardTitle>
            <CardDescription>{t("mediaManager.previewSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("mediaManager.postText")}</Label>
              <Textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={t("mediaManager.postTextPlaceholder")}
                rows={6}
              />
              <p className="text-xs text-muted-foreground text-right">
                {postText.length.toLocaleString(i18n.language)} / {(63206).toLocaleString(i18n.language)} {t("mediaManager.characters")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("mediaManager.image")}</Label>
              {imageUrl ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
                  <img src={imageUrl} alt="Post preview" className="w-full h-full object-cover" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={() => setImageUrl("")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                    disabled={isUploading}
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    {isUploading ? (
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    )}
                    <p className="text-sm text-muted-foreground">
                      {isUploading ? t("common.uploading") : t("mediaManager.clickToUpload")}
                    </p>
                  </label>
                </div>
              )}
            </div>

            {/* Partner Distribution Section */}
            <PartnerDistributionSection
              audience={partnerAudience}
              selectedPartnerIds={partnerSelectedIds}
              onAudienceChange={setPartnerAudience}
              onSelectedPartnersChange={setPartnerSelectedIds}
              disabled={selectedPost?.status === "published"}
            />

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSaveDraft}
                disabled={isCreating || isUpdating}
                className="flex-1 gap-2"
              >
                {isCreating || isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("mediaManager.saveDraft")}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={!selectedPostId || isApproving || selectedPost?.status === "approved"}
                variant="secondary"
                className="gap-2"
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t("mediaManager.approve")}
              </Button>
              <Button
                onClick={async () => {
                  if (selectedPostId) {
                    await publishPost(selectedPostId);
                  }
                }}
                disabled={!selectedPostId || isPublishing || selectedPost?.status !== "approved"}
                variant="outline"
                className="gap-2"
                title={selectedPost?.status !== "approved" ? t("mediaManager.mustBeApproved") : t("mediaManager.publishToFacebook")}
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("mediaManager.publish")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section - Drafts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("mediaManager.existingPosts")}</CardTitle>
              <CardDescription>{t("mediaManager.existingPostsSubtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as SocialPostStatus | "all")}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">{t("mediaManager.statuses.all")}</TabsTrigger>
              <TabsTrigger value="draft">{t("mediaManager.statuses.drafts")}</TabsTrigger>
              <TabsTrigger value="approved">{t("mediaManager.statuses.approved")}</TabsTrigger>
              <TabsTrigger value="published">{t("mediaManager.statuses.published")}</TabsTrigger>
              <TabsTrigger value="failed">{t("mediaManager.statuses.failed")}</TabsTrigger>
            </TabsList>

            {/* Show PublishedPostsSection for Published tab, regular table for others */}
            {statusFilter === "published" ? (
              <TabsContent value="published" className="mt-0">
                <PublishedPostsSection />
              </TabsContent>
            ) : (
              <TabsContent value={statusFilter} className="mt-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t("mediaManager.noPostsFound")}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("mediaManager.table.topic")}</TableHead>
                          <TableHead>{t("mediaManager.table.goal")}</TableHead>
                          <TableHead>{t("mediaManager.table.language")}</TableHead>
                          <TableHead>{t("mediaManager.table.status")}</TableHead>
                          <TableHead>{t("mediaManager.table.created")}</TableHead>
                          <TableHead className="text-right">{t("mediaManager.table.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {posts.map((post) => (
                          <TableRow
                            key={post.id}
                            className={cn(
                              "cursor-pointer",
                              selectedPostId === post.id && "bg-muted/50"
                            )}
                            onClick={() => handleSelectPost(post)}
                          >
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {post.topic || t("mediaManager.untitled")}
                            </TableCell>
                            <TableCell>
                              {post.goal ? t(`mediaManager.goals.${post.goal}`) : "-"}
                            </TableCell>
                            <TableCell>
                              {t(`mediaManager.languages.${post.language}`)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={STATUS_COLORS[post.status]}>
                                {t(`mediaManager.statuses.${post.status}`)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(post.created_at), "MMM d, yyyy", { locale: i18n.language === "es" ? es : enGB })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-1">
                                {/* Error indicator for failed posts */}
                                {post.status === "failed" && post.error_message && (
                                  <span 
                                    className="text-destructive cursor-help" 
                                    title={post.error_message}
                                  >
                                    <AlertCircle className="h-4 w-4" />
                                  </span>
                                )}
                                {/* Retry button for failed posts */}
                                {post.status === "failed" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryPost(post.id);
                                    }}
                                    disabled={isRetrying}
                                  >
                                    <RefreshCw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
                                    {t("mediaManager.actions.retry")}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPost(post);
                                  }}
                                  title={t("mediaManager.readyToPublish.preview")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPost(post);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(post.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Compliance Warning Dialog */}
      <ComplianceWarningDialog
        open={showComplianceDialog}
        onOpenChange={setShowComplianceDialog}
        warnings={complianceWarnings}
        onConfirm={handleForceApprove}
        isLoading={isApproving}
      />

      {/* Post Preview Dialog */}
      <PostPreviewDialog
        post={previewPost}
        open={!!previewPost}
        onOpenChange={(open) => !open && setPreviewPost(null)}
        onPublish={handlePublishFromPreview}
        onRetry={handleRetryFromPreview}
        onEdit={handleEditFromPreview}
        isPublishing={publishingFromQueue === previewPost?.id}
        isRetrying={isRetrying}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("mediaManager.deleteConfirmTitle")}
        description={t("mediaManager.deleteConfirm")}
        onConfirm={handleConfirmDelete}
        destructive
        confirmLabel={t("common.delete")}
      />
        </>
      )}
    </div>
  );
}
