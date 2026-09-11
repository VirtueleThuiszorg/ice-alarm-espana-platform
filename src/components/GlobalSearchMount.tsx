import { Suspense, lazy, useEffect, useState } from "react";

/**
 * The Cmd+K palette, kept out of the entry chunk until somebody presses Cmd+K.
 *
 * `GlobalSearch` is ~500 lines that reach `cmdk`, two dozen lucide icons and four
 * Supabase searches, and it was rendered unconditionally at the top of the app —
 * so a visitor reading the pricing page on their phone downloaded and parsed a
 * staff search palette they cannot even use (its results are gated on `isStaff`).
 *
 * WHY A MOUNT COMPONENT RATHER THAN `lazy()` AT THE CALL SITE. The palette's
 * trigger is a global keydown listener that lives INSIDE the component, so a
 * lazily-mounted `GlobalSearch` could never hear the keypress that should mount
 * it. This holds the listener instead — twelve lines, no dependencies — and on
 * the first Cmd+K hands the real component over with `defaultOpen`, so the press
 * that loaded it is also the press that opened it. Afterwards the component's own
 * listener does the toggling and this one is inert.
 *
 * The fallback is deliberately `null`: a spinner in the top-left corner of an
 * otherwise finished page, for the few hundred milliseconds a chunk takes, is
 * worse than the palette simply appearing when it is ready.
 */
const GlobalSearch = lazy(() =>
  import("./GlobalSearch").then((m) => ({ default: m.GlobalSearch })),
);

export function GlobalSearchMount() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setArmed(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [armed]);

  if (!armed) return null;

  return (
    <Suspense fallback={null}>
      <GlobalSearch defaultOpen />
    </Suspense>
  );
}
