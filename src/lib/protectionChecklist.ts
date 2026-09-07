import { readinessGap, type ReadinessGap } from "@/lib/readinessGap";
import { membershipCondition, type MembershipCondition } from "@/lib/membershipCondition";
import type { SupportActionKey } from "@/lib/supportActions";

/**
 * "YOUR PROTECTION" — the three things that decide whether pressing the button works.
 *
 * WP4: *"Home: greeting + date; 'Your protection' checklist (Membership / Pendant / Emergency
 * contacts, each with state and one action)."*
 *
 * Home had three cards — Subscription, Emergency contacts, Messages — each a small dashboard of
 * its own: a plan name, a renewal date, an amount, two contact names with ordinal badges. All
 * true, and none of it the question a member opens this page to ask, which is **"if I press it,
 * will somebody come?"**
 *
 * The answer has exactly three parts, and a member has to be able to see which one is missing.
 *
 * ── FIVE STATES, AND WHY EACH ONE EXISTS ───────────────────────────────────────────────────
 *
 * `ok`             this part is done
 * `in_progress`    it is happening and nobody needs to do anything. A pendant that has been
 *                  sent but not yet tested is NOT a failure — telling a member "action needed"
 *                  about something we owe them is blaming them for our queue
 * `action_needed`  they can act, or we can, and until somebody does this part does not work
 * `not_included`   they never had it and that was a choice. A phone-only member has no pendant;
 *                  showing that as a fault marks a legitimate plan as broken every time they
 *                  open the page. It is offered, not demanded
 * `unknown`        the read failed. NEVER folded into `ok` (a false all-clear on a life-safety
 *                  page) and never into `action_needed` (a false alarm, which is how a member
 *                  learns to ignore the whole checklist). Same rule as `readinessGap()`
 *
 * ── WHERE THE FACTS COME FROM ──────────────────────────────────────────────────────────────
 *
 * Nothing here decides what "ready" means; two modules already do, and a third opinion would be
 * a third thing to keep in step:
 *
 *   `readinessGap()`         which of the two readiness conditions is missing, from the view
 *   `membershipCondition()`  what a subscription's status means for the member
 *
 * This module adds only the granularity a checklist needs on top: is the pendant on its way, and
 * did they choose not to have one.
 */

export type ProtectionRungId = "membership" | "pendant" | "contacts";

export type ProtectionState = "ok" | "in_progress" | "action_needed" | "not_included" | "unknown";

/** Where a rung's single action goes: an in-app route, or a prefilled support request. */
export type ProtectionAction =
  | { kind: "route"; to: string; label: { key: string; fallback: string } }
  | { kind: "support"; action: SupportActionKey; label: { key: string; fallback: string } };

export interface ProtectionRung {
  id: ProtectionRungId;
  state: ProtectionState;
  /** One line saying where this part stands. Never a scolding. */
  headline: { key: string; fallback: string };
  /** The single action. `null` only where there is genuinely nothing to offer. */
  action: ProtectionAction | null;
}

/** The order they are shown in, and it is deliberate — see `PROTECTION_RUNG_ORDER`. */
export const PROTECTION_RUNG_ORDER = [
  "membership",
  "pendant",
  "contacts",
] as const satisfies readonly ProtectionRungId[];

/** Compile-time: every rung id is in the order, and nothing else is. */
type OrderedRung = (typeof PROTECTION_RUNG_ORDER)[number];
const _everyRungIsOrdered: Exclude<ProtectionRungId, OrderedRung> extends never ? true : never =
  true;
void _everyRungIsOrdered;

/**
 * Whether a state is one the member (or we) still have to do something about.
 *
 * `in_progress` is FALSE here, deliberately: it is the one non-`ok` state that needs nobody.
 * `unknown` is false too — a failed read is not a task, and offering one would be inventing work
 * from a network error.
 */
export function isProtectionGap(state: ProtectionState): boolean {
  return state === "action_needed" || state === "not_included";
}

/** Does the checklist as a whole say somebody is watching? Only if all three are `ok`. */
export function isFullyProtected(rungs: readonly ProtectionRung[]): boolean {
  return rungs.length > 0 && rungs.every((r) => r.state === "ok");
}

export interface ProtectionInput {
  /**
   * The member's most recent subscription of any status, `null` when they never had one, and
   * `undefined` when the read has not answered. The three are different answers — see
   * `membershipCondition()`.
   */
  latestSubscription: { status: string | null } | null | undefined;
  /** `subscriptions.has_pendant` on the ACTIVE subscription. `undefined` when unknown. */
  hasPendant: boolean | null | undefined;
  /** The device row, `null` when none is assigned, `undefined` when the read has not answered. */
  device: { is_online: boolean | null } | null | undefined;
  /** The readiness view row, `null`/`undefined` when it could not be read. */
  readiness:
    | { emergency_contact_count: number | null; device_tested_at: string | null }
    | null
    | undefined;
}

