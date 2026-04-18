import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Bot, User, Loader2 } from "lucide-react";

export type AgentStatus = "online" | "processing" | "offline" | "escalated";

interface AgentStatusIndicatorProps {
  status: AgentStatus;
  estimatedWait?: number; // minutes
  className?: string;
}

export function AgentStatusIndicator({
  status,
  estimatedWait,
  className,
}: AgentStatusIndicatorProps) {
  const { t } = useTranslation();

  const statusConfig: Record<
    AgentStatus,
    { label: string; dotClass: string; icon: React.ElementType }
  > = {
    online: {
      label: t("agentStatus.online", "AI Agent Online"),
      dotClass: "bg-green-500",
      icon: Bot,
    },
    processing: {
      label: t("agentStatus.processing", "Processing..."),
      dotClass: "bg-yellow-500",
      icon: Loader2,
    },
    offline: {
      label: t("agentStatus.offline", "AI Agent Offline"),
      dotClass: "bg-gray-400",
      icon: Bot,
    },
    escalated: {
      label: t("agentStatus.escalated", "Waiting for human agent"),
      dotClass: "bg-blue-500",
      icon: User,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        "bg-muted/50 border border-border",
        className
      )}
    >
      {/* Animated status dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            config.dotClass,
            status === "online" && "animate-ping",
            status === "processing" && "animate-pulse"
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            config.dotClass
          )}
        />
      </span>

      {/* Icon */}
      <Icon
        className={cn(
          "h-3 w-3 text-muted-foreground",
          status === "processing" && "animate-spin"
        )}
      />

      {/* Label */}
      <span className="text-muted-foreground">{config.label}</span>

      {/* Estimated wait time for escalated conversations */}
      {status === "escalated" && estimatedWait !== undefined && (
        <span className="text-muted-foreground/70">
          {t("agentStatus.estimatedWait", "~{{minutes}} min", {
            minutes: estimatedWait,
          })}
        </span>
      )}
    </div>
  );
}
