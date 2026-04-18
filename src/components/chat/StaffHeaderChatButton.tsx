import { useState, useEffect } from "react";
import { Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AIChatWidget } from "./AIChatWidget";
import { useAIAgent } from "@/hooks/useAIAgents";

const AGENT_KEY = "staff_support_specialist";

interface StaffHeaderChatButtonProps {
  className?: string;
  staffName?: string | null;
}

export function StaffHeaderChatButton({ className, staffName }: StaffHeaderChatButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [imagePreloaded, setImagePreloaded] = useState(false);
  
  const { data: staffSupportAgent } = useAIAgent(AGENT_KEY);
  const avatarUrl = staffSupportAgent?.avatar_url;

  // Preload avatar image
  useEffect(() => {
    if (avatarUrl) {
      const img = new Image();
      img.onload = () => setImagePreloaded(true);
      img.onerror = () => setImagePreloaded(false);
      img.src = avatarUrl;
    }
  }, [avatarUrl]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "relative h-9 w-9 rounded-full flex items-center justify-center",
          "bg-primary/10 hover:bg-primary/20 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          className
        )}
        aria-label={t("aiChat.openChat")}
      >
        {avatarUrl && imagePreloaded ? (
          <img
            src={avatarUrl}
            alt="AI Assistant"
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <Headset className="h-5 w-5 text-primary" />
        )}
        
        {/* Online indicator */}
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-alert-resolved border-2 border-background">
          <span className="absolute inset-0 rounded-full bg-alert-resolved animate-ping opacity-75" />
        </span>
      </button>

      {isOpen && (
        <AIChatWidget
          defaultOpen={true}
          onClose={() => setIsOpen(false)}
          agentKey={AGENT_KEY}
          staffName={staffName}
          userRole="staff"
        />
      )}
    </>
  );
}
