import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users, Link2, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Partner {
  id: string;
  contact_name: string;
  company_name: string | null;
  referral_code: string;
}

interface PartnerDistributionSectionProps {
  audience: "none" | "all" | "selected";
  selectedPartnerIds: string[];
  onAudienceChange: (audience: "none" | "all" | "selected") => void;
  onSelectedPartnersChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function PartnerDistributionSection({
  audience,
  selectedPartnerIds,
  onAudienceChange,
  onSelectedPartnersChange,
  disabled = false,
}: PartnerDistributionSectionProps) {
  const { t } = useTranslation();

  // Fetch active partners
  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["active-partners-for-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, contact_name, company_name, referral_code")
        .eq("status", "active")
        .order("contact_name");

      if (error) throw error;
      return data as Partner[];
    },
  });

  const handlePartnerToggle = (partnerId: string) => {
    if (selectedPartnerIds.includes(partnerId)) {
      onSelectedPartnersChange(selectedPartnerIds.filter((id) => id !== partnerId));
    } else {
      onSelectedPartnersChange([...selectedPartnerIds, partnerId]);
    }
  };

  const handleSelectAll = () => {
    onSelectedPartnersChange(partners.map((p) => p.id));
  };

  const handleDeselectAll = () => {
    onSelectedPartnersChange([]);
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Label className="font-medium">{t("mediaManager.partnerDistribution.title")}</Label>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          {t("mediaManager.partnerDistribution.infoText")}
        </p>
      </div>

      {/* Single RadioGroup with all 3 options */}
      <RadioGroup
        value={audience}
        onValueChange={(v) => onAudienceChange(v as "none" | "all" | "selected")}
        className="space-y-3"
        disabled={disabled}
      >
        {/* No partner sharing */}
        <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
          <RadioGroupItem value="none" id="audience-none" />
          <Label htmlFor="audience-none" className="flex-1 font-normal cursor-pointer">
            <span>{t("mediaManager.partnerDistribution.noPartnerSharing")}</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("mediaManager.partnerDistribution.noPartnerSharingDesc")}
            </p>
          </Label>
        </div>

        {/* All active partners */}
        <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
          <RadioGroupItem value="all" id="audience-all" />
          <Label htmlFor="audience-all" className="flex-1 font-normal cursor-pointer">
            <span>{t("mediaManager.partnerDistribution.allActivePartners")}</span>
            <span className="text-muted-foreground ml-1">
              ({partners.length} {t("mediaManager.partnerDistribution.partners")})
            </span>
          </Label>
        </div>

        {/* Selected partners only */}
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
            <RadioGroupItem value="selected" id="audience-selected" />
            <Label htmlFor="audience-selected" className="flex-1 font-normal cursor-pointer">
              {t("mediaManager.partnerDistribution.selectedPartners")}
            </Label>
          </div>

          {/* Partner Selection (only show when "selected" is chosen) */}
          {audience === "selected" && (
            <div className="ml-7 space-y-2">
              {/* Select All / Deselect All buttons with count */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={disabled || isLoading || partners.length === 0}
                >
                  {t("mediaManager.partnerDistribution.selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={disabled || isLoading || selectedPartnerIds.length === 0}
                >
                  {t("mediaManager.partnerDistribution.deselectAll")}
                </Button>
                <Badge variant="secondary" className="text-xs">
                  {t("mediaManager.partnerDistribution.selectedCount", {
                    count: selectedPartnerIds.length,
                    total: partners.length,
                  })}
                </Badge>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : partners.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {t("mediaManager.partnerDistribution.noActivePartners")}
                </p>
              ) : (
                <ScrollArea className="h-[150px] rounded-md border p-2">
                  <div className="space-y-2">
                    {partners.map((partner) => (
                      <div
                        key={partner.id}
                        className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`partner-${partner.id}`}
                          checked={selectedPartnerIds.includes(partner.id)}
                          onCheckedChange={() => handlePartnerToggle(partner.id)}
                          disabled={disabled}
                        />
                        <label
                          htmlFor={`partner-${partner.id}`}
                          className="flex-1 text-sm cursor-pointer"
                        >
                          <span className="font-medium">{partner.contact_name}</span>
                          {partner.company_name && (
                            <span className="text-muted-foreground ml-1">
                              ({partner.company_name})
                            </span>
                          )}
                        </label>
                        <Badge variant="outline" className="text-xs">
                          {partner.referral_code}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </RadioGroup>

      {/* Tracking note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link2 className="h-3 w-3" />
        <span>{t("mediaManager.partnerDistribution.trackingNote")}</span>
      </div>
    </div>
  );
}
