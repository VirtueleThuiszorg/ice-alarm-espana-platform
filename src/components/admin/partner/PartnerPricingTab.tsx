import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DollarSign, Plus, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePartnerPricing, useCreatePartnerPricingTier, useDeletePartnerPricingTier } from "@/hooks/usePartnerPricing";

interface PartnerPricingTabProps {
  partnerId: string;
  partnerType: string;
}

export function PartnerPricingTab({ partnerId, partnerType }: PartnerPricingTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    membership_type: "single" as "single" | "couple",
    billing_frequency: "monthly" as "monthly" | "annual",
    subscription_net_price: "",
    registration_fee: "0",
    registration_fee_discount_percent: "0",
    pendant_net_price: "",
    commission_amount: "50",
  });

  const { data: pricingTiers, isLoading } = usePartnerPricing(partnerId);
  const createTier = useCreatePartnerPricingTier();
  const deleteTier = useDeletePartnerPricingTier();

  const handleCreate = async () => {
    if (!formData.name || !formData.subscription_net_price) {
      toast.error("Name and subscription price are required");
      return;
    }

    try {
      await createTier.mutateAsync({
        partner_id: partnerId,
        name: formData.name,
        membership_type: formData.membership_type,
        billing_frequency: formData.billing_frequency,
        subscription_net_price: parseFloat(formData.subscription_net_price),
        registration_fee: parseFloat(formData.registration_fee) || 0,
        registration_fee_discount_percent: parseInt(formData.registration_fee_discount_percent) || 0,
        pendant_net_price: formData.pendant_net_price ? parseFloat(formData.pendant_net_price) : null,
        commission_amount: parseFloat(formData.commission_amount) || 50,
        effective_from: new Date().toISOString(),
        effective_to: null,
      });
      toast.success("Pricing tier created");
      setIsAddDialogOpen(false);
      setFormData({
        name: "",
        membership_type: "single",
        billing_frequency: "monthly",
        subscription_net_price: "",
        registration_fee: "0",
        registration_fee_discount_percent: "0",
        pendant_net_price: "",
        commission_amount: "50",
      });
    } catch (error) {
      toast.error("Failed to create pricing tier");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTier.mutateAsync({ id, partnerId });
      toast.success("Pricing tier deleted");
    } catch (error) {
      toast.error("Failed to delete pricing tier");
    }
  };

  if (partnerType === "referral") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Custom pricing tiers are available for Care and Residential partners only.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Referral partners use the standard commission structure.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Custom Pricing Tiers
              </CardTitle>
              <CardDescription>
                Configure special pricing for this partner's referrals
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Pricing Tier
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Pricing Tier</DialogTitle>
                  <DialogDescription>
                    Define custom pricing for members referred by this partner
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tier Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Care Home Bulk Rate"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Membership Type</Label>
                      <Select
                        value={formData.membership_type}
                        onValueChange={(v) =>
                          setFormData({ ...formData, membership_type: v as "single" | "couple" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="couple">Couple</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Billing Frequency</Label>
                      <Select
                        value={formData.billing_frequency}
                        onValueChange={(v) =>
                          setFormData({ ...formData, billing_frequency: v as "monthly" | "annual" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Subscription Price (€/period)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.subscription_net_price}
                        onChange={(e) =>
                          setFormData({ ...formData, subscription_net_price: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Registration Fee (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.registration_fee}
                        onChange={(e) => setFormData({ ...formData, registration_fee: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Pendant Price (€, optional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.pendant_net_price}
                        onChange={(e) =>
                          setFormData({ ...formData, pendant_net_price: e.target.value })
                        }
                        placeholder="Leave empty for standard"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Commission Amount (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.commission_amount}
                        onChange={(e) =>
                          setFormData({ ...formData, commission_amount: e.target.value })
                        }
                        placeholder="50.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reg. Fee Discount (%)</Label>
                    <Input
                      type="number"
                      value={formData.registration_fee_discount_percent}
                      onChange={(e) =>
                        setFormData({ ...formData, registration_fee_discount_percent: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createTier.isPending}>
                    {createTier.isPending ? "Creating..." : "Create Tier"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : pricingTiers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No custom pricing tiers configured. Standard pricing will be applied.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Subscription</TableHead>
                  <TableHead className="text-right">Reg. Fee</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingTiers?.map((tier) => (
                  <TableRow key={tier.id}>
                    <TableCell className="font-medium">{tier.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tier.membership_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tier.billing_frequency}</Badge>
                    </TableCell>
                    <TableCell className="text-right">€{tier.subscription_net_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      €{tier.registration_fee.toFixed(2)}
                      {tier.registration_fee_discount_percent > 0 && (
                        <span className="text-green-600 ml-1">
                          (-{tier.registration_fee_discount_percent}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      €{tier.commission_amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(tier.effective_from), "dd MMM yy")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Pricing Tier</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this pricing tier. Existing members using this
                              tier will not be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(tier.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
