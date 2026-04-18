/**
 * useSOSConference — real-time conference state for an SOS alert.
 *
 * Subscribes to Realtime on: conference_rooms, conference_participants,
 * isabella_assessment_notes, alert_escalations.
 * Merges INSERT/UPDATE/DELETE into state without full refetch.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface ConferenceRoom {
  id: string;
  alert_id: string;
  twilio_conference_sid: string | null;
  conference_name: string;
  status: string;
  created_at: string;
  ended_at: string | null;
  recording_url: string | null;
}

interface ConferenceParticipant {
  id: string;
  conference_id: string;
  participant_type: string;
  participant_name: string;
  phone_number: string | null;
  twilio_call_sid: string | null;
  staff_id: string | null;
  emergency_contact_id: string | null;
  is_muted: boolean;
  joined_at: string;
  left_at: string | null;
  join_method: string;
}

interface IsabellaNote {
  id: string;
  alert_id: string;
  timestamp: string;
  note_type: string;
  content: string;
  is_critical: boolean;
}

interface AlertEscalation {
  id: string;
  alert_id: string;
  escalation_level: number;
  target_type: string;
  target_staff_id: string | null;
  target_phone: string | null;
  attempted_at: string;
  responded: boolean;
  responded_at: string | null;
  response_method: string | null;
}

export interface UseSOSConferenceReturn {
  conference: ConferenceRoom | null;
  participants: ConferenceParticipant[];
  isabellaLogs: IsabellaNote[];
  escalations: AlertEscalation[];
  loading: boolean;
  joinConference: () => Promise<void>;
  leaveConference: () => Promise<void>;
  muteParticipant: (participantId: string) => Promise<void>;
  unmuteParticipant: (participantId: string) => Promise<void>;
  addParticipantByPhone: (
    name: string,
    phone: string,
    type: string,
    ecId?: string,
  ) => Promise<void>;
}

export function useSOSConference(alertId: string | null): UseSOSConferenceReturn {
  const [conference, setConference] = useState<ConferenceRoom | null>(null);
  const [participants, setParticipants] = useState<ConferenceParticipant[]>([]);
  const [isabellaLogs, setIsabellaLogs] = useState<IsabellaNote[]>([]);
  const [escalations, setEscalations] = useState<AlertEscalation[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (!alertId) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);

      // Fetch conference room for this alert
      const { data: confData } = await supabase
        .from("conference_rooms")
        .select("*")
        .eq("alert_id", alertId)
        .eq("status", "active")
        .maybeSingle();

      setConference(confData as ConferenceRoom | null);

      if (confData) {
        // Fetch participants
        const { data: partData } = await supabase
          .from("conference_participants")
          .select("*")
          .eq("conference_id", confData.id)
          .order("joined_at", { ascending: true });

        setParticipants((partData || []) as ConferenceParticipant[]);
      }

      // Fetch Isabella notes
      const { data: notesData } = await supabase
        .from("isabella_assessment_notes")
        .select("*")
        .eq("alert_id", alertId)
        .order("timestamp", { ascending: true });

      setIsabellaLogs((notesData || []) as IsabellaNote[]);

      // Fetch escalations
      const { data: escData } = await supabase
        .from("alert_escalations")
        .select("*")
        .eq("alert_id", alertId)
        .order("attempted_at", { ascending: true });

      setEscalations((escData || []) as AlertEscalation[]);

      setLoading(false);
    };

    fetchAll();
  }, [alertId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!alertId) return;

    const channel = supabase
      .channel(`sos-conference-${alertId}`)
      // Conference rooms changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conference_rooms",
          filter: `alert_id=eq.${alertId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setConference(payload.new as unknown as ConferenceRoom);
          } else if (payload.eventType === "DELETE") {
            setConference(null);
            setParticipants([]);
          }
        },
      )
      // Conference participants changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conference_participants",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const rec = payload.new as unknown as ConferenceParticipant;

          if (payload.eventType === "INSERT") {
            // Only add if it belongs to our conference
            setConference((conf) => {
              if (conf && rec.conference_id === conf.id) {
                setParticipants((prev) => {
                  if (prev.some((p) => p.id === rec.id)) return prev;
                  return [...prev, rec];
                });
              }
              return conf;
            });
          } else if (payload.eventType === "UPDATE") {
            setParticipants((prev) =>
              prev.map((p) => (p.id === rec.id ? rec : p)),
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Record<string, unknown>).id as string;
            setParticipants((prev) => prev.filter((p) => p.id !== oldId));
          }
        },
      )
      // Isabella assessment notes
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "isabella_assessment_notes",
          filter: `alert_id=eq.${alertId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const note = payload.new as unknown as IsabellaNote;
          setIsabellaLogs((prev) => {
            if (prev.some((n) => n.id === note.id)) return prev;
            return [...prev, note];
          });
        },
      )
      // Alert escalations
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alert_escalations",
          filter: `alert_id=eq.${alertId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const esc = payload.new as unknown as AlertEscalation;
          if (payload.eventType === "INSERT") {
            setEscalations((prev) => {
              if (prev.some((e) => e.id === esc.id)) return prev;
              return [...prev, esc];
            });
          } else if (payload.eventType === "UPDATE") {
            setEscalations((prev) =>
              prev.map((e) => (e.id === esc.id ? esc : e)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alertId]);

  // ── Actions ─────────────────────────────────────────────────────

  const joinConference = useCallback(async () => {
    if (!conference) return;
    await supabase.functions.invoke("sos-conference-join", {
      body: {
        conference_id: conference.id,
        participant_type: "staff",
        participant_name: "Staff",
        join_method: "accepted_alert",
      },
    });
  }, [conference]);

  const leaveConference = useCallback(async () => {
    if (!conference) return;
    // Find our participant (staff type, not left)
    const myParticipant = participants.find(
      (p) => p.participant_type === "staff" && !p.left_at,
    );
    if (!myParticipant) return;

    await supabase.functions.invoke("sos-conference-leave", {
      body: {
        conference_id: conference.id,
        participant_id: myParticipant.id,
        action: "leave",
      },
    });
  }, [conference, participants]);

  const muteParticipant = useCallback(
    async (participantId: string) => {
      if (!conference) return;
      await supabase.functions.invoke("sos-conference-leave", {
        body: {
          conference_id: conference.id,
          participant_id: participantId,
          action: "mute",
        },
      });
    },
    [conference],
  );

  const unmuteParticipant = useCallback(
    async (participantId: string) => {
      if (!conference) return;
      await supabase.functions.invoke("sos-conference-leave", {
        body: {
          conference_id: conference.id,
          participant_id: participantId,
          action: "unmute",
        },
      });
    },
    [conference],
  );

  const addParticipantByPhone = useCallback(
    async (name: string, phone: string, type: string, ecId?: string) => {
      if (!conference) return;
      await supabase.functions.invoke("sos-conference-join", {
        body: {
          conference_id: conference.id,
          participant_type: type,
          participant_name: name,
          phone_number: phone,
          emergency_contact_id: ecId || null,
          join_method: "added_by_staff",
        },
      });
    },
    [conference],
  );

  return {
    conference,
    participants,
    isabellaLogs,
    escalations,
    loading,
    joinConference,
    leaveConference,
    muteParticipant,
    unmuteParticipant,
    addParticipantByPhone,
  };
}
