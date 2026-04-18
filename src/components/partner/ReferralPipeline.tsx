import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Database } from "@/integrations/supabase/types";

type InviteStatus = Database["public"]["Enums"]["invite_status"];
type CommissionStatus = Database["public"]["Enums"]["commission_status"];

interface PipelineItem {
  id: string;
  name: string;
  stage: InviteStatus;
  createdAt: string;
  sentAt: string | null;
  commissionStatus: CommissionStatus | null;
  commissionAmount: number | null;
}

interface ReferralPipelineProps {
  partnerId: string | undefined;
}

const stageColors: Record<InviteStatus, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  viewed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  registered: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  converted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const commissionColors: Record<CommissionStatus, string> = {
  pending_release: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export function ReferralPipeline({ partnerId }: ReferralPipelineProps) {
  const { t } = useTranslation();

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ["partner-pipeline", partnerId],
    queryFn: async () => {
      const { data: invites, error: invitesError } = await supabase
        .from("partner_invites")
        .select("id, invitee_name, status, created_at, sent_at, converted_member_id")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false })
        .limit(10);

      if (invitesError) throw invitesError;

      const memberIds = invites
        ?.filter((i) => i.converted_member_id)
        .map((i) => i.converted_member_id)
        .filter((x): x is string => x !== null) || [];

      const commissionsMap: Record<string, { status: CommissionStatus; amount: number }> = {};

      if (memberIds.length > 0) {
        const { data: commissions } = await supabase
          .from("partner_commissions")
          .select("member_id, status, amount_eur")
          .eq("partner_id", partnerId!)
          .in("member_id", memberIds);

        commissions?.forEach((c) => {
          commissionsMap[c.member_id] = {
            status: c.status,
            amount: Number(c.amount_eur),
          };
        });
      }

      return invites?.map((invite): PipelineItem => {
        const commission = invite.converted_member_id
          ? commissionsMap[invite.converted_member_id]
          : null;

        return {
          id: invite.id,
          name: invite.invitee_name,
          stage: invite.status,
          createdAt: invite.created_at,
          sentAt: invite.sent_at,
          commissionStatus: commission?.status || null,
          commissionAmount: commission?.amount || null,
        };
      }) || [];
    },
    enabled: !!partnerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("partner.pipeline.title", "Referral Pipeline")}</CardTitle>
        <CardDescription>{t("partner.pipeline.subtitle", "Recent invites and their progress")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : pipeline?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t("partner.pipeline.empty", "No invites yet. Start inviting people to earn commissions!")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name", "Name")}</TableHead>
                <TableHead>{t("partner.pipeline.stage", "Stage")}</TableHead>
                <TableHead>{t("partner.pipeline.sent", "Sent")}</TableHead>
                <TableHead>{t("partner.pipeline.commission", "Commission")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipeline?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge className={stageColors[item.stage]}>
                      {item.stage.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.sentAt
                      ? format(new Date(item.sentAt), "dd MMM yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {item.commissionStatus ? (
                      <div className="flex items-center gap-2">
                        <Badge className={commissionColors[item.commissionStatus]}>
                          {item.commissionStatus.replace("_", " ")}
                        </Badge>
                        <span className="text-sm">
                          &euro;{item.commissionAmount?.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
