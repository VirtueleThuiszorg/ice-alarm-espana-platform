import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Activity,
  Navigation,
  Battery,
  BatteryLow,
  BatteryWarning,
  BatteryCharging,
  Clock,
  Phone,
  Wifi,
  WifiOff,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SOSVitalsStripProps {
  alertId: string;
  alertType: string;
  memberId: string;
  receivedAt: string;
  isUnresponsive?: boolean;
}

interface MemberData {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  preferred_language: string | null;
  photo_url: string | null;
  phone: string | null;
  nie_dni: string | null;
  address_line_1: string | null;
  city: string | null;
  province: string | null;
}

interface DeviceData {
  battery_level: number | null;
  is_online: boolean | null;
  sim_phone_number: string | null;
  model: string | null;
  last_checkin_at: string | null;
}

const alertTypeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  sos_button: { label: "SOS", color: "bg-red-600", icon: AlertTriangle },
  fall_detected: { label: "FALL", color: "bg-orange-600", icon: Activity },
  geo_fence: { label: "GEO-FENCE", color: "bg-yellow-600", icon: Navigation },
  low_battery: { label: "LOW BATTERY", color: "bg-blue-600", icon: Battery },
};

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ElapsedTimer({ since }: { since: string }) {
  const [display, setDisplay] = useState("0:00");

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Date.now() - new Date(since).getTime());
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setDisplay(`${min}:${sec.toString().padStart(2, "0")}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [since]);

  return (
    <div className="flex items-center gap-1.5 bg-zinc-800 px-3 py-1.5 rounded-lg">
      <Clock className="h-4 w-4 text-red-400" />
      <span className="text-lg font-mono font-bold text-red-400">{display}</span>
    </div>
  );
}

function BatteryIcon({ level }: { level: number }) {
  if (level <= 15) return <BatteryLow className="h-4 w-4 text-red-400" />;
  if (level <= 30) return <BatteryWarning className="h-4 w-4 text-orange-400" />;
  return <BatteryCharging className="h-4 w-4 text-green-400" />;
}

export function SOSVitalsStrip({ alertType, memberId, receivedAt, isUnresponsive }: SOSVitalsStripProps) {
  const { t } = useTranslation();
  const [member, setMember] = useState<MemberData | null>(null);
  const [device, setDevice] = useState<DeviceData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch member data
      const { data: memberData } = await supabase
        .from("members")
        .select("first_name, last_name, date_of_birth, preferred_language, photo_url, phone, nie_dni, address_line_1, city, province")
        .eq("id", memberId)
        .maybeSingle();
      if (memberData) setMember(memberData);

      // Fetch device data for this member
      const { data: deviceData } = await supabase
        .from("devices")
        .select("battery_level, is_online, sim_phone_number, model, last_checkin_at")
        .eq("member_id", memberId)
        .eq("status", "active")
        .maybeSingle();
      if (deviceData) setDevice(deviceData);
    };
    fetchData();
  }, [memberId]);

  const config = alertTypeConfig[alertType] || alertTypeConfig.sos_button;
  const Icon = config.icon;
  const langFlag = member?.preferred_language === "en" ? "🇬🇧" : "🇪🇸";
  const age = member?.date_of_birth ? calculateAge(member.date_of_birth) : null;
  const initials = member ? `${member.first_name[0]}${member.last_name[0]}` : "?";
  const homeAddress = member
    ? [member.address_line_1, member.city, member.province].filter(Boolean).join(", ")
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60 border-b border-zinc-700/50">
      {/* Left: Member Identity */}
      <div className="flex items-center gap-4">
        {/* Photo */}
        <Avatar className="h-10 w-10 border-2 border-zinc-600">
          <AvatarImage src={member?.photo_url || undefined} />
          <AvatarFallback className="bg-zinc-700 text-zinc-300 font-bold">{initials}</AvatarFallback>
        </Avatar>

        {/* Name + age + language */}
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">
            {member ? `${member.first_name} ${member.last_name}` : "Loading..."}
          </h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            {age !== null && <span>{age} {t("sos.vitals.years", "yrs")}</span>}
            <span>{langFlag}</span>
            {member?.nie_dni && (
              <span className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {member.nie_dni}
              </span>
            )}
          </div>
        </div>

        {/* Alert type badge */}
        <Badge className={cn(config.color, "text-white font-bold text-xs px-3 py-1")}>
          <Icon className="h-3.5 w-3.5 mr-1" />
          {config.label}
        </Badge>

        {/* Unresponsive indicator */}
        {isUnresponsive && (
          <div className="flex items-center gap-1.5 bg-red-900/60 border border-red-500 px-3 py-1 rounded animate-pulse">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-bold text-red-300">
              {t("sos.vitals.memberUnresponsive", "MEMBER UNRESPONSIVE")}
            </span>
          </div>
        )}
      </div>

      {/* Right: Contact + Device + Timer */}
      <div className="flex items-center gap-3">
        {/* Member phone */}
        {member?.phone && (
          <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 rounded-lg">
            <Phone className="h-3.5 w-3.5 text-green-400" />
            <span className="text-sm font-mono text-zinc-300">{member.phone}</span>
          </div>
        )}

        {/* Device SIM */}
        {device?.sim_phone_number && (
          <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 rounded-lg">
            <Smartphone className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-mono text-zinc-400">{device.sim_phone_number}</span>
          </div>
        )}

        {/* Device status */}
        {device && (
          <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 rounded-lg">
            {/* Battery */}
            {device.battery_level !== null && (
              <div className="flex items-center gap-1">
                <BatteryIcon level={device.battery_level} />
                <span className={cn(
                  "text-sm font-mono font-medium",
                  device.battery_level <= 15 ? "text-red-400" :
                  device.battery_level <= 30 ? "text-orange-400" : "text-green-400"
                )}>
                  {device.battery_level}%
                </span>
              </div>
            )}
            {/* Online status */}
            <div className="flex items-center gap-1">
              {device.is_online ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs text-green-400">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-xs text-red-400">Offline</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Home address (compact) */}
        {homeAddress && (
          <div className="hidden xl:flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 rounded-lg max-w-[200px]">
            <Navigation className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="text-xs text-zinc-400 truncate">{homeAddress}</span>
          </div>
        )}

        {/* Elapsed timer */}
        <ElapsedTimer since={receivedAt} />
      </div>
    </div>
  );
}
