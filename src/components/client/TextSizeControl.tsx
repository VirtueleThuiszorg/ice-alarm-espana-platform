import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  TEXT_SIZES,
  applyTextSize,
  readStoredTextSize,
  writeStoredTextSize,
  type TextSizeLevel,
} from "@/lib/textSize";

/**
 * THE A/A CONTROL, in the member header — R3, R10.
 *
 * Two buttons, both showing "A", the second one larger. The size of the glyph IS the affordance:
 * a member who cannot read the small one can still see which of the two is bigger, which is not
 * true of a label saying "Text size: large".
 *
 * BUT "A" AND "A" ARE THE SAME TO A SCREEN READER, so each carries a real accessible name and the
 * pair is a `radiogroup` rather than two loose buttons — pressing one is choosing between them,
 * not toggling something on. `aria-checked` says which is current, so the state is announced
 * rather than left to the visual weight.
 *
 * IT READS THE STORE ON MOUNT rather than trusting a prop. `applyStoredTextSize()` has already
 * run from `main.tsx` before the first paint, so this is only catching up with a decision already
 * applied — and if the two ever disagree, the DOM is what the member is looking at.
 */
export function TextSizeControl({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<TextSizeLevel>(() => readStoredTextSize());

  // The store is the authority across tabs; a member who changes it in one and comes back to the
  // other should not see a control that disagrees with the text in front of them.
  useEffect(() => {
    const onStorage = () => setLevel(readStoredTextSize());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const choose = useCallback((next: TextSizeLevel) => {
    setLevel(next);
    applyTextSize(next, document.documentElement);
    writeStoredTextSize(next);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label={t("textSize.groupLabel", "Text size")}
      data-testid="text-size-control"
      className={cn("flex items-center rounded-md border", className)}
    >
      {TEXT_SIZES.map((size, i) => {
        const current = size.level === level;
        return (
          <button
            key={size.level}
            type="button"
            role="radio"
            aria-checked={current}
            aria-label={t(size.label.key, size.label.fallback)}
            data-testid={`text-size-${size.level}`}
            onClick={() => choose(size.level)}
            className={cn(
              // A 36px hit target at the smallest, so the control that fixes small text is not
              // itself the hardest thing on the page to press.
              "flex h-9 w-9 items-center justify-center font-semibold transition-colors",
              i === 0 ? "rounded-l-md" : "rounded-r-md",
              // Ink, never brand red: R2 keeps red off anything that is not the page's action.
              current ? "bg-foreground text-background" : "hover:bg-accent",
            )}
          >
            <span aria-hidden="true" className={i === 0 ? "text-xs" : "text-base"}>
              {size.glyph}
            </span>
          </button>
        );
      })}
    </div>
  );
}
