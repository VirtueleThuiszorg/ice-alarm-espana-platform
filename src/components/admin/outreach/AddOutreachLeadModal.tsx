import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOutreachRawLeads } from "@/hooks/useOutreachRawLeads";
import { useOutreachCampaigns } from "@/hooks/useOutreachCampaigns";

type LeadFormData = z.infer<ReturnType<typeof makeLeadSchema>>;

function makeLeadSchema(t: (key: string) => string) {
  return z.object({
    company_name: z.string().min(1, t("outreach.validation.companyRequired")),
    contact_name: z.string().optional(),
    email: z.string().email(t("outreach.validation.invalidEmail")).optional().or(z.literal("")),
    website_url: z.string().url(t("outreach.validation.invalidUrl")).optional().or(z.literal("")),
    phone: z.string().optional(),
    location: z.string().optional(),
    category: z.string().optional(),
    pipeline_type: z.enum(["sales", "partner"]),
    campaign_id: z.string().optional(),
    notes: z.string().optional(),
  });
}

interface AddOutreachLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddOutreachLeadModal({ open, onOpenChange }: AddOutreachLeadModalProps) {
  const { t } = useTranslation();
  const leadSchema = useMemo(() => makeLeadSchema(t), [t]);
  const { addLead, isAdding } = useOutreachRawLeads();
  const { campaigns } = useOutreachCampaigns();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      pipeline_type: "sales",
      campaign_id: "none",
    },
  });

  const selectedPipeline = watch("pipeline_type");
  const selectedCampaignId = watch("campaign_id");
  const filteredCampaigns = campaigns?.filter(c => c.pipeline_type === selectedPipeline && c.status === "active") || [];

  const onSubmit = async (data: LeadFormData) => {
    await addLead({
      company_name: data.company_name,
      contact_name: data.contact_name || null,
      phone: data.phone || null,
      location: data.location || null,
      category: data.category || null,
      notes: data.notes || null,
      pipeline_type: data.pipeline_type,
      email: data.email || null,
      website_url: data.website_url || null,
      source: "manual",
      campaign_id: data.campaign_id === "none" ? null : data.campaign_id,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("outreach.leads.addLead")}</DialogTitle>
          <DialogDescription>
            {t("outreach.leads.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">{t("outreach.leads.columns.company")} *</Label>
              <Input
                id="company_name"
                {...register("company_name")}
                placeholder="Acme Corp"
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_name">{t("outreach.leads.columns.contact")}</Label>
              <Input
                id="contact_name"
                {...register("contact_name")}
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("outreach.leads.columns.email")}</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="john@acme.com"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t("common.phone")}</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="+34 600 000 000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website_url">{t("outreach.leads.columns.website")}</Label>
              <Input
                id="website_url"
                {...register("website_url")}
                placeholder="https://acme.com"
              />
              {errors.website_url && (
                <p className="text-sm text-destructive">{errors.website_url.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{t("outreach.leads.columns.location")}</Label>
              <Input
                id="location"
                {...register("location")}
                placeholder="Madrid, Spain"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t("outreach.leads.columns.category")}</Label>
              <Input
                id="category"
                {...register("category")}
                placeholder="Healthcare"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("outreach.leads.columns.pipeline")}</Label>
              <Select
                value={selectedPipeline}
                onValueChange={(v) => {
                  setValue("pipeline_type", v as "sales" | "partner");
                  setValue("campaign_id", "none"); // Reset campaign when pipeline changes
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{t("outreach.leads.pipeline.sales")}</SelectItem>
                  <SelectItem value="partner">{t("outreach.leads.pipeline.partner")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>{t("outreach.leads.columns.campaign")}</Label>
              <Select
                value={selectedCampaignId}
                onValueChange={(v) => setValue("campaign_id", v)}
              >
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
              {filteredCampaigns.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("outreach.leads.noActiveCampaigns")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder={t("common.notesPlaceholder")}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isAdding}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
