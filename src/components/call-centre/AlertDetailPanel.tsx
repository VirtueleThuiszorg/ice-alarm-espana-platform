import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapPin, 
  Phone, 
  Clock, 
  User,
  Heart,
  Pill,
  AlertTriangle,
  Activity,
  Droplets,
  Building2,
  Stethoscope,
  Shield,
  Battery,
  Navigation,
  MessageSquare,
  PhoneCall,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LocationMap } from "@/components/maps/LocationMap";

type AlertType = "sos_button" | "fall_detected" | "low_battery" | "geo_fence" | "check_in" | "manual" | "device_offline";

interface AlertDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  alert: {
    id: string;
    type: AlertType;
    status: string;
    memberName: string;
    location?: string;
    locationLat?: number;
    locationLng?: number;
    receivedAt: Date;
    member?: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
      photoUrl?: string;
      preferredLanguage: string;
      dateOfBirth: string;
      address: string;
      specialInstructions?: string;
    };
    medicalInfo?: {
      conditions: string[];
      medications: string[];
      allergies: string[];
      bloodType?: string | null;
      doctorName?: string | null;
      doctorPhone?: string | null;
      hospitalPreference?: string | null;
    };
    device?: {
      id: string;
      status: string;
      batteryLevel?: number;
      lastCheckin?: Date;
      imei: string;
    };
    emergencyContacts?: {
      id: string;
      name: string;
      relationship: string;
      phone: string;
      email?: string;
      speaksSpanish: boolean;
      priorityOrder: number;
    }[];
    subscription?: {
      planType: string;
      hasPendant: boolean | null;
    };
    previousAlerts?: {
      id: string;
      type: AlertType;
      receivedAt: Date;
      resolvedAt?: Date;
    }[];
  } | null;
  onResolve: (alertId: string, notes: string) => void;
  onEscalate: (alertId: string) => void;
}

const alertTypeConfig = {
  sos_button: { labelKey: "callCentre.alertTypes.sos", label: "SOS Alert", color: "bg-alert-sos", icon: AlertTriangle },
  fall_detected: { labelKey: "callCentre.alertTypes.fall", label: "Fall Detected", color: "bg-alert-fall", icon: Activity },
  low_battery: { labelKey: "callCentre.alertTypes.lowBattery", label: "Low Battery", color: "bg-alert-battery", icon: Battery },
  geo_fence: { labelKey: "callCentre.alertTypes.geoFence", label: "Geo-Fence Alert", color: "bg-yellow-500", icon: Navigation },
  check_in: { labelKey: "callCentre.alertTypes.checkIn", label: "Check-in", color: "bg-alert-checkin", icon: CheckCircle },
  manual: { labelKey: "callCentre.alertTypes.manual", label: "Manual Alert", color: "bg-gray-500", icon: AlertTriangle },
  device_offline: { labelKey: "callCentre.alertTypes.deviceOffline", label: "Device Offline", color: "bg-destructive", icon: AlertTriangle },
};

