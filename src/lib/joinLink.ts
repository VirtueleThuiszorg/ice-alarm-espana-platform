// Carrying a pricing selection into the join wizard.
//
// The pricing surfaces (/pricing, the home #pricing section, /pendant#pricing) and wizard
// step 1 used to ask the same question, so a member picked their membership twice. The
// pricing CTAs now deep-link the choice (/join?plan=couple&billing=annual) and the wizard
// starts pre-selected, skipping step 1 when the plan arrived unambiguously.
//
// NOTE: this only pre-fills the wizard. It is not part of the charge path — the amount is
// still recomputed server-side in submit-registration from DB pricing plus the submitted
// options, so a hand-edited URL can change what the member SEES pre-selected, never what
// they are charged for it.

import type { BillingFrequency, MembershipType } from "@/config/pricing";

export interface JoinSelection {
  plan?: MembershipType;
  billing?: BillingFrequency;
}

const PLANS: readonly string[] = ["single", "couple"];
const BILLING: readonly string[] = ["monthly", "annual"];

/** Build the /join deep link for a pricing card selection. */
export function buildJoinPath(selection: JoinSelection = {}): string {
  const params = new URLSearchParams();
  if (selection.plan) params.set("plan", selection.plan);
  if (selection.billing) params.set("billing", selection.billing);
  const query = params.toString();
  return query ? `/join?${query}` : "/join";
}

/** Read ?plan=&billing=. Anything unrecognised is dropped rather than trusted. */
export function parseJoinSelection(params: Pick<URLSearchParams, "get">): JoinSelection {
  const plan = params.get("plan");
  const billing = params.get("billing");
  return {
    plan: plan && PLANS.includes(plan) ? (plan as MembershipType) : undefined,
    billing: billing && BILLING.includes(billing) ? (billing as BillingFrequency) : undefined,
  };
}

/**
 * Step 1 asks for the membership type only, so it is redundant exactly when a valid plan
 * came in on the URL. A billing period alone is not enough — it is chosen on the review
 * step, not step 1.
 */
export function canSkipPlanStep(selection: JoinSelection): boolean {
  return !!selection.plan;
}

export interface JoinEntry {
  /** What to pre-select. Empty when the wizard is resuming rather than starting. */
  selection: JoinSelection;
  planStepSkipped: boolean;
  initialStep: number;
}

/**
 * The wizard's mount-time entry state, derived from the URL alone. Kept out of the component
 * so the skip/pre-select rules are unit-testable.
 */
export function resolveJoinEntry(params: Pick<URLSearchParams, "get" | "has">): JoinEntry {
  // Coming back from the payment gateway means restoring the saved draft — the deep link
  // must not overwrite what the member already filled in and paid for.
  if (params.has("success") || params.has("cancelled")) {
    return { selection: {}, planStepSkipped: false, initialStep: 1 };
  }
  const selection = parseJoinSelection(params);
  const planStepSkipped = canSkipPlanStep(selection);
  return { selection, planStepSkipped, initialStep: planStepSkipped ? 2 : 1 };
}
