import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, Users, Building2, Home, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface DefaultPricing {
  id?: string;
  partner_type: "referral" | "care" | "residential";
  membership_type: "single" | "couple";
  billing_frequency: "monthly" | "annual";
  subscription_net_price: number;
  registration_fee: number;
  registration_fee_discount_percent: number;
  pendant_net_price: number | null;
  commission_amount: number;
}

// Default pricing templates
const DEFAULT_PRICING_TEMPLATES: Omit<DefaultPricing, "id">[] = [
  // Referral partners
  { partner_type: "referral", membership_type: "single", billing_frequency: "monthly", subscription_net_price: 27.49, registration_fee: 59.99, registration_fee_discount_percent: 0, pendant_net_price: 151.25, commission_amount: 50 },
  { partner_type: "referral", membership_type: "single", billing_frequency: "annual", subscription_net_price: 274.89, registration_fee: 59.99, registration_fee_discount_percent: 0, pendant_net_price: 151.25, commission_amount: 50 },
  { partner_type: "referral", membership_type: "couple", billing_frequency: "monthly", subscription_net_price: 38.49, registration_fee: 59.99, registration_fee_discount_percent: 0, pendant_net_price: 151.25, commission_amount: 50 },
  { partner_type: "referral", membership_type: "couple", billing_frequency: "annual", subscription_net_price: 384.89, registration_fee: 59.99, registration_fee_discount_percent: 0, pendant_net_price: 151.25, commission_amount: 50 },
  // Care partners
  { partner_type: "care", membership_type: "single", billing_frequency: "monthly", subscription_net_price: 24.99, registration_fee: 59.99, registration_fee_discount_percent: 50, pendant_net_price: 125.00, commission_amount: 40 },
  { partner_type: "care", membership_type: "single", billing_frequency: "annual", subscription_net_price: 249.90, registration_fee: 59.99, registration_fee_discount_percent: 50, pendant_net_price: 125.00, commission_amount: 40 },
  { partner_type: "care", membership_type: "couple", billing_frequency: "monthly", subscription_net_price: 34.99, registration_fee: 59.99, registration_fee_discount_percent: 50, pendant_net_price: 125.00, commission_amount: 40 },
  { partner_type: "care", membership_type: "couple", billing_frequency: "annual", subscription_net_price: 349.90, registration_fee: 59.99, registration_fee_discount_percent: 50, pendant_net_price: 125.00, commission_amount: 40 },
  // Residential partners
  { partner_type: "residential", membership_type: "single", billing_frequency: "monthly", subscription_net_price: 19.99, registration_fee: 0, registration_fee_discount_percent: 100, pendant_net_price: 0, commission_amount: 0 },
  { partner_type: "residential", membership_type: "single", billing_frequency: "annual", subscription_net_price: 199.90, registration_fee: 0, registration_fee_discount_percent: 100, pendant_net_price: 0, commission_amount: 0 },
  { partner_type: "residential", membership_type: "couple", billing_frequency: "monthly", subscription_net_price: 29.99, registration_fee: 0, registration_fee_discount_percent: 100, pendant_net_price: 0, commission_amount: 0 },
  { partner_type: "residential", membership_type: "couple", billing_frequency: "annual", subscription_net_price: 299.90, registration_fee: 0, registration_fee_discount_percent: 100, pendant_net_price: 0, commission_amount: 0 },
];

