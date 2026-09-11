import type { Page } from "@playwright/test";

/**
 * WAIT UNTIL THE PAGE HAS STOPPED MOVING, before believing a photograph of it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * A screenshot taken during an entrance animation is a screenshot of a state no human ever
 * sees, and it is indistinguishable from a rendering defect. `ProfilePage` wraps its whole body
 * in `animate-fade-in` — `opacity: 0 → 1` over 300ms — and a capture taken 100ms in shows every
 * card uniformly darkened. That is not a subtle artefact: it was reported as "the member portal
 * renders with a dimming overlay over its content", investigated as a stuck dialog backdrop,
 * and there was never anything there. The screenshot was the bug.
 *
 * ── WHY NOT A `waitForTimeout` ──────────────────────────────────────────────
 *
 * A fixed sleep is a guess that is simultaneously too long on every run and too short on the
 * one that matters. `document.getAnimations()` is the actual question — "is anything still
 * animating" — asked of the browser rather than estimated.
 *
 * INFINITE ANIMATIONS ARE EXCLUDED, and they have to be: this product has `animate-pulse` on an
 * incoming SOS badge and `pulse-soft` in the token set. Waiting for those to finish would hang
 * until the test timed out, on exactly the screens that matter most.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => {
          const timing = a.effect?.getTiming();
          // `Infinity` iterations never end; nothing else may be outstanding.
          return timing?.iterations !== Infinity;
        })
        .every((a) => a.playState === "finished" || a.playState === "idle"),
    undefined,
    { timeout: 10_000 },
  );
  // One frame after the last animation settles, so the compositor has painted the final state.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Every element that covers most of the viewport and is positioned over the page.
 *
 * A stuck Radix backdrop — a Dialog or Sheet whose overlay stays mounted after close — is a real
 * failure mode and looks exactly like the animation artefact above. This is how the two are told
 * apart: one is a DOM element that is really there, the other is not.
 *
 * `data-state="closed"` is excluded: Radix keeps an overlay mounted through its exit animation
 * and marks it closed, and catching that is catching the same timing artefact from the other
 * side.
 */
export async function fullViewportOverlays(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return;
      if (cs.visibility === "hidden" || cs.display === "none") return;
      if (el.getAttribute("data-state") === "closed") return;
      // Fully transparent layers are not dimming anything.
      if (cs.opacity === "0") return;
      const bg = cs.backgroundColor;
      if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.9) return;
      out.push(
        `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> bg=${bg} opacity=${cs.opacity} z=${cs.zIndex}`,
      );
    });
    return out;
  });
}
