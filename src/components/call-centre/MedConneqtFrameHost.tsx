import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ExternalLink, Loader2, MonitorX, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MEDCONNEQT_FRAME_ANCESTORS_HEADER,
  MEDCONNEQT_LOAD_TIMEOUT_MS,
  MEDCONNEQT_ROUTE,
  MEDCONNEQT_URL,
} from "@/config/medconneqt";

/**
 * The Medconneqt frame, mounted ONCE for the whole call-centre surface.
 *
 * WHY IT IS NOT IN THE PAGE. It was, and that was the defect (Lee's dashboard notes, 9 Sep,
 * item 8: "mount once, keep alive, do not remount"). A route component unmounts when the
 * operator navigates away, and unmounting an iframe destroys its document — so every trip to
 * Members and back logged them out of Medconneqt and put them in front of the partner's login
 * form again. Mid-shift, with a dispenser alarm open, that is not an inconvenience.
 *
 * So the host is rendered by CallCentreLayout, lives as long as the layout does, and is HIDDEN
 * rather than unmounted on every other route. `display: none` (which is what the `hidden`
 * attribute gives us) does not unload a frame: the document, its cookies and its scroll
 * position all survive, and coming back is instant.
 *
 * The page at MEDCONNEQT_ROUTE renders only the chrome above the frame — title, the login note,
 * the always-present new-tab button. It deliberately contains no iframe of its own; a second
 * one would be a second session, which is the bug wearing a different hat.
 */

type FrameState = "loading" | "ready" | "blocked" | "unreachable";

/** Gap left below the frame so it never pushes the page into a second scrollbar. */
const BOTTOM_GUTTER_PX = 24;
const MIN_FRAME_HEIGHT_PX = 320;

export function MedConneqtFrameHost() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = pathname === MEDCONNEQT_ROUTE;

  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameState, setFrameState] = useState<Exclude<FrameState, "unreachable">>("loading");
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frameHeight, setFrameHeight] = useState<number | undefined>();

  // A frame that fails at the network layer (host down, DNS, a corporate proxy in the way)
  // renders the BROWSER's error page, which is cross-origin and so indistinguishable from a
  // successful load by inspection alone. An independent no-cors probe tells the two apart.
  const state: FrameState = reachable === false ? "unreachable" : frameState;

  // Size the frame to the space actually left below it. Measuring the live offset (rather than
  // assuming a header height) keeps this correct when the SOS alert bar appears, on mobile where
  // the header is fixed, and when the sidebar collapses.
  //
  // Re-measured when the route becomes active as well as on resize: while hidden the container
  // has no box, so a measurement taken then would be nonsense — and it is exactly the
  // measurement that would be in place on the operator's first visit back.
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setFrameHeight(Math.max(MIN_FRAME_HEIGHT_PX, window.innerHeight - top - BOTTOM_GUTTER_PX));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [active]);

  /**
   * Decide whether the frame actually rendered Medconneqt.
   *
   * Cross-origin content is unreadable — contentDocument is null or throws a SecurityError — and
   * that is the SUCCESS signal. When a browser refuses the frame on X-Frame-Options /
   * frame-ancestors it leaves it parked on about:blank, which IS same-origin and readable but
   * empty. So: readable and empty means blocked; unreadable means it loaded.
   */
  const probe = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    try {
      const doc = el.contentDocument;
      if (doc === null) {
        setFrameState("ready");
        return;
      }
      const empty = !doc.body || doc.body.childElementCount === 0;
      setFrameState(empty ? "blocked" : "ready");
    } catch {
      setFrameState("ready");
    }
  }, []);

  // Reachability probe, re-run on every attempt.
  //
  // The response TYPE is the signal, not merely that the promise settled. Our own service worker
  // answers a failed cross-origin request with a synthesised offline fallback (sw.js
  // `networkFirst` → `offlineFallback`), so a plain `.then()` resolves even when the host is
  // unreachable and the frame is showing the browser's error page. Only a real no-cors network
  // response is `opaque`; the service worker's stand-in is not.
  //
  // Gated on `active`: the host is mounted on every call-centre route, and probing a third
  // party from the SOS screen would be a request nobody asked for.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setReachable(null);
    fetch(MEDCONNEQT_URL, { mode: "no-cors", cache: "no-store" })
      // opaque = real cross-origin answer, basic/cors = a real answer too.
      // "default" is what a hand-built Response has — i.e. our own fallback.
      .then((res) => !cancelled && setReachable(res.type !== "default" && res.type !== "error"))
      .catch(() => !cancelled && setReachable(false));
    return () => {
      cancelled = true;
    };
  }, [attempt, active]);

  // A frame that never fires load at all (refused outright, or the host is unreachable) must not
  // leave staff staring at a spinner forever.
  useEffect(() => {
    if (frameState !== "loading" || !active) return;
    const timer = window.setTimeout(() => setFrameState("blocked"), MEDCONNEQT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [frameState, attempt, active]);

  const retry = () => {
    setFrameState("loading");
    setAttempt((n) => n + 1);
  };

  const failed = state === "blocked" || state === "unreachable";
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div
      // `hidden`, never a conditional render: unmounting would take the Medconneqt session with
      // it. Tailwind's preflight makes this `display: none`, which a frame survives.
      hidden={!active}
      data-testid="medconneqt-frame-host"
      className="relative mt-4 overflow-hidden rounded-lg border border-border bg-background"
      ref={containerRef}
      style={{ height: active ? frameHeight : undefined }}
    >
      {!failed && (
        <iframe
          key={attempt}
          ref={frameRef}
          src={MEDCONNEQT_URL}
          onLoad={probe}
          onError={() => setFrameState("blocked")}
          title={t("medconneqt.frameTitle")}
          className="h-full w-full border-0"
          allow="fullscreen"
        />
      )}

      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("medconneqt.loading")}</p>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center overflow-auto p-6">
          <Card className="max-w-lg">
            <CardContent className="space-y-4 pt-6 text-center">
              <MonitorX className="mx-auto h-10 w-10 text-muted-foreground" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">
                  {state === "unreachable"
                    ? t("medconneqt.unreachableTitle")
                    : t("medconneqt.blockedTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {state === "unreachable"
                    ? t("medconneqt.unreachableBody")
                    : t("medconneqt.blockedBody")}
                </p>
              </div>

              {/*
                The refusal is Medconneqt's to lift, so the panel says exactly what they would
                have to send rather than leaving an operator to report "it doesn't work". The
                browser never reveals WHICH of the two headers refused us, so both are named:
                X-Frame-Options has no allow-list form and must go, and frame-ancestors is the
                one that can grant the exception.
              */}
              {state === "blocked" && (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-left">
                  <p className="text-xs text-muted-foreground">{t("medconneqt.blockedHeaderNote")}</p>
                  <code className="block select-all break-all rounded bg-background p-2 text-xs">
                    {MEDCONNEQT_FRAME_ANCESTORS_HEADER(origin)}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    {t("medconneqt.blockedHeaderXfo")}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <a href={MEDCONNEQT_URL} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t("medconneqt.openInNewTab")}
                  </a>
                </Button>
                <Button variant="outline" onClick={retry}>
                  <RefreshCw className="h-4 w-4" />
                  {t("medconneqt.retry")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
