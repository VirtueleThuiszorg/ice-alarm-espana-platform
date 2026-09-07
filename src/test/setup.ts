import "@testing-library/jest-dom";

// Guard for tests that opt into the node environment (no `window`).
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

/**
 * jsdom has no Pointer Events API, and every Radix overlay (dropdown, select, dialog) opens on
 * `pointerdown` and calls `hasPointerCapture` while doing it. Without these three shims a menu
 * simply never opens in a test, so the assertions that matter — what the click WRITES — cannot
 * be reached at all, and the temptation is to test the component's internals instead of its
 * behaviour.
 *
 * Additive and inert outside jsdom: guarded on `window`, and each shim is only installed when
 * the real thing is absent, so a future jsdom that implements them wins.
 */
if (typeof window !== "undefined") {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventShim extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 1;
        this.pointerType = props.pointerType ?? "mouse";
      }
    }
    window.PointerEvent = PointerEventShim as unknown as typeof window.PointerEvent;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  /*
    Radix's Select measures its trigger to size the popover, and jsdom has no ResizeObserver, so
    OPENING a select throws before any assertion is reached. Same reasoning as the pointer shims
    above: without it the only testable thing is the component's internals, and what matters is
    what the choice WRITES.

    A no-op is the right shim rather than a polyfill: nothing in jsdom has a layout to observe,
    and a callback that never fires is exactly as accurate as one measuring zeroes.
  */
  if (typeof window.ResizeObserver === "undefined") {
    class ResizeObserverShim {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverShim as unknown as typeof window.ResizeObserver;
  }
}
