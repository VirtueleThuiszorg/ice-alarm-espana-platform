import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, UserCheck, Package, Clock, CheckCircle, Wallet } from "lucide-react";

interface StatsCardsProps {
  stats: {
    totalInvitesSent: number;
    totalRegistrations: number;
    totalDelivered: number;
    pendingCommission: number;
    approvedCommission: number;
    paidCommission: number;
  } | undefined;
  isLoading: boolean;
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const { t } = useTranslation();

  const cards = [
    {
      title: t("partner.stats.invitesSent", "Invites Sent"),
      value: stats?.totalInvitesSent || 0,
      icon: Send,
      format: "number",
    },
    {
      title: t("partner.stats.registrations", "Registrations"),
      value: stats?.totalRegistrations || 0,
      icon: UserCheck,
      format: "number",
    },
    {
      title: t("partner.stats.delivered", "Pendants Delivered"),
      value: stats?.totalDelivered || 0,
      icon: Package,
      format: "number",
    },
    {
      title: t("partner.stats.pendingCommission", "Pending Commission"),
      value: stats?.pendingCommission || 0,
      icon: Clock,
      format: "currency",
      className: "text-yellow-600",
    },
    {
      title: t("partner.stats.approvedCommission", "Approved Commission"),
      value: stats?.approvedCommission || 0,
      icon: CheckCircle,
      format: "currency",
      className: "text-blue-600",
    },
    {
      title: t("partner.stats.paidCommission", "Paid Commission"),
      value: stats?.paidCommission || 0,
      icon: Wallet,
      format: "currency",
      className: "text-green-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className={`text-2xl font-bold ${card.className || ""}`}>
                {card.format === "currency"
                  ? `€${card.value.toFixed(2)}`
                  : card.value}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
