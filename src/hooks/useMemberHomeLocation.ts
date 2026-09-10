import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * THE MEMBER'S CONFIRMED FRONT DOOR, for the operator surfaces.
 *
 * ONE reader, used by both SOS cards. `SOSSituationPanel` already fetched `members` for the
 * postal-address fallback and `AlertDetailPanel` receives a hand-built `alert` object; without
 * this hook the two would each grow their own copy of the same six-column read, and the day the
 * column set changes one of them would keep working.
 *
 * IT READS AS THE SIGNED-IN OPERATOR. No service role, no edge function: "Staff can view all
 * members" is what makes this legal, and `scripts/rls/isolation.sql` proves that a member, a
 * partner and a signed-in stranger get nothing from the same query.
 *
 * `staleTime` is deliberately long. A home pin changes when somebody moves house, not during an
 * alert, and an operator refetching it every thirty seconds mid-SOS is network they do not have
 * to spare.
 */
export interface MemberHomeLocationRow {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  source: string | null;
  setAt: string | null;
}

export function useMemberHomeLocation(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["member-home-location", memberId],
    queryFn: async (): Promise<MemberHomeLocationRow | null> => {
      if (!memberId) return null;
      const { data, error } = await supabase
        .from("members")
        .select("home_lat, home_lng, home_location_accuracy_m, home_location_source, home_location_set_at")
        .eq("id", memberId)
        .maybeSingle();
      /*
        A FAILED READ IS NOT "NO PIN". Returning null on error would tell the operator this
        member has never set a home location, which is a different and more dangerous statement
        than "we could not load it" — so it throws and the caller renders nothing rather than an
        empty state that reads as a fact. G2: never silent.
      */
      if (error) throw error;
      if (!data) return null;
      return {
        lat: data.home_lat,
        lng: data.home_lng,
        accuracyM: data.home_location_accuracy_m,
        source: data.home_location_source,
        setAt: data.home_location_set_at,
      };
    },
    enabled: !!memberId,
    staleTime: 5 * 60 * 1000,
  });
}
