import type { Database } from "@/integrations/supabase/types";

/**
 * THE FIVE THINGS STAFF DO TO A MEMBER'S SUBSCRIPTION — WP7.
 *
 * Renew, switch single↔couple, add a pendant, pause, cancel. Every one changes what a
 * vulnerable person is paying and what protection they have, and the brief's rule for all of
 * them is the same: *"EVERY one creates a Stripe action and the webhook changes state — staff
 * never write status='active' or a subscription row directly."*
 *
 * WHAT THE DATABASE ALREADY DEMANDS. `enforce_member_action_attribution()` (20260907100500)
 * refuses an `activity_logs` row carrying a `member_action` unless it also has a non-blank
 * reason, a `staff_id`, and `entity_type = 'member'`. That is enforcement, not a form
 * convention — "who cancelled this member, and why?" has to be answerable from the log alone.
 *
 * TWO CAPABILITIES, DELIBERATELY SEPARATE, and this is the design decision worth reading:
 *
 *   the RECORD       works for all six actions today
 *   the AUTOMATION   works for pause, resume and cancel — `admin-subscription-action` has
 *                    driven those through Stripe since #16x
 *
 * Renew, the plan switch and adding a pendant have no server path yet: each is new Stripe
 * money-movement code against a real customer's card, which nothing in this repo can test, and
 * a mistake in it charges a real person. So those three are OFFERED but not automated — staff
 * do them in Stripe and record them here, which is more useful than hiding the button, because
 * they have to do them either way and the audit trail is the part that was missing.
 *
 * An absent button is indistinguishable from a feature nobody built. A button that says what it
 * does and does not do is not.
 */

export type MemberAction = Database["public"]["Enums"]["member_action"];

/** How much of the action this system can perform, as opposed to record. */
export type MemberActionAutomation =
  /** A proven server path exists: `admin-subscription-action` drives Stripe. */
  | "automated"
  /** Recorded here; performed by a human in Stripe. See the module comment. */
  | "manual_in_stripe";

export interface MemberActionSpec {
  action: MemberAction;
  label: { key: string; fallback: string };
  /** What it does, in the words a staff member needs before pressing it. */
  description: { key: string; fallback: string };
  automation: MemberActionAutomation;
  /** The `admin-subscription-action` action name, when there is one. */
  serverAction?: "pause" | "resume" | "cancel";
  /**
   * Whether the UI insists on a reason before it will submit.
   *
   * The DATABASE insists for all six — this is about which ones the screen refuses to let you
   * even try without one. It is `true` for all six too, and that is not redundancy: the trigger
   * refusing a write produces a `RAISE EXCEPTION` a staff member has to read, and a form that
   * lets them get there has wasted their work. The field exists so that a future action added
   * with `reasonRequired: false` is a visible decision rather than an omission.
   */
  reasonRequired: boolean;
  /**
   * Destructive actions get a warning of their own in the dialog.
   *
   * REQUIRED rather than optional, for the same reason `MEMBER_ACCESS_FIELDS.secret` is: a new
   * action must not default to "not destructive" because nobody thought about it. Pausing a
   * life-safety subscription is exactly the kind of thing that looks administrative until you
   * remember what stops working.
   */
  destructive: boolean;
}

