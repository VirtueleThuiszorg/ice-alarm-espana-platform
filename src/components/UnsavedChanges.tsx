import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

/**
 * WHO IS HALF-WAY THROUGH AN EDIT — so leaving does not throw it away silently.
 *
 * `EditableCard` already warns two ways: an in-app confirm on Cancel, and the browser's own
 * `beforeunload` for a closed tab or the back button. NEITHER SEES A TAB CHANGE. Radix unmounts
 * the inactive `TabsContent`, so clicking "Medical" while half-way through editing the address
 * destroyed the edit with no warning at all and no way back — inside the app, where the browser
 * has nothing to say.
 *
 * A card cannot solve this alone: the thing being clicked is somewhere else on the page. So a
 * card REGISTERS that it is dirty and whatever owns the navigation asks before moving.
 *
 * DELIBERATELY NOT A ROUTER GUARD. This is about one page's tabs; blocking route changes app-
 * wide is a bigger promise with more ways to get stuck, and `beforeunload` already covers
 * leaving the app.
 */

interface UnsavedChangesValue {
  /** A card reports itself dirty or clean. Clean-up on unmount is the caller's job. */
  setDirty: (id: string, dirty: boolean) => void;
  /** Is anything on this page mid-edit? */
  hasUnsaved: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  /*
    A REF, AND DELIBERATELY NO STATE AT ALL.

    The first version kept a `version` counter and bumped it on every change so that anything
    rendering FROM the registry would update. That re-rendered the provider, which changed the
    context value, which re-rendered every registered card, whose effect re-registered — and
    typing one character into a card locked the event loop hard enough that the test timeout
    could not fire. It hung the runner instead of failing, which is the expensive way to find
    a render loop.

    Nothing renders from this. The registry is READ once, inside a click handler, at the moment
    somebody tries to leave — so a ref is not an optimisation here, it is the whole design, and
    it makes the loop impossible rather than merely absent. A consumer that ever needs to
    RENDER from unsaved state should subscribe explicitly rather than reintroduce the counter.
  */
  const dirty = useRef(new Set<string>());

  const setDirty = useCallback((id: string, next: boolean) => {
    if (next) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);

  const hasUnsaved = useCallback(() => dirty.current.size > 0, []);

  const value = useMemo(() => ({ setDirty, hasUnsaved }), [setDirty, hasUnsaved]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

/**
 * Null outside a provider, on purpose. A card must work on a page that has no tabs to guard —
 * throwing here would make the shell unusable exactly where it is simplest.
 */
export function useUnsavedChanges(): UnsavedChangesValue | null {
  return useContext(UnsavedChangesContext);
}
