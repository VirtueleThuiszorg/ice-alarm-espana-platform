import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Copy, 
  ImageOff, 
  Share2,
  MessageCircle,
  Mail,
  MousePointerClick,
  UserPlus,
  ShoppingCart,
  Coins
} from "lucide-react";
import { toast } from "sonner";
import { usePartnerShareableContent, PartnerPostLink } from "@/hooks/usePartnerPostLinks";

interface ShareContentSectionProps {
  partnerId: string;
}

export function ShareContentSection({ partnerId }: ShareContentSectionProps) {
  const { t } = useTranslation();
  const { data: shareableContent = [], isLoading } = usePartnerShareableContent(partnerId);

  const copyCaption = (post: PartnerPostLink["post"]) => {
    if (!post?.post_text) {
      toast.error(t("partner.share.noCaptionAvailable"));
      return;
    }
    navigator.clipboard.writeText(post.post_text);
    toast.success(t("partner.share.captionCopied"));
  };

  const copyLink = (link: PartnerPostLink) => {
    navigator.clipboard.writeText(link.tracked_url);
    toast.success(t("partner.share.linkCopied"));
  };

  const shareWhatsApp = (link: PartnerPostLink) => {
    const message = encodeURIComponent(
      `${link.post?.post_text?.substring(0, 200) || ""}\n\n${link.tracked_url}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const shareEmail = (link: PartnerPostLink) => {
    const subject = encodeURIComponent(link.post?.topic || "ICE Alarm");
    const body = encodeURIComponent(
      `${link.post?.post_text || ""}\n\n${link.tracked_url}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const getChannelBadges = (channels: string[]) => {
    if (!channels?.length) return null;
    return channels.map((channel) => (
      <Badge key={channel} variant="outline" className="text-xs capitalize">
        {channel}
      </Badge>
    ));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (shareableContent.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {t("partner.share.title")}
          </CardTitle>
          <CardDescription>{t("partner.share.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Share2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>{t("partner.share.noContent")}</p>
            <p className="text-sm mt-1">{t("partner.share.noContentHint")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          {t("partner.share.title")}
        </CardTitle>
        <CardDescription>{t("partner.share.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shareableContent.map((link) => (
            <Card key={link.id} className="overflow-hidden">
              {/* Image */}
              {link.post?.image_url ? (
                <div className="aspect-video overflow-hidden border-b bg-muted">
                  <img
                    src={link.post.image_url}
                    alt={link.post.topic || "Post image"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video border-b bg-muted flex items-center justify-center">
                  <ImageOff className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              <CardContent className="p-4 space-y-4">
                {/* Title and badges */}
                <div>
                  <h3 className="font-medium line-clamp-2">
                    {link.post?.topic || t("partner.share.untitled")}
                  </h3>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {getChannelBadges(link.post?.content_channels || [])}
                    {link.post?.language && (
                      <Badge variant="secondary" className="text-xs">
                        {link.post.language === "both" ? "🇬🇧🇪🇸" : link.post.language === "en" ? "🇬🇧" : "🇪🇸"}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="space-y-1">
                    <MousePointerClick className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-semibold">{link.clicks}</p>
                    <p className="text-xs text-muted-foreground">{t("partner.share.stats.clicks")}</p>
                  </div>
                  <div className="space-y-1">
                    <UserPlus className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-semibold">{link.signups}</p>
                    <p className="text-xs text-muted-foreground">{t("partner.share.stats.signups")}</p>
                  </div>
                  <div className="space-y-1">
                    <ShoppingCart className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-semibold">{link.purchases}</p>
                    <p className="text-xs text-muted-foreground">{t("partner.share.stats.purchases")}</p>
                  </div>
                  <div className="space-y-1">
                    <Coins className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-semibold">€{link.commission}</p>
                    <p className="text-xs text-muted-foreground">{t("partner.share.stats.commission")}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => copyCaption(link.post)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("partner.share.copyCaption")}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => copyLink(link)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("partner.share.copyLink")}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => shareWhatsApp(link)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => shareEmail(link)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </Button>
                  </div>
                </div>

                {/* Link preview */}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 truncate">
                  {link.tracked_url}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
