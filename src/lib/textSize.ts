/**
 * THE A/A TEXT-SIZE CONTROL — MEMBER_UX_RULES R10 and R3.
 *
 * R10: *"16px body, 13px labels minimum, A/A control persists per user (localStorage is fine)."*
 * R3 puts the control in the header, between the bell and the language selector.
 *
 * TWO LEVELS, AND NEITHER IS SMALLER THAN THE FLOOR. "A/A" is two sizes, not a slider, and the
 * lower one is the design's own size rather than a shrunken version of it. A product whose
 * readers are mostly over seventy has no business offering a way to make the text smaller than
 * 16px: somebody would press it once, by accident, and then be unable to read the control that
 * would put it back.
 *
 * HOW IT SCALES. The level sets `font-size` on `<html>`, and every Tailwind type utility in this
 * codebase is rem-based, so one property moves the whole member surface — including
 * `.theme-public`'s 1.0625rem body floor, which scales with it rather than pinning against it.
 * The exception is an arbitrary PX value (`text-[28px]`), which ignores the root size entirely
 * and is why `memberPageShell.test.tsx` now forbids one on the member surface. R5's "28px" is
 * written as `1.75rem`: the same size at the default level, and a size that still means something
 * at the larger one.
 *
 * APPLIED BEFORE THE FIRST PAINT. `applyStoredTextSize()` runs from `main.tsx`, synchronously,
 * ahead of `createRoot().render()`. Doing it in an effect instead would render the page at the
 * default size and then jump — which for a member who chose the large size is the app appearing
 * to ignore them once per visit.
 *
 * EVERY STORAGE ACCESS CAN THROW. Safari's private mode throws on `localStorage.setItem`, and a
 * text-size preference is never worth a white screen. Both directions are wrapped, and a stored
 * value that is not a known level is treated as absent rather than parsed into something.
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not stored against the member's row. R10 sanctions
 * localStorage in as many words, and a `members` column would be a schema change plus a write
 * path on a table whose self-UPDATE policy has no column restriction (PAYER_MODEL.md §2). The
 * cost is real and worth naming: a member who reads on a tablet and a phone sets it twice.
 */

export interface TextSizeSpec {
  level: string;
  /** Multiplier applied to the root font size. Never below 1 — see the module comment. */
  scale: number;
  /** The visible glyph. Both levels show "A"; the size of the glyph is the affordance. */
  glyph: string;
  /** Accessible name — "A" and "A" are indistinguishable to a screen reader. */
  label: { key: string; fallback: string };
}

export const TEXT_SIZES = [
  {
    level: "normal",
    scale: 1,
    glyph: "A",
    label: { key: "textSize.normal", fallback: "Normal text size" },
  },
  {
    level: "large",
    scale: 1.25,
    glyph: "A",
    label: { key: "textSize.large", fallback: "Larger text" },
  },
] as const satisfies readonly TextSizeSpec[];

/**
 * `as const satisfies`, never an annotation: `: readonly TextSizeSpec[]` widens `level` back to
 * `string` and this type stops meaning anything. Same trap as `medicalFields.ts`, which shipped a
 * decorative ratchet on its first attempt.
 */
export type TextSizeLevel = (typeof TEXT_SIZES)[number]["level"];

export const DEFAULT_TEXT_SIZE: TextSizeLevel = "normal";

export const TEXT_SIZE_STORAGE_KEY = "ice.textSize";

/** The root font size the browser gives us, and the number the scales are relative to. */
export const BASE_FONT_PX = 16;

export function textSizeSpec(level: TextSizeLevel): TextSizeSpec {
  const spec = TEXT_SIZES.find((s) => s.level === level);
  // Unreachable while the union above is derived from the array; thrown rather than defaulted,
  // because silently falling back would make a broken level look like a working one.
  if (!spec) throw new Error(`unknown text size level: ${level}`);
  return spec;
}

/** A stored string, or anything else, reduced to a level we can act on. */
export function parseTextSize(raw: unknown): TextSizeLevel {
  const known = TEXT_SIZES.map((s) => s.level as string);
  return typeof raw === "string" && known.includes(raw) ? (raw as TextSizeLevel) : DEFAULT_TEXT_SIZE;
}

/** Reads the stored preference. Never throws; an unreadable store means the default. */
export function readStoredTextSize(): TextSizeLevel {
  try {
    return parseTextSize(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

/** Writes the preference. Never throws; a failed write costs the preference, not the session. */
export function writeStoredTextSize(level: TextSizeLevel): void {
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, level);
  } catch {
    /* private mode, or storage full. The size still applies for this visit. */
  }
}

/** Sets the root font size. The one place that touches the document. */
export function applyTextSize(level: TextSizeLevel, root: HTMLElement): void {
  root.style.fontSize = `${BASE_FONT_PX * textSizeSpec(level).scale}px`;
  // So CSS and tests can see the choice without reverse-engineering it from a pixel value.
  root.dataset.textSize = level;
}

/**
 * Applies whatever was stored, before the app renders. Safe to call anywhere, including in a
 * non-DOM environment, where it does nothing and returns the default.
 */
export function applyStoredTextSize(): TextSizeLevel {
  const level = readStoredTextSize();
  if (typeof document !== "undefined" && document.documentElement) {
    applyTextSize(level, document.documentElement);
  }
  return level;
}
