import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

/**
 * Record when Santander takes a legacy member's money.
 *
 * The import derives this from Karma where Karma says it; this is the other half — the office
 * reading it off a bank statement or off the phone, for the ones it could not. Without a date
 * the billing-migration runner cannot time a switch link, so these members simply never get
 * moved onto Stripe.
 *
 * TWO STEPS, IN THIS ORDER, and the order matters the same way it does in `useMemberAction`:
 * the write first, the audit row second, and a failed audit row is SAID OUT LOUD rather than
 * swallowed. `logActivity` in `src/lib/auditLog.ts` deliberately swallows — it is a
 * best-effort breadcrumb for page views and the like — and a billing date is not that. Somebody
 * will ask who put the 28th on this record, and "the log write failed quietly" is not an answer.
 *
 * WHAT IT DOES NOT DO: it does not touch `status`, `billing_source`, or any subscription.
 * Golden rule 4 is untouched — knowing when a member pays Santander is not a claim that they
 * have paid US.
 */
export interface LegacyBillingDateParams {
  memberId: string;
  /** 1–31, or null to put the member back in the "needs a billing date" queue. */
  day: number | null;
  /** ISO date, or null. Null whenever the day is null. */
  nextRenewal: string | null;
  /** What the record said before, so the audit row is a change and not just an assertion. */
  previous: { day: number | null; nextRenewal: string | null };
}

export function useLegacyBillingDate() {
  const queryClient = useQueryClient();
  const { data: staff } = useCurrentStaff();

  return useMutation({
    mutationFn: async ({ memberId, day, nextRenewal, previous }: LegacyBillingDateParams) => {
      if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
        // The CHECK constraint refuses this too; refusing here means the member's record is not
        // touched at all and the staff member gets a sentence rather than a Postgres error.
        throw new Error("The billing day must be a day of the month, between 1 and 31.");
      }
      if (day !== null && !nextRenewal) {
        throw new Error("A next debit date is needed alongside the billing day.");
      }

      const { error } = await supabase
        .from("members")
        .update({
          legacy_billing_day: day,
          legacy_next_renewal: day === null ? null : nextRenewal,
        })
        .eq("id", memberId);

      // A real Error, not the PostgrestError plain object: `e instanceof Error` is false for
      // that, and the dialog then shows a generic message instead of what Postgres said.
      if (error) throw new Error(error.message || "The billing date could not be saved.");

      const { error: logError } = await supabase.from("activity_logs").insert({
        staff_id: staff?.id ?? null,
        action: "update",
        entity_type: "member",
        entity_id: memberId,
        old_values: {
          legacy_billing_day: previous.day,
          legacy_next_renewal: previous.nextRenewal,
        },
        new_values: {
          legacy_billing_day: day,
          legacy_next_renewal: day === null ? null : nextRenewal,
        },
      });

      return { logged: !logError, logError: logError?.message ?? null };
    },
    onSuccess: (_result, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });
}
