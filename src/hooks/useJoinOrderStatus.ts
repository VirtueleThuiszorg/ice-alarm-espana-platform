import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Poll `join-order-status` until the webhook has actually processed the payment.
 *
 * WHY THE SCREEN CANNOT JUST ASSERT SUCCESS. `/join?success=true` is reached the instant Stripe
 * redirects, which is BEFORE `stripe-webhook` has run. The confirmation screen therefore said
 * "registration complete" on nothing but a query parameter — and went on saying it if the
 * webhook never ran at all. It also told the member to "add your contacts once you sign in"
 * while the second-stage link that collects them existed nowhere they could see it
 * (ONBOARDING_SPLIT.md §6-A, REVIEW_JOIN_PATH.md F6).
 *
 * IT GIVES UP, ON PURPOSE. A screen that polls for ever is a screen that shows a spinner to
 * somebody who has paid and needs to be told what to do. After `TIMEOUT_MS` the status becomes
 * `timeout`, which the screen renders as the phone route — a person who can take the details
 * over the phone is a better answer than an animation.
 */

export interface SecondStageInvite {
  firstName: string | null;
  link: string;
  expiresAt: string;
}

export type JoinOrderStatus = "idle" | "polling" | "confirmed" | "failed" | "timeout" | "unknown";

export interface JoinOrderState {
  status: JoinOrderStatus;
  orderNumber: string | null;
  /** One per member — a couple gets two, labelled by name (option B). */
  secondStage: SecondStageInvite[];
  emergencyPhone: string | null;
}

/** Every 2s. Fast enough to feel immediate, slow enough not to hammer the function. */
const INTERVAL_MS = 2_000;
/** 90s. Stripe's webhook is normally sub-second; this is the "something is wrong" boundary. */
const TIMEOUT_MS = 90_000;

const EMPTY: JoinOrderState = {
  status: "idle",
  orderNumber: null,
  secondStage: [],
  emergencyPhone: null,
};

export function useJoinOrderStatus(sessionId: string | undefined): JoinOrderState {
  const [state, setState] = useState<JoinOrderState>(EMPTY);
  // Held in a ref so the effect does not re-run when the state it sets changes.
  const stopped = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      // No session id means an older link, or a member who came back to /join later. The
      // screen falls back to the phone route rather than claiming anything.
      setState({ ...EMPTY, status: "unknown" });
      return;
    }

    stopped.current = false;
    setState({ ...EMPTY, status: "polling" });

    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (stopped.current) return;

      try {
        const { data, error } = await supabase.functions.invoke("join-order-status", {
          body: { sessionId },
        });

        if (stopped.current) return;

        if (!error && data?.confirmed) {
          setState({
            status: "confirmed",
            orderNumber: data.orderNumber ?? null,
            secondStage: Array.isArray(data.secondStage) ? data.secondStage : [],
            emergencyPhone: data.emergencyPhone ?? null,
          });
          return;
        }

        if (!error && data?.status === "failed") {
          setState({
            status: "failed",
            orderNumber: data.orderNumber ?? null,
            secondStage: [],
            emergencyPhone: data.emergencyPhone ?? null,
          });
          return;
        }

        // An error is treated exactly like "not yet": the member has paid, and a transient
        // failure of this endpoint is not something to report to them as a problem with it.
        if (Date.now() - startedAt >= TIMEOUT_MS) {
          setState((prev) => ({ ...prev, status: "timeout" }));
          return;
        }

        timer = setTimeout(poll, INTERVAL_MS);
      } catch {
        if (stopped.current) return;
        if (Date.now() - startedAt >= TIMEOUT_MS) {
          setState((prev) => ({ ...prev, status: "timeout" }));
          return;
        }
        timer = setTimeout(poll, INTERVAL_MS);
      }
    };

    poll();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  return state;
}
