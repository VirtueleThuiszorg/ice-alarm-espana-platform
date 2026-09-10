import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Crosshair, Loader2, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { logMemberActivity } from "@/lib/auditLog";
import {
  MEMBER_GPS_MAX_ACCURACY_M,
  NUDGE_METRES,
  isAcceptableMemberGpsAccuracy,
  nudgeCoords,
  round6,
  type HomeLocationSource,
} from "@/lib/homeLocation";
import { forwardGeocode } from "@/lib/geocode";
import { toast } from "sonner";

/**
 * "WHERE DO WE SEND HELP IF YOUR PENDANT CANNOT TELL US WHERE YOU ARE?"
 *
 * One dialog, two callers, because it is the same question either way:
 *  - the member, from their own account page. Saves through `member-self-service`, which stamps
 *    the provenance from the bearer token, so the pin is recorded as member-confirmed.
 *  - staff, from the member record, correcting one over the phone. Writes `members` directly
 *    under the staff policy and is recorded as `staff_pin`, never as a member confirmation —
 *    the SOS card labels the two differently and `guard_member_home_location()` refuses the lie
 *    even if this component tried to tell it.
 *
 * THE MEMBER'S LOCATION IS NEVER TRACKED. `navigator.geolocation` is asked ONCE, only when the
 * member presses the button, and the answer is held in component state until they press Save or
 * close the dialog. There is no watchPosition, no polling, and nothing is written on any other
 * interaction.
 *
 * WHY IT REFUSES A BAD FIX RATHER THAN SAVING IT. A browser indoors on wifi commonly reports
 * ±500–800 m. Stored as a front door that is a pin on the wrong street, and the SOS card would
 * then show it with the same confidence as a good one — which is worse than showing nothing,
 * because an operator would act on it. So >100 m is refused with a plain instruction, not a
 * warning the member can click past.
 */

// Leaflet and its stylesheet are ~45 KB gzipped and are needed only once a member opens this
// dialog. Nothing about the first paint of the dashboard should pay for them.
const HomeLocationMap = lazy(() => import("@/components/maps/HomeLocationMap"));

/** Where the map starts when there is no pin and the address cannot be geocoded: Albox, Almería. */
const FALLBACK_CENTRE = { lat: 37.3886, lng: -2.1487 };

export interface SetHomeLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  /** Existing pin, if there is one. The map opens on it rather than on the address. */
  existing?: { lat: number; lng: number } | null;
  /** The typed postal address, used to centre the map the FIRST time. Never saved from here. */
  address?: {
    line1?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  } | null;
  /** Which write path and which provenance. See the module comment. */
  actor: "member" | "staff";
  onSaved?: () => void;
}

type GpsState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "refused"; accuracyM: number }
  | { kind: "unavailable"; reason: "denied" | "error" }
  | { kind: "accepted"; accuracyM: number };

