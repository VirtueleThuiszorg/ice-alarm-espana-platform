import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerData } from "@/hooks/usePartnerData";
import { format } from "date-fns";
import { FileSignature, Check, Clock, User, CreditCard, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { agreementSections } from "@/content/partnerAgreementTerms";

export default function PartnerAgreementPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { isStaff, staffRole } = useAuth();

  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  // Fetch the agreement if signed
  const { data: agreement, isLoading: agreementLoading } = useQuery({
    queryKey: ["partner-agreement", partner?.id],
    queryFn: async () => {
      if (!partner?.id) return null;

      const { data, error } = await supabase
        .from("partner_agreements")
        .select("*")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!partner?.id,
  });

  const isLoading = partnerLoading || agreementLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const isSigned = !!partner?.agreement_signed_at;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileSignature className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("partnerAgreement.title")}</h1>
            <p className="text-muted-foreground">{t("partnerAgreement.pageDescription")}</p>
          </div>
        </div>

        {isSigned && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <Check className="h-3 w-3 mr-1" />
            {t("partnerAgreement.signed")}
          </Badge>
        )}
      </div>

      {isSigned && agreement ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Signature Details Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                {t("partnerAgreement.signatureDetails")}
              </CardTitle>
              <CardDescription>{t("partnerAgreement.signedOn")} {format(new Date(agreement.signed_at), "PPP")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("partnerAgreement.signerName")}</p>
                  <p className="font-medium">{agreement.signer_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("partnerAgreement.idDocument")}</p>
                  <p className="font-medium">{agreement.signer_id_type}: {agreement.signer_id_number}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("partnerAgreement.signedAt")}</p>
                  <p className="font-medium">{format(new Date(agreement.signed_at), "PPpp")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("partnerAgreement.version")}</p>
                  <p className="font-medium">{agreement.version}</p>
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{t("partnerAgreement.confirmRead")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{t("partnerAgreement.confirmUnderstand")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{t("partnerAgreement.confirmAccept")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agreement Content */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("partnerAgreement.agreementText")}</CardTitle>
              <CardDescription>{t("partnerAgreement.signedVersion")}: {agreement.version}</CardDescription>
            </CardHeader>
            <CardContent>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full mb-4">
                    {t("partnerAgreement.viewFullAgreement")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[500px] border rounded-lg p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {agreementSections.map((section, index) => (
                        <section key={index} className="mb-6">
                          <h3 className="text-base font-semibold mb-2">
                            {index + 1}. {t(section.titleKey)}
                          </h3>
                          <div 
                            className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line"
                            dangerouslySetInnerHTML={{ __html: t(section.contentKey) }}
                          />
                        </section>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Not Signed State - This shouldn't normally be visible due to the blocking modal */
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-600">{t("partnerAgreement.notSigned")}</CardTitle>
            <CardDescription>{t("partnerAgreement.notSignedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t("partnerAgreement.refreshToSign")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
