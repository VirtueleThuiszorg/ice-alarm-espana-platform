import { Clock, MapPin, AlertTriangle, Heart, Battery, CheckCircle, Navigation, Radio, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AlertType = "sos_button" | "fall_detected" | "low_battery" | "geo_fence" | "check_in" | "manual" | "device_offline";
type AlertStatus = "incoming" | "in_progress" | "resolved" | "escalated";

interface AlertCardProps {
  id: string;
  type: AlertType;
  status: AlertStatus;
  memberName: string;
  location?: string;
  medicalConditions?: string[];
  receivedAt: Date;
  onClaim?: () => void;
}

const alertConfig = {
  sos_button: {
    icon: AlertTriangle,
    label: "SOS Alert",
    color: "bg-alert-sos text-alert-sos-foreground",
    borderColor: "border-l-alert-sos",
    badge: "destructive" as const,
  },
  fall_detected: {
    icon: AlertTriangle,
    label: "Fall Detected",
    color: "bg-alert-fall text-alert-fall-foreground",
    borderColor: "border-l-alert-fall",
    badge: "default" as const,
  },
  low_battery: {
    icon: Battery,
    label: "Low Battery",
    color: "bg-alert-battery text-alert-battery-foreground",
    borderColor: "border-l-alert-battery",
    badge: "secondary" as const,
  },
  geo_fence: {
    icon: Navigation,
    label: "Geo-Fence Alert",
    color: "bg-yellow-500 text-white",
    borderColor: "border-l-yellow-500",
    badge: "secondary" as const,
  },
  check_in: {
    icon: CheckCircle,
    label: "Check-in",
    color: "bg-alert-checkin text-alert-checkin-foreground",
    borderColor: "border-l-alert-checkin",
    badge: "outline" as const,
  },
  manual: {
    icon: Radio,
    label: "Manual Alert",
    color: "bg-gray-500 text-white",
    borderColor: "border-l-gray-500",
    badge: "secondary" as const,
  },
  device_offline: {
    icon: WifiOff,
    label: "Device Offline",
    color: "bg-destructive text-destructive-foreground",
    borderColor: "border-l-destructive",
    badge: "destructive" as const,
  },
};

export function AlertCard({ 
  type, 
  status, 
  memberName, 
  location, 
  medicalConditions,
  receivedAt,
  onClaim 
}: AlertCardProps) {
  const config = alertConfig[type];
  const Icon = config.icon;
  
  const timeAgo = getTimeAgo(receivedAt);

  return (
    <Card className={cn(
      "border-l-4 transition-all hover:shadow-lg",
      config.borderColor,
      status === "incoming" && "alert-pulse"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Badge className={config.color}>
                <Icon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </span>
            </div>

            {/* Member Name */}
            <h3 className="font-semibold text-lg">{memberName}</h3>

            {/* Location */}
            {location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-4 h-4 shrink-0" />
                {location}
              </p>
            )}

            {/* Medical Conditions */}
            {medicalConditions && medicalConditions.length > 0 && (
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-alert-sos shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {medicalConditions.slice(0, 3).map((condition, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {condition}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          {status === "incoming" && (
            <Button 
              onClick={onClaim}
              className="bg-primary hover:bg-primary/90"
            >
              Claim Alert
            </Button>
          )}

          {status === "in_progress" && (
            <Badge variant="outline" className="bg-alert-battery/10 text-alert-battery border-alert-battery/30">
              In Progress
            </Badge>
          )}

          {status === "escalated" && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
              Escalated
            </Badge>
          )}

          {status === "resolved" && (
            <Badge variant="outline" className="bg-alert-resolved/10 text-alert-resolved border-alert-resolved/30">
              Resolved
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
