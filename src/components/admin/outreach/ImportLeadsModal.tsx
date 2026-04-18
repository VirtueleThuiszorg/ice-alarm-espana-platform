import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOutreachRawLeads } from "@/hooks/useOutreachRawLeads";
import { useOutreachCampaigns } from "@/hooks/useOutreachCampaigns";
import { toast } from "@/hooks/use-toast";

interface ImportLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportLeadsModal({ open, onOpenChange }: ImportLeadsModalProps) {
  const { t } = useTranslation();
  const { bulkAddLeads, isAdding } = useOutreachRawLeads();
  const { campaigns } = useOutreachCampaigns();
  const [pasteContent, setPasteContent] = useState("");
  const [pipelineType, setPipelineType] = useState<"sales" | "partner">("sales");
  const [campaignId, setCampaignId] = useState("none");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const filteredCampaigns = campaigns?.filter(c => c.pipeline_type === pipelineType && c.status === "active") || [];

  const handlePipelineChange = (value: "sales" | "partner") => {
    setPipelineType(value);
    setCampaignId("none"); // Reset campaign when pipeline changes
  };

  const handlePasteImport = async () => {
    if (!pasteContent.trim()) return;

    try {
      const lines = pasteContent.split("\n").filter(line => line.trim());
      const leads = lines.map(line => {
        const parts = line.split("|").map(p => p.trim());
        return {
          company_name: parts[0] || "Unknown",
          email: parts[1] || null,
          website_url: parts[2] || null,
          pipeline_type: pipelineType,
          source: "paste_list" as const,
          campaign_id: campaignId === "none" ? null : campaignId,
        };
      });

      if (leads.length > 0) {
        await bulkAddLeads(leads);
        setPasteContent("");
        setCampaignId("none");
        onOpenChange(false);
        toast({
          title: t("common.success"),
          description: t("outreach.leads.import.success", { count: leads.length }),
        });
      }
    } catch (error) {
      console.error("Import paste error:", error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : "Failed to import leads",
        variant: "destructive",
      });
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter(line => line.trim());
        
        // Skip header row
        const dataLines = lines.slice(1);
        
        const leads = dataLines.map(line => {
          const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ""));
          return {
            company_name: parts[0] || "Unknown",
            contact_name: parts[1] || null,
            email: parts[2] || null,
            website_url: parts[3] || null,
            location: parts[4] || null,
            category: parts[5] || null,
            pipeline_type: pipelineType,
            source: "csv_import" as const,
            campaign_id: campaignId === "none" ? null : campaignId,
          };
        }).filter(l => l.company_name !== "Unknown");

        if (leads.length > 0) {
          await bulkAddLeads(leads);
          setCsvFile(null);
          setCampaignId("none");
          onOpenChange(false);
          toast({
            title: t("common.success"),
            description: t("outreach.leads.import.success", { count: leads.length }),
          });
        }
      } catch (error) {
        console.error("CSV import error:", error);
        toast({
          title: t("common.error"),
          description: error instanceof Error ? error.message : "Failed to import CSV",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("outreach.leads.import.title")}</DialogTitle>
          <DialogDescription>
            {t("outreach.leads.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("outreach.leads.columns.pipeline")}</Label>
              <Select value={pipelineType} onValueChange={handlePipelineChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{t("outreach.leads.pipeline.sales")}</SelectItem>
                  <SelectItem value="partner">{t("outreach.leads.pipeline.partner")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("outreach.leads.columns.campaign")}</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("outreach.leads.noCampaign")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("outreach.leads.noCampaign")}</SelectItem>
                  {filteredCampaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Tabs defaultValue="paste" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="paste" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("outreach.leads.import.pasteTab")}
            </TabsTrigger>
            <TabsTrigger value="csv" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {t("outreach.leads.import.csvTab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>{t("outreach.leads.pasteList")}</Label>
              <Textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={t("outreach.leads.import.pasteInstructions")}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("outreach.leads.import.pasteInstructions")}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handlePasteImport} disabled={isAdding || !pasteContent.trim()}>
                {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("outreach.leads.import.importButton")}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>{t("outreach.leads.import.csvTab")}</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                {t("outreach.leads.import.csvInstructions")}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleCsvImport} disabled={isAdding || !csvFile}>
                {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("outreach.leads.import.importButton")}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
