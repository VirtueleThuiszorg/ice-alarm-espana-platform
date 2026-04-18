import { useTranslation } from "react-i18next";
import { useMemberDevice, useMemberSubscription } from "@/hooks/useMemberProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Smartphone,
  Battery,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Phone,
  MessageCircle,
  MapPin,
  Wrench,
  RefreshCw
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function DevicePage() {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  const navigate = useNavigate();
  const { data: device, isLoading: deviceLoading } = useMemberDevice();
  const { data: subscription, isLoading: subLoading } = useMemberSubscription();
  const { settings: companySettings } = useCompanySettings();
  
  // Realtime subscription for device updates
  useDeviceRealtime(memberId ?? undefined);
  
  const phoneForLink = companySettings.emergency_phone.replace(/\s/g, "");

  const isLoading = deviceLoading || subLoading;
  const hasPendant = subscription?.has_pendant && device;

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    return t('time.daysAgo', { count: diffDays });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Phone-Only Member View
  if (!hasPendant) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('navigation.myDevice')}</h1>
          <p className="text-muted-foreground mt-1">{t('membership.phoneOnlyService')}</p>
        </div>

        {/* Phone-Only Service Info */}
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              {t('device.yourCurrentService', 'Your Current Service')}
            </CardTitle>
            <CardDescription>
              {t('device.usingPhoneOnlyMembership', 'You are using our Phone-Only membership')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              {t('device.contactUsAnytime', 'Contact us anytime using the number below. Save this in your phone for emergencies!')}
            </p>

            {/* Emergency Number */}
            <div className="p-6 bg-primary/5 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">{t('support.emergencyNumber')}</p>
              <a 
                href={`tel:${phoneForLink}`}
                className="text-3xl md:text-4xl font-bold text-primary hover:underline block"
              >
                {t("common.callNow")}
              </a>
              <Button 
                className="mt-4 bg-[#25D366] hover:bg-[#128C7E] text-white"
                size="lg"
                asChild
              >
                <a 
                  href={`https://wa.me/${phoneForLink.replace("+", "")}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  {t('support.whatsApp')}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* What You're Missing */}
        <Card className="border-alert-battery/50 bg-alert-battery/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-alert-battery">
              <AlertTriangle className="h-5 w-5" />
              {t('device.whatYoureMissing', "What You're Missing")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('device.gpsLocation')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('device.weCannotTrackLocation', 'We cannot track your location automatically')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('device.fallDetection')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('device.fallsNotDetected', 'Falls are not automatically detected')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('device.sosButton')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('device.mustCallManually', 'You must call us manually')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('device.geoFencing')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('device.noBoundaryAlerts', 'No boundary alerts available')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upgrade Section */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
          <CardHeader>
            <CardTitle>{t('device.addPendantForFullProtection', 'Add a Pendant for Full Protection')}</CardTitle>
            <CardDescription>
              {t('device.getCompletePeaceOfMind', 'Get complete peace of mind with our GPS pendant')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 bg-primary/20 rounded-lg flex items-center justify-center">
                <Smartphone className="h-10 w-10 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">{t('device.iceAlarmGpsPendant', 'ICE Alarm GPS Pendant')}</p>
                <p className="text-2xl font-bold text-primary">€151.25</p>
                <p className="text-sm text-muted-foreground">+ €14.99 {t('landing.shipping')}</p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
                <span>{t('device.gpsLocationTracking', 'GPS Location Tracking')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
                <span>{t('device.automaticFallDetection', 'Automatic Fall Detection')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
                <span>{t('device.oneTouchSosButton', 'One-touch SOS Button')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
                <span>{t('device.twoWayVoiceCommunication', 'Two-way Voice Communication')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
                <span>{t('device.geoFencingAlerts', 'Geo-Fencing Alerts')}</span>
              </div>
            </div>

            <Button size="lg" className="w-full touch-target" asChild>
              <a
                href={`https://wa.me/${phoneForLink.replace("+", "")}?text=${encodeURIComponent(t('device.pendantWhatsAppMessage', 'Hello, I would like to upgrade my membership to include a GPS pendant. Can you help me?'))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                {t('device.purchasePendant', 'Purchase Pendant')}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has Pendant View
  const batteryLevel = device?.battery_level || 0;
  // Use real is_online field instead of status check
  const isConnected = device?.is_online === true;
  const lastCheckin = device?.last_checkin_at 
    ? new Date(device.last_checkin_at) 
    : null;
  const offlineSince = device?.offline_since 
    ? new Date(device.offline_since) 
    : null;

  const getBatteryColor = () => {
    if (batteryLevel <= 20) return "text-destructive";
    if (batteryLevel <= 50) return "text-alert-battery";
    return "text-alert-resolved";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('navigation.myPendant')}</h1>
        <p className="text-muted-foreground mt-1">{t('device.yourIceAlarmPendant', 'Your ICE Alarm GPS Personal Pendant')}</p>
      </div>

      {/* Device Status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 bg-primary/10 rounded-xl flex items-center justify-center">
              <Smartphone className="h-12 w-12 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{t('device.iceAlarmGpsPendant', 'ICE Alarm GPS Pendant')}</h3>
                <Badge 
                  variant={isConnected ? "default" : "destructive"}
                  className={isConnected ? "bg-alert-resolved" : ""}
                >
                  {isConnected ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('device.connected')} {lastCheckin && `(${formatRelativeTime(lastCheckin)})`}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      {t('device.offline')} {lastCheckin && `(${t('device.lastCheckIn')}: ${formatRelativeTime(lastCheckin)})`}
                    </>
                  )}
                </Badge>
              </div>

              {/* Battery */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Battery className={`h-4 w-4 ${getBatteryColor()}`} />
                    {t('device.battery')}
                  </span>
                  <span className={`font-medium ${getBatteryColor()}`}>
                    {batteryLevel}%
                  </span>
                </div>
                <Progress 
                  value={batteryLevel} 
                  className="h-2"
                />
              </div>

              {/* Last Check-in */}
              {lastCheckin && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {t('device.lastCheckIn')}: {formatRelativeTime(lastCheckin)}
                </div>
              )}

              {/* Offline Since indicator */}
              {!isConnected && offlineSince && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t('device.offlineSince', 'Offline since')}: {formatRelativeTime(offlineSince)}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SIM Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('device.deviceInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground">{t('device.simNumber')}</span>
            <span className="font-medium">{device?.sim_phone_number}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground">{t('device.deviceType')}</span>
            <span className="font-medium capitalize">{device?.device_type}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">{t('device.imei')}</span>
            <span className="font-mono text-sm">{device?.imei}</span>
          </div>
        </CardContent>
      </Card>

      {/* Location Card */}
      {device?.last_location_lat && device?.last_location_lng && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t('device.lastKnownLocation', 'Last Known Location')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {device.last_location_address && (
              <p className="text-sm text-muted-foreground">{device.last_location_address}</p>
            )}
            <Button variant="outline" className="w-full" asChild>
              <a
                href={`https://www.google.com/maps?q=${device.last_location_lat},${device.last_location_lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin className="mr-2 h-4 w-4" />
                {t('device.viewOnMap', 'View on Google Maps')}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('device.activeFeatures')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-alert-resolved/10">
            <CheckCircle className="h-5 w-5 text-alert-resolved" />
            <div>
              <p className="font-medium">{t('device.gpsLocation')}</p>
              <p className="text-sm text-muted-foreground">{t('device.locationMonitored')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-alert-resolved/10">
            <CheckCircle className="h-5 w-5 text-alert-resolved" />
            <div>
              <p className="font-medium">{t('device.sosButton')}</p>
              <p className="text-sm text-muted-foreground">{t('device.speakDirectly')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-alert-resolved/10">
            <CheckCircle className="h-5 w-5 text-alert-resolved" />
            <div>
              <p className="font-medium">{t('device.fallDetection')}</p>
              <p className="text-sm text-muted-foreground">{t('device.automaticAlerts')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-alert-resolved/10">
            <CheckCircle className="h-5 w-5 text-alert-resolved" />
            <div>
              <p className="font-medium">{t('device.geoFencing')}</p>
              <p className="text-sm text-muted-foreground">{t('device.boundaryMonitoring')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How to Use */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('device.howToUse')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              1
            </div>
            <div>
              <p className="font-medium">{t('device.step1')}</p>
              <p className="text-sm text-muted-foreground">
                {t('device.step1Desc')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              2
            </div>
            <div>
              <p className="font-medium">{t('device.step2')}</p>
              <p className="text-sm text-muted-foreground">
                {t('device.step2Desc')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              3
            </div>
            <div>
              <p className="font-medium">{t('device.step3')}</p>
              <p className="text-sm text-muted-foreground">
                {t('device.step3Desc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid gap-3 md:grid-cols-2">
        <Button variant="outline" className="touch-target" onClick={() => navigate("/dashboard/support?action=report_issue")}>
          <Wrench className="mr-2 h-4 w-4" />
          {t('device.reportIssue')}
        </Button>
        <Button variant="outline" className="touch-target" onClick={() => navigate("/dashboard/support?action=request_replacement")}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('device.requestReplacement')}
        </Button>
      </div>
    </div>
  );
}
