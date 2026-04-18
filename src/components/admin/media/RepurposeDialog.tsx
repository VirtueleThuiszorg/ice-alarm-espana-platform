import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Video, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";

interface RepurposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: {
    id: string;
    topic: string | null;
    post_text: string | null;
    language: string;
    goal: string | null;
    target_audience: string | null;
    image_url: string | null;
  } | null;
}

export function RepurposeDialog({ open, onOpenChange, post }: RepurposeDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targets, setTargets] = useState({ video: false, outreach: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ video?: string; outreach?: string } | null>(null);

  const handleRepurpose = async () => {
    if (!post || (!targets.video && !targets.outreach)) return;

    setIsProcessing(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("repurpose-content", {
        body: {
          post_id: post.id,
          post_text: post.post_text,
          topic: post.topic,
          language: post.language,
          goal: post.goal,
          target_audience: post.target_audience,
          image_url: post.image_url,
          targets: {
            video: targets.video,
            outreach: targets.outreach,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults(data.results);

      if (data.results?.video) {
        queryClient.invalidateQueries({ queryKey: ["video-projects"] });
      }
      if (data.results?.outreach) {
        queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      }

      toast({
        title: i18n.t("mediaManager.repurpose.success"),
        description: i18n.t("mediaManager.repurpose.successDesc"),
      });
    } catch (err: any) {
      toast({
        title: i18n.t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setTargets({ video: false, outreach: false });
    setResults(null);
    onOpenChange(false);
  };

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("mediaManager.repurpose.title")}
          </DialogTitle>
          <DialogDescription>
            {t("mediaManager.repurpose.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source post info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium text-sm">{post.topic || t("mediaManager.repurpose.untitled")}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.post_text?.slice(0, 120)}...</p>
          </div>

          {/* Target checkboxes */}
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("mediaManager.repurpose.selectTargets")}</p>

            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                id="target-video"
                checked={targets.video}
                onCheckedChange={(checked) => setTargets(prev => ({ ...prev, video: !!checked }))}
                disabled={isProcessing}
              />
              <div className="flex-1">
                <Label htmlFor="target-video" className="flex items-center gap-2 cursor-pointer">
                  <Video className="h-4 w-4 text-purple-500" />
                  {t("mediaManager.repurpose.createVideo")}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("mediaManager.repurpose.createVideoDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                id="target-outreach"
                checked={targets.outreach}
                onCheckedChange={(checked) => setTargets(prev => ({ ...prev, outreach: !!checked }))}
                disabled={isProcessing}
              />
              <div className="flex-1">
                <Label htmlFor="target-outreach" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="h-4 w-4 text-blue-500" />
                  {t("mediaManager.repurpose.createOutreach")}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("mediaManager.repurpose.createOutreachDesc")}
                </p>
              </div>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="space-y-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                {t("mediaManager.repurpose.created")}
              </p>
              {results.video && (
                <Badge variant="secondary" className="gap-1">
                  <Video className="h-3 w-3" /> {t("mediaManager.repurpose.videoCreated")}
                </Badge>
              )}
              {results.outreach && (
                <Badge variant="secondary" className="gap-1">
                  <Mail className="h-3 w-3" /> {t("mediaManager.repurpose.outreachCreated")}
                </Badge>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {results ? t("common.close") : t("common.cancel")}
          </Button>
          {!results && (
            <Button
              onClick={handleRepurpose}
              disabled={isProcessing || (!targets.video && !targets.outreach)}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isProcessing ? t("mediaManager.repurpose.processing") : t("mediaManager.repurpose.repurpose")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
