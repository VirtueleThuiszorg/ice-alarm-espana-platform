import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: "up" | "down";
  };
  icon: LucideIcon;
  variant?: "default" | "primary" | "alert" | "success" | "warning";
  className?: string;
}

export function StatsCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  variant = "default",
  className 
}: StatsCardProps) {
  const variantStyles = {
    default: {
      container: "bg-card",
      icon: "bg-secondary text-secondary-foreground",
    },
    primary: {
      container: "bg-primary text-primary-foreground",
      icon: "bg-primary-foreground/20 text-primary-foreground",
    },
    alert: {
      container: "bg-alert-sos text-alert-sos-foreground",
      icon: "bg-alert-sos-foreground/20 text-alert-sos-foreground",
    },
    success: {
      container: "bg-alert-resolved text-alert-resolved-foreground",
      icon: "bg-alert-resolved-foreground/20 text-alert-resolved-foreground",
    },
    warning: {
      container: "bg-alert-battery text-alert-battery-foreground",
      icon: "bg-alert-battery-foreground/20 text-alert-battery-foreground",
    },
  };

  const styles = variantStyles[variant];

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      styles.container,
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className={cn(
              "text-sm font-medium",
              variant === "default" ? "text-muted-foreground" : "opacity-90"
            )}>
              {title}
            </p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {change && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                change.trend === "up" 
                  ? (variant === "default" ? "text-status-active" : "opacity-90")
                  : (variant === "default" ? "text-alert-sos" : "opacity-90")
              )}>
                {change.trend === "up" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{change.value}% from last month</span>
              </div>
            )}
          </div>
          <div className={cn(
            "rounded-xl p-3",
            styles.icon
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
