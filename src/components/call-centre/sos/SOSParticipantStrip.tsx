import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, PhoneOff, Bot, User, Phone, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Participant {
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

interface SOSParticipantStripProps {
  participants: Participant[];
  onMute: (participantId: string) => void;
  onUnmute: (participantId: string) => void;
  onRemove: (participantId: string) => void;
}

function ElapsedTime({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Date.now() - new Date(since).getTime());
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setElapsed(`${min}:${sec.toString().padStart(2, "0")}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [since]);

  return <span className="text-xs font-mono text-zinc-500">{elapsed}</span>;
}

const typeIcons: Record<string, React.ElementType> = {
  member: User,
  staff: UserCheck,
  ai: Bot,
  emergency_contact: Phone,
  external_service: Phone,
};

const typeLabels: Record<string, string> = {
  member: "Member",
  staff: "Staff",
  ai: "Isabella AI",
  emergency_contact: "Contact",
  external_service: "External",
};

export function SOSParticipantStrip({ participants, onMute, onUnmute, onRemove }: SOSParticipantStripProps) {
  const { t } = useTranslation();
  const active = participants.filter((p) => !p.left_at);
  const left = participants.filter((p) => p.left_at);

  if (active.length === 0 && left.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/40 border-t border-zinc-700/50 overflow-x-auto">
      <span className="text-xs text-zinc-500 font-medium shrink-0">
        {t("sos.participants.label", "ON CALL")}
      </span>

      {active.map((p) => {
        const Icon = typeIcons[p.participant_type] || User;
        const isAi = p.participant_type === "ai";
        const isMember = p.participant_type === "member";

        return (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm shrink-0",
              p.is_muted
                ? "border-zinc-600 bg-zinc-800 text-zinc-400"
                : "border-green-700 bg-green-900/30 text-green-300"
            )}
          >
            {/* Status dot */}
            <div className={cn("h-2 w-2 rounded-full", p.is_muted ? "bg-zinc-500" : "bg-green-500 animate-pulse")} />

            <Icon className="h-3.5 w-3.5" />
            <span className="font-medium">{p.participant_name}</span>
            <span className="text-xs text-zinc-500">
              {isAi
                ? p.is_muted
                  ? t("sos.participants.standby", "Standby")
                  : t("sos.participants.active", "Active")
                : typeLabels[p.participant_type] || p.participant_type}
            </span>
            <ElapsedTime since={p.joined_at} />

            {/* Controls — don't show remove for member */}
            {!isMember && (
              <div className="flex items-center gap-0.5 ml-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-zinc-400 hover:text-white"
                  onClick={() => (p.is_muted ? onUnmute(p.id) : onMute(p.id))}
                >
                  {p.is_muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-zinc-400 hover:text-red-400"
                  onClick={() => onRemove(p.id)}
                >
                  <PhoneOff className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Show left participants dimmed */}
      {left.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-600 text-sm shrink-0"
        >
          <div className="h-2 w-2 rounded-full border border-red-700" />
          <span>{p.participant_name}</span>
          <span className="text-xs">{t("sos.participants.left", "left")}</span>
        </div>
      ))}
    </div>
  );
}
