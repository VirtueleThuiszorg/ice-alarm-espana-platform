import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PARTNER_TYPES, getPartnerTypeLabel } from "@/config/partnerTypes";

interface InvitePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvitePartnerDialog({ open, onOpenChange }: InvitePartnerDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("es");
  const [partnerType, setPartnerType] = useState("referral");

  const resetForm = () => {
    setContactName("");
    setEmail("");
    setLanguage("es");
    setPartnerType("referral");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactName.trim() || !email.trim()) {
      toast({ title: t("partnerInvite.dialog.requiredFields", "Name and email are required"), variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("partner-admin-invite", {
        body: {
          contact_name: contactName.trim(),
          email: email.trim().toLowerCase(),
          preferred_language: language,
          partner_type: partnerType,
        },
      });

      if (error) {
        const errorData = data;
        throw new Error(errorData?.error || error.message || "Failed to send invitation");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to send invitation");
      }

      toast({ title: t("partnerInvite.dialog.success", "Invitation sent successfully!") });
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner-global-stats"] });
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t("partnerInvite.dialog.error", "Failed to send invitation"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) resetForm();
      onOpenChange(newOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("partnerInvite.dialog.title", "Invite a New Partner")}</DialogTitle>
          <DialogDescription>
            {t("partnerInvite.dialog.description", "Send an invitation email to a new partner. They will set up their own password and complete their profile.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="invite-name">{t("common.name", "Name")} *</Label>
            <Input
              id="invite-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t("partnerInvite.dialog.namePlaceholder", "Partner contact name")}
              required
            />
          </div>

          <div>
            <Label htmlFor="invite-email">{t("common.email", "Email")} *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
              required
            />
          </div>

          <div>
            <Label>{t("common.language", "Language")}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("common.partnerType", "Partner Type")}</Label>
            <Select value={partnerType} onValueChange={setPartnerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_TYPES.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value}>
                    {getPartnerTypeLabel(pt.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("partnerInvite.dialog.sending", "Sending...")}
                </>
              ) : (
                t("partnerInvite.dialog.sendInvite", "Send Invitation")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
