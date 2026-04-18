import { 
  UserPlus, 
  Smartphone, 
  CreditCard, 
  Settings, 
  Edit,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  type: "member_added" | "device_assigned" | "alert_resolved" | "payment_received" | "settings_changed" | "member_updated" | "alert_triggered";
  description: string;
  timestamp: Date;
  user?: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
}

const activityConfig = {
  member_added: {
    icon: UserPlus,
    color: "text-alert-resolved bg-alert-resolved/10",
  },
  device_assigned: {
    icon: Smartphone,
    color: "text-primary bg-primary/10",
  },
  alert_resolved: {
    icon: CheckCircle,
    color: "text-alert-resolved bg-alert-resolved/10",
  },
  alert_triggered: {
    icon: AlertTriangle,
    color: "text-alert-sos bg-alert-sos/10",
  },
  payment_received: {
    icon: CreditCard,
    color: "text-alert-resolved bg-alert-resolved/10",
  },
  settings_changed: {
    icon: Settings,
    color: "text-muted-foreground bg-muted",
  },
  member_updated: {
    icon: Edit,
    color: "text-alert-checkin bg-alert-checkin/10",
  },
};

export function ActivityFeed({ activities, maxItems = 10 }: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayActivities.map((activity) => {
            const config = activityConfig[activity.type];
            const Icon = config.icon;

            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={cn(
                  "rounded-full p-2 shrink-0",
                  config.color
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{activity.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(activity.timestamp)}
                    </span>
                    {activity.user && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {activity.user}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {activities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent activity
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  return date.toLocaleDateString();
}
