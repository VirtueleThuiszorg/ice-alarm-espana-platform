import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Video, Plus, Search, HelpCircle, FolderOpen, Wand2, Layout, Download, Settings, Youtube, ExternalLink, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VideoProjectsTab } from "@/components/admin/video-hub/VideoProjectsTab";
import { VideoCreateTab } from "@/components/admin/video-hub/VideoCreateTab";
import { VideoTemplatesTab } from "@/components/admin/video-hub/VideoTemplatesTab";
import { VideoExportsTab } from "@/components/admin/video-hub/VideoExportsTab";
import { VideoSettingsTab } from "@/components/admin/video-hub/VideoSettingsTab";
import { VideoHelpDialog } from "@/components/admin/video-hub/VideoHelpDialog";
import { useYouTubeIntegration } from "@/hooks/useYouTubeIntegration";
import { Link } from "react-router-dom";
import type { VideoProject } from "@/hooks/useVideoProjects";

const TAB_STORAGE_KEY = "videoHub_activeTab";
const FILTERS_STORAGE_KEY = "videoHub_filters";

interface Filters {
  language: string;
  format: string;
  status: string;
}

export default function VideoHubPage() {
  const { t } = useTranslation();
  const { isConnected: youtubeConnected, isLoading: youtubeLoading } = useYouTubeIntegration();

  // Persist active tab
  const [activeTab, setActiveTab] = useState(() => {
    const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
    return stored || "projects";
  });

  // Persist filters
  const [filters, setFilters] = useState<Filters>(() => {
    const stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { language: "all", format: "all", status: "all" };
      }
    }
    return { language: "all", format: "all", status: "all" };
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<VideoProject | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isQuickCreate, setIsQuickCreate] = useState(false);

  // Persist tab changes
  useEffect(() => {
    sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  // Persist filter changes
  useEffect(() => {
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleNewVideo = useCallback((quick = false) => {
    setEditingProject(null);
    setSelectedTemplateId(null);
    setIsQuickCreate(quick);
    setActiveTab("create");
  }, []);

  const handleEditProject = useCallback((project: VideoProject) => {
    setEditingProject(project);
    setSelectedTemplateId(null);
    setIsQuickCreate(false);
    setActiveTab("create");
  }, []);

  const handleSelectTemplate = useCallback((templateId: string) => {
    setEditingProject(null);
    setSelectedTemplateId(templateId);
    setIsQuickCreate(false);
    setActiveTab("create");
  }, []);

  const handleCreateComplete = useCallback(() => {
    setEditingProject(null);
    setSelectedTemplateId(null);
    setIsQuickCreate(false);
    setActiveTab("projects");
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Video className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("videoHub.title")}</h1>
            <p className="text-muted-foreground">{t("videoHub.subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* YouTube Connection Status */}
          <Link
            to="/admin/settings#communications/social"
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Youtube className={`h-4 w-4 ${youtubeConnected ? "text-red-600" : "text-muted-foreground"}`} />
            {youtubeLoading ? (
              <span className="text-muted-foreground">{t("common.loading")}...</span>
            ) : youtubeConnected ? (
              <>
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {t("videoHub.youtube.connected", "Connected")}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{t("videoHub.youtube.notConnected", "Not Connected")}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </>
            )}
          </Link>

          <Button variant="outline" size="icon" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button onClick={() => handleNewVideo(false)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("videoHub.newVideo")}
          </Button>
        </div>
      </div>

      {/* Filters Bar — only shown on tabs that use filtering */}
      {(activeTab === "projects" || activeTab === "exports") && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("videoHub.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filters.language} onValueChange={(v) => handleFilterChange("language", v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={t("videoHub.projects.language")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.format} onValueChange={(v) => handleFilterChange("format", v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t("videoHub.projects.format")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="9:16">{t("videoHub.formats.portrait")}</SelectItem>
              <SelectItem value="16:9">{t("videoHub.formats.landscape")}</SelectItem>
              <SelectItem value="1:1">{t("videoHub.formats.square")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(v) => handleFilterChange("status", v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t("videoHub.projects.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="draft">{t("videoHub.statuses.draft")}</SelectItem>
              <SelectItem value="rendering">{t("videoHub.statuses.rendering")}</SelectItem>
              <SelectItem value="done">{t("videoHub.statuses.done")}</SelectItem>
              <SelectItem value="failed">{t("videoHub.statuses.failed")}</SelectItem>
              <SelectItem value="approved">{t("videoHub.statuses.approved")}</SelectItem>
              <SelectItem value="archived">{t("videoHub.statuses.archived")}</SelectItem>
            </SelectContent>
          </Select>

          {(filters.language !== "all" || filters.format !== "all" || filters.status !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ language: "all", format: "all", status: "all" })}
            >
              {t("common.clearFilters", "Clear Filters")}
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="projects" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            {t("videoHub.tabs.projects")}
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-2">
            <Wand2 className="h-4 w-4" />
            {t("videoHub.tabs.create")}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Layout className="h-4 w-4" />
            {t("videoHub.tabs.templates")}
          </TabsTrigger>
          <TabsTrigger value="exports" className="gap-2">
            <Download className="h-4 w-4" />
            {t("videoHub.tabs.exports")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            {t("videoHub.tabs.settings")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          <VideoProjectsTab
            searchQuery={searchQuery}
            filters={filters}
            onCreateNew={() => handleNewVideo(false)}
            onEditProject={handleEditProject}
          />
        </TabsContent>

        <TabsContent value="create">
          <VideoCreateTab
            onComplete={handleCreateComplete}
            editingProject={editingProject}
            initialTemplateId={selectedTemplateId}
            isQuickCreate={isQuickCreate}
          />
        </TabsContent>

        <TabsContent value="templates">
          <VideoTemplatesTab onSelectTemplate={handleSelectTemplate} />
        </TabsContent>

        <TabsContent value="exports">
          <VideoExportsTab searchQuery={searchQuery} filters={filters} />
        </TabsContent>

        <TabsContent value="settings">
          <VideoSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Help Dialog */}
      <VideoHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
