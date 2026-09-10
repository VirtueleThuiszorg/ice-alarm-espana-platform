import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { ShiftType } from "@/config/shifts";
import i18n from "@/i18n";

/**
 * SWAPS AND COVER — the two questions an operator could not ask before.
 *
 * `staff_shift_swaps` has had a table, six statuses and its RLS since the rota landed
 * (20260909120000) and there was no way to reach any of it: an operator wanting Thursday off
 * asked Mary, and Mary moved the shift by hand. This is the flow the rota brief's §3 asked for.
 *
 * FOUR THINGS THIS FILE DELIBERATELY DOES NOT DO, each because something else already does it:
 *
 *   THE MOVE. Approving does not update `staff_shifts` from here. It calls `apply_shift_swap`,
 *   which moves both shifts, writes the cover rows and the audit row in ONE transaction. Two
 *   client-side updates would leave a half-applied swap on a life-safety rota — two people on
 *   one slot and nobody on another, with `staff_on_shift_now` agreeing.
 *
 *   THE BELL. No `notifyUsers` call anywhere below. `bell_on_shift_swap` (20260910130000) writes
 *   the targeted `notification_log` rows for every transition, and `emit_shift_swap_to_router`
 *   (20260910130100) queues the push. A bell written here as well would double every swap in
 *   everybody's list — and would be lost when a tab closes mid-request, which is the failure the
 *   trigger exists to remove. `useShiftCoverMutations` notifies from the client because it
 *   predates both triggers; do not copy that part of it here.
 *
 *   THE ROLE CHECK. `approveSwap` does not test the caller's role. `apply_shift_swap` refuses
 *   anybody who is not an admin or a `call_centre_supervisor`, and the RLS policy refuses the
 *   direct UPDATE. A check here would be a third copy of the rule and the only one an operator
 *   could edit.
 *
 *   VALIDATING WHOSE SHIFT IT IS. The INSERT policy already requires `requested_by` to be you
 *   AND `requested_shift_id` to be a shift of yours. The UI offers only your own shifts, so the
 *   two agree — but the database is what enforces it.
 */

export const SWAP_STATUSES = [
  "requested",
  "accepted",
  "declined",
  "approved",
  "applied",
  "cancelled",
] as const;

export type SwapStatus = (typeof SWAP_STATUSES)[number];

/** The statuses that are still going somewhere. Anything else is history. */
export const OPEN_SWAP_STATUSES: readonly SwapStatus[] = ["requested", "accepted"];

interface SwapShift {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  staff_id: string;
}

interface SwapPerson {
  first_name: string;
  last_name: string;
}

export interface ShiftSwap {
  id: string;
  requested_shift_id: string;
  offered_shift_id: string | null;
  requested_by: string;
  counterparty_id: string;
  status: SwapStatus;
  /** true = a SWAP was asked for (a shift back); false = cover. See the column's comment. */
  wants_exchange: boolean;
  reason: string | null;
  accepted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  requested_shift?: SwapShift | null;
  offered_shift?: SwapShift | null;
  requester?: SwapPerson | null;
  counterparty?: SwapPerson | null;
}

/**
 * Every embed is hinted by COLUMN, not by relation name, and it has to be.
 *
 * `staff_shift_swaps` points at `staff_shifts` twice (requested and offered) and at `staff` three
 * times (requester, counterparty, approver). PostgREST cannot pick one on its own and answers a
 * bare `staff_shifts(...)` with an ambiguity error, so each embed names the column it travels
 * along. Same reason `useStaffShifts` casts through `unknown`: the generated types cannot infer a
 * disambiguated embed either.
 */
const SWAP_SELECT = `
  *,
  requested_shift:requested_shift_id(id, shift_date, shift_type, start_time, end_time, staff_id),
  offered_shift:offered_shift_id(id, shift_date, shift_type, start_time, end_time, staff_id),
  requester:requested_by(first_name, last_name),
  counterparty:counterparty_id(first_name, last_name)
`;

/**
 * Swaps this person is a party to — either side, every status.
 *
 * The `or` filter is belt and braces: "Staff view own swaps" already restricts the rows to the
 * two people involved. It is here so the query says out loud what it wants, and so a supervisor
 * — who CAN read every row — sees her own requests on My shifts rather than the whole queue.
 */
