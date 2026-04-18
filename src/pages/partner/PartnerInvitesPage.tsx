import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerData } from "@/hooks/usePartnerData";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole } from "@/config/constants";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Mail, MessageCircle, Plus, Send, QrCode, FileText, Image, File } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";
import { generateReferralLink } from "@/lib/crmEvents";

type InviteStatus = Database["public"]["Enums"]["invite_status"];
type InviteChannel = Database["public"]["Enums"]["invite_channel"];

interface Presentation {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
}

const statusColors: Record<InviteStatus, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  viewed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  registered: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  converted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return File;
  if (fileType.includes("pdf")) return FileText;
  if (fileType.includes("image")) return Image;
  return File;
};

const defaultMessages = {
  en: `Hi! I'd like to invite you to join ICE Alarm Spain - a personal emergency response service that provides peace of mind for you and your loved ones. 

Use my referral link to sign up: {referral_link}

The service includes a GPS pendant that connects you to a 24/7 emergency response center with just one button press.`,
  es: `¡Hola! Me gustaría invitarte a unirte a ICE Alarm España - un servicio de respuesta a emergencias personales que proporciona tranquilidad para ti y tus seres queridos.

Usa mi enlace de referido para registrarte: {referral_link}

El servicio incluye un colgante GPS que te conecta con un centro de respuesta de emergencias 24/7 con solo pulsar un botón.`,
};

