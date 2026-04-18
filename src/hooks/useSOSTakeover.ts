/**
 * useSOSTakeover — manages SOS alert acceptance and resolution for staff.
 *
 * Subscribes to real-time alert changes, splits into activeAlert (mine)
 * and pendingAlerts (unaccepted SOS alerts), provides accept/resolve actions.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface SOSAlert {
  id: string;
  alert_type: string;
  status: string;
  member_id: string;
  received_at: string;
  accepted_by_staff_id: string | null;
  accepted_at: string | null;
  conference_id: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  is_false_alarm: boolean;
  resolution_notes: string | null;
}

export interface UseSOSTakeoverReturn {
  activeAlert: SOSAlert | null;
  pendingAlerts: SOSAlert[];
  isTakeoverActive: boolean;
  loading: boolean;
  acceptAlert: (alertId: string) => Promise<boolean>;
  resolveAlert: (
    alertId: string,
    notes: string,
    isFalseAlarm: boolean,
  ) => Promise<boolean>;
}

const SOS_TYPES: Array<"sos_button" | "fall_detected"> = ["sos_button", "fall_detected"];

export function useSOSTakeover(): UseSOSTakeoverReturn {
  const { data: staff } = useCurrentStaff();
  const staffId = staff?.id || null;

  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch SOS alerts
  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("alerts")
        .select(
          "id, alert_type, status, member_id, received_at, accepted_by_staff_id, accepted_at, conference_id, location_address, location_lat, location_lng, is_false_alarm, resolution_notes",
        )
        .in("alert_type", SOS_TYPES)
        .in("status", ["incoming", "in_progress"])
        .order("received_at", { ascending: false });

      if (error) {
        console.error("[useSOSTakeover] Fetch error:", error);
      } else {
        setAlerts((data || []) as SOSAlert[]);
      }

      setLoading(false);
    };

    fetchAlerts();
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("sos-takeover-alerts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === "INSERT") {
            const newAlert = payload.new as unknown as SOSAlert;
            if (
              (SOS_TYPES as readonly string[]).includes(newAlert.alert_type) &&
              ["incoming", "in_progress"].includes(newAlert.status)
            ) {
              setAlerts((prev) => {
                if (prev.some((a) => a.id === newAlert.id)) return prev;
                return [newAlert, ...prev];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as SOSAlert;
            if (updated.status === "resolved" || updated.status === "escalated") {
              // Remove resolved/escalated alerts
              setAlerts((prev) => prev.filter((a) => a.id !== updated.id));
            } else {
              setAlerts((prev) =>
                prev.map((a) => (a.id === updated.id ? updated : a)),
              );
            }
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Record<string, unknown>).id as string;
            setAlerts((prev) => prev.filter((a) => a.id !== oldId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Split alerts
  const activeAlert =
    staffId
      ? alerts.find((a) => a.accepted_by_staff_id === staffId) || null
      : null;

  const pendingAlerts = alerts.filter((a) => !a.accepted_by_staff_id);

  const isTakeoverActive = activeAlert !== null;

  // Accept alert with optimistic concurrency guard
  const acceptAlert = useCallback(
    async (alertId: string): Promise<boolean> => {
      if (!staffId) return false;

      const { data, error } = await supabase
        .from("alerts")
        .update({
          accepted_by_staff_id: staffId,
          accepted_at: new Date().toISOString(),
          status: "in_progress",
        })
        .eq("id", alertId)
        .is("accepted_by_staff_id", null) // Guard: only if not already accepted
        .select()
        .maybeSingle();

      if (error) {
        console.error("[useSOSTakeover] Accept error:", error);
        return false;
      }

      if (!data) {
        // Another staff member already accepted this alert
        return false;
      }

      // Optimistic update
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? {
                ...a,
                accepted_by_staff_id: staffId,
                accepted_at: new Date().toISOString(),
                status: "in_progress",
              }
            : a,
        ),
      );

      return true;
    },
    [staffId],
  );

  // Resolve alert via edge function (handles conference end, notifications)
  const resolveAlert = useCallback(
    async (
      alertId: string,
      notes: string,
      isFalseAlarm: boolean,
      resolutionType?: string,
    ): Promise<boolean> => {
      const { error } = await supabase.functions.invoke("sos-alert-resolve", {
        body: {
          alert_id: alertId,
          resolution_notes: notes,
          is_false_alarm: isFalseAlarm,
          resolution_type: resolutionType || "other",
        },
      });

      if (error) {
        console.error("[useSOSTakeover] Resolve error:", error);
        return false;
      }

      // Remove from local state
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      return true;
    },
    [],
  );

  return {
    activeAlert,
    pendingAlerts,
    isTakeoverActive,
    loading,
    acceptAlert,
    resolveAlert,
  };
}