function membershipRung(input: ProtectionInput): ProtectionRung {
  const condition: MembershipCondition = membershipCondition(
    input.latestSubscription as Parameters<typeof membershipCondition>[0],
  );

  if (condition === "unknown") {
    return {
      id: "membership",
      state: "unknown",
      headline: {
        key: "protection.membership.unknown",
        fallback: "We could not check your membership just now.",
      },
      action: null,
    };
  }

  if (condition === "active") {
    return {
      id: "membership",
      state: "ok",
      headline: { key: "protection.membership.ok", fallback: "Your membership is active." },
      action: {
        kind: "route",
        to: "/dashboard/subscription",
        label: { key: "protection.membership.okAction", fallback: "See your membership" },
      },
    };
  }

  /*
    ONE line here, and the detail on the Membership page.

    There are seven ways a subscription is not active and each has its own honest sentence —
    they live in `membershipCondition.ts` and the Membership page renders them. Repeating the
    seven on Home would be two places to keep in step, and the checklist's job is to say WHICH
    of the three parts is missing, not to explain the billing.
  */
  return {
    id: "membership",
    state: "action_needed",
    headline: {
      key: "protection.membership.inactive",
      fallback: "Your membership is not active, so nobody is monitoring your alarm.",
    },
    action: {
      kind: "route",
      to: "/dashboard/subscription",
      label: { key: "protection.membership.inactiveAction", fallback: "See what to do" },
    },
  };
}

function pendantRung(input: ProtectionInput): ProtectionRung {
  const gap: ReadinessGap = readinessGap(input.readiness);

  // A failed readiness read means we cannot say whether the pendant was tested. `device` alone
  // cannot answer it: a device can be assigned and never tested.
  if (gap === "unknown") {
    return {
      id: "pendant",
      state: "unknown",
      headline: {
        key: "protection.pendant.unknown",
        fallback: "We could not check your pendant just now.",
      },
      action: null,
    };
  }

  // Phone-only is a plan, not a fault. Offered, never marked broken.
  if (input.hasPendant === false) {
    return {
      id: "pendant",
      state: "not_included",
      headline: {
        key: "protection.pendant.notIncluded",
        fallback: "Your membership does not include a pendant.",
      },
      action: {
        kind: "support",
        action: "add_pendant",
        label: { key: "subscription.addPendant", fallback: "Add a pendant" },
      },
    };
  }

  const tested = input.readiness?.device_tested_at != null;

  if (tested) {
    // The device row says whether it is reachable RIGHT NOW; the test says it worked in the home.
    const offline = input.device?.is_online === false;
    return {
      id: "pendant",
      state: offline ? "action_needed" : "ok",
      headline: offline
        ? {
            key: "protection.pendant.offline",
            fallback: "Your pendant has stopped checking in with us.",
          }
        : { key: "protection.pendant.ok", fallback: "Your pendant is tested and checking in." },
      action: offline
        ? {
            kind: "support",
            action: "report_issue",
            label: { key: "protection.pendant.offlineAction", fallback: "Tell us about it" },
          }
        : {
            kind: "route",
            to: "/dashboard/device",
            label: { key: "protection.pendant.okAction", fallback: "See your pendant" },
          },
    };
  }

  // Not tested. Which side of "sent" it is on decides whether this is our queue or a real gap.
  if (input.device) {
    return {
      id: "pendant",
      state: "in_progress",
      headline: {
        key: "protection.pendant.awaitingTest",
        fallback: "We still need to test your pendant with you on the phone.",
      },
      action: {
        kind: "route",
        to: "/dashboard/support",
        label: { key: "protection.pendant.awaitingTestAction", fallback: "Arrange the test" },
      },
    };
  }

  return {
    id: "pendant",
    state: "action_needed",
    headline: {
      key: "protection.pendant.notSent",
      fallback: "Your pendant has not reached you yet.",
    },
    action: {
      kind: "route",
      to: "/dashboard/device",
      label: { key: "protection.pendant.notSentAction", fallback: "See where it is" },
    },
  };
}

function contactsRung(input: ProtectionInput): ProtectionRung {
  const count = input.readiness?.emergency_contact_count;

  // NULL is not zero. A view row we could not read, or a count that came back null, must not
  // render as "you have nobody" — that is a false alarm on the condition members act on most.
  if (input.readiness == null || count == null) {
    return {
      id: "contacts",
      state: "unknown",
      headline: {
        key: "protection.contacts.unknown",
        fallback: "We could not check your emergency contacts just now.",
      },
      action: null,
    };
  }

  if (count > 0) {
    return {
      id: "contacts",
      state: "ok",
      headline: { key: "protection.contacts.ok", fallback: "We have people we can call." },
      action: {
        kind: "route",
        to: "/dashboard/contacts",
        label: { key: "protection.contacts.okAction", fallback: "See your contacts" },
      },
    };
  }

  return {
    id: "contacts",
    state: "action_needed",
    headline: {
      key: "protection.contacts.none",
      fallback: "We have nobody to contact on your behalf yet.",
    },
    action: {
      kind: "route",
      to: "/dashboard/contacts",
      label: { key: "clientDashboard.notReady.action", fallback: "Add your emergency contacts" },
    },
  };
}

const BUILDERS: Record<ProtectionRungId, (input: ProtectionInput) => ProtectionRung> = {
  membership: membershipRung,
  pendant: pendantRung,
  contacts: contactsRung,
};

/** The three rungs, in order. */
export function protectionChecklist(input: ProtectionInput): ProtectionRung[] {
  return PROTECTION_RUNG_ORDER.map((id) => BUILDERS[id](input));
}
