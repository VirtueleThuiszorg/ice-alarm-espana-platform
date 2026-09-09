import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";

/**
 * Ask the server for a Stripe payment link for a member — item 4.
 *
 * WHAT THE BROWSER SENDS: a plan, a billing frequency, a pendant count, and who pays. NO
 * amounts, no price ids, no total, no redirect URLs. Everything with a number in it is derived
 * server-side from `pricing_plans` / `pricing_settings` / `stripe_prices`, which is the F7
 * defect (`create-checkout` charging `item.amount` from the request body) not being rebuilt.
 *
 * WHAT COMES BACK: the URL, always — plus a per-channel delivery report. The link is shown on
 * screen whatever happened to the SMS and the email, because a staff member who can read it out
 * over the phone is never blocked by a channel switch being off.
 *
 * NOTHING HERE ACTIVATES ANYBODY. The rows the server creates are all pending; the member
 * becomes active when `stripe-webhook` sees the payment (golden rule 4).
 */

export type DeliveryOutcome =
  | "sent"
  | "skipped_channel_off"
  | "skipped_not_configured"
  | "skipped_no_address"
  | "failed";

export interface DeliveryReport {
  channel: "sms" | "email";
  to: string | null;
  outcome: DeliveryOutcome;
  detail?: string;
}

export interface SendPaymentLinkResult {
  url: string;
  sessionId: string;
  expiresAt: number | null;
  orderNumber: string;
  orderId: string;
  paymentId: string;
  subscriptionId: string;
  payerId: string | null;
  totalEuros: number;
  planLabel: string;
  delivery: DeliveryReport[];
  lines: Array<{ priceKey: string; quantity: number; unitAmountCents: number; source: string }>;
}

export interface SendPaymentLinkInput {
  memberId: string;
  membershipType: "single" | "couple";
  billingFrequency: "monthly" | "annual";
  pendantCount: number;
  payer:
    | { mode: "member" }
    | { mode: "other"; fullName: string; email: string; phone?: string; relationship?: string };
}

export function useSendPaymentLink() {
  const queryClient = useQueryClient();

  return useMutation<SendPaymentLinkResult, Error, SendPaymentLinkInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke("send-payment-link", {
        body: input,
      });

      // `invoke` hides the function's own message behind "non-2xx status code", and this
      // function's messages are the useful part — "sync prices to Stripe first", "this member
      // already has a live subscription". functionError reads the body.
      if (error) throw await functionError(error, "The payment link could not be created");
      if (!data?.url) throw new Error(data?.error ?? "The server returned no payment link");
      return data as SendPaymentLinkResult;
    },
    onSuccess: (_result, input) => {
      // The tab shows the pending subscription and the order that now exists.
      queryClient.invalidateQueries({ queryKey: ["member-subscription", input.memberId] });
      queryClient.invalidateQueries({ queryKey: ["member-payments", input.memberId] });
      queryClient.invalidateQueries({ queryKey: ["member-orders", input.memberId] });
    },
  });
}

/** Did anything actually reach anybody? Used for the wording, which must not overclaim. */
export function anyChannelSent(delivery: DeliveryReport[]): boolean {
  return delivery.some((d) => d.outcome === "sent");
}
