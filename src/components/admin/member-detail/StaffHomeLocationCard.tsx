import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetHomeLocationDialog } from "@/components/maps/SetHomeLocationDialog";
import { useMemberHomeLocation } from "@/hooks/useMemberHomeLocation";
import { CONFIRMED_HOME_SOURCES, isHomeLocationSource } from "@/lib/homeLocation";

/**
 * STAFF SET OR CORRECT THE PIN, from the member record.
 *
 * WHY STAFF NEED THIS AT ALL, when the member has the dialog on their own dashboard: most of
 * the 431 imported members will never open that dashboard. The pin gets set on the phone —
 * "which side of the gate is your door on?" — during a courtesy call or a pendant test, and if
 * there is no way to do it from the record it does not happen.
 *
 * IT IS RECORDED AS A STAFF CORRECTION, NOT A MEMBER CONFIRMATION. `staff_pin`, stamped with
 * the operator's own id by the database trigger, and the SOS card labels it "set by our team"
 * rather than "set by member" — because an operator reading the card has to know whether the
 * person who lives there put the pin where it is. This component cannot lie about that even if
 * it tried: `guard_member_home_location()` refuses a member source from a staff write.
 *
 * WHAT IT SHOWS BEFORE ANYTHING IS SET: the provenance of what is there. A pin that came off the
 * CRM import is a guess and says so, which is the difference between "we have a location" and
 * "somebody has confirmed this is the door".
 */
export function StaffHomeLocationCard({
  memberId,
  address,
  onUpdate,
}: {
  memberId: string;
  /**
   * The member's typed address, used ONLY to centre the picker the first time. Never saved from
   * here — a geocoded rooftop in rural Almería is routinely a hundred metres from the gate,
   * which is the problem the pin exists to fix.
   */
  address?: {
    line1?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  } | null;
  onUpdate?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: home, isLoading } = useMemberHomeLocation(memberId);

  const hasPin =
    !!home && typeof home.lat === "number" && typeof home.lng === "number"
      && isHomeLocationSource(home.source);
  const confirmed = hasPin && (CONFIRMED_HOME_SOURCES as readonly string[]).includes(home.source as string);
  const setAt = home?.setAt ? new Date(home.setAt) : null;

  return (
    <Card data-testid="staff-home-location-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Home location
        </CardTitle>
        <CardDescription>
          Where an operator sends help when the pendant cannot say where the member is.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasPin ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={confirmed ? "secondary" : "outline"} data-testid="staff-home-location-source">
                {home?.source === "member_pin" || home?.source === "member_gps"
                  ? "Confirmed by the member"
                  : home?.source === "staff_pin"
                    ? "Set by our team"
                    : home?.source === "geocoded"
                      ? "From the address — not confirmed"
                      : "From the CRM import — not confirmed"}
              </Badge>
              {setAt && (
                <span className="text-sm text-muted-foreground" data-testid="staff-home-location-date">
                  {format(setAt, "d MMM yyyy")}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground" data-testid="staff-home-location-coords">
              {(home?.lat as number).toFixed(6)}, {(home?.lng as number).toFixed(6)}
              {typeof home?.accuracyM === "number" ? ` · ±${Math.round(home.accuracyM)} m` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="staff-home-location-none">
            No pin on this record. The SOS card will fall back to the postal address.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {hasPin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps?q=${home?.lat},${home?.lng}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              data-testid="staff-home-location-map"
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Open in Maps
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="staff-home-location-edit"
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            {hasPin ? "Correct the pin" : "Set the pin"}
          </Button>
        </div>
      </CardContent>

      <SetHomeLocationDialog
        open={open}
        onOpenChange={setOpen}
        memberId={memberId}
        actor="staff"
        existing={hasPin ? { lat: home?.lat as number, lng: home?.lng as number } : null}
        address={address}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["member-home-location", memberId] });
          onUpdate?.();
        }}
      />
    </Card>
  );
}
