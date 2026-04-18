import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, HelpCircle, MessageCircle, Brain, Handshake, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface IsabellaNote {
  id: string;
  alert_id: string;
  timestamp: string;
  note_type: string;
  content: string;
  is_critical: boolean;
}

interface SOSIsabellaFeedProps {
  notes: IsabellaNote[];
  alertReceivedAt: string;
}

const noteTypeIcons: Record<string, React.ElementType> = {
  observation: Eye,
  question_asked: HelpCircle,
  member_response: MessageCircle,
  triage_decision: Brain,
  handover_briefing: Handshake,
  flag: Flag,
};

function relativeTime(noteTimestamp: string, alertStart: string): string {
  const diff = Math.max(0, new Date(noteTimestamp).getTime() - new Date(alertStart).getTime());
  const totalSec = Math.floor(diff / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function SOSIsabellaFeed({ notes, alertReceivedAt }: SOSIsabellaFeedProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new notes arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        <Brain className="h-4 w-4 mr-2 opacity-50" />
        {t("sos.isabella.waitingForNotes", "Waiting for Isabella's assessment...")}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto space-y-1 pr-1"
    >
      {notes.map((note, i) => {
        const Icon = noteTypeIcons[note.note_type] || Eye;
        return (
          <div
            key={note.id}
            className={cn(
              "flex gap-2 px-2 py-1.5 rounded text-sm transition-opacity duration-300",
              note.is_critical && "border-l-2 border-red-500 bg-red-500/10",
              i === notes.length - 1 && "animate-in fade-in slide-in-from-bottom-1 duration-300"
            )}
          >
            <span className="text-zinc-500 font-mono text-xs whitespace-nowrap pt-0.5">
              {relativeTime(note.timestamp, alertReceivedAt)}
            </span>
            <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", note.is_critical ? "text-red-400" : "text-zinc-400")} />
            <span className={cn("text-zinc-300", note.is_critical && "text-red-300 font-medium")}>
              {note.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
