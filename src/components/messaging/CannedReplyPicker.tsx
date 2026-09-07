import { useState } from "react";
import { Loader2, MessageSquareText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { useCannedReplies } from "@/hooks/useCannedReplies";
import {
  cannedReplyLanguageSpec,
  languageIsRecorded,
  matchesCannedReply,
} from "@/lib/cannedReplies";

interface CannedReplyPickerProps {
  /** The MEMBER's stored `preferred_language`, raw. Never the operator's UI language. */
  preferredLanguage: string | null | undefined;
  /** True while the composer is writing an internal note. See the comment below. */
  isInternalNote?: boolean;
  /** Called with the reply's body. The caller appends it to the composer; nothing is sent. */
  onInsert: (body: string) => void;
}

/**
 * QUICK REPLIES FOR AN OPERATOR — WP6 G5, the surface half.
 *
 * ONE COMPONENT FOR THREE COMPOSERS. `call-centre/MessagesPage`, `admin/MessagesPage` and the
 * dashboard's `MessagesPanel` each write staff replies, and the last time a decision was left to
 * all three of them independently — which `sender_type` an internal note carries — two of them
 * got it wrong and members read the notes. A shared component is not tidiness here.
 *
 * IT INSERTS, IT DOES NOT SEND. A script goes into the composer for the operator to read, edit
 * and send deliberately. One-click sending of a pre-written paragraph to a member of a
 * life-safety service is a different feature, and not one anybody asked for.
 *
 * NOT AVAILABLE ON AN INTERNAL NOTE, and it says why rather than vanishing. Canned replies are
 * what we say TO the member; a note is what we say about them. The failure being prevented is
 * the operator who picks a script, does not notice the internal toggle is still on, and sends
 * the member nothing at all — the reply lands where only staff can read it, and the member's
 * thread stays silent. A greyed-out control with a reason is visible; a missing one is not.
 *
 * THE LANGUAGE IS THE MEMBER'S AND THE HEADER SAYS SO. When it was never recorded the header
 * says that too, instead of presenting the `en` default as the member's choice. The line this
 * must never become is `preferredLanguage={i18n.language}` — that is the operator's browser, not
 * the member's preference, and `cannedReplies.test.tsx` scans every call site in `src/` for it.
 * (Which is why that scan strips comments first: this sentence is otherwise a call site.)
 */
export function CannedReplyPicker({
  preferredLanguage,
  isInternalNote = false,
  onInsert,
}: CannedReplyPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const spec = cannedReplyLanguageSpec(preferredLanguage);
  const recorded = languageIsRecorded(preferredLanguage);
  const { data: replies, isLoading, isError } = useCannedReplies(preferredLanguage, !isInternalNote);

  const visible = (replies ?? []).filter((r) => matchesCannedReply(r, query));

  if (isInternalNote) {
    return (
      <Button variant="outline" size="sm" disabled title={t(
        "cannedReplies.notOnNotes",
        "Quick replies are what we send the member — not available on an internal note",
      )}>
        <MessageSquareText className="h-4 w-4 mr-2" />
        {t("cannedReplies.trigger", "Quick replies")}
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageSquareText className="h-4 w-4 mr-2" />
          {t("cannedReplies.trigger", "Quick replies")}
          <span className="ml-2 text-xs text-muted-foreground">{spec.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-3 border-b space-y-2">
          <p className="text-sm font-medium">
            {t("cannedReplies.heading", "Quick replies in {{language}}", { language: spec.label })}
          </p>
          <p className="text-xs text-muted-foreground">
            {recorded
              ? t(
                  "cannedReplies.headingRecorded",
                  "This member's recorded language. Replies are inserted for you to edit before sending.",
                )
              : t(
                  "cannedReplies.headingUnrecorded",
                  "No language recorded for this member — showing {{language}}. Check before you send.",
                  { language: spec.label },
                )}
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("cannedReplies.search", "Search replies")}
              aria-label={t("cannedReplies.search", "Search replies")}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("cannedReplies.loading", "Loading replies…")}
          </div>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive">
            {t(
              "cannedReplies.loadFailed",
              "The quick replies could not be loaded. Type your reply instead.",
            )}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {replies?.length
              ? t("cannedReplies.noMatch", "No reply matches “{{query}}”.", { query })
              : t(
                  "cannedReplies.empty",
                  "No quick replies in {{language}} yet. An admin adds them; nothing is substituted from another language.",
                  { language: spec.label },
                )}
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="py-1">
              {visible.map((reply) => (
                <li key={reply.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      onInsert(reply.body);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <code className="text-xs text-muted-foreground">{reply.shortcut}</code>
                      <span className="text-sm font-medium">{reply.title}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {reply.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
