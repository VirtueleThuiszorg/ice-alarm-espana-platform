import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Info, Loader2, MonitorX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MEDCONNEQT_URL, MEDCONNEQT_LOAD_TIMEOUT_MS } from "@/config/medconneqt";

type FrameState = "loading" | "ready" | "blocked" | "unreachable";

/** Gap left below the frame so it never pushes the page into a second scrollbar. */
const BOTTOM_GUTTER_PX = 24;
const MIN_FRAME_HEIGHT_PX = 320;

export default function MedConneqtPage() {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameState, setFrameState] = useState<Exclude<FrameState, "unreachable">>("loading");
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frameHeight, setFrameHeight] = useState<number | undefined>();

  // A frame that fails at the network layer (host down, DNS, a corporate proxy
  // in the way) renders the BROWSER's error page, which is cross-origin and so
  // indistinguishable from a successful load by inspection alone. An
  // independent no-cors probe tells the two apart: it resolves opaquely when
  // the host answers and rejects when it cannot be reached. Without this the
  // page would confidently show an empty browser error page as "loaded" —
  // exactly the silent blank rectangle this view exists to prevent.
  const state: FrameState = reachable === false ? "unreachable" : frameState;

  // Size the frame to the space actually left below it. Measuring the live
  // offset (rather than assuming a header height) keeps this correct when the
  // SOS alert bar appears, on mobile where the header is fixed, and when the
  // sidebar collapses.
  useLayoutEffect(() => {
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
  }, []);

  /**
   * Decide whether the frame actually rendered Medconneqt.
   *
   * Cross-origin content is unreadable — contentDocument is null or throws a
   * SecurityError — and that is the SUCCESS signal. When a browser refuses the
   * frame on X-Frame-Options / frame-ancestors it leaves it parked on
   * about:blank, which IS same-origin and readable but empty. So: readable and
   * empty means blocked; unreadable means it loaded.
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
  // The response TYPE is the signal, not merely that the promise settled. Our
  // own service worker answers a failed cross-origin request with a
  // synthesised offline fallback (sw.js `networkFirst` → `offlineFallback`),
  // so a plain `.then()` resolves even when the host is unreachable and the
  // frame is showing the browser's error page. Only a real no-cors network
  // response is `opaque`; the service worker's stand-in is not.
  useEffect(() => {
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
  }, [attempt]);

  // A frame that never fires load at all (refused outright, or the host is
  // unreachable) must not leave staff staring at a spinner forever.
  useEffect(() => {
    if (frameState !== "loading") return;
    const timer = window.setTimeout(() => setFrameState("blocked"), MEDCONNEQT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [frameState, attempt]);

  const retry = () => {
    setFrameState("loading");
    setAttempt((n) => n + 1);
  };

  const failed = state === "blocked" || state === "unreachable";

  const openInNewTab = (
    <Button variant="outline" size="sm" asChild>
      <a href={MEDCONNEQT_URL} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-4 w-4" />
        {t("medconneqt.openInNewTab")}
      </a>
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("medconneqt.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("medconneqt.subtitle")}</p>
        </div>
        {/* Always available: staff may need the separate login, and browsers
            can refuse the frame's cookies even when framing itself works. */}
        {openInNewTab}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {t("medconneqt.loginNote")} {t("medconneqt.sessionNote")}
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-border bg-background"
        style={{ height: frameHeight }}
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
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Card className="max-w-md">
              <CardContent className="space-y-4 pt-6 text-center">
                <MonitorX className="mx-auto h-10 w-10 text-muted-foreground" />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">
                    {state === "unreachable" ? t("medconneqt.unreachableTitle") : t("medconneqt.blockedTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {state === "unreachable" ? t("medconneqt.unreachableBody") : t("medconneqt.blockedBody")}
                  </p>
                </div>
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
    </div>
  );
}