export default function PartnerInvitesPage() {
  const queryClient = useQueryClient();
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();

  // Admin view mode detection
  const isAdminRole = isStaff && checkAdminRole(staffRole);
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    inviteeName: "",
    inviteeEmail: "",
    inviteePhone: "",
    channel: "email" as InviteChannel,
    language: "en" as "en" | "es",
    message: defaultMessages.en,
    includeQrCode: false,
    selectedPresentations: [] as string[],
  });

  const referralLink = partner
    ? generateReferralLink(partner.referral_code)
    : "";

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ["partner-invites", partner?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_invites")
        .select("*")
        .eq("partner_id", partner!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!partner?.id,
  });

  // Fetch partner presentations for attachment selection
  const { data: presentations } = useQuery({
    queryKey: ["partner-presentations", partner?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_presentations")
        .select("id, file_name, file_url, file_type")
        .eq("partner_id", partner!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Presentation[];
    },
    enabled: !!partner?.id,
  });

  const sendInviteMutation = useMutation({
    mutationFn: async () => {
      // Get selected presentation URLs
      const selectedPresentationUrls = presentations
        ?.filter(p => formData.selectedPresentations.includes(p.id))
        .map(p => ({ name: p.file_name, url: p.file_url })) || [];

      // Create invite record
      const { data: invite, error: inviteError } = await supabase
        .from("partner_invites")
        .insert({
          partner_id: partner!.id,
          invitee_name: formData.inviteeName,
          invitee_email: formData.inviteeEmail || null,
          invitee_phone: formData.inviteePhone || null,
          channel: formData.channel,
          status: "sent",
          sent_at: new Date().toISOString(),
          metadata: { 
            language: formData.language, 
            message: formData.message,
            includedQrCode: formData.includeQrCode,
            attachedPresentations: formData.selectedPresentations,
          },
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Call edge function to send the actual message
      const { error: sendError } = await supabase.functions.invoke("partner-send-invite", {
        body: {
          inviteId: invite.id,
          channel: formData.channel,
          recipient: formData.channel === "email" ? formData.inviteeEmail : formData.inviteePhone,
          message: formData.message.replace("{referral_link}", referralLink),
          language: formData.language,
          includeQrCode: formData.includeQrCode,
          presentations: selectedPresentationUrls,
          referralCode: partner!.referral_code,
          referralLink: referralLink,
        },
      });

      if (sendError) {
        // Update status to draft if sending failed
        await supabase
          .from("partner_invites")
          .update({ status: "draft", sent_at: null })
          .eq("id", invite.id);
        throw sendError;
      }

      return invite;
    },
    onSuccess: () => {
      toast.success("Invite sent successfully!");
      queryClient.invalidateQueries({ queryKey: ["partner-invites"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to send invite: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      inviteeName: "",
      inviteeEmail: "",
      inviteePhone: "",
      channel: "email",
      language: "en",
      message: defaultMessages.en,
      includeQrCode: false,
      selectedPresentations: [],
    });
  };

  const togglePresentation = (presentationId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedPresentations: prev.selectedPresentations.includes(presentationId)
        ? prev.selectedPresentations.filter(id => id !== presentationId)
        : [...prev.selectedPresentations, presentationId],
    }));
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  const shareViaWhatsApp = () => {
    const message = encodeURIComponent(
      `Join ICE Alarm Spain with my referral link: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent("Join ICE Alarm Spain");
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to invite you to join ICE Alarm Spain - a personal emergency response service.\n\nSign up here: ${referralLink}\n\nBest regards`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleLanguageChange = (lang: "en" | "es") => {
    setFormData({
      ...formData,
      language: lang,
      message: defaultMessages[lang],
    });
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        
        {/* Referral link card skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>
        
        {/* Invites table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invites</h1>
          <p className="text-muted-foreground">
            {isAdminViewMode 
              ? `Viewing ${partner?.contact_name}'s invites`
              : "Share your referral link and track your invitations"
            }
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Send Invite
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Send New Invite</DialogTitle>
                <DialogDescription>
                  Send a personalized invitation to a potential customer
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="inviteeName">Name *</Label>
                  <Input
                    id="inviteeName"
                    value={formData.inviteeName}
                    onChange={(e) =>
                      setFormData({ ...formData, inviteeName: e.target.value })
                    }
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="channel">Channel *</Label>
                    <Select
                      value={formData.channel}
                      onValueChange={(value: InviteChannel) =>
                        setFormData({ ...formData, channel: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="language">Language</Label>
                    <Select
                      value={formData.language}
                      onValueChange={handleLanguageChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.channel === "email" ? (
                  <div>
                    <Label htmlFor="inviteeEmail">Email *</Label>
                    <Input
                      id="inviteeEmail"
                      type="email"
                      value={formData.inviteeEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, inviteeEmail: e.target.value })
                      }
                      placeholder="john@example.com"
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="inviteePhone">Phone Number *</Label>
                    <Input
                      id="inviteePhone"
                      type="tel"
                      value={formData.inviteePhone}
                      onChange={(e) =>
                        setFormData({ ...formData, inviteePhone: e.target.value })
                      }
                      placeholder="+34 600 000 000"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    rows={5}
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use {"{referral_link}"} to insert your referral link
                  </p>
                </div>

                {/* Attachments Section */}
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">Attachments</h4>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>

                  {/* QR Code Toggle */}
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="includeQrCode"
                      checked={formData.includeQrCode}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, includeQrCode: checked as boolean })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="includeQrCode" className="text-sm font-normal cursor-pointer">
                        Include QR Code
                      </Label>
                    </div>
                  </div>

                  {/* Presentations Selection */}
                  {presentations && presentations.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        Select Presentations to Include:
                      </Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {presentations.map((presentation) => {
                          const FileIcon = getFileIcon(presentation.file_type);
                          return (
                            <div key={presentation.id} className="flex items-center space-x-3">
                              <Checkbox
                                id={`presentation-${presentation.id}`}
                                checked={formData.selectedPresentations.includes(presentation.id)}
                                onCheckedChange={() => togglePresentation(presentation.id)}
                              />
                              <div className="flex items-center gap-2 min-w-0">
                                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <Label 
                                  htmlFor={`presentation-${presentation.id}`} 
                                  className="text-sm font-normal cursor-pointer truncate"
                                >
                                  {presentation.file_name}
                                </Label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(!presentations || presentations.length === 0) && (
                    <p className="text-xs text-muted-foreground">
                      No presentations uploaded yet. Add them in Marketing Tools.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => sendInviteMutation.mutate()}
                  disabled={
                    sendInviteMutation.isPending ||
                    !formData.inviteeName ||
                    (formData.channel === "email" && !formData.inviteeEmail) ||
                    (formData.channel !== "email" && !formData.inviteePhone)
                  }
                >
                  {sendInviteMutation.isPending ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Invite
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </div>

      {/* Referral Link Card - read-only for admins */}
      <Card>
        <CardHeader>
          <CardTitle>Referral Link</CardTitle>
          <CardDescription>
            {isAdminViewMode 
              ? `${partner?.contact_name}'s referral link`
              : "Share this link to earn commissions on every successful referral"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm border truncate">
              {referralLink}
            </code>
            <Button variant="outline" onClick={copyReferralLink}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={shareViaWhatsApp}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Share via WhatsApp
            </Button>
            <Button variant="outline" onClick={shareViaEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Share via Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invites Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sent Invites</CardTitle>
          <CardDescription>Track the status of invitations</CardDescription>
        </CardHeader>
        <CardContent>
          {invitesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : invites?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No invites sent yet</p>
              <p className="text-sm">Start inviting people to earn commissions!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites?.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">
                      {invite.invitee_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invite.invitee_email || invite.invitee_phone || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {invite.channel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[invite.status]}>
                        {invite.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invite.sent_at
                        ? format(new Date(invite.sent_at), "dd MMM yyyy HH:mm")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
