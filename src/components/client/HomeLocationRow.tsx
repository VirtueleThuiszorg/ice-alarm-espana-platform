import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ExternalLink, MapPin, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetHomeLocationDialog } from "@/components/maps/SetHomeLocationDialog";
import { isHomeLocationSource } from "@/lib/homeLocation";
import type { MemberProfile } from "@/hooks/useMemberProfile";

/**
 * THE "HOME LOCATION" ROW on a member's own account page.
 *
 * Two states and no third:
 *   not set → one large button, and one sentence saying what it is for. No form, no map, no
 *             explanation of GPS. A member who does not want to think about it can ignore it —
 *             this is RECOMMENDED, not required, and the record does not count as incomplete
 *             without it (see memberRequiredFields.ts).
 *   set     → a small still map of the pin, when it was set, and three controls: Open in Maps,
 *             Change, and nothing else.
 *
 * WHY THE DATE IS ON SCREEN and not in a tooltip. A pin set four years ago is a different fact
 * from one set last week, and the member is the only person who knows whether they have moved.
 * The same date is what the SOS card shows an operator, so the member sees exactly what the
 * operator sees.
 *
 * The preview map is lazy-loaded: Leaflet is not worth 45 KB on the first paint of a page most
 * members open to check their phone number.
 */

const HomeLocationMap = lazy(() => import("@/components/maps/HomeLocationMap"));

export function HomeLocationRow({
  profile,
  onSaved,
}: {
  profile: MemberProfile;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const lat = typeof profile.home_lat === "number" ? profile.home_lat : null;
  const lng = typeof profile.home_lng === "number" ? profile.home_lng : null;
  const hasPin = lat !== null && lng !== null && isHomeLocationSource(profile.home_location_source);
  const setAt = profile.home_location_set_at ? new Date(profile.home_location_set_at) : null;

  return (
    <div className="space-y-3" data-testid="home-location-row">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("homeLocation.row.title", "Home location")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(
              "homeLocation.row.purpose",
              "Where we send help if your pendant cannot tell us where you are.",
            )}
          </p>
        </div>
      </div>

      {hasPin ? (
        <div className="space-y-3">
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-lg" />}>
            <HomeLocationMap
              lat={lat as number}
              lng={lng as number}
              interactive={false}
              heightClass="h-40"
              ariaLabel={t("homeLocation.row.mapLabel", "Map showing your saved home location")}
            />
          </Suspense>

          <p className="text-sm text-muted-foreground" data-testid="home-location-set-at">
            {setAt
              ? t("homeLocation.row.setOn", "Set on {{date}}", {
                  date: format(setAt, "d MMMM yyyy"),
                })
              : t("homeLocation.row.setDateUnknown", "We do not have a date for this pin.")}
          </p>

          <div className="flex flex-wrap gap-2">
            {/* The Google links stay exactly as the rest of the app does them. */}
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              onClick={() =>
                window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank", "noopener,noreferrer")
              }
              data-testid="home-location-open-maps"
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("homeLocation.row.openInMaps", "Open in Maps")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 text-base"
              onClick={() => setDialogOpen(true)}
              data-testid="home-location-change"
            >
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("homeLocation.row.change", "Change")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          // Full width and 56px high: the primary action of an empty state, on a page a member
          // may be reading on a phone with one hand.
          className="h-14 w-full text-base"
          onClick={() => setDialogOpen(true)}
          data-testid="home-location-set"
        >
          <MapPin className="mr-2 h-5 w-5" aria-hidden="true" />
          {t("homeLocation.row.setButton", "Set my home location")}
        </Button>
      )}

      <SetHomeLocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        memberId={profile.id}
        actor="member"
        existing={hasPin ? { lat: lat as number, lng: lng as number } : null}
        address={{
          line1: profile.address_line_1,
          city: profile.city,
          province: profile.province,
          postalCode: profile.postal_code,
        }}
        onSaved={onSaved}
      />
    </div>
  );
}
