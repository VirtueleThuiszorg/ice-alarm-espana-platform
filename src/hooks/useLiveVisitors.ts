import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LiveVisitorData {
  activeNow: number;
  last5min: number;
  last15min: number;
  activeSessions: {
    visitor_id: string;
    page_path: string;
    device_type: string;
    country_name: string | null;
    last_seen: string;
  }[];
}

export function useLiveVisitors(refreshInterval = 10000) {
  const [data, setData] = useState<LiveVisitorData>({
    activeNow: 0,
    last5min: 0,
    last15min: 0,
    activeSessions: [],
  });

  const { data: liveData, isLoading, refetch } = useQuery({
    queryKey: ["live-visitors"],
    queryFn: async () => {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

      // Get recent events (last 15 min) to determine active visitors
      const { data: events, error } = await supabase
        .from("website_events")
        .select("visitor_id, session_id, page_path, device_type, country_name, created_at")
        .gte("created_at", fifteenMinAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by visitor to get their last activity
      const visitorLastSeen: Record<string, {
        lastSeen: Date;
        page_path: string;
        device_type: string;
        country_name: string | null;
      }> = {};

      events?.forEach((event) => {
        if (event.visitor_id && event.created_at) {
          const eventTime = new Date(event.created_at);
          if (!visitorLastSeen[event.visitor_id] || eventTime > visitorLastSeen[event.visitor_id].lastSeen) {
            visitorLastSeen[event.visitor_id] = {
              lastSeen: eventTime,
              page_path: event.page_path || "/",
              device_type: event.device_type || "unknown",
              country_name: event.country_name,
            };
          }
        }
      });

      // Count visitors by recency
      let activeNow = 0; // Within 2 minutes (considered "live")
      let last5min = 0;
      let last15min = 0;
      const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const activeSessions: LiveVisitorData["activeSessions"] = [];

      Object.entries(visitorLastSeen).forEach(([visitor_id, info]) => {
        last15min++;
        if (info.lastSeen >= fiveMinAgo) {
          last5min++;
        }
        if (info.lastSeen >= twoMinAgo) {
          activeNow++;
          activeSessions.push({
            visitor_id,
            page_path: info.page_path,
            device_type: info.device_type,
            country_name: info.country_name,
            last_seen: info.lastSeen.toISOString(),
          });
        }
      });

      return {
        activeNow,
        last5min,
        last15min,
        activeSessions,
      };
    },
    refetchInterval: refreshInterval,
    staleTime: 5000,
  });

  useEffect(() => {
    if (liveData) {
      setData(liveData);
    }
  }, [liveData]);

  return {
    ...data,
    isLoading,
    refetch,
  };
}
