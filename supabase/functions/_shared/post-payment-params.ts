import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * WHAT A SUCCESSFUL PAYMENT IS HANDED — the shape, with none of the machinery.
 *
 * Lifted out of `post-payment.ts` so the webhook's handlers can name the function they call
 * without IMPORTING it. That module reaches `email.ts` and `npm:nodemailer`, a specifier Deno
 * resolves and no test runner can; importing it — even for a type — drags the whole chain into
 * the TypeScript program and the test bundle, and the handlers were extracted precisely so they
 * could be loaded by a test.
 *
 * `post-payment.ts` imports this too, so the two cannot drift: a field added here is a field its
 * implementation must accept, and a field added only there is a compile error at its own
 * signature.
 */
export interface PostPaymentParams {
  orderId: string;
  paymentId: string;
  memberId: string;
  subscriptionId?: string;
  partnerMemberId?: string;
  partnerSubscriptionId?: string;
  amountPaid: number;
  gatewayPaymentId: string;
  gateway: "stripe" | "mollie";
}

/**
 * The call the webhook makes when Stripe says the money arrived.
 *
 * Deliberately returns `Promise<unknown>`: the handler does not read the result, and a narrower
 * return type here would be a second claim about `handleSuccessfulPayment` that nothing checks.
 */
export type PostPayment = (
  supabase: SupabaseClient,
  params: PostPaymentParams,
) => Promise<unknown>;