export function useMySwaps(staffId: string | undefined) {
  return useQuery<ShiftSwap[]>({
    queryKey: ["my-swaps", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shift_swaps")
        .select(SWAP_SELECT)
        .or(`requested_by.eq.${staffId},counterparty_id.eq.${staffId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ShiftSwap[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.SHORT,
  });
}

/**
 * The approval queue: accepted by the counterparty, waiting for a supervisor.
 *
 * `enabled` is the caller's role gate. RLS returns nothing to an operator here anyway, but a
 * query that always runs would put an empty "Requests to approve" section on their screen, which
 * reads as "there are none" rather than "this is not yours".
 */
export function useSwapsAwaitingApproval(enabled = true) {
  return useQuery<ShiftSwap[]>({
    queryKey: ["swaps-awaiting-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shift_swaps")
        .select(SWAP_SELECT)
        .eq("status", "accepted")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as ShiftSwap[];
    },
    enabled,
    staleTime: STALE_TIMES.SHORT,
  });
}

export interface RequestSwapInput {
  /** A shift of YOUR OWN that you want somebody else to take. */
  requested_shift_id: string;
  /**
   * The counterparty's shift that comes back in exchange — and it is ALWAYS null here.
   *
   * The requester cannot see another operator's shifts (RLS), so they cannot name one. It is
   * filled in by the counterparty when they accept. `wants_exchange` is what carries the ask
   * that far, which is the whole reason the column exists.
   */
  offered_shift_id?: string | null;
  requested_by: string;
  counterparty_id: string;
  /** true = "swap, give me one of yours back"; false = "just cover it". */
  wants_exchange?: boolean;
  reason?: string | null;
}

export function useShiftSwapMutations() {
  const queryClient = useQueryClient();

  /** Everything a swap can touch. Kept in one place so no mutation forgets half of it. */
  const invalidateAll = () => {
    for (const key of [
      ["my-swaps"],
      ["swaps-awaiting-approval"],
      ["staff-shifts"],
      ["my-shifts"],
      ["my-shift-range"],
      ["my-accepted-covers"],
      ["my-pending-covers"],
      ["all-covers"],
      ["notifications"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const requestSwap = useMutation({
    mutationFn: async (input: RequestSwapInput) => {
      const { data, error } = await supabase
        .from("staff_shift_swaps")
        .insert({
          requested_shift_id: input.requested_shift_id,
          offered_shift_id: input.offered_shift_id ?? null,
          requested_by: input.requested_by,
          counterparty_id: input.counterparty_id,
          wants_exchange: input.wants_exchange ?? false,
          reason: input.reason ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(i18n.t("swaps.toasts.requestSent", "Request sent"));
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("swaps.toasts.requestFailed", "Could not send that request"));
    },
  });

  /**
   * The counterparty's answer. `accepted_at` is stamped here rather than by a trigger because
   * `apply_shift_swap` copies it onto the cover row's `responded_at` — the answer's time is when
   * they said yes, not when a supervisor got round to it.
   */
  const respondToSwap = useMutation({
    mutationFn: async ({
      id,
      status,
      offered_shift_id,
    }: {
      id: string;
      status: "accepted" | "declined";
      /**
       * One of YOUR OWN shifts, given back in exchange. Only meaningful on 'accepted', and only
       * you can name it: the person who asked cannot read your rota. Left out, an accept is
       * plain cover — which stays valid even where a swap was asked for ("I'll just take it").
       */
      offered_shift_id?: string | null;
    }) => {
      const { error } = await supabase
        .from("staff_shift_swaps")
        .update({
          status,
          accepted_at: status === "accepted" ? new Date().toISOString() : null,
          ...(status === "accepted" && offered_shift_id
            ? { offered_shift_id }
            : {}),
        })
        .eq("id", id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: ({ status }) => {
      invalidateAll();
      toast.success(
        status === "accepted"
          ? i18n.t("swaps.toasts.accepted", "Accepted — a supervisor has to approve it")
          : i18n.t("swaps.toasts.declined", "Declined"),
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("swaps.toasts.responseFailed", "Could not save that"));
    },
  });

  const cancelSwap = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_shift_swaps")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(i18n.t("swaps.toasts.cancelled", "Withdrawn"));
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("swaps.toasts.cancelFailed", "Could not withdraw it"));
    },
  });

  /**
   * Approve it — which means MOVE THE ROTA, in the database, in one transaction.
   *
   * The toast reports what the function said it did rather than "approved": a supervisor
   * double-clicking gets "nothing moved" instead of a second success message for a move that
   * did not happen twice.
   */
  const approveSwap = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("apply_shift_swap", { p_swap_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { moved_shifts: number; covers_written: number; outcome: string } | null;
    },
    onSuccess: (result) => {
      invalidateAll();
      if (result && result.moved_shifts === 0) {
        toast.info(i18n.t("swaps.toasts.alreadyApplied", "Already approved — nothing moved"));
      } else {
        toast.success(
          i18n.t("swaps.toasts.approved", "Approved — {{count}} shift(s) moved", {
            count: result?.moved_shifts ?? 0,
          }),
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("swaps.toasts.approveFailed", "Could not approve it"));
    },
  });

  return { requestSwap, respondToSwap, cancelSwap, approveSwap };
}

/** Whose turn it is. Drives which buttons a row offers, and is the same rule as the RLS. */
export function swapAwaits(swap: ShiftSwap, staffId: string | undefined): "them" | "you" | "supervisor" | "done" {
  if (swap.status === "requested") {
    return swap.counterparty_id === staffId ? "you" : "them";
  }
  if (swap.status === "accepted" || swap.status === "approved") return "supervisor";
  return "done";
}
