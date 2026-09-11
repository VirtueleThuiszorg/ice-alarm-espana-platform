import { useTranslation } from "react-i18next";
import { useMemberDevice, useMemberSubscription } from "@/hooks/useMemberProfile";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { canonicalGross } from "@/lib/catalogPriceAuthority";
import {
  MEMBER_PENDANT_SUBTITLE,
  mayOfferPendant,
  memberPendantView,
} from "@/lib/memberPendantView";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { usePricing } from "@/hooks/usePricing";
import { formatPrice } from "@/config/pricing";

import { telHref, waNumber } from "@/lib/phone";
import { PageHeader } from "@/components/client/PageHeader";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";

import { usePendantOrderForMember } from "@/hooks/usePendantOrder";
import { supportActionPath } from "@/lib/supportActions";
import { FieldLabel } from "@/components/FieldGrid";
export default function DevicePage() {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  /*
    THE PRICE, FROM THE AUTHORITY, NOT FROM A MODULE-LEVEL GLOBAL.

    It was `usePricing()` called for its side effect — hydrating a mutable singleton in
    `config/pricing` — and then `getPendantFinalPrice(1)` read back out of it. So the figure this
    page quoted depended on whether some component had already run, and on a cold load it was
    the seed rather than what an admin had set. `catalogPriceAuthority.canonicalGross` answers
    the question the page is actually asking — *what is really charged for a pendant* — from the
    config this hook returns, so a stale read is a late render rather than a wrong price on a
    page that offers to sell something.
  */
  const { config: pricing, isLoading: pricingLoading } = usePricing();
  const navigate = useNavigate();
  const { data: device, isLoading: deviceLoading } = useMemberDevice();
  const { data: subscription, isLoading: subLoading } = useMemberSubscription();
  const { settings: companySettings } = useCompanySettings();
  // The member's pendant order, whether or not a device has been put on it yet — so the window
  // between paying and the device arriving can say what is actually happening.
  const { memberPendantOrder: pendantOrder } = usePendantOrderForMember(memberId);
  
  // Realtime subscription for device updates
  useDeviceRealtime(memberId ?? undefined);
  
  // Both null when settings_emergency_phone is unset; every call/WhatsApp affordance below is
  // rendered conditionally on them rather than as a link that goes nowhere.
  const phoneHref = telHref(companySettings.emergency_phone);
  const whatsappNumber = waNumber(companySettings.emergency_phone);

  const isLoading = deviceLoading || subLoading;

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

  /*
    WHICH MEMBER IS THIS — one derivation, in `memberPendantView.ts`, off the same two columns
    the fulfilment desk reads.

    It was three branches keyed on `subscription?.has_pendant && device`, and the branch decided
    the SUBTITLE. A member with a paid pendant order and no device row yet fell into the branch
    titled "Phone-Only membership" — told they had chosen a service they had paid to leave, on
    the screen they open when they are worried about whether their alarm works. WP4 added a
    fourth branch for the worst of it; the words were still decided by a boolean that cannot
    tell "never bought one" from "bought one, waiting".

    Six states now, each a genuinely different sentence to somebody waiting: we have not been
    paid; we are getting it ready; we are waiting on stock; it is in the post; you have it; you
    have not got one. And `mayOfferPendant` is true for exactly the last of those, so the sales
    card cannot reappear in front of somebody who has already bought one.
  */
  const view = memberPendantView({
    hasDevice: !!device,
    subscriptionHasPendant: subscription?.has_pendant,
    order: pendantOrder,
  });
  const subtitle = t(
    MEMBER_PENDANT_SUBTITLE[view].key,
    MEMBER_PENDANT_SUBTITLE[view].fallback,
  );

  /**
   * THE MONITORED LINE — one card, and the same one whether or not a pendant is coming.
   *
   * It was two different treatments of the same fact: a 4xl number in a tinted panel on the
   * phone-only branch, and nothing at all on the waiting branch. The number that reaches an
   * operator is the thing every member on this page has, so it is one card that both read.
   *
   * NOT 4xl. R5 gives the page one 28px title and R10 a 16px body; a 36-40px phone number was
   * the largest text in the member portal, on a page where it is a useful detail rather than
   * the subject. It is a normal link — pressable on a phone, selectable on a desktop.
   *
   * NOT WHATSAPP GREEN. `bg-[#25D366] hover:bg-[#128C7E] text-white` was the only raw hex left
   * on the member surface: a third party's brand colour, outside the token system, with a
   * contrast ratio nobody had checked (white on #25D366 is 2.1:1 — below WCAG AA for text of
   * any size, so it failed the standard GOALS.md sets while looking deliberate). It is an
   * outline button with the WhatsApp glyph, which is the same affordance in this product's
   * colours.
   *
   * The whole card is omitted with no number configured rather than rendered empty: a heading
   * reading EMERGENCY NUMBER over nothing at all is the most alarming empty state in the
   * portal. WP1b: show nothing, never a fake number.
   */
  const monitoredLineCard = phoneHref ? (
    <Card data-testid="device-monitored-line">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("device.monitoredLine.title", "Your monitored line")}
        </CardTitle>
        <CardDescription>
          {t(
            "device.monitoredLine.body",
            "Call this number any hour of the day and a real operator answers. Save it in your phone.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          {/*
            FieldLabel, not a hand-written copy of its declarations. This page had the same six
            classes typed out — found by the "exactly one definition" count in
            memberRecordSurface.test.tsx, which is what that assertion is for.
          */}
          <FieldLabel>{t("support.emergencyNumber")}</FieldLabel>
          <a
            href={phoneHref}
            className="text-lg font-semibold text-foreground underline underline-offset-4"
            data-testid="device-emergency-number"
          >
            {companySettings.emergency_phone}
          </a>
        </div>
        {whatsappNumber && (
          <Button variant="outline" asChild className="touch-target">
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="device-whatsapp"
            >
              <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
              {t("support.whatsApp")}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  ) : null;

  if (view !== "with_pendant") {
    /*
      EVERY WAITING STATE, AND THE ONE WHO HAS NOT GOT A PENDANT, on one shell.

      They were two separate returns with two different layouts for what is very nearly the same
      page. The only real difference is whether we may offer to sell a pendant, and that is one
      card.
    */
    const offer = mayOfferPendant(view);
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={t("navigation.myPendant")}
          subtitle={subtitle}
        />

        {/*
          WHAT HAPPENS NEXT, for a member who is waiting — and it is the test call, not the
          delivery. Q1 (Lee, 2026-09-07) is operator-confirmed only, so a member cannot mark
          their own pendant tested. Saying so here stops them waiting for a button that will
          never appear.
        */}
        {!offer && (
          <Card data-testid="pendant-awaiting">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-semibold" data-testid="pendant-awaiting-state">
                    {subtitle}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {t(
                      "device.onItsWay.nextStep",
                      "When it arrives we will phone you and test it together — a real operator answers, so you know it works.",
                    )}
                  </p>
                </div>
              </div>
              {/* R1: the page's one red button. */}
              <Button asChild className="touch-target">
                <Link to={supportActionPath("report_issue")}>
                  {t("device.onItsWay.action", "Ask us where it is")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {monitoredLineCard}

        {/*
          "WHAT YOU'RE MISSING" IS GONE — WP4 says so, and here is why it needed saying.

          It was four rows in `text-destructive`, each with a red ✗, telling a phone-only member
          that we cannot track their location, that falls are not detected, that they must call
          us manually, and that there are no boundary alerts. Every line true; the whole card
          wrong. It opened the page of somebody who CHOSE this plan with four ways they are
          unprotected, in the colour this product reserves for an emergency (R2), on the screen
          they are most likely to open when they are worried.

          What replaces it is the monitored-line card above — the same information stated as what
          they HAVE — and this one offer. The pendant's features are listed inside the offer,
          where a feature list belongs.

          AND IT IS RENDERED ONLY WHEN WE MAY SELL. `mayOfferPendant` is true for exactly one of
          the six states, so a member with a pendant on order never meets it.
        */}
        {offer && (
          <Card data-testid="device-pendant-offer">
            <CardHeader>
              <CardTitle className="text-lg">
                {t("device.addPendantForFullProtection", "Add a Pendant for Full Protection")}
              </CardTitle>
              <CardDescription>
                {t(
                  "device.getCompletePeaceOfMind",
                  "Get complete peace of mind with our GPS pendant",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/*
                  THE ACTUAL PENDANT, not a phone glyph in a tinted square. `pendant1.webp` is
                  the product photograph the marketing pages already use; a `<Smartphone/>` icon
                  standing in for a pendant on the page selling the pendant was the one place
                  this product illustrated itself with something it does not sell.
                */}
                <img
                  src="/pendant1.webp"
                  alt={t("device.iceAlarmGpsPendant", "ICE Alarm España GPS Pendant")}
                  width={96}
                  height={96}
                  loading="lazy"
                  className="h-24 w-24 shrink-0 rounded-lg border object-cover"
                  data-testid="device-pendant-image"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold">
                    {t("device.iceAlarmGpsPendant", "ICE Alarm España GPS Pendant")}
                  </p>
                  {/*
                    THE PRICE, OR NOTHING — and keyed on the LOAD, not on the value.

                    `usePricing` returns `DEFAULT_PRICING_CONFIG` (the seed) while the read is in
                    flight and never undefined, so `pricing ? …` would always be true and would
                    quote the seed figure to a member for as long as the query took. If an admin
                    has edited the pendant price, that is the wrong number on the one card that
                    offers to sell something. GOALS.md's "no fake numbers" applies hardest to
                    money, so the skeleton holds the space until the real figure lands.
                  */}
                  {pricing && !pricingLoading ? (
                    <>
                      <p className="text-lg font-bold text-foreground" data-testid="device-pendant-price">
                        {formatPrice(canonicalGross("pendant", pricing))}
                      </p>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        + {formatPrice(canonicalGross("shipping", pricing))} {t("landing.shipping")}
                      </p>
                    </>
                  ) : (
                    <Skeleton className="h-6 w-24" data-testid="device-pendant-price-loading" />
                  )}
                </div>
              </div>

              <ul className="grid gap-2">
                {[
                  ["device.gpsLocationTracking", "GPS Location Tracking"],
                  ["device.automaticFallDetection", "Automatic Fall Detection"],
                  ["device.oneTouchSosButton", "One-touch SOS Button"],
                  ["device.twoWayVoiceCommunication", "Two-way Voice Communication"],
                  ["device.geoFencingAlerts", "Geo-Fencing Alerts"],
                ].map(([key, fallback]) => (
                  <li key={key} className="flex items-center gap-2 text-base">
                    <CheckCircle
                      className="h-4 w-4 shrink-0 text-alert-resolved"
                      aria-hidden="true"
                    />
                    <span>{t(key, fallback)}</span>
                  </li>
                ))}
              </ul>

              {/*
                ONE PRIMARY BUTTON, AND IT IS NOT GATED ON WHATSAPP.

                This was a single `whatsappNumber && <Button …wa.me…>`. With
                `settings_emergency_phone` unset — the state WP1b's "show nothing, never a fake
                number" rule leaves us in until Lee seeds it — a phone-only member had NO route
                at all to the one thing this page is offering them. The in-app route is
                unconditional and is this card's one action; WhatsApp is already offered by the
                monitored-line card above, so it is not repeated here.
              */}
              <Button size="lg" className="touch-target w-full sm:w-auto" asChild>
                <Link to={supportActionPath("add_pendant")} data-testid="device-add-pendant">
                  {t("subscription.addPendant", "Add a pendant")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
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
      <PageHeader title={t("navigation.myPendant")} subtitle={subtitle} />

      {/* Device Status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 bg-primary/10 rounded-xl flex items-center justify-center">
              <Smartphone className="h-12 w-12 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{t('device.iceAlarmGpsPendant', 'ICE Alarm España GPS Pendant')}</h3>
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
        <Button variant="outline" className="touch-target" onClick={() => navigate(supportActionPath("report_issue"))}>
          <Wrench className="mr-2 h-4 w-4" />
          {t('device.reportIssue')}
        </Button>
        <Button variant="outline" className="touch-target" onClick={() => navigate(supportActionPath("request_replacement"))}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('device.requestReplacement')}
        </Button>
      </div>
    </div>
  );
}