export function SetHomeLocationDialog({
  open,
  onOpenChange,
  memberId,
  existing,
  address,
  actor,
  onSaved,
}: SetHomeLocationDialogProps) {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(existing ?? null);
  const [centring, setCentring] = useState(false);
  const [gps, setGps] = useState<GpsState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  /**
   * THE ACCEPTED FIX THE PIN IS CURRENTLY STANDING ON, or null.
   *
   * It holds the accuracy, not just a boolean, and that is the fix for a real defect. It was
   * `gpsUntouched: boolean`, with the accuracy read out of the `gps` message state at save time —
   * so a member who pressed "Use my current location" twice, the second time from a worse spot,
   * ended up in a state where the message said "refused" while the flag still said "this is a
   * GPS fix". The save then went out as `member_gps` with a NULL accuracy, which
   * `save_home_location` and the CHECK constraint both correctly refuse. The member was told
   * their reading was not accurate enough while looking at a pin that was.
   *
   * Found in a Playwright screenshot of exactly that sequence, not by a test — which is why
   * there is now a test for it.
   *
   * Cleared the moment the member moves the pin themselves: one nudge and it is their own
   * judgement, which is `member_pin` with no accuracy figure to claim.
   */
  const [acceptedFix, setAcceptedFix] = useState<{ accuracyM: number } | null>(null);
  const geocodedFor = useRef<string | null>(null);

  const addressLine = [address?.line1, address?.postalCode, address?.city, address?.province]
    .filter(Boolean)
    .join(", ");

  // Centre on the geocoded postal address the first time the dialog opens without a pin, so the
  // member is nudging a marker that is already outside roughly the right building rather than
  // panning across Spain.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setCoords(existing);
      return;
    }
    if (!addressLine || geocodedFor.current === addressLine) return;
    geocodedFor.current = addressLine;
    let cancelled = false;
    setCentring(true);
    forwardGeocode(addressLine)
      .then((found) => {
        if (cancelled) return;
        setCoords((current) => current ?? found ?? FALLBACK_CENTRE);
      })
      .finally(() => {
        if (!cancelled) setCentring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, existing, addressLine]);

  // Closing puts everything back. A refusal message left on screen from last time, or a fix from
  // a different room, would both be lies the second time the dialog opens.
  useEffect(() => {
    if (open) return;
    setGps({ kind: "idle" });
    setAcceptedFix(null);
    setSaving(false);
    setCoords(existing ?? null);
  }, [open, existing]);

  const useCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps({ kind: "unavailable", reason: "error" });
      return;
    }
    setGps({ kind: "asking" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracyM = position.coords.accuracy;
        if (!isAcceptableMemberGpsAccuracy(accuracyM)) {
          // The pin is NOT moved. Showing the member a marker we are about to refuse to save
          // would be the worst of both.
          setGps({ kind: "refused", accuracyM });
          return;
        }
        setCoords({ lat: round6(position.coords.latitude), lng: round6(position.coords.longitude) });
        setAcceptedFix({ accuracyM });
        setGps({ kind: "accepted", accuracyM });
      },
      (error) => {
        setGps({
          kind: "unavailable",
          reason: error.code === error.PERMISSION_DENIED ? "denied" : "error",
        });
      },
      // No cached fix and no watching: one fresh reading, then nothing.
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, []);

  const moveTo = useCallback((next: { lat: number; lng: number }) => {
    setCoords(next);
    // The member has taken over from the browser, so this is their pin now.
    setAcceptedFix(null);
  }, []);

  const nudge = useCallback(
    (direction: "north" | "south" | "east" | "west") => {
      setCoords((current) => {
        if (!current) return current;
        setAcceptedFix(null);
        return nudgeCoords(current, direction);
      });
    },
    [],
  );

  /*
    THE SOURCE AND THE ACCURACY COME FROM THE SAME PLACE, so they cannot disagree. Reading the
    accuracy out of the transient message state is what let a `member_gps` save go out with a
    null accuracy after a second, worse reading.
  */
  const source: HomeLocationSource =
    actor === "staff" ? "staff_pin" : acceptedFix ? "member_gps" : "member_pin";

  const save = async () => {
    if (!coords) return;
    setSaving(true);
    try {
      if (actor === "member") {
        /*
          THROUGH THE EDGE FUNCTION, not straight at the table. `members` does have a member
          UPDATE policy, so a direct write would succeed — but the provenance has to be stamped
          from a verified identity and the audit row has to be written, and members hold no
          INSERT on activity_logs. See member-self-service's own comment.
        */
        const { data, error } = await supabase.functions.invoke("member-self-service", {
          body: {
            action: "save_home_location",
            lat: coords.lat,
            lng: coords.lng,
            source,
            accuracy_m: source === "member_gps" ? acceptedFix?.accuracyM ?? null : null,
          },
        });
        if (error) throw await functionError(error, t("homeLocation.saveFailed", "We could not save your home location."));
        if (data?.error) throw new Error(String(data.error));
      } else {
        const { error } = await supabase
          .from("members")
          .update({
            home_lat: coords.lat,
            home_lng: coords.lng,
            home_location_accuracy_m: null,
            home_location_source: "staff_pin",
          })
          .eq("id", memberId);
        if (error) throw error;
        // Staff writes are attributed with a reason elsewhere in the record; this is the same
        // trail every other staff edit of a member leaves.
        await logMemberActivity("home_location_set", memberId, undefined, { source: "staff_pin" });
      }
      toast.success(t("homeLocation.saved", "Home location saved"));
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Error saving home location:", e);
      toast.error(e instanceof Error ? e.message : t("homeLocation.saveFailed", "We could not save your home location."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="set-home-location-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
            {actor === "member"
              ? t("homeLocation.dialog.title", "Set your home location")
              : t("homeLocation.dialog.titleStaff", "Set the member's home location")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {actor === "member"
              ? t(
                  "homeLocation.dialog.purpose",
                  "This is where we send help if your pendant cannot tell us where you are.",
                )
              : t(
                  "homeLocation.dialog.purposeStaff",
                  "Where an operator sends help when the pendant cannot say. Recorded as a correction by our team, not as the member's own confirmation.",
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            (a) the browser's own fix — THE MEMBER'S ONLY.

            An operator pressing this from the office would place the pin on the office, and the
            trigger would happily record it as a staff correction of the member's front door,
            because that is exactly what it would be. So the control does not exist for staff:
            they place the pin on the map, from what the member is telling them on the phone.
          */}
          {actor === "member" && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              // Large tap target: a 56px-high full-width button, in rem so the A/A control moves it.
              className="h-14 w-full justify-start gap-3 text-base"
              onClick={useCurrentLocation}
              disabled={gps.kind === "asking" || saving}
              data-testid="home-location-use-current"
            >
              {gps.kind === "asking" ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Crosshair className="h-5 w-5" aria-hidden="true" />
              )}
              {t("homeLocation.dialog.useCurrent", "Use my current location")}
            </Button>

            {gps.kind === "accepted" && (
              <p
                className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                data-testid="home-location-accuracy"
              >
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("homeLocation.dialog.accuracyOk", "Accurate to about {{metres}} metres.", {
                  metres: Math.round(gps.accuracyM),
                })}
              </p>
            )}

            {gps.kind === "refused" && (
              /* THE REFUSAL. Not a warning the member can click past — the pin has not moved. */
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="home-location-accuracy-refused"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("homeLocation.dialog.accuracyTooLow", {
                    defaultValue:
                      "Your phone could only place you to about {{metres}} metres, which is not close enough — please stand at your front door and try again.",
                    metres: Math.round(gps.accuracyM),
                    max: MEMBER_GPS_MAX_ACCURACY_M,
                  })}
                </span>
              </p>
            )}

            {gps.kind === "unavailable" && (
              <p role="alert" className="text-sm text-muted-foreground" data-testid="home-location-gps-unavailable">
                {gps.reason === "denied"
                  ? t(
                      "homeLocation.dialog.permissionDenied",
                      "Your device did not allow us to read your location. You can still place the pin on the map below.",
                    )
                  : t(
                      "homeLocation.dialog.gpsError",
                      "We could not read your location. You can still place the pin on the map below.",
                    )}
              </p>
            )}
          </div>
          )}

          {/* (b) the pin */}
          <div className="space-y-2">
            <p className="text-base">
              {actor === "member"
                ? t(
                    "homeLocation.dialog.dragHelp",
                    "Move the pin onto your front door. Tap the map where your door is, or use the arrows.",
                  )
                : t(
                    "homeLocation.dialog.dragHelpStaff",
                    "Move the pin onto the member's front door. Tap the map, or use the arrows.",
                  )}
            </p>

            {centring && !coords ? (
              <Skeleton className="h-64 w-full rounded-lg" data-testid="home-location-map-loading" />
            ) : coords ? (
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
                <HomeLocationMap
                  lat={coords.lat}
                  lng={coords.lng}
                  interactive
                  onMove={moveTo}
                  ariaLabel={t("homeLocation.dialog.mapLabel", "Map showing your home location pin")}
                />
              </Suspense>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t(
                  "homeLocation.dialog.noStartingPoint",
                  "We could not find your address on the map. Please use the button above while standing at your front door.",
                )}
              </p>
            )}

            {coords && (
              <>
                {/*
                  KEYBOARD AND NO-DRAG REACH. Four buttons, each 48px, each labelled — the same
                  move a drag makes, for a hand that cannot drag and for anyone on a keyboard.
                */}
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={t("homeLocation.dialog.nudgeGroup", "Move the pin in small steps")}
                  data-testid="home-location-nudge"
                >
                  {(["north", "south", "east", "west"] as const).map((direction) => (
                    <Button
                      key={direction}
                      type="button"
                      variant="outline"
                      size="lg"
                      className="h-12 min-w-24"
                      onClick={() => nudge(direction)}
                      data-testid={`home-location-nudge-${direction}`}
                    >
                      {t(`homeLocation.dialog.nudge.${direction}`, {
                        defaultValue: direction,
                        metres: NUDGE_METRES,
                      })}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="home-location-coords">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 text-base"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            className="h-12 text-base"
            onClick={save}
            disabled={!coords || saving}
            data-testid="home-location-save"
          >
            {saving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-5 w-5" aria-hidden="true" />
            )}
            {actor === "member"
              ? t("homeLocation.dialog.save", "Save my home location")
              : t("homeLocation.dialog.saveStaff", "Save this location")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
