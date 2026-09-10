import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Confirm a member the CRM import left `pending_review` as a real, monitored, legacy-billed
 * member (D-19 item 2).
 *
 * THE DECISION IS THE DATABASE'S, NOT THIS HOOK'S. `confirm_legacy_member()` checks the role,
 * refuses anything that is not `pending_review`, writes the audit row and raises the bell. This
 * hook sends the id and shows what came back. There is deliberately no client-side "am I allowed"
 * check standing in for the real one — a screen that decides permission for itself is a screen
 * that disagrees with the database on the day the roles change.
 *
 * WHY NOT AN `UPDATE`: a plain `UPDATE ... SET status = 'active'` is REFUSED by
 * `guard_member_status_self_write`, for an admin as much as for an operator. That is the point of
 * the function — the act is recorded with somebody's name against it, and there is no route to
 * `active` that is not either a payment or a named decision.
 */
export interface ConfirmLegacyResult {
  member_id: string;
  status: string;
  billing_source: string;
}

export function useConfirmLegacyMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, reason }: { memberId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("confirm_legacy_member", {
        _member_id: memberId,
        // Trimmed to null rather than sent as "": an empty string in an audit column reads as a
        // reason that was given and was blank, which is not what happened.
        _reason: reason.trim() || undefined,
      });
      /*
       * Thrown as a REAL Error, carrying the database's own sentence.
       *
       * `supabase.rpc` returns a PostgrestError — a plain object, not an Error instance. Throwing
       * it directly means every `e instanceof Error` at the call site is false, and the screen
       * falls back to a generic "could not confirm". That is the difference between an operator
       * reading "admin or supervisor only" and going to find a supervisor, and reading "could
       * not confirm" and pressing the button again. Caught by a test, not by reading it.
       */
      if (error) {
        const raised = new Error(error.message || "confirm_legacy_member failed");
        // Kept so a caller can still reach the code and the hint if it wants them.
        (raised as Error & { cause?: unknown }).cause = error;
        throw raised;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as ConfirmLegacyResult | null;
    },
    onSuccess: (_row, { memberId }) => {
      // The roster, the member's own record and the dashboard counts all change: they were
      // reading a member who was not monitored and now are reading one who is.
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["member-detail", memberId] });
    },
  });
}
