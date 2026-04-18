import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Copy, Download, Printer, Upload, Trash2, ExternalLink, FileText, FileImage, File } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerData } from "@/hooks/usePartnerData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ShareContentSection } from "@/components/partner/ShareContentSection";
import { generateReferralLink } from "@/lib/crmEvents";

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return File;
  if (fileType.includes("pdf")) return FileText;
  if (fileType.includes("image")) return FileImage;
  return File;
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MAX_PRESENTATION_SIZE_MB = 50;
const MAX_PRESENTATION_SIZE_BYTES = MAX_PRESENTATION_SIZE_MB * 1024 * 1024;

export default function PartnerMarketingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const partnerIdParam = searchParams.get("partnerId");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  // Determine if admin is viewing a specific partner
  const isAdminViewMode = !!partnerIdParam;
  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  // Fetch presentations
  const { data: presentations, isLoading: presentationsLoading } = useQuery({
    queryKey: ["partner-presentations", partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data, error } = await supabase
        .from("partner_presentations")
        .select("*")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!partner?.id,
  });

  const referralLink = partner?.referral_code 
    ? generateReferralLink(partner.referral_code) 
    : "";

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success(t("partner.linkCopied"));
  };

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${partner?.referral_code || "referral"}-qr.png`;
    link.href = url;
    link.click();
    toast.success(t("partner.qrDownloaded"));
  };

  const printQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    
    const url = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>QR Code - ${partner?.referral_code}</title></head>
          <body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
            <div style="text-align:center;">
              <img src="${url}" style="max-width:400px;" />
              <p style="font-family:sans-serif;font-size:18px;margin-top:20px;">
                ${partner?.referral_code}
              </p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !partner?.id || !user?.id) return;

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error(t("partner.invalidFileType"));
      return;
    }

    // Validate file size
    if (file.size > MAX_PRESENTATION_SIZE_BYTES) {
      toast.error(t("partner.fileTooLarge"));
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("partner-presentations")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the file path (not public URL) for signed URL generation
      // Save metadata to database
      const { error: dbError } = await supabase
        .from("partner_presentations")
        .insert({
          partner_id: partner.id,
          file_name: file.name,
          file_url: filePath,
          file_type: file.type,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["partner-presentations", partner.id] });
      toast.success(t("partner.fileUploaded"));
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(t("partner.uploadError"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const deletePresentation = async (id: string, fileUrl: string) => {
    if (!user?.id) return;

    try {
      // file_url now stores the file path directly
      await supabase.storage
        .from("partner-presentations")
        .remove([fileUrl]);

      // Delete from database
      const { error } = await supabase
        .from("partner_presentations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["partner-presentations", partner?.id] });
      toast.success(t("partner.fileDeleted"));
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(t("partner.deleteError"));
    }
  };

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from("partner-presentations")
      .createSignedUrl(filePath, 3600); // 1 hour expiry
    if (error) {
      console.error("Signed URL error:", error);
      return null;
    }
    return data.signedUrl;
  };

  const copyFileLink = async (filePath: string) => {
    const url = await getSignedUrl(filePath);
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success(t("partner.linkCopied"));
    } else {
      toast.error(t("common.error"));
    }
  };

  const openFile = async (filePath: string) => {
    const url = await getSignedUrl(filePath);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.error(t("common.error"));
    }
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!partner) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">{t("partner.notFound")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("partner.marketingTools")}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Referral Link Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("partner.yourReferralLink")}</CardTitle>
            <CardDescription>{t("partner.referralLinkDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-center">
              <div className="flex-1 min-w-0">
                <code className="block w-full rounded bg-muted px-3 py-2 text-sm border overflow-hidden text-ellipsis whitespace-nowrap">
                  {referralLink}
                </code>
              </div>
              <Button onClick={copyReferralLink} size="icon" className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t("partner.referralCode")}:</span>
              <code className="font-mono font-medium text-foreground">
                {partner.referral_code}
              </code>
            </div>
          </CardContent>
        </Card>

        {/* QR Code Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("partner.yourQrCode")}</CardTitle>
            <CardDescription>{t("partner.qrCodeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              ref={qrRef} 
              className="flex justify-center p-4 bg-white rounded-lg"
            >
              <QRCodeCanvas 
                value={referralLink}
                size={180}
                level="H"
                includeMargin
              />
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={downloadQR}>
                <Download className="h-4 w-4 mr-2" />
                {t("partner.downloadPng")}
              </Button>
              <Button variant="outline" onClick={printQR}>
                <Printer className="h-4 w-4 mr-2" />
                {t("partner.print")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Presentations Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("partner.presentations")}</CardTitle>
            <CardDescription>{t("partner.presentationsDescription")}</CardDescription>
          </div>
          <div>
            <Input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? t("common.uploading") : t("partner.uploadFile")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {presentationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : presentations && presentations.length > 0 ? (
            <div className="space-y-2">
              {presentations.map((file) => {
                const FileIcon = getFileIcon(file.file_type);
                return (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyFileLink(file.file_url)}
                        title={t("partner.copyLink")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openFile(file.file_url)}
                        title={t("partner.openFile")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePresentation(file.id, file.file_url)}
                        className="text-destructive hover:text-destructive"
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("partner.noPresentations")}</p>
              <p className="text-sm mt-1">{t("partner.uploadHint")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shareable Content Section */}
      {partner?.id && <ShareContentSection partnerId={partner.id} />}
    </div>
  );
}
