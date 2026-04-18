import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, User, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { AIAgent } from "@/hooks/useAIAgents";

interface AIAvatarUploadProps {
  agent: AIAgent;
}

export function AIAvatarUpload({ agent }: AIAvatarUploadProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: t("common.error", "Error"),
        description: t("ai.avatarInvalidType", "Please upload a JPG, PNG, or WebP image"),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("common.error", "Error"),
        description: t("ai.avatarTooLarge", "Image must be less than 5MB"),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Create unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${agent.agent_key}-${Date.now()}.${fileExt}`;

      // Delete old avatar if exists
      if (agent.avatar_url) {
        const oldPath = agent.avatar_url.split("/").pop();
        if (oldPath) {
          await supabase.storage.from("ai-agent-avatars").remove([oldPath]);
        }
      }

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from("ai-agent-avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("ai-agent-avatars")
        .getPublicUrl(fileName);

      // Update agent with new avatar URL
      const { error: updateError } = await supabase
        .from("ai_agents")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", agent.id);

      if (updateError) throw updateError;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent", agent.agent_key] });

      toast({
        title: t("ai.avatarUploaded", "Avatar uploaded"),
        description: t("ai.avatarUploadedDescription", "Agent avatar has been updated"),
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        title: t("common.error", "Error"),
        description: t("ai.avatarUploadError", "Failed to upload avatar"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!agent.avatar_url) return;

    setIsUploading(true);
    try {
      // Delete file from storage
      const fileName = agent.avatar_url.split("/").pop();
      if (fileName) {
        await supabase.storage.from("ai-agent-avatars").remove([fileName]);
      }

      // Update agent to remove avatar URL
      const { error: updateError } = await supabase
        .from("ai_agents")
        .update({ avatar_url: null })
        .eq("id", agent.id);

      if (updateError) throw updateError;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent", agent.agent_key] });

      toast({
        title: t("ai.avatarRemoved", "Avatar removed"),
        description: t("ai.avatarRemovedDescription", "Agent avatar has been removed"),
      });
    } catch (error) {
      console.error("Avatar remove error:", error);
      toast({
        title: t("common.error", "Error"),
        description: t("ai.avatarRemoveError", "Failed to remove avatar"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="h-16 w-16 border-2 border-border">
          <AvatarImage src={agent.avatar_url || undefined} alt={agent.name} />
          <AvatarFallback className="bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </AvatarFallback>
        </Avatar>
        {agent.avatar_url && (
          <Badge 
            variant="secondary" 
            className="absolute -bottom-1 -right-1 text-[10px] px-1.5"
          >
            {t("common.custom", "Custom")}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {t("ai.uploadAvatar", "Upload Avatar")}
          </Button>
          {agent.avatar_url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveAvatar}
              disabled={isUploading}
            >
              <X className="h-4 w-4 mr-2" />
              {t("common.remove", "Remove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("ai.avatarDescription", "This image appears in the chat widget")}
        </p>
      </div>
    </div>
  );
}
