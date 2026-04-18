import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOutreachCampaigns, NewCampaign, Campaign } from "@/hooks/useOutreachCampaigns";
import { Loader2 } from "lucide-react";

type CampaignFormValues = z.infer<ReturnType<typeof makeCampaignSchema>>;

function makeCampaignSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t("outreach.validation.campaignNameRequired")),
    description: z.string().optional(),
    pipeline_type: z.enum(["sales", "partner"]),
    status: z.enum(["active", "paused", "draft", "completed"]),
    target_description: z.string().optional(),
    target_locations: z.string().optional(),
    default_language: z.enum(["en", "es"]),
    email_tone: z.enum(["professional", "friendly", "neutral"]),
    outreach_goal: z.enum(["intro", "partnership", "meeting"]),
    follow_up_enabled: z.boolean(),
    max_emails_per_lead: z.number().min(1).max(5),
    days_between_emails: z.number().min(1).max(14),
  });
}

interface CampaignFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign | null;
  mode: "create" | "edit";
}

export function CampaignFormModal({ open, onOpenChange, campaign, mode }: CampaignFormModalProps) {
  const { t } = useTranslation();
  const campaignSchema = useMemo(() => makeCampaignSchema(t), [t]);
  const { createCampaign, isCreating, updateCampaign, isUpdating } = useOutreachCampaigns();

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      description: "",
      pipeline_type: "sales",
      status: "active",
      target_description: "",
      target_locations: "",
      default_language: "en",
      email_tone: "professional",
      outreach_goal: "intro",
      follow_up_enabled: true,
      max_emails_per_lead: 3,
      days_between_emails: 3,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (mode === "edit" && campaign) {
      form.reset({
        name: campaign.name,
        description: campaign.description || "",
        pipeline_type: campaign.pipeline_type,
        status: campaign.status || "active",
        target_description: campaign.target_description || "",
        target_locations: campaign.target_locations?.join(", ") || "",
        default_language: campaign.default_language,
        email_tone: campaign.email_tone,
        outreach_goal: campaign.outreach_goal,
        follow_up_enabled: campaign.follow_up_enabled,
        max_emails_per_lead: campaign.max_emails_per_lead || 3,
        days_between_emails: campaign.days_between_emails || 3,
      });
    } else if (mode === "create") {
      form.reset({
        name: "",
        description: "",
        pipeline_type: "sales",
        status: "active",
        target_description: "",
        target_locations: "",
        default_language: "en",
        email_tone: "professional",
        outreach_goal: "intro",
        follow_up_enabled: true,
        max_emails_per_lead: 3,
        days_between_emails: 3,
      });
    }
  }, [mode, campaign, form, open]);

  const onSubmit = async (values: CampaignFormValues) => {
    const campaignData: NewCampaign = {
      name: values.name,
      description: values.description || null,
      pipeline_type: values.pipeline_type,
      status: values.status as "draft" | "active" | "paused" | "completed",
      target_description: values.target_description || null,
      target_locations: values.target_locations 
        ? values.target_locations.split(",").map(s => s.trim()).filter(Boolean)
        : null,
      default_language: values.default_language,
      email_tone: values.email_tone,
      outreach_goal: values.outreach_goal,
      follow_up_enabled: values.follow_up_enabled,
      max_emails_per_lead: values.max_emails_per_lead,
      days_between_emails: values.days_between_emails,
    };

    if (mode === "edit" && campaign) {
      await updateCampaign({ id: campaign.id, ...campaignData });
    } else {
      await createCampaign(campaignData);
    }
    
    form.reset();
    onOpenChange(false);
  };

  const isSubmitting = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" 
              ? t("outreach.campaigns.editCampaign") 
              : t("outreach.campaigns.newCampaign")}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? t("outreach.campaigns.editDescription")
              : t("outreach.campaigns.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t("outreach.campaigns.sections.basic")}
              </h3>
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outreach.campaigns.fields.name")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("outreach.campaigns.placeholders.name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outreach.campaigns.fields.description")}</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t("outreach.campaigns.placeholders.description")} 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pipeline_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outreach.campaigns.fields.pipelineType")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="sales">{t("outreach.leads.pipeline.sales")}</SelectItem>
                          <SelectItem value="partner">{t("outreach.leads.pipeline.partner")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outreach.campaigns.fields.status")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t("outreach.campaigns.status.active")}</SelectItem>
                          <SelectItem value="paused">{t("outreach.campaigns.status.paused")}</SelectItem>
                          <SelectItem value="draft">{t("outreach.campaigns.status.draft")}</SelectItem>
                          <SelectItem value="completed">{t("outreach.campaigns.status.completed")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Targeting Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t("outreach.campaigns.sections.targeting")}
              </h3>

              <FormField
                control={form.control}
                name="target_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outreach.campaigns.fields.targetDescription")}</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t("outreach.campaigns.placeholders.targetDescription")} 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      {t("outreach.campaigns.descriptions.targetDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_locations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outreach.campaigns.fields.targetLocations")}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={t("outreach.campaigns.placeholders.targetLocations")} 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      {t("outreach.campaigns.descriptions.targetLocations")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="default_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outreach.campaigns.fields.defaultLanguage")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">{t("common.languages.en")}</SelectItem>
                        <SelectItem value="es">{t("common.languages.es")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Messaging Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t("outreach.campaigns.sections.messaging")}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email_tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outreach.campaigns.fields.emailTone")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="professional">{t("outreach.campaigns.tones.professional")}</SelectItem>
                          <SelectItem value="friendly">{t("outreach.campaigns.tones.friendly")}</SelectItem>
                          <SelectItem value="neutral">{t("outreach.campaigns.tones.neutral")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="outreach_goal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outreach.campaigns.fields.outreachGoal")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="intro">{t("outreach.campaigns.goals.intro")}</SelectItem>
                          <SelectItem value="partnership">{t("outreach.campaigns.goals.partnership")}</SelectItem>
                          <SelectItem value="meeting">{t("outreach.campaigns.goals.meeting")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Follow-up Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t("outreach.campaigns.sections.followUp")}
              </h3>

              <FormField
                control={form.control}
                name="follow_up_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t("outreach.campaigns.fields.followUpEnabled")}
                      </FormLabel>
                      <FormDescription>
                        {t("outreach.campaigns.descriptions.followUpEnabled")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("follow_up_enabled") && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="max_emails_per_lead"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("outreach.campaigns.fields.maxEmails")}</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(parseInt(val))} 
                          value={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("outreach.campaigns.descriptions.maxEmails")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="days_between_emails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("outreach.campaigns.fields.daysBetween")}</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(parseInt(val))} 
                          value={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 {t("common.day")}</SelectItem>
                            <SelectItem value="2">2 {t("common.days")}</SelectItem>
                            <SelectItem value="3">3 {t("common.days")}</SelectItem>
                            <SelectItem value="5">5 {t("common.days")}</SelectItem>
                            <SelectItem value="7">7 {t("common.days")}</SelectItem>
                            <SelectItem value="14">14 {t("common.days")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "edit" ? t("common.save") : t("outreach.campaigns.create")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
