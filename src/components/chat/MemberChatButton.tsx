import { useState, useEffect } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AIChatWidget } from "./AIChatWidget";
import { useAIAgent } from "@/hooks/useAIAgents";
import { useMemberProfile } from "@/hooks/useMemberProfile";

const AGENT_KEY = "member_specialist";
const AVATAR_AGENT_KEY = "customer_service_expert"; // Use same avatar as frontend

/**
 * THE ASSISTANT PILL — MEMBER_UX_RULES R3.
 *
 * *"RIGHT = Assistant outline pill, bell, A/A text size, EN/ES, initials avatar + name + role."*
 *
 * It was a bare round avatar with no visible label. For this reader that is a guess: an unlabelled
 * circular image in a header is a photograph of somebody, or an account menu, or a decoration —
 * a member has to press it to find out. The `aria-label` meant a screen reader was better served
 * than the person looking at the screen. An outline pill saying "Assistant" needs no guessing, and
 * outline rather than red because R1 rations red to the page's own action.
 *
 * THE PULSING GREEN DOT IS GONE, and this is the part worth reading. It was a hard-coded
 * `bg-green-500` with `animate-ping`, driven by nothing. The member surface already uses a small
 * round green dot for ONE thing: `is_online`, the pendant's connectivity — `ClientDashboard` and
 * `DevicePage` both render it from real data. So the same mark on a header button teaches a member
 * that a green dot means their alarm is connected, and then shows them one that does not.
 *
 * There is nothing wrong with saying the assistant is always available; `chat.available` says it
 * in words inside the widget, where it is a sentence rather than a signal.
 */
interface MemberChatButtonProps {
  className?: string;
  memberId?: string | null;
}

export function MemberChatButton({ className, memberId }: MemberChatButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [imagePreloaded, setImagePreloaded] = useState(false);
  
  // Fetch the customer service agent for avatar (matches frontend widget)
  const { data: avatarAgent } = useAIAgent(AVATAR_AGENT_KEY);
  const avatarUrl = avatarAgent?.avatar_url;

  // Fetch member profile for personalization
  const { data: memberProfile } = useMemberProfile();
  const memberName = memberProfile?.first_name || null;

  // Preload avatar image for instant display
  useEffect(() => {
    if (avatarUrl && !imagePreloaded) {
      const img = new Image();
      img.src = avatarUrl;
      img.onload = () => setImagePreloaded(true);
    }
  }, [avatarUrl, imagePreloaded]);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className={cn("gap-2", className)}
        data-testid="assistant-pill"
      >
        {avatarUrl && imagePreloaded ? (
          /* alt="" deliberately: the word "Assistant" is right next to it, and an alt of its own
             makes a screen reader announce the same thing twice. */
          <img
            src={avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <Bot className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{t("chat.assistant", "Assistant")}</span>
      </Button>

      {isOpen && (
        <AIChatWidget 
          defaultOpen={true} 
          onClose={() => setIsOpen(false)}
          agentKey={AGENT_KEY}
          memberId={memberId}
          memberName={memberName}
        />
      )}
    </>
  );
}
