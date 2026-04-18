import { useTranslation } from "react-i18next";
import { Battery, BatteryLow, MapPin, Signal, Clock, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DeviceStatusCardProps {
  batteryLevel: number;
  isConnected: boolean;
  lastCheckIn?: Date;
  location?: string;
}

export function DeviceStatusCard({ 
  batteryLevel, 
  isConnected, 
  lastCheckIn,
  location 
}: DeviceStatusCardProps) {
  const { t } = useTranslation();

  const getBatteryColor = (level: number) => {
    if (level <= 20) return "text-alert-sos";
    if (level <= 50) return "text-alert-battery";
    return "text-alert-resolved";
  };

  const getBatteryIcon = (level: number) => {
    return level <= 20 ? BatteryLow : Battery;
  };

  const BatteryIcon = getBatteryIcon(batteryLevel);

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('time.justNow');
    if (diffInMinutes < 60) return t('time.minutesAgo', { count: diffInMinutes });
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return t('time.hoursAgo', { count: diffInHours });
    
    const diffInDays = Math.floor(diffInHours / 24);
    return t('time.daysAgo', { count: diffInDays });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg">{t('deviceStatus.title')}</span>
          <div className={cn(
            "flex items-center gap-2 text-sm font-normal px-3 py-1 rounded-full",
            isConnected 
              ? "bg-alert-resolved/10 text-alert-resolved" 
              : "bg-alert-sos/10 text-alert-sos"
          )}>
            {isConnected ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {isConnected ? t('deviceStatus.connected') : t('deviceStatus.disconnected')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Battery */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BatteryIcon className={cn("w-5 h-5", getBatteryColor(batteryLevel))} />
              <span className="text-sm font-medium">{t('deviceStatus.battery')}</span>
            </div>
            <span className={cn(
              "text-sm font-semibold",
              getBatteryColor(batteryLevel),
              batteryLevel <= 20 && "battery-critical"
            )}>
              {batteryLevel}%
            </span>
          </div>
          <Progress 
            value={batteryLevel} 
            className="h-2"
          />
        </div>

        {/* Signal */}
        <div className="flex items-center justify-between py-2 border-t">
          <div className="flex items-center gap-2">
            <Signal className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{t('deviceStatus.signalStrength')}</span>
          </div>
          <span className="text-sm text-muted-foreground">{t('deviceStatus.excellent')}</span>
        </div>

        {/* Last Check-in */}
        {lastCheckIn && (
          <div className="flex items-center justify-between py-2 border-t">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t('deviceStatus.lastCheckIn')}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatRelativeTime(lastCheckIn)}
            </span>
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-start gap-2 py-2 border-t">
            <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-medium block">{t('deviceStatus.lastLocation')}</span>
              <span className="text-sm text-muted-foreground">{location}</span>
            </div>
          </div>
        )}

        {/* Status Message */}
        <div className={cn(
          "p-3 rounded-lg text-sm text-center font-medium",
          isConnected && batteryLevel > 20
            ? "bg-alert-resolved/10 text-alert-resolved"
            : "bg-alert-battery/10 text-alert-battery"
        )}>
          {isConnected && batteryLevel > 20 
            ? t('deviceStatus.workingProperly')
            : isConnected && batteryLevel <= 20
            ? t('deviceStatus.chargeSoon')
            : t('deviceStatus.connectionLost')
          }
        </div>
      </CardContent>
    </Card>
  );
}
