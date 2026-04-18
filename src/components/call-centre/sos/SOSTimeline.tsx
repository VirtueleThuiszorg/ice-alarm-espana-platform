import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  time: string;
  actor: string;
  description: string;
  type: "isabella" | "staff" | "system" | "escalation" | "participant";
}

interface SOSTimelineProps {
  alertReceivedAt: string;
  alertStatus: string;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  isabellaLogs: Array<{
    id: string;
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const typeColors: Record<string, string> = {
  isabella: "bg-purple-500",
  staff: "bg-blue-500",
  system: "bg-zinc-500",
  escalation: "bg-orange-500",
  participant: "bg-green-500",
};

export function SOSTimeline({
  alertReceivedAt,
  alertStatus,
  acceptedAt,
  acceptedByName,
  isabellaLogs,
  participants,
  escalations,
}: SOSTimelineProps) {
  const { t } = useTranslation();

  const events = useMemo(() => {
    const all: TimelineEvent[] = [];

    // Alert created
    all.push({
      time: alertReceivedAt,
      actor: t("sos.timeline.system", "System"),
      description: t("sos.timeline.alertReceived", "Alert received"),
      type: "system",
    });

    // Staff acceptance
    if (acceptedAt) {
      all.push({
        time: acceptedAt,
        actor: acceptedByName || t("sos.timeline.staff", "Staff"),
        description: t("sos.timeline.alertAccepted", "Accepted alert"),
        type: "staff",
      });
    }

    // Isabella key moments (triage_decision, flag, handover_briefing only)
    for (const note of isabellaLogs) {
      if (["triage_decision", "flag", "handover_briefing"].includes(note.note_type)) {
        all.push({
          time: note.timestamp,
          actor: "Isabella",
          description: note.content,
          type: "isabella",
        });
      }
    }

    // Participant join/leave
    for (const p of participants) {
      all.push({
        time: p.joined_at,
        actor: p.participant_name,
        description: t("sos.timeline.joinedConference", "Joined conference"),
        type: "participant",
      });
      if (p.left_at) {
        all.push({
          time: p.left_at,
          actor: p.participant_name,
          description: t("sos.timeline.leftConference", "Left conference"),
          type: "participant",
        });
      }
    }

    // Escalations
    for (const esc of escalations) {
      all.push({
        time: esc.attempted_at,
        actor: t("sos.timeline.system", "System"),
        description: t("sos.timeline.escalationLevel", "Escalation level {{level}} ({{type}})", {
          level: esc.escalation_level,
          type: esc.target_type.replace("_", " "),
        }),
        type: "escalation",
      });
      if (esc.responded && esc.responded_at) {
        all.push({
          time: esc.responded_at,
          actor: t("sos.timeline.staff", "Staff"),
          description: t("sos.timeline.escalationResponded", "Responded to escalation"),
          type: "staff",
        });
      }
    }

    // Sort chronologically
    all.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return all;
  }, [alertReceivedAt, alertStatus, acceptedAt, acceptedByName, isabellaLogs, participants, escalations, t]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        {t("sos.timeline.noEvents", "No events yet")}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-700" />

        {events.map((event, i) => (
          <div key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Dot */}
            <div className={cn("absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-zinc-900", typeColors[event.type] || "bg-zinc-500")} />

            <div className="ml-4 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-zinc-500">{formatTime(event.time)}</span>
                <span className="text-xs font-medium text-zinc-400">{event.actor}</span>
              </div>
              <p className="text-sm text-zinc-300 truncate">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
