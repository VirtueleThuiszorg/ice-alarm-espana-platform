import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Facebook,
  Youtube,
  Check,
  Eye,
  EyeOff,
  Save,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { useYouTubeIntegration } from "@/hooks/useYouTubeIntegration";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const EXPECTED_CHANNEL_ID = "UCT9_R7Czan0lPFvq5XyV5kg";

interface SocialMediaSectionProps {
  facebookPageId: string;
  setFacebookPageId: React.Dispatch<React.SetStateAction<string>>;
  facebookTokenInput: string;
  setFacebookTokenInput: React.Dispatch<React.SetStateAction<string>>;
  facebookTokenStored: boolean;
  showFacebookToken: boolean;
  setShowFacebookToken: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveFacebook: () => void;
  isSaving: boolean;
  isConfigured: boolean;
}

export function SocialMediaSection({
  facebookPageId,
  setFacebookPageId,
  facebookTokenInput,
  setFacebookTokenInput,
  facebookTokenStored,
  showFacebookToken,
  setShowFacebookToken,
  handleSaveFacebook,
  isSaving,
  isConfigured,
}: SocialMediaSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [youtubeDefaultsOpen, setYoutubeDefaultsOpen] = useState(false);
  
  const {
    integration: youtubeIntegration,
    isLoading: youtubeLoading,
    isConnected: youtubeConnected,
    connect: connectYouTube,
    isConnecting,
    disconnect: disconnectYouTube,
    isDisconnecting,
    refresh: refreshYouTube,
  } = useYouTubeIntegration();

  // Fetch YouTube default settings
  const { data: youtubeDefaults } = useQuery({
    queryKey: ["youtube-default-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "settings_youtube_default_visibility",
          "settings_youtube_default_tags",
          "settings_youtube_default_description_footer",
        ]);
      if (error) throw error;
      
      const map: Record<string, string> = {};
      data?.forEach((s) => {
        const key = s.key.replace("settings_youtube_default_", "");
        map[key] = s.value;
      });
      return map;
    },
    enabled: youtubeConnected,
  });

  const [defaultVisibility, setDefaultVisibility] = useState(youtubeDefaults?.visibility || "unlisted");
  const [defaultTags, setDefaultTags] = useState(youtubeDefaults?.tags || "");
  const [defaultDescriptionFooter, setDefaultDescriptionFooter] = useState(
    youtubeDefaults?.description_footer || ""
  );

  // Save YouTube defaults mutation
  const saveDefaultsMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("save-api-keys", {
        body: { service: "settings", keys: updates },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-default-settings"] });
      toast({ title: "YouTube defaults saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving defaults", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveYouTubeDefaults = () => {
    saveDefaultsMutation.mutate({
      settings_youtube_default_visibility: defaultVisibility,
      settings_youtube_default_tags: defaultTags,
      settings_youtube_default_description_footer: defaultDescriptionFooter,
    });
  };

  return (
    <div className="space-y-6">
      {/* Facebook Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5" />
            Facebook Page
            {isConfigured ? (
              <Badge className="bg-alert-resolved text-alert-resolved-foreground ml-2">
                <Check className="mr-1 h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 ml-2">
                <AlertCircle className="mr-1 h-3 w-3" />
                Not Configured
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Connect your Facebook Page to publish social media posts. Get credentials from the{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Meta Graph API Explorer
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Page ID</Label>
              <Input
                value={facebookPageId}
                onChange={(e) => setFacebookPageId(e.target.value)}
                placeholder="123456789012345"
              />
              <p className="text-xs text-muted-foreground">
                Use the numeric Page ID from <code>/me/accounts</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Page Access Token</Label>
              {facebookTokenStored && !facebookTokenInput && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Token saved (hidden for security). Paste a new token below to replace it.</span>
                </div>
              )}
              <div className="relative">
                <Input
                  type={showFacebookToken ? "text" : "password"}
                  value={facebookTokenInput}
                  onChange={(e) => setFacebookTokenInput(e.target.value)}
                  placeholder={facebookTokenStored ? "Paste new token to replace..." : "EAA..."}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 z-10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowFacebookToken((prev) => !prev)}
                >
                  {showFacebookToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use a <strong>Page Access Token</strong> (from <code>/me/accounts</code>) with{" "}
                <code>pages_manage_posts</code>.
              </p>
            </div>
          </div>

          <Button onClick={handleSaveFacebook} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Facebook Configuration
          </Button>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">Required Permissions</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • <code>pages_manage_posts</code> - Publish and manage posts
              </li>
              <li>
                • <code>pages_read_engagement</code> - Read post metrics
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* YouTube Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-600" />
            YouTube Channel
            {youtubeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : youtubeConnected ? (
              <Badge className="bg-alert-resolved text-alert-resolved-foreground ml-2">
                <Check className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 ml-2">
                <AlertCircle className="mr-1 h-3 w-3" />
                Not Connected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Connect your YouTube channel to publish videos directly from Video Hub.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {youtubeIntegration?.connected ? (
            <>
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {youtubeIntegration.thumbnail_url && (
                    <img
                      src={youtubeIntegration.thumbnail_url}
                      alt="Channel"
                      className="h-12 w-12 rounded-full"
                    />
                  )}
                  <div>
                    <p className="font-medium">{youtubeIntegration.channel_name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      ID: {youtubeIntegration.channel_id}
                      {youtubeIntegration.channel_mismatch && (
                        <span className="text-amber-600 flex items-center gap-1 ml-2">
                          <AlertCircle className="h-3 w-3" />
                          Not ICE Alarm España
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {youtubeIntegration.last_used_at && (
                  <p className="text-xs text-muted-foreground">
                    Last used: {format(new Date(youtubeIntegration.last_used_at), "MMM d, yyyy 'at' HH:mm")}
                  </p>
                )}
                {youtubeIntegration.channel_mismatch && (
                  <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-700">
                      <AlertCircle className="inline h-4 w-4 mr-1" />
                      Warning: Connected channel ID does not match the expected ICE Alarm España channel ({EXPECTED_CHANNEL_ID}).
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refreshYouTube()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectYouTube()}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : null}
                  Disconnect
                </Button>
              </div>

              {/* Publishing Defaults */}
              <Collapsible open={youtubeDefaultsOpen} onOpenChange={setYoutubeDefaultsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                  <Settings2 className="h-4 w-4" />
                  Publishing Defaults
                  <ChevronDown className={`h-4 w-4 transition-transform ${youtubeDefaultsOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Default Visibility</Label>
                    <Select value={defaultVisibility} onValueChange={setDefaultVisibility}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Default Tags</Label>
                    <Input
                      value={defaultTags}
                      onChange={(e) => setDefaultTags(e.target.value)}
                      placeholder="ice alarm, elderly care, spain"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated tags</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Description Footer</Label>
                    <Input
                      value={defaultDescriptionFooter}
                      onChange={(e) => setDefaultDescriptionFooter(e.target.value)}
                      placeholder="ICE Alarm España - www.icealarm.es"
                    />
                    <p className="text-xs text-muted-foreground">Appended to all video descriptions</p>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSaveYouTubeDefaults}
                    disabled={saveDefaultsMutation.isPending}
                  >
                    {saveDefaultsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Defaults
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            <Button onClick={() => connectYouTube()} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Youtube className="h-4 w-4 mr-2" />
              )}
              Connect YouTube Channel
            </Button>
          )}

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">Required Scopes</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <code>youtube.upload</code> - Upload videos</li>
              <li>• <code>youtube</code> - Manage account</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
