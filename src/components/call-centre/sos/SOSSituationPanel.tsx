import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Brain, Clock, ExternalLink, Navigation } from "lucide-react";
import { LocationMap } from "@/components/maps/LocationMap";
import { SOSIsabellaFeed } from "./SOSIsabellaFeed";
import { SOSTimeline } from "./SOSTimeline";
import { supabase } from "@/integrations/supabase/client";

interface SOSSituationPanelProps {
  alertId: string;
  memberId: string;
  receivedAt: string;
  alertStatus: string;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
  isabellaLogs: Array<{
    id: string;
    alert_id: string;
    timestamp: string;
    note_type: string;
    content: string;
    is_critical: boolean;
  }>;
  participants: Array<{
    id: string;
    participant_name: string;
    participant_type: string;
    joined_at: string;
    left_at: string | null;
  }>;
  escalations: Array<{
    id: string;
    escalation_level: number;
    target_type: string;
    attempted_at: string;
    responded: boolean;
    responded_at: string | null;
  }>;
}

export function SOSSituationPanel({
  memberId,
  receivedAt,
  alertStatus,
  acceptedAt,
  acceptedByName,
  locationLat,
  locationLng,
  locationAddress,
  isabellaLogs,
  participants,
  escalations,
}: SOSSituationPanelProps) {
  const { t } = useTranslation();
  const [memberAddress, setMemberAddress] = useState<string | null>(null);

  // Fallback: fetch member address if no GPS location on alert
  useEffect(() => {
    if (locationLat && locationLng) return;

    const fetchAddress = async () => {
      const { data } = await supabase
        .from("members")
        .select("address_line_1, city, province")
        .eq("id", memberId)
        .maybeSingle();
      if (data) {
        setMemberAddress(
          [data.address_line_1, data.city, data.province].filter(Boolean).join(", ")
        );
      }
    };
    fetchAddress();
  }, [memberId, locationLat, locationLng]);

  const lat = locationLat ?? null;
  const lng = locationLng ?? null;
  const address = locationAddress || memberAddress;

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Map — top third */}
      <div className="shrink-0" style={{ height: "33%" }}>
        <div className="h-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/30 border-b border-zinc-700/50">
            <MapPin className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-medium text-zinc-400">
              {t("sos.situation.lastKnownLocation", "Last Known Location")}
            </span>
            {lat && lng && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank")}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                  title="Open in Google Maps"
                >
                  <ExternalLink className="h-3 w-3" />
                  Map
                </button>
                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank")}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                  title="Get Directions"
                >
                  <Navigation className="h-3 w-3" />
                  Directions
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {lat && lng ? (
              <LocationMap
                lat={lat}
                lng={lng}
                address={address || undefined}
                height="100%"
                showDirections={false}
                className="border-0 rounded-none [&_.p-3]:p-1.5 [&_iframe]:rounded-none"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                <MapPin className="h-4 w-4 mr-2 opacity-50" />
                {address || t("sos.situation.noLocation", "No location available")}
              </div>
            )}
          </div>
          {address && lat && lng && (
            <p className="text-xs text-zinc-500 px-3 py-1 border-t border-zinc-700/50 truncate">
              {address}
            </p>
          )}
        </div>
      </div>

      {/* Isabella Feed — middle third */}
      <div className="flex-1 min-h-0" style={{ height: "33%" }}>
        <div className="h-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/50 shrink-0">
            <Brain className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-medium text-zinc-400">
              {t("sos.situation.isabellaFeed", "Isabella Live Feed")}
            </span>
            <span className="text-xs text-zinc-600 ml-auto">{isabellaLogs.length} notes</span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <SOSIsabellaFeed notes={isabellaLogs} alertReceivedAt={receivedAt} />
          </div>
        </div>
      </div>

      {/* Timeline — bottom third */}
      <div className="shrink-0" style={{ height: "33%" }}>
        <div className="h-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/50 shrink-0">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-medium text-zinc-400">
              {t("sos.situation.incidentTimeline", "Incident Timeline")}
            </span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <SOSTimeline
              alertReceivedAt={receivedAt}
              alertStatus={alertStatus}
              acceptedAt={acceptedAt}
              acceptedByName={acceptedByName}
              isabellaLogs={isabellaLogs}
              participants={participants}
              escalations={escalations}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
