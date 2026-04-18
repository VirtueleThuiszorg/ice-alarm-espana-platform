import { useEffect } from "react";
import { Send, Loader2, Bot, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useAIChat } from "@/hooks/useAIChat";
import { cn } from "@/lib/utils";
import { useMemberProfile } from "@/hooks/useMemberProfile";
import { useAuth } from "@/contexts/AuthContext";

interface InlineAIChatProps {
  /** Use member_specialist agent with personalization when in member context */
  memberContext?: boolean;
}

export function InlineAIChat({ memberContext = false }: InlineAIChatProps) {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  const { data: memberProfile } = useMemberProfile();
  
  // Use member specialist agent if in member context and has member ID
  const agentKey = memberContext && memberId ? "member_specialist" : "customer_service_expert";
  const memberName = memberContext && memberProfile?.first_name ? memberProfile.first_name : null;

  const {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    sendMessage,
    handleKeyPress,
    resetConversation,
    initializeChat,
    scrollRef,
    inputRef,
    avatarUrl,
    agentLoading,
  } = useAIChat({ agentKey, memberId: memberContext ? memberId : null, memberName });

  // Initialize chat on mount
  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Header */}
      <CardHeader className="flex-row items-center gap-3 p-4 bg-primary text-primary-foreground rounded-t-lg space-y-0">
        <Avatar className="h-10 w-10 border-2 border-primary-foreground/20">
          {!agentLoading && avatarUrl ? (
            <AvatarImage src={avatarUrl} alt="Assistant" />
          ) : null}
          <AvatarFallback className="bg-primary-foreground/20">
            <Bot className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">
            {t("chat.assistantName", "ICE Alarm Assistant")}
          </h3>
          <p className="text-xs opacity-80 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
            {t("chat.available", "Available 24/7")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
          onClick={resetConversation}
          aria-label={t("chat.newChat", "New chat")}
          title={t("chat.newChat", "New chat")}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-[300px] p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8 shrink-0">
                    {!agentLoading && avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt="Assistant" />
                    ) : null}
                    <AvatarFallback className="bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-[80%] px-4 py-2 rounded-2xl text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t("chat.placeholder", "Type your message...")}
            disabled={isLoading}
            className="flex-1 rounded-full"
          />
          <Button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="rounded-full shrink-0"
            aria-label={t("chat.send", "Send")}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
