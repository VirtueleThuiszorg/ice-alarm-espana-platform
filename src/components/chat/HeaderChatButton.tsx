import { useState, useEffect } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AIChatWidget } from "./AIChatWidget";
import { useAIAgent } from "@/hooks/useAIAgents";

const AGENT_KEY = "customer_service_expert";

interface HeaderChatButtonProps {
  className?: string;
}

export function HeaderChatButton({ className }: HeaderChatButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [imagePreloaded, setImagePreloaded] = useState(false);

  // Fetch the customer service agent to get its avatar
  const { data: csAgent } = useAIAgent(AGENT_KEY);
  const avatarUrl = csAgent?.avatar_url;

  // Preload avatar image
  useEffect(() => {
    if (avatarUrl && !imagePreloaded) {
      const img = new Image();
      img.src = avatarUrl;
      img.onload = () => setImagePreloaded(true);
    }
  }, [avatarUrl, imagePreloaded]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "relative h-10 w-10 rounded-full overflow-hidden shadow-lg hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          className
        )}
        aria-label={t("chat.openChat", "Chat with AI Assistant")}
      >
        {avatarUrl && imagePreloaded ? (
          <img 
            src={avatarUrl} 
            alt="AI Help" 
            className="h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <div className="h-full w-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
        )}
        {/* Pulsing online indicator */}
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background">
          <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
        </span>
      </button>

      {/* Render the chat widget when open */}
      {isOpen && (
        <AIChatWidget 
          defaultOpen={true} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  );
}