export const MEMBER_ACTIONS = [
  {
    action: "renew",
    label: { key: "admin.memberActions.renew", fallback: "Renew for another year" },
    description: {
      key: "admin.memberActions.renewDesc",
      fallback:
        "Take another year's payment. Do this in Stripe, then record it here so the renewal has an owner and a reason.",
    },
    automation: "manual_in_stripe",
    reasonRequired: true,
    // Changes what they pay; does not stop their monitoring.
    destructive: false,
  },
  {
    action: "switch_to_couple",
    label: { key: "admin.memberActions.switchToCouple", fallback: "Change to a couple plan" },
    description: {
      key: "admin.memberActions.switchToCoupleDesc",
      fallback:
        "Two people, one subscription. Change the plan in Stripe, then record it here — the price change is what the member will ask about.",
    },
    automation: "manual_in_stripe",
    reasonRequired: true,
    // Changes what they pay; does not stop their monitoring.
    destructive: false,
  },
  {
    action: "switch_to_single",
    label: { key: "admin.memberActions.switchToSingle", fallback: "Change to a single plan" },
    description: {
      key: "admin.memberActions.switchToSingleDesc",
      fallback:
        "Usually because the second person has died or moved out. Change the plan in Stripe, then record it here.",
    },
    automation: "manual_in_stripe",
    reasonRequired: true,
    // Changes what they pay; does not stop their monitoring.
    destructive: false,
  },
  {
    action: "add_pendant",
    label: { key: "admin.memberActions.addPendant", fallback: "Add a pendant" },
    description: {
      key: "admin.memberActions.addPendantDesc",
      fallback:
        "A second pendant on the same subscription. Charge it in Stripe, then record it here — and raise the order, or readiness will never reach the new one.",
    },
    automation: "manual_in_stripe",
    reasonRequired: true,
    // Changes what they pay; does not stop their monitoring.
    destructive: false,
  },
  {
    action: "pause",
    label: { key: "admin.memberActions.pause", fallback: "Pause the subscription" },
    description: {
      key: "admin.memberActions.pauseDesc",
      fallback:
        "Stops the billing and the monitoring. Their pendant will not reach an operator while it is paused — say so on the call before you do it.",
    },
    automation: "automated",
    serverAction: "pause",
    reasonRequired: true,
    destructive: true,
  },
  {
    action: "cancel",
    label: { key: "admin.memberActions.cancel", fallback: "Cancel the subscription" },
    description: {
      key: "admin.memberActions.cancelDesc",
      fallback:
        "Ends the subscription and the monitoring. This is the one somebody will ask about afterwards, so the reason matters more here than anywhere.",
    },
    automation: "automated",
    serverAction: "cancel",
    reasonRequired: true,
    destructive: true,
  },
] as const satisfies readonly MemberActionSpec[];

/**
 * THE RATCHET. A value added to the `member_action` enum stops the build until it has a spec —
 * a label, a description, an automation answer and a decision about the reason. An action that
 * exists in the database and nowhere on the screen is an action staff perform by writing SQL.
 */
type Covered = (typeof MEMBER_ACTIONS)[number]["action"];
type Uncovered = Exclude<MemberAction, Covered>;
const _everyActionHasASpec: Uncovered extends never ? true : never = true;
void _everyActionHasASpec;

export function memberActionSpec(action: MemberAction): MemberActionSpec {
  const spec = MEMBER_ACTIONS.find((a) => a.action === action);
  // Unreachable given the ratchet above; thrown rather than returned as undefined so a future
  // hole is loud at the call site instead of rendering an empty dialog.
  if (!spec) throw new Error(`no spec for member_action=${action}`);
  return spec;
}

/**
 * The shape `enforce_member_action_attribution()` will accept, built in one place.
 *
 * `entity_type` is `'member'` and `entity_id` is the member — not the subscription. The trigger
 * demands it, and the reason it demands it is that this log is read by member: "what has been
 * done to this person's account" is the question, and a row pointing at a subscription id makes
 * it a join away from the answer.
 */
export interface MemberActionLogRow {
  staff_id: string;
  action: string;
  entity_type: "member";
  entity_id: string;
  member_action: MemberAction;
  reason: string;
  /**
   * A type ALIAS shape, not `Record<string, unknown>`. `new_values` is jsonb, so the value has
   * to satisfy the generated `Json` type — and `Record<string, unknown>` does not: TypeScript
   * gives implicit index signatures to type aliases but not to interfaces, so a nested
   * `Record<string, unknown>` fails `Json`'s recursive constraint. Same reason
   * `useDeviceProvisioning`'s `ProvisioningStepState` is an alias.
   */
  new_values: { performed: string };
}

export function buildMemberActionLog(params: {
  staffId: string;
  memberId: string;
  action: MemberAction;
  reason: string;
  automation: MemberActionAutomation;
}): MemberActionLogRow {
  return {
    staff_id: params.staffId,
    action: `member_${params.action}`,
    entity_type: "member",
    entity_id: params.memberId,
    member_action: params.action,
    // Trimmed: the trigger uses btrim(), so an untrimmed reason of spaces would be accepted
    // here and refused there.
    reason: params.reason.trim(),
    new_values: {
      // Recorded so the log distinguishes "this system did it" from "a person did it in Stripe
      // and told us". Six months later that is the difference between a bug and a workflow.
      performed: params.automation === "automated" ? "by_system_via_stripe" : "by_staff_in_stripe",
    },
  };
}
