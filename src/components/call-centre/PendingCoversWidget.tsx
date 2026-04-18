import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMyPendingCovers, useShiftCoverMutations } from "@/hooks/useShiftCovers";
import { SHIFT_TYPES } from "@/config/shifts";
import type { ShiftType } from "@/config/shifts";
import { format, formatDistanceToNow } from "date-fns";

interface PendingCoversWidgetProps {
  staffId: string | undefined;
}

export function PendingCoversWidget({ staffId }: PendingCoversWidgetProps) {
  const { t } = useTranslation();
  const { data: covers = [] } = useMyPendingCovers(staffId);
  const { respondToCover } = useShiftCoverMutations();

  if (covers.length === 0) return null;

  return (
    <Card className="shadow-sm bg-background/80 border-amber-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-amber-500" />
            {t("staffDashboard.pendingCovers", "Pending Cover Requests")}
          </CardTitle>
          <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
            {covers.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {covers.map((cover) => {
            const shiftType = (cover.shift?.shift_type || "morning") as ShiftType;
            const config = SHIFT_TYPES[shiftType];
            return (
              <div key={cover.id} className="p-3 border rounded-lg border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t("covers.coverFor", "Cover for")}{" "}
                      {cover.original_staff?.first_name} {cover.original_staff?.last_name}
                    </p>
                    {cover.shift && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(cover.shift.shift_date + "T12:00:00"), "EEE d MMM")} —{" "}
                        <Badge className={`${config.bgClass} ${config.textClass} border-0 text-xs`}>
                          {config.label}
                        </Badge>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("covers.expiresIn", "Expires")}{" "}
                      {formatDistanceToNow(new Date(cover.expires_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => respondToCover.mutateAsync({ id: cover.id, status: "accepted" })}
                    disabled={respondToCover.isPending}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t("covers.accept", "Accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => respondToCover.mutateAsync({ id: cover.id, status: "declined" })}
                    disabled={respondToCover.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t("covers.decline", "Decline")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
