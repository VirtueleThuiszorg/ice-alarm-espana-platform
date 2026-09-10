import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ExternalLink, Home, Navigation } from "lucide-react";
import {
  CONFIRMED_HOME_SOURCES,
  formatDistance,
  type ResolvedHome,
} from "@/lib/homeLocation";

/**
 * THE HOME BLOCK ON AN OPERATOR'S SOS CARD — one implementation, both cards.
 *
 * ── THE ONE RULE THIS COMPONENT EXISTS TO ENFORCE ───────────────────────────
 *
 * The home pin is NEVER merged with the pendant's live fix and NEVER shown in its place
 * unlabelled. Whatever else changes, this block always says, in words, what it is and where it
 * came from: "Home location (set by member on 3 June 2026)". An operator reading a coordinate
 * has to know whether they are looking at where the pendant last was or where the member says
 * they live, because those two facts lead to two different decisions.
 *
 * So the label is DERIVED FROM THE PROVENANCE, not passed in:
 *   member_pin / member_gps  → "set by member on <date>"
 *   staff_pin                → "set by our team on <date>"
 *   geocoded / imported      → "from our records — not confirmed by the member"
 *
 * The third case is the one worth having a component for. A coordinate that came off a
 * spreadsheet or a geocoded address must not borrow the confidence of one the member stood on,
 * and the only way to guarantee that is for the two to be rendered by the same code.
 *
 * DISPLAY ONLY. Nothing here escalates, resolves, times, or decides who is called.
 */

export interface HomeLocationBlockProps {
  home: ResolvedHome;
  /** True when there is no recent pendant fix and this is the card's leading answer. */
  isPrimary: boolean;
  /** Straight-line metres from the pendant's fix, when there is one. */
  distanceMetres: number | null;
  /**
   * `dark` for the operator SOS screens (zinc-on-black), `card` for the alert detail sheet.
   * Two skins rather than two components: the label logic is the part that must not fork.
   */
  tone: "dark" | "card";
  className?: string;
}

export function HomeLocationBlock({
  home,
  isPrimary,
  distanceMetres,
  tone,
  className = "",
}: HomeLocationBlockProps) {
  const { t } = useTranslation();
  const dark = tone === "dark";

  const setOn = home.setAt ? format(new Date(home.setAt), "d MMM yyyy") : null;
  const confirmed = (CONFIRMED_HOME_SOURCES as readonly string[]).includes(home.source);

  const label = !confirmed
    ? t("sos.home.labelUnconfirmed", "Home location (from our records — not confirmed by the member)")
    : home.source === "staff_pin"
      ? setOn
        ? t("sos.home.labelStaff", "Home location (set by our team on {{date}})", { date: setOn })
        : t("sos.home.labelStaffNoDate", "Home location (set by our team)")
      : setOn
        ? t("sos.home.labelMember", "Home location (set by member on {{date}})", { date: setOn })
        : t("sos.home.labelMemberNoDate", "Home location (set by member)");

  const distance = distanceMetres === null ? null : formatDistance(distanceMetres);

  const openMap = () =>
    window.open(`https://www.google.com/maps?q=${home.lat},${home.lng}`, "_blank", "noopener,noreferrer");
  const openDirections = () =>
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${home.lat},${home.lng}`,
      "_blank",
      "noopener,noreferrer",
    );

  return (
    <div
      className={[
        "rounded-lg border p-2",
        dark
          ? isPrimary
            ? "border-amber-500/60 bg-amber-500/10"
            : "border-zinc-700/50 bg-zinc-800/40"
          : isPrimary
            ? "border-amber-500/60 bg-amber-500/10"
            : "border-border bg-muted/40",
        className,
      ].join(" ")}
      data-testid="sos-home-location"
      data-home-primary={isPrimary ? "true" : "false"}
      data-home-source={home.source}
    >
      <div className="flex items-start gap-1.5">
        <Home
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${dark ? "text-amber-300" : "text-amber-600"}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          {/* THE LABEL. Always present, always says whose pin this is and when. */}
          <p
            className={`text-xs font-medium ${dark ? "text-zinc-200" : "text-foreground"}`}
            data-testid="sos-home-label"
          >
            {label}
          </p>

          {distance && (
            /*
              THE ONE LINE AN OPERATOR ACTS ON. "the pendant is 1.2 km from home" answers
              "do I send help to the house?" on its own, without either coordinate being read.
            */
            <p
              className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
              data-testid="sos-home-distance"
            >
              {t("sos.home.distance", "Pendant is {{value}} {{unit}} from home", {
                value: distance.value,
                unit: distance.unit,
              })}
            </p>
          )}

          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={openMap}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors ${
                dark ? "text-zinc-300 hover:bg-zinc-700 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              data-testid="sos-home-map"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              {t("sos.home.map", "Map")}
            </button>
            <button
              type="button"
              onClick={openDirections}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors ${
                dark ? "text-zinc-300 hover:bg-zinc-700 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              data-testid="sos-home-directions"
            >
              <Navigation className="h-3 w-3" aria-hidden="true" />
              {t("sos.home.directions", "Directions")}
            </button>
            <span
              className={`ml-auto shrink-0 text-[0.625rem] ${dark ? "text-zinc-500" : "text-muted-foreground"}`}
              data-testid="sos-home-coords"
            >
              {home.lat.toFixed(5)}, {home.lng.toFixed(5)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
