import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone, Plus, LayoutGrid, List, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOutreachCampaigns, Campaign } from "@/hooks/useOutreachCampaigns";
import { CampaignFormModal } from "./CampaignFormModal";
import { CampaignCard } from "./CampaignCard";
import { DeleteCampaignDialog } from "./DeleteCampaignDialog";

type ViewMode = "grid" | "list";
type StatusFilter = "all" | "active" | "paused" | "draft" | "completed";

export function OutreachCampaignsTab() {
  const { t } = useTranslation();
  const { campaigns, isLoading, updateCampaign, deleteCampaign, isUpdating, isDeleting } = useOutreachCampaigns();
  
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setShowFormModal(true);
  };

  const handleCloseModal = (open: boolean) => {
    setShowFormModal(open);
    if (!open) {
      setEditingCampaign(null);
    }
  };

  const handleToggleStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await updateCampaign({ id: campaign.id, status: newStatus });
  };

  const handleConfirmDelete = async () => {
    if (deletingCampaign) {
      await deleteCampaign(deletingCampaign.id);
      setDeletingCampaign(null);
    }
  };

  // Filter campaigns
  const filteredCampaigns = campaigns?.filter((c) => {
    if (statusFilter === "all") return true;
    return c.status === statusFilter;
  }) || [];

  // Stats
  const stats = {
    total: campaigns?.length || 0,
    active: campaigns?.filter((c) => c.status === "active").length || 0,
    paused: campaigns?.filter((c) => c.status === "paused").length || 0,
    totalLeads: campaigns?.reduce((sum, c) => sum + c.leads_count, 0) || 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-9 w-32" />
            </div>
          </CardHeader>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header Card with Stats */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{t("outreach.campaigns.title")}</CardTitle>
                <CardDescription>{t("outreach.campaigns.subtitle")}</CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowFormModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("outreach.campaigns.newCampaign")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats Bar */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">{t("outreach.campaigns.stats.total")}:</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
              <span className="text-sm text-green-700 dark:text-green-400">{t("outreach.campaigns.status.active")}:</span>
              <span className="font-semibold text-green-700 dark:text-green-400">{stats.active}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <span className="text-sm text-amber-700 dark:text-amber-400">{t("outreach.campaigns.status.paused")}:</span>
              <span className="font-semibold text-amber-700 dark:text-amber-400">{stats.paused}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
              <span className="text-sm text-primary">{t("outreach.campaigns.stats.totalLeads")}:</span>
              <span className="font-semibold text-primary">{stats.totalLeads}</span>
            </div>
          </div>

          {/* Filters and View Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("outreach.campaigns.filters.all")}</SelectItem>
                  <SelectItem value="active">{t("outreach.campaigns.status.active")}</SelectItem>
                  <SelectItem value="paused">{t("outreach.campaigns.status.paused")}</SelectItem>
                  <SelectItem value="draft">{t("outreach.campaigns.status.draft")}</SelectItem>
                  <SelectItem value="completed">{t("outreach.campaigns.status.completed")}</SelectItem>
                </SelectContent>
              </Select>
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  {filteredCampaigns.length} {t("outreach.campaigns.results")}
                </Badge>
              )}
            </div>
            
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="grid" className="h-7 px-2">
                  <LayoutGrid className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="list" className="h-7 px-2">
                  <List className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Grid/List */}
      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Megaphone className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {statusFilter === "all" 
                  ? t("outreach.campaigns.noCampaigns")
                  : t("outreach.campaigns.noResults")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                {t("outreach.campaigns.subtitle")}
              </p>
              {statusFilter === "all" && (
                <Button className="mt-4" onClick={() => setShowFormModal(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("outreach.campaigns.newCampaign")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === "grid" 
            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" 
            : "space-y-4"
        }>
          {filteredCampaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onEdit={handleEdit}
              onDelete={setDeletingCampaign}
              onToggleStatus={handleToggleStatus}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <CampaignFormModal
        open={showFormModal}
        onOpenChange={handleCloseModal}
        campaign={editingCampaign}
        mode={editingCampaign ? "edit" : "create"}
      />

      <DeleteCampaignDialog
        open={!!deletingCampaign}
        onOpenChange={(open) => !open && setDeletingCampaign(null)}
        campaign={deletingCampaign}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </>
  );
}
