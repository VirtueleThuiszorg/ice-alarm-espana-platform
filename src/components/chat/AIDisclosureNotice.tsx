import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EU AI ACT ART. 50 — "YOU ARE TALKING TO AN AI".
 *
 * Shown at the top of every member- and visitor-facing Isabella chat, above the first message and
 * outside the scrolling area, so it is read before anything is typed and never scrolls away.
 * It is a sentence, not an icon: the readers here are often older, and a robot glyph beside a
 * friendly photo does not say "this is not a person".
 *
 * The staff and admin assistants do not render it — they are internal tools and their own
 * greeting already says "AI assistant".
 *
 * DRAFT wording, pending legal review (LEGAL.md §2B). Keys: `chat.aiDisclosure.*`.
 */
export function AIDisclosureNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      aria-label={t("chat.aiDisclosure.label")}
      data-testid="ai-disclosure"
      className={cn(
        "flex items-start gap-2 border-b bg-muted/60 px-4 py-2 text-xs leading-relaxed text-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">{t("chat.aiDisclosure.label")}.</strong>{" "}
        {t("chat.aiDisclosure.text")}
      </p>
    </div>
  );
}
