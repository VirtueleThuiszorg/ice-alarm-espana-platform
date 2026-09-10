import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

/**
 * The people the rota is made of: active call-centre staff, operators and supervisors.
 *
 * ONE QUERY, TWO SCREENS. `RotaPage` had this inline and the swap picker needs the same list —
 * "who can I ask to take this shift?" is the same question as "who has a row on the grid?". A
 * second copy would drift the moment one of them started filtering differently, and the
 * `active-cc-staff` key means both screens share the cached answer rather than each fetching it.
 *
 * `role` is included because the swap picker shows it: asking the supervisor to cover a night is
 * a different thing from asking another operator, and the person choosing should be able to see
 * which they are doing.
 *
 * Readable by any staff member — `staff` grants SELECT to `is_staff()` — which is what makes the
 * picker possible at all. Their SHIFTS are not: `call_centre` reads its own shift rows only,
 * which is why a swap request cannot name the shift it wants back (see `wants_exchange`).
 */

export interface RotaStaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

export function useRotaStaff() {
  return useQuery<RotaStaffMember[]>({
    queryKey: ["active-cc-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role")
        .in("role", ["call_centre", "call_centre_supervisor"])
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return (data || []) as RotaStaffMember[];
    },
    staleTime: STALE_TIMES.LONG,
  });
}

/** Everybody on the rota except one person — the list you can ask to take your shift. */
export function colleaguesOf(
  staff: RotaStaffMember[],
  staffId: string | undefined,
): RotaStaffMember[] {
  return staff.filter((s) => s.id !== staffId);
}

export function staffName(person: { first_name: string; last_name: string } | null | undefined): string {
  return person ? `${person.first_name} ${person.last_name}`.trim() : "—";
}