export default function PartnerPricingSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"referral" | "care" | "residential">("referral");
  const [editingPricing, setEditingPricing] = useState<DefaultPricing | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch custom pricing overrides (stored in system_settings)
  const { data: pricingSettings } = useQuery({
    queryKey: ["partner-default-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .like("key", "partner_pricing_%");

      if (error) throw error;
      
      // Parse stored JSON pricing
      const pricingMap: Record<string, DefaultPricing> = {};
      data?.forEach(setting => {
        try {
          pricingMap[setting.key] = JSON.parse(setting.value);
        } catch {
          // Ignore invalid JSON
        }
      });
      
      return pricingMap;
    },
  });

  // Fetch partners with custom pricing
  const { data: partnersWithCustomPricing } = useQuery({
    queryKey: ["partners-with-custom-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_pricing_tiers")
        .select(`
          id,
          partner_id,
          name,
          membership_type,
          billing_frequency,
          subscription_net_price,
          commission_amount,
          effective_from,
          partner:partners(contact_name, company_name, partner_type)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  // Save default pricing mutation
  const savePricingMutation = useMutation({
    mutationFn: async (pricing: DefaultPricing) => {
      const key = `partner_pricing_${pricing.partner_type}_${pricing.membership_type}_${pricing.billing_frequency}`;
      
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key,
          value: JSON.stringify(pricing),
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-default-pricing"] });
      toast.success("Default pricing saved");
      setIsDialogOpen(false);
      setEditingPricing(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Get pricing for display (merged defaults + overrides)
  const getPricingForType = (type: "referral" | "care" | "residential") => {
    return DEFAULT_PRICING_TEMPLATES.filter(p => p.partner_type === type).map(template => {
      const key = `partner_pricing_${template.partner_type}_${template.membership_type}_${template.billing_frequency}`;
      return pricingSettings?.[key] || template;
    });
  };

  const handleEditPricing = (pricing: DefaultPricing) => {
    setEditingPricing({ ...pricing });
    setIsDialogOpen(true);
  };

  const handleSavePricing = () => {
    if (editingPricing) {
      savePricingMutation.mutate(editingPricing);
    }
  };

  const partnerTypeIcon = {
    referral: <Users className="h-4 w-4" />,
    care: <Building2 className="h-4 w-4" />,
    residential: <Home className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
       <div>
         <h1 className="text-3xl font-bold tracking-tight">{t("adminPartnerPricing.title", "Partner Pricing Settings")}</h1>
         <p className="text-muted-foreground">
           {t("adminPartnerPricing.subtitle", "Configure default pricing for each partner type")}
         </p>
       </div>

      {/* Partner Type Tabs */}
      <div className="flex gap-2">
        {(["referral", "care", "residential"] as const).map(type => (
          <Button
            key={type}
            variant={activeTab === type ? "default" : "outline"}
            onClick={() => setActiveTab(type)}
            className="capitalize"
          >
            {partnerTypeIcon[type]}
            <span className="ml-2">{type} Partners</span>
          </Button>
        ))}
      </div>

      {/* Default Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Default {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Partner Pricing
          </CardTitle>
          <CardDescription>
            These rates apply to new {activeTab} partners unless overridden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membership</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead className="text-right">Subscription</TableHead>
                <TableHead className="text-right">Reg. Fee</TableHead>
                <TableHead className="text-right">Reg. Discount</TableHead>
                <TableHead className="text-right">Pendant</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getPricingForType(activeTab).map((pricing, idx) => (
                <TableRow key={idx}>
                  <TableCell className="capitalize">{pricing.membership_type}</TableCell>
                  <TableCell className="capitalize">{pricing.billing_frequency}</TableCell>
                  <TableCell className="text-right font-medium">€{pricing.subscription_net_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">€{pricing.registration_fee.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{pricing.registration_fee_discount_percent}%</TableCell>
                  <TableCell className="text-right">
                    {pricing.pendant_net_price !== null ? `€${pricing.pendant_net_price.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-green-600 font-medium">€{pricing.commission_amount}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleEditPricing(pricing)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Custom Pricing Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Partners with Custom Pricing</CardTitle>
          <CardDescription>
            These partners have pricing that differs from the defaults
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partnersWithCustomPricing?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No partners have custom pricing configured yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tier Name</TableHead>
                  <TableHead>Membership</TableHead>
                  <TableHead className="text-right">Subscription</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnersWithCustomPricing?.map((tier) => (
                  <TableRow 
                    key={tier.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/partners/${tier.partner_id}`)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{tier.partner?.contact_name}</div>
                        {tier.partner?.company_name && (
                          <div className="text-sm text-muted-foreground">{tier.partner.company_name}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tier.partner?.partner_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{tier.name}</TableCell>
                    <TableCell className="capitalize">
                      {tier.membership_type} / {tier.billing_frequency}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      €{Number(tier.subscription_net_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      €{Number(tier.commission_amount).toFixed(0)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tier.effective_from ? format(new Date(tier.effective_from), "dd MMM yy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/partners/${tier.partner_id}?tab=pricing`);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Pricing Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Default Pricing</DialogTitle>
            <DialogDescription>
              Update the default pricing for {editingPricing?.partner_type} partners ({editingPricing?.membership_type} / {editingPricing?.billing_frequency})
            </DialogDescription>
          </DialogHeader>
          
          {editingPricing && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subscription Price (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPricing.subscription_net_price}
                    onChange={(e) => setEditingPricing({
                      ...editingPricing,
                      subscription_net_price: parseFloat(e.target.value) || 0
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Commission Amount (€)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={editingPricing.commission_amount}
                    onChange={(e) => setEditingPricing({
                      ...editingPricing,
                      commission_amount: parseFloat(e.target.value) || 0
                    })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Registration Fee (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPricing.registration_fee}
                    onChange={(e) => setEditingPricing({
                      ...editingPricing,
                      registration_fee: parseFloat(e.target.value) || 0
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reg. Fee Discount (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={editingPricing.registration_fee_discount_percent}
                    onChange={(e) => setEditingPricing({
                      ...editingPricing,
                      registration_fee_discount_percent: parseInt(e.target.value) || 0
                    })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Pendant Price (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingPricing.pendant_net_price || ""}
                  onChange={(e) => setEditingPricing({
                    ...editingPricing,
                    pendant_net_price: e.target.value ? parseFloat(e.target.value) : null
                  })}
                  placeholder="Leave empty for no pendant"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePricing} disabled={savePricingMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save Pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
