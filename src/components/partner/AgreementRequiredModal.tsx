import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileSignature, AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { agreementSections, generateAgreementHtml, CURRENT_AGREEMENT_VERSION } from "@/content/partnerAgreementTerms";
import { logCrmEvent } from "@/lib/crmEvents";

interface AgreementRequiredModalProps {
  partnerId: string;
  partnerName?: string;
}

export function AgreementRequiredModal({ partnerId, partnerName }: AgreementRequiredModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [signerName, setSignerName] = useState(partnerName || "");
  const [idType, setIdType] = useState<string>("");
  const [idNumber, setIdNumber] = useState("");
  const [confirmedRead, setConfirmedRead] = useState(false);
  const [confirmedUnderstand, setConfirmedUnderstand] = useState(false);
  const [confirmedAccept, setConfirmedAccept] = useState(false);

  const canSign = signerName.trim() && idType && idNumber.trim() && confirmedRead && confirmedUnderstand && confirmedAccept;

  const signAgreementMutation = useMutation({
    mutationFn: async () => {
      const agreementHtml = generateAgreementHtml(t);

      // Insert agreement record
      const { error: agreementError } = await supabase
        .from("partner_agreements")
        .insert({
          partner_id: partnerId,
          version: CURRENT_AGREEMENT_VERSION,
          signer_name: signerName.trim(),
          signer_id_type: idType,
          signer_id_number: idNumber.trim().toUpperCase(),
          agreement_html: agreementHtml,
          confirmed_read: confirmedRead,
          confirmed_understand: confirmedUnderstand,
          confirmed_accept: confirmedAccept,
          ip_address: null,
          user_agent: navigator.userAgent,
        });

      if (agreementError) throw agreementError;

      // Update partner record
      const { error: partnerError } = await supabase
        .from("partners")
        .update({
          agreement_signed_at: new Date().toISOString(),
          agreement_version: CURRENT_AGREEMENT_VERSION,
        })
        .eq("id", partnerId);

      if (partnerError) throw partnerError;

      // Log CRM event
      await logCrmEvent("partner_created", {
        partner_id: partnerId,
        event: "agreement_signed",
        version: CURRENT_AGREEMENT_VERSION,
        signer_name: signerName.trim(),
        signer_id_type: idType,
        signed_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success(t("partnerAgreement.signedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["my-partner-data"] });
    },
    onError: (error) => {
      console.error("Error signing agreement:", error);
      toast.error(t("partnerAgreement.signError"));
    },
  });

  return (
    <Dialog 
      open={true} 
      modal={true}
    >
      <DialogContent 
        className="max-w-5xl max-h-[90vh] p-0 overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        hideCloseButton
      >
        {/* Header */}
        <DialogHeader className="border-b bg-card px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileSignature className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">{t("partnerAgreement.title")}</DialogTitle>
              <p className="text-sm text-muted-foreground">{t("partnerAgreement.requiredMessage")}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Warning Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-6 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">{t("partnerAgreement.mustSignWarning")}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Agreement Text */}
          <div className="flex-1 lg:border-r min-h-0">
            <ScrollArea className="h-full max-h-[40vh] lg:max-h-none">
              <div className="p-6 max-w-3xl mx-auto">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-muted-foreground mb-6">
                    {t("partnerAgreement.version")}: {CURRENT_AGREEMENT_VERSION} | {t("partnerAgreement.effectiveDate")}: {new Date().toLocaleDateString()}
                  </p>

                  {agreementSections.map((section, index) => (
                    <section key={index} className="mb-8">
                      <h3 className="text-lg font-semibold mb-3">
                        {index + 1}. {t(section.titleKey)}
                      </h3>
                      <div 
                        className="text-muted-foreground leading-relaxed whitespace-pre-line"
                        dangerouslySetInnerHTML={{ __html: t(section.contentKey) }}
                      />
                    </section>
                  ))}

                  <div className="mt-8 p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium">{t("partnerAgreement.legalNotice")}</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Signature Panel */}
          <div className="lg:w-96 border-t lg:border-t-0 bg-card min-h-0">
            <ScrollArea className="h-full max-h-[40vh] lg:max-h-none">
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">{t("partnerAgreement.signatureSection")}</h2>
                  <p className="text-sm text-muted-foreground">{t("partnerAgreement.signatureInstructions")}</p>
                </div>

                {/* Signer Name */}
                <div className="space-y-2">
                  <Label htmlFor="signerName">{t("partnerAgreement.signerName")} *</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder={t("partnerAgreement.signerNamePlaceholder")}
                  />
                </div>

                {/* ID Type */}
                <div className="space-y-2">
                  <Label>{t("partnerAgreement.idType")} *</Label>
                  <Select value={idType} onValueChange={setIdType}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("partnerAgreement.selectIdType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NIE">{t("partnerAgreement.idTypes.nie")}</SelectItem>
                      <SelectItem value="NIF">{t("partnerAgreement.idTypes.nif")}</SelectItem>
                      <SelectItem value="CIF">{t("partnerAgreement.idTypes.cif")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* ID Number */}
                <div className="space-y-2">
                  <Label htmlFor="idNumber">{t("partnerAgreement.idNumber")} *</Label>
                  <Input
                    id="idNumber"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                    placeholder={idType === "CIF" ? "B12345678" : "X1234567A"}
                  />
                </div>

                {/* Date (read-only) */}
                <div className="space-y-2">
                  <Label>{t("partnerAgreement.signDate")}</Label>
                  <Input
                    value={new Date().toLocaleDateString()}
                    disabled
                    className="bg-muted"
                  />
                </div>

                {/* Confirmation Checkboxes */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="confirmedRead"
                      checked={confirmedRead}
                      onCheckedChange={(checked) => setConfirmedRead(checked === true)}
                    />
                    <Label htmlFor="confirmedRead" className="text-sm leading-relaxed cursor-pointer">
                      {t("partnerAgreement.confirmRead")}
                    </Label>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="confirmedUnderstand"
                      checked={confirmedUnderstand}
                      onCheckedChange={(checked) => setConfirmedUnderstand(checked === true)}
                    />
                    <Label htmlFor="confirmedUnderstand" className="text-sm leading-relaxed cursor-pointer">
                      {t("partnerAgreement.confirmUnderstand")}
                    </Label>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="confirmedAccept"
                      checked={confirmedAccept}
                      onCheckedChange={(checked) => setConfirmedAccept(checked === true)}
                    />
                    <Label htmlFor="confirmedAccept" className="text-sm leading-relaxed cursor-pointer">
                      {t("partnerAgreement.confirmAccept")}
                    </Label>
                  </div>
                </div>

                {/* Sign Button */}
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!canSign || signAgreementMutation.isPending}
                  onClick={() => signAgreementMutation.mutate()}
                >
                  {signAgreementMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("partnerAgreement.signing")}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {t("partnerAgreement.signButton")}
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {t("partnerAgreement.legalBinding")}
                </p>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
