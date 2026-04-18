import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Upload, Star, ArrowRight, X, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useOutreachRawLeads } from "@/hooks/useOutreachRawLeads";
import { useOutreachCampaigns } from "@/hooks/useOutreachCampaigns";
import { useOutreachCaps } from "@/hooks/useOutreachCaps";
import { AddOutreachLeadModal } from "./AddOutreachLeadModal";
import { ImportLeadsModal } from "./ImportLeadsModal";

export function OutreachLeadsTab() {
  const { t } = useTranslation();
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    pipeline: "all",
    source: "all",
    campaign: "all",
  });

  const { leads, isLoading, qualifyLeads, rejectLeads, isQualifying, rateLeads, isRating } =
    useOutreachRawLeads(filters);
  const { campaigns } = useOutreachCampaigns();
  const { settings, usage } = useOutreachCaps();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(leads?.map((l) => l.id) || []);
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectLead = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLeads((prev) => [...prev, id]);
    } else {
      setSelectedLeads((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleMoveQualified = async () => {
    // Pass cap settings and current usage for enforcement
    if (selectedLeads.length > 0) {
      await qualifyLeads({ 
        leadIds: selectedLeads, 
        capSettings: settings, 
        currentUsage: usage 
      });
      setSelectedLeads([]);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedLeads.length > 0) {
      await rejectLeads(selectedLeads);
      setSelectedLeads([]);
    }
  };

  const handleRateSelected = async () => {
    if (selectedLeads.length > 0) {
      await rateLeads({ leadIds: selectedLeads });
    }
  };

  const handleRateAllNew = async () => {
    await rateLeads({ rateAllNew: true });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary">{t("outreach.leads.status.new")}</Badge>;
      case "qualified":
        return <Badge className="bg-green-500">{t("outreach.leads.status.qualified")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("outreach.leads.status.rejected")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPipelineBadge = (pipeline: string) => {
    return (
      <Badge
        variant="outline"
        className={
          pipeline === "sales" ? "border-blue-500 text-blue-500" : "border-purple-500 text-purple-500"
        }
      >
        {t(`outreach.leads.pipeline.${pipeline}`)}
      </Badge>
    );
  };

  const renderScoreStars = (score: number | null, reasoning?: string | null) => {
    if (score === null) return <span className="text-muted-foreground">—</span>;
    const fullStars = Math.floor(score);
    
    const content = (
      <div className="flex items-center gap-1 cursor-help">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < fullStars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">({score.toFixed(1)})</span>
      </div>
    );

    if (reasoning) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">{reasoning}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return content;
  };

  // Count unrated new leads
  const unratedNewCount = leads?.filter((l) => l.status === "new" && l.ai_score === null).length || 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("outreach.leads.title")}</CardTitle>
              <CardDescription>
                {t("outreach.leads.subtitle")}
                {leads && leads.length >= 200 && (
                  <span className="ml-2 text-yellow-600">
                    ({t("outreach.leads.showingFirst", { count: 200 })})
                  </span>
                )}
                {leads && leads.length > 0 && leads.length < 200 && (
                  <span className="ml-2">
                    ({leads.length} {t("outreach.leads.leadsFound")})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRateAllNew}
                disabled={isRating || unratedNewCount === 0}
              >
                {isRating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {t("outreach.leads.rateAllNew")}
                {unratedNewCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {unratedNewCount}
                  </Badge>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t("outreach.leads.importLeads")}
              </Button>
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("outreach.leads.addLead")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("outreach.leads.columns.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="new">{t("outreach.leads.status.new")}</SelectItem>
                <SelectItem value="qualified">{t("outreach.leads.status.qualified")}</SelectItem>
                <SelectItem value="rejected">{t("outreach.leads.status.rejected")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.pipeline} onValueChange={(v) => setFilters((f) => ({ ...f, pipeline: v }))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("outreach.leads.columns.pipeline")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="sales">{t("outreach.leads.pipeline.sales")}</SelectItem>
                <SelectItem value="partner">{t("outreach.leads.pipeline.partner")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.source} onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("outreach.leads.columns.source")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="manual">{t("outreach.leads.sources.manual")}</SelectItem>
                <SelectItem value="csv_import">{t("outreach.leads.sources.csv_import")}</SelectItem>
                <SelectItem value="paste_list">{t("outreach.leads.sources.paste_list")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.campaign} onValueChange={(v) => setFilters((f) => ({ ...f, campaign: v }))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("outreach.leads.columns.campaign")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="none">{t("outreach.leads.noCampaign")}</SelectItem>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          {selectedLeads.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <span className="text-sm font-medium">
                {selectedLeads.length} {t("common.selected")}
              </span>
              <Button size="sm" variant="outline" onClick={handleRateSelected} disabled={isRating}>
                {isRating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {t("outreach.leads.rateSelected")}
              </Button>
              <Button size="sm" onClick={handleMoveQualified} disabled={isQualifying}>
                {isQualifying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {t("outreach.leads.moveQualified")}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleRejectSelected}>
                <X className="mr-2 h-4 w-4" />
                {t("outreach.leads.rejectLead")}
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedLeads.length === leads?.length && leads?.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>{t("outreach.leads.columns.company")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.contact")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.email")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.pipeline")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.campaign")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.score")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.status")}</TableHead>
                  <TableHead>{t("outreach.leads.columns.source")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">{t("outreach.leads.loading")}</p>
                    </TableCell>
                  </TableRow>
                ) : leads?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      {t("outreach.leads.noLeads")}
                    </TableCell>
                  </TableRow>
                ) : (
                  leads?.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.company_name}</TableCell>
                      <TableCell>{lead.contact_name || "—"}</TableCell>
                      <TableCell>{lead.email || "—"}</TableCell>
                      <TableCell>{getPipelineBadge(lead.pipeline_type)}</TableCell>
                      <TableCell>
                        {lead.campaign ? (
                          <Badge variant="outline" className="text-xs">
                            {lead.campaign.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {renderScoreStars(
                          lead.ai_score ? Number(lead.ai_score) : null,
                          lead.ai_reasoning
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(lead.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t(`outreach.leads.sources.${lead.source}`, { defaultValue: lead.source })}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddOutreachLeadModal open={showAddModal} onOpenChange={setShowAddModal} />
      <ImportLeadsModal open={showImportModal} onOpenChange={setShowImportModal} />
    </>
  );
}
