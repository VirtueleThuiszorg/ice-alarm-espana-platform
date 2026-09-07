import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { episodeDuration, type IsabellaEpisode } from "@/lib/isabellaThread";

interface IsabellaEpisodeCardProps {
  episode: IsabellaEpisode;
  /** Who is reading. Only changes how the human turns are labelled. */
  viewer: "member" | "staff";
}

/**
 * ONE CARD FOR ONE CONVERSATION WITH ISABELLA — WP6 G7.
 *
 * Closed by default and openable. A four-minute call is thirty short turns; thirty bubbles in
 * the thread would bury the two human messages either side of it.
 *
 * WHAT IT DOES NOT DO. No summary, no sentiment, no "topics discussed", no urgency score. A
 * generated précis of a care conversation is a clinical judgement wearing a UI, and the member
 * reads this card too. It shows what was said, when, and by whom.
 *
 * THE STATUS IS TWILIO'S WORD, NOT OURS. `no-answer` stays `no-answer`. Rewriting it as
 * "missed" or "unsuccessful" adds an interpretation to a call record that an operator may later
 * have to rely on.
 *
 * A CALL WITH NO TRANSCRIPT SAYS SO. `voice-handler` writes each turn best-effort inside a
 * try/catch, so a call row can exist with nothing under it. An empty expander would read as a
 * silent call.
 */
export function IsabellaEpisodeCard({ episode, viewer }: IsabellaEpisodeCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const duration = episodeDuration(episode);
  const isVoice = episode.channel === "voice";
  const ChannelIcon = isVoice ? Phone : MessageCircle;

  const humanLabel = viewer === "member"
    ? t("isabellaThread.you", "You")
    : t("isabellaThread.caller", "Caller");

  return (
    <div className="my-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <Bot className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {isVoice
                ? t("isabellaThread.voiceTitle", "Call with Isabella")
                : t("isabellaThread.chatTitle", "Chat with Isabella")}
            </span>
            <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {episode.status && (
              <Badge variant="outline" className="text-xs font-normal">{episode.status}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {episode.startedAt ? format(new Date(episode.startedAt), "d MMM yyyy, HH:mm") : null}
            {duration
              ? ` · ${t("isabellaThread.duration", "{{minutes}}m {{seconds}}s", {
                  minutes: duration.minutes,
                  seconds: duration.seconds,
                })}`
              : ""}
            {` · ${t("isabellaThread.turnCount", "{{count}} messages", { count: episode.turns.length })}`}
          </p>
        </div>
        {episode.turns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {open
              ? t("isabellaThread.hide", "Hide transcript")
              : t("isabellaThread.show", "Show transcript")}
          </Button>
        )}
      </div>

      {episode.turns.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {t("isabellaThread.noTranscript", "No transcript was recorded for this call.")}
        </p>
      )}

      {open && episode.turns.length > 0 && (
        <ul className="mt-3 space-y-2 border-t pt-3">
          {episode.turns.map((turn) => (
            <li key={turn.id} className="text-sm">
              <span className="font-medium">
                {turn.role === "assistant" ? t("isabellaThread.isabella", "Isabella") : humanLabel}
              </span>
              <span className="text-muted-foreground">: </span>
              <span className="whitespace-pre-wrap break-words">{turn.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