export function AlertDetailPanel({ 
  isOpen, 
  onClose, 
  alert, 
  onResolve,
  onEscalate 
}: AlertDetailPanelProps) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");
  const [emergencyServicesCalled, setEmergencyServicesCalled] = useState(false);
  const [nextOfKinNotified, setNextOfKinNotified] = useState(false);
  const [showPreviousAlerts, setShowPreviousAlerts] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [sendingContactId, setSendingContactId] = useState<string | null>(null);

  if (!alert) return null;

  const config = alertTypeConfig[alert.type];
  const Icon = config.icon;

  const age = alert.member?.dateOfBirth 
    ? Math.floor((new Date().getTime() - new Date(alert.member.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const timeSinceAlert = Math.floor((new Date().getTime() - alert.receivedAt.getTime()) / 1000);
  const minutes = Math.floor(timeSinceAlert / 60);
  const seconds = timeSinceAlert % 60;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("callCentre.alert.copiedToClipboard", "Copied to clipboard") });
  };

  const handleCallMember = () => {
    if (alert.member?.phone) {
      window.location.href = `tel:${alert.member.phone}`;
    }
  };

  const handleCall112 = () => {
    window.location.href = "tel:112";
    setEmergencyServicesCalled(true);
  };

  const handleSendSms = async (message: string, toPhone?: string, recipientType: 'member' | 'emergency_contact' = 'member', contactId?: string) => {
    const phone = toPhone || alert.member?.phone;
    if (!phone) {
      toast({ title: t("callCentre.alert.noPhone", "No phone number"), description: t("callCentre.alert.noPhoneSms", "Cannot send SMS without a phone number"), variant: "destructive" });
      return;
    }

    if (contactId) {
      setSendingContactId(contactId);
    } else {
      setIsSendingSms(true);
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast({ title: t("common.notAuthenticated", "Not authenticated"), variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke("twilio-sms", {
        body: {
          to: phone,
          message,
          alertId: alert.id,
          recipientType,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send SMS");
      }

      toast({ title: t("callCentre.alert.smsSent", "SMS Sent"), description: t("callCentre.alert.messageSentTo", "Message sent to {{phone}}", { phone }) });
      
      // Log to member_interactions
      if (alert.member?.id) {
        const { data: staffData } = await supabase.auth.getUser();
        if (staffData.user) {
          const { data: staff } = await supabase
            .from("staff")
            .select("id")
            .eq("user_id", staffData.user.id)
            .single();
            
          if (staff) {
            await supabase.from("member_interactions").insert({
              member_id: alert.member.id,
              staff_id: staff.id,
              interaction_type: "sms_sent",
              description: message,
              metadata: { 
                twilio_sid: response.data?.sid,
                to: phone,
                alert_id: alert.id,
                recipient_type: recipientType
              }
            });
          }
        }
      }
    } catch (error) {
      console.error("SMS error:", error);
      toast({
        title: t("callCentre.alert.smsFailed", "Failed to send SMS"),
        description: error instanceof Error ? error.message : t("common.unknownError", "Unknown error"),
        variant: "destructive"
      });
    } finally {
      setIsSendingSms(false);
      setSendingContactId(null);
    }
  };

  const handleSendWhatsApp = async (message: string, toPhone?: string, recipientType: 'member' | 'emergency_contact' = 'member') => {
    const phone = toPhone || alert.member?.phone;
    if (!phone) {
      toast({ title: t("callCentre.alert.noPhone", "No phone number"), description: t("callCentre.alert.noPhoneWhatsApp", "Cannot send WhatsApp without a phone number"), variant: "destructive" });
      return;
    }

    setIsSendingSms(true);
    try {
      const response = await supabase.functions.invoke("twilio-whatsapp", {
        body: {
          to: phone,
          message,
          alertId: alert.id,
          recipientType,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send WhatsApp");
      }

      toast({ title: t("callCentre.alert.whatsAppSent", "WhatsApp Sent"), description: t("callCentre.alert.messageSentTo", "Message sent to {{phone}}", { phone }) });
    } catch (error) {
      console.error("WhatsApp error:", error);
      toast({
        title: t("callCentre.alert.whatsAppFailed", "Failed to send WhatsApp"),
        description: error instanceof Error ? error.message : t("common.unknownError", "Unknown error"),
        variant: "destructive"
      });
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleResolve = () => {
    if (!notes.trim()) {
      toast({ title: t("callCentre.alert.notesRequired", "Notes required"), description: t("callCentre.alert.addResolutionNotes", "Please add resolution notes"), variant: "destructive" });
      return;
    }
    onResolve(alert.id, notes);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl overflow-hidden p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-4 border-b bg-card">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn(config.color, "text-white")}>
                    <Icon className="w-3 h-3 mr-1" />
                    {t(config.labelKey, config.label)}
                  </Badge>
                  <Badge variant="outline" className="animate-pulse">
                    <Clock className="w-3 h-3 mr-1" />
                    {minutes}:{seconds.toString().padStart(2, '0')}
                  </Badge>
                </div>
                <SheetTitle className="text-2xl">
                  {alert.member?.firstName} {alert.member?.lastName || alert.memberName}
                </SheetTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {alert.member?.preferredLanguage && (
                    <Badge variant="outline">
                      <Globe className="w-3 h-3 mr-1" />
                      {alert.member.preferredLanguage === 'es' ? t("common.spanish", "Español") : t("common.english", "English")}
                    </Badge>
                  )}
                  {alert.subscription?.planType && (
                    <Badge variant="outline">
                      {alert.subscription.planType === 'couple' ? `👫 ${t("common.couple", "Couple")}` : `👤 ${t("common.single", "Single")}`}
                    </Badge>
                  )}
                  {alert.subscription?.hasPendant ? (
                    <Badge className="bg-status-active text-white">
                      <Shield className="w-3 h-3 mr-1" />
                      {t("callCentre.alert.hasPendant", "Has Pendant")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-alert-battery/10 text-alert-battery border-alert-battery/30">
                      <Phone className="w-3 h-3 mr-1" />
                      {t("callCentre.alert.phoneOnly", "Phone Only")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Phone-Only Warning */}
              {!alert.subscription?.hasPendant && (
                <div className="bg-alert-battery/10 border border-alert-battery/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-alert-battery shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-alert-battery">{t("callCentre.alert.phoneOnlyWarning", "PHONE-ONLY MEMBER")}</h4>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                        <li>• {t("callCentre.alert.noGps", "No GPS tracking available")}</li>
                        <li>• {t("callCentre.alert.noAutoLocation", "No automatic location - ask member for their location")}</li>
                        <li>• {t("callCentre.alert.noFallDetection", "No fall detection active")}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Location Section */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {t("callCentre.alert.location", "Location")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alert.locationLat && alert.locationLng ? (
                    <>
                      {alert.location && <p className="text-sm">{alert.location}</p>}
                      <LocationMap
                        lat={alert.locationLat}
                        lng={alert.locationLng}
                        address={alert.location}
                        height="160px"
                        showDirections={true}
                      />
                    </>
                  ) : alert.location ? (
                    <>
                      <p className="text-sm">{alert.location}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(alert.location!)}`, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {t("callCentre.alert.openInMaps", "Open in Maps")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(alert.location!)}`, "_blank")}
                        >
                          <Navigation className="w-3 h-3 mr-1" />
                          {t("callCentre.alert.getDirections", "Get Directions")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("callCentre.alert.noLocation", "No location data available")}</p>
                  )}
                </CardContent>
              </Card>

              {/* Member Info Section */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {t("callCentre.alert.memberInfo", "Member Information")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("common.phone", "Phone")}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{alert.member?.phone || "N/A"}</span>
                      {alert.member?.phone && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(alert.member!.phone)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {age && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("callCentre.alert.age", "Age")}</span>
                      <span className="font-medium">{t("callCentre.alert.years", "{{count}} years", { count: age })}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("common.address", "Address")}</span>
                    <span className="font-medium text-right text-sm max-w-[60%]">{alert.member?.address || "N/A"}</span>
                  </div>
                  {alert.member?.specialInstructions && (
                    <div className="mt-2 p-3 bg-accent rounded-lg border-l-4 border-primary">
                      <p className="text-sm font-medium">{t("callCentre.alert.specialInstructions", "Special Instructions")}</p>
                      <p className="text-sm text-muted-foreground">{alert.member.specialInstructions}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Medical Info Section */}
              <Card className="border-alert-sos/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-alert-sos">
                    <Heart className="w-4 h-4" />
                    {t("callCentre.alert.medicalInfo", "Medical Information")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alert.medicalInfo?.conditions && alert.medicalInfo.conditions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("callCentre.alert.conditions", "Conditions")}</p>
                      <div className="flex flex-wrap gap-1">
                        {alert.medicalInfo.conditions.map((condition, i) => (
                          <Badge key={i} variant="outline">{condition}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {alert.medicalInfo?.medications && alert.medicalInfo.medications.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Pill className="w-3 h-3" /> {t("callCentre.alert.medications", "Medications")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {alert.medicalInfo.medications.map((med, i) => (
                          <Badge key={i} variant="secondary">{med}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {alert.medicalInfo?.allergies && alert.medicalInfo.allergies.length > 0 && (
                    <div className="p-3 bg-alert-sos/10 border border-alert-sos/30 rounded-lg">
                      <p className="text-xs text-alert-sos font-semibold mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {t("callCentre.alert.allergies", "ALLERGIES")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {alert.medicalInfo.allergies.map((allergy, i) => (
                          <Badge key={i} variant="destructive">{allergy}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {alert.medicalInfo?.bloodType && (
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-alert-sos" />
                        <span>Blood: <strong>{alert.medicalInfo.bloodType}</strong></span>
                      </div>
                    )}
                    {alert.medicalInfo?.doctorName && (
                      <div className="flex items-center gap-2">
                        <Stethoscope className="w-4 h-4" />
                        <span>{alert.medicalInfo.doctorName}</span>
                      </div>
                    )}
                  </div>

                  {alert.medicalInfo?.doctorPhone && (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => { window.location.href = `tel:${alert.medicalInfo!.doctorPhone}`; }}>
                      <Phone className="w-3 h-3 mr-1" />
                      Call Doctor: {alert.medicalInfo.doctorPhone}
                    </Button>
                  )}

                  {alert.medicalInfo?.hospitalPreference && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4" />
                      <span>Preferred: <strong>{alert.medicalInfo.hospitalPreference}</strong></span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pendant Info (if has pendant) */}
              {alert.subscription?.hasPendant && alert.device && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      {t("callCentre.alert.pendantStatus", "Pendant Status")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("common.status", "Status")}</span>
                      <Badge className={alert.device.status === 'active' ? 'bg-status-active' : 'bg-status-inactive'}>
                        {alert.device.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("callCentre.alert.battery", "Battery")}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all",
                              (alert.device.batteryLevel || 0) > 50 ? "bg-status-active" :
                              (alert.device.batteryLevel || 0) > 20 ? "bg-alert-battery" : "bg-alert-sos"
                            )}
                            style={{ width: `${alert.device.batteryLevel || 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{alert.device.batteryLevel || 0}%</span>
                      </div>
                    </div>
                    {alert.device.lastCheckin && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t("callCentre.alert.lastCheckin", "Last Check-in")}</span>
                        <span className="text-sm">{new Date(alert.device.lastCheckin).toLocaleString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Emergency Contacts */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {t("callCentre.alert.emergencyContacts", "Emergency Contacts")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alert.emergencyContacts && alert.emergencyContacts.length > 0 ? (
                    alert.emergencyContacts.map((contact, index) => (
                      <div key={contact.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {index + 1}. {contact.name} ({contact.relationship})
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </p>
                          </div>
                          {contact.speaksSpanish && (
                            <Badge variant="outline">🇪🇸 {t("callCentre.alert.speaksSpanish", "Speaks Spanish")}</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => { window.location.href = `tel:${contact.phone}`; }}>
                            <PhoneCall className="w-3 h-3 mr-1" />
                            Call
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            disabled={sendingContactId === contact.id}
                            onClick={() => handleSendSms(
                              `ICE Alarm: Alert received for ${alert.member?.firstName} ${alert.member?.lastName}. Please contact us.`,
                              contact.phone,
                              'emergency_contact',
                              contact.id
                            )}
                          >
                            {sendingContactId === contact.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <MessageSquare className="w-3 h-3 mr-1" />
                                SMS
                              </>
                            )}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => handleSendWhatsApp(
                              `ICE Alarm: Alert received for ${alert.member?.firstName} ${alert.member?.lastName}. Please contact us.`,
                              contact.phone,
                              'emergency_contact'
                            )}
                          >
                            WhatsApp
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("callCentre.alert.noEmergencyContacts", "No emergency contacts on file")}</p>
                  )}
                </CardContent>
              </Card>

              {/* Communication Panel */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {t("callCentre.alert.quickMessages", "Quick Messages")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {["I'm on my way", "Help is coming", "Are you okay?", "Stay calm"].map((template: string, i: number) => (
                      <Button 
                        key={i} 
                        variant="outline" 
                        size="sm"
                        disabled={isSendingSms}
                        onClick={() => handleSendSms(template)}
                      >
                        {template}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea 
                      placeholder={t("callCentre.alert.customMessage", "Custom message...")}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="min-h-[60px]"
                    />
                    <div className="flex flex-col gap-1">
                      <Button 
                        size="sm"
                        disabled={!customMessage.trim() || isSendingSms}
                        onClick={() => {
                          handleSendSms(customMessage);
                          setCustomMessage("");
                        }}
                      >
                        {isSendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : "SMS"}
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        disabled={!customMessage.trim() || isSendingSms}
                        onClick={() => {
                          handleSendWhatsApp(customMessage);
                          setCustomMessage("");
                        }}
                      >
                        WA
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Previous Alerts */}
              {alert.previousAlerts && alert.previousAlerts.length > 0 && (
                <Collapsible open={showPreviousAlerts} onOpenChange={setShowPreviousAlerts}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      {t("callCentre.alert.previousAlerts", "Previous Alerts")} ({alert.previousAlerts.length})
                      {showPreviousAlerts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 mt-2">
                    {alert.previousAlerts.map((prevAlert) => (
                      <div key={prevAlert.id} className="p-2 bg-muted rounded text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {t(alertTypeConfig[prevAlert.type].labelKey, alertTypeConfig[prevAlert.type].label)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {new Date(prevAlert.receivedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {prevAlert.resolvedAt && (
                          <Badge variant="outline" className="text-xs bg-status-active/10 text-status-active">
                            {t("common.resolved", "Resolved")}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </ScrollArea>

          {/* Action Footer */}
          <div className="border-t p-4 space-y-4 bg-card">
            {/* Call Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" className="bg-primary hover:bg-primary/90" onClick={handleCallMember}>
                <PhoneCall className="w-4 h-4 mr-2" />
                {t("callCentre.alert.callMember", "Call Member")}
              </Button>
              <Button size="lg" variant="destructive" onClick={handleCall112}>
                <Phone className="w-4 h-4 mr-2" />
                {t("callCentre.alert.call112", "Call 112")}
              </Button>
            </div>

            {/* Notes */}
            <Textarea 
              placeholder={t("callCentre.alert.resolutionNotes", "Resolution notes...")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px]"
            />

            {/* Checkboxes */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="emergency" 
                  checked={emergencyServicesCalled}
                  onCheckedChange={(checked) => setEmergencyServicesCalled(checked as boolean)}
                />
                <Label htmlFor="emergency" className="text-sm">{t("callCentre.alert.emergencyServicesCalled", "Emergency services (112) called")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="kin" 
                  checked={nextOfKinNotified}
                  onCheckedChange={(checked) => setNextOfKinNotified(checked as boolean)}
                />
                <Label htmlFor="kin" className="text-sm">{t("callCentre.alert.nextOfKinNotified", "Next of kin notified")}</Label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => onEscalate(alert.id)}
              >
                {t("callCentre.alert.escalate", "Escalate")}
              </Button>
              <Button 
                className="flex-1 bg-status-active hover:bg-status-active/90"
                onClick={handleResolve}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {t("callCentre.alert.resolveAlert", "Resolve Alert")}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
