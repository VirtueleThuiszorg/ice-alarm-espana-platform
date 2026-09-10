import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Brain, Clock, ExternalLink, Navigation } from "lucide-react";
import { LocationMap } from "@/components/maps/LocationMap";
import { SOSIsabellaFeed } from "./SOSIsabellaFeed";
import { SOSTimeline } from "./SOSTimeline";
import { supabase } from "@/integrations/supabase/client";
import { useMemberHomeLocation } from "@/hooks/useMemberHomeLocation";
import { resolveSosLocation } from "@/lib/homeLocation";
import { HomeLocationBlock } from "./HomeLocationBlock";

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

  /*
    THE HOME PIN — DISPLAY ONLY.

    Nothing below changes escalation, timers, or who gets called. What it changes is what an
    operator can SEE: an EV07B indoors usually has no fix, and until now the card fell back to a
    typed postal address, which in rural Almería is regularly a property a driver cannot find at
    night. The member's own confirmed front door is a better fallback and a DIFFERENT KIND OF
    FACT, so it is rendered in its own labelled block and never merged with the pendant's fix.

    The alert's `received_at` is the age of the fix: the coordinates arrive with the SOS.
  */
  const { data: home } = useMemberHomeLocation(memberId);
  const view = resolveSosLocation({
    live: { lat: locationLat, lng: locationLng, at: receivedAt, address: locationAddress },
    home,
  });

  /*
    WHAT THE MAP SHOWS. The live fix whenever there is one — a home pin must never be shown IN
    PLACE OF a pendant fix, however old that fix is. Home takes the map only when there is no
    usable fix at all, and then the banner below says so in words.
  */
  const lat = view.live ? view.live.lat : view.home?.lat ?? null;
  const lng = view.live ? view.live.lng : view.home?.lng ?? null;
  const showingHomeOnMap = !view.live && !!view.home;
  const address = view.live ? locationAddress || memberAddress : memberAddress;

  return (
    <div className="h-full flex flex-col gap-2">
      {/*
        LOCATION — top third, and it is a COLUMN rather than a single card.

        It was one card at `height: 33%` with `overflow-hidden`, and the map inside it does not
        shrink (LocationMap sets its own 100% height plus a footer). So the two things added
        below it — the no-recent-fix sentence and the home block — were rendered, asserted, and
        CLIPPED OUT OF SIGHT. The Playwright screenshots caught that; `toHaveText` did not,
        because a clipped element still has its text. The specs now assert `toBeVisible()`.

        As a column, the map card is `flex-1 min-h-0` and yields its space to the two `shrink-0`
        blocks beside it. With no home pin nothing extra renders and the layout is exactly what
        it was.
      */}
      <div className="shrink-0 flex flex-col gap-1.5" style={{ height: "33%" }}>
        <div className="flex-1 min-h-0 bg-zinc-800/50 rounded-lg border border-zinc-700/50 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/30 border-b border-zinc-700/50">
            <MapPin className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-medium text-zinc-400" data-testid="sos-map-label">
              {showingHomeOnMap
                ? t("sos.home.mapHeader", "Home location")
                : t("sos.situation.lastKnownLocation", "Last Known Location")}
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

          {/*
            IN WORDS, NOT BY IMPLICATION. When there is no fix from the last half hour, the card
            says so — an operator must never have to infer the age of a coordinate from its
            absence. `resolveSosLocation` decides; this only renders the sentence.
          */}
        </div>

        {view.announceNoRecentFix && (
          <p
            className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300"
            data-testid="sos-no-recent-fix"
          >
            {t("sos.noRecentFix", "No recent pendant location — showing home")}
          </p>
        )}

        {/* The home pin: always its own block, always labelled with whose pin it is and when. */}
        {view.home && (
          <div className="shrink-0">
            <HomeLocationBlock
              home={view.home}
              isPrimary={view.primary === "home"}
              distanceMetres={view.distanceMetres}
              tone="dark"
            />
          </div>
        )}
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
