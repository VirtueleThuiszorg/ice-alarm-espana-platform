import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Activity, Navigation, Battery, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSOSTakeover } from "@/hooks/useSOSTakeover";
import { supabase } from "@/integrations/supabase/client";

const alertTypeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  sos_button: { label: "SOS", color: "bg-red-600", icon: AlertTriangle },
  fall_detected: { label: "FALL", color: "bg-orange-600", icon: Activity },
  geo_fence: { label: "GEO-FENCE", color: "bg-yellow-600", icon: Navigation },
  low_battery: { label: "LOW BATTERY", color: "bg-blue-600", icon: Battery },
};

function ElapsedCounter({ since }: { since: string }) {
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

  return <span className="font-mono font-bold text-white">{display}</span>;
}

// Play alarm sound using Web Audio API
function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Three ascending tones
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800 + i * 200;
      osc.type = "square";
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.15);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.15);
    }
  } catch {
    // Web Audio API not available
  }
}

export function SOSAlertBar() {
  const { t } = useTranslation();
  const { pendingAlerts, acceptAlert } = useSOSTakeover();
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [isabellaStatus, setIsabellaStatus] = useState<Record<string, string>>({});
  const [accepting, setAccepting] = useState<string | null>(null);
  const alarmPlayedRef = useRef<Set<string>>(new Set());
  const alarmTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch member names for alerts
  useEffect(() => {
    const fetchNames = async () => {
      const ids = pendingAlerts.map((a) => a.member_id).filter(Boolean);
      if (ids.length === 0) return;

      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name, date_of_birth")
        .in("id", ids);

      if (data) {
        const names: Record<string, string> = {};
        data.forEach((m) => {
          const age = m.date_of_birth
            ? Math.floor((Date.now() - new Date(m.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null;
          names[m.id] = `${m.first_name} ${m.last_name}${age ? ` (${age})` : ""}`;
        });
        setMemberNames(names);
      }
    };
    fetchNames();
  }, [pendingAlerts]);

  // Fetch latest Isabella note for each alert
  useEffect(() => {
    const fetchIsabella = async () => {
      const alertIds = pendingAlerts.map((a) => a.id);
      if (alertIds.length === 0) return;

      const { data } = await supabase
        .from("isabella_assessment_notes")
        .select("alert_id, content")
        .in("alert_id", alertIds)
        .order("timestamp", { ascending: false })
        .limit(alertIds.length);

      if (data) {
        const status: Record<string, string> = {};
        // Take first (most recent) for each alert
        data.forEach((n) => {
          if (!status[n.alert_id]) status[n.alert_id] = n.content;
        });
        setIsabellaStatus(status);
      }
    };
    fetchIsabella();

    // Subscribe for new notes
    const channel = supabase
      .channel("sos-alert-bar-isabella")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "isabella_assessment_notes" },
        (payload) => {
          const note = payload.new as { alert_id: string; content: string };
          setIsabellaStatus((prev) => ({ ...prev, [note.alert_id]: note.content }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pendingAlerts.map((a) => a.id).join(",")]);

  // Audio alarm at 15 seconds
  useEffect(() => {
    for (const alert of pendingAlerts) {
      if (alarmPlayedRef.current.has(alert.id)) continue;

      const elapsed = Date.now() - new Date(alert.received_at).getTime();
      if (elapsed >= 15000) {
        playAlarmSound();
        alarmPlayedRef.current.add(alert.id);
      } else {
        const delay = 15000 - elapsed;
        const timer = setTimeout(() => {
          playAlarmSound();
          alarmPlayedRef.current.add(alert.id);
        }, delay);
        alarmTimersRef.current.set(alert.id, timer);
      }
    }

    // Clean up timers for alerts no longer pending
    const pendingIds = new Set(pendingAlerts.map((a) => a.id));
    for (const [id, timer] of alarmTimersRef.current.entries()) {
      if (!pendingIds.has(id)) {
        clearTimeout(timer);
        alarmTimersRef.current.delete(id);
      }
    }

    return () => {
      for (const timer of alarmTimersRef.current.values()) clearTimeout(timer);
    };
  }, [pendingAlerts]);

  const navigate = useNavigate();

  const handleAccept = async (alertId: string) => {
    setAccepting(alertId);
    const accepted = await acceptAlert(alertId);
    setAccepting(null);
    if (accepted) {
      navigate("/call-centre/sos-alert");
    }
  };

  if (pendingAlerts.length === 0) return null;

  return (
    <div className="bg-red-900/90 border-b-2 border-red-500 animate-pulse-slow">
      {pendingAlerts.map((alert) => {
        const config = alertTypeConfig[alert.alert_type] || alertTypeConfig.sos_button;
        const Icon = config.icon;
        const name = memberNames[alert.member_id] || "Loading...";
        const isabella = isabellaStatus[alert.id];

        return (
          <div
            key={alert.id}
            className="flex items-center justify-between px-4 py-2 border-b border-red-800 last:border-b-0"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Badge className={cn(config.color, "text-white font-bold text-xs shrink-0")}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>

              <span className="text-white font-semibold truncate">{name}</span>

              {alert.location_address && (
                <span className="text-red-200 text-sm truncate hidden md:block">
                  {alert.location_address}
                </span>
              )}

              <div className="flex items-center gap-1 shrink-0">
                <Clock className="h-3.5 w-3.5 text-red-300" />
                <ElapsedCounter since={alert.received_at} />
              </div>

              {isabella && (
                <span className="text-red-200 text-xs truncate hidden lg:block max-w-[200px]">
                  Isabella: {isabella}
                </span>
              )}
            </div>

            <Button
              size="sm"
              className="bg-white text-red-900 hover:bg-red-100 font-bold shrink-0 ml-3"
              disabled={accepting === alert.id}
              onClick={() => handleAccept(alert.id)}
            >
              {accepting === alert.id
                ? t("sos.alertBar.accepting", "Accepting...")
                : t("sos.alertBar.acceptAlert", "Accept Alert")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
