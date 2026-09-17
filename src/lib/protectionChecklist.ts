import { readinessGap, type ReadinessGap } from "@/lib/readinessGap";
import { parsePendantTestReminderDays, pendantTestIsStale } from "@/lib/pendantTestReminder";
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
  /**
   * An ISO timestamp the headline's `{{date}}` is filled from, when it has one.
   *
   * RAW, NOT FORMATTED. "3 March" / "3 de marzo" / "3 maart" is a question about the reader's
   * language, and this module is pure — it has no `t`, no i18n instance and no business
   * acquiring one. `ProtectionChecklist` formats it through `formatMemberDayMonth`, which is the
   * same map the dashboard greeting uses.
   */
  headlineDate?: string | null;
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
  /**
   * How many days a pendant test stays current for — `system_settings.pendant_test_reminder_days`.
   *
   * OPTIONAL, AND ABSENT MEANS 90, never "never stale". A caller that has not read the setting
   * yet, or could not, must still prompt a member whose last test was fourteen months ago: the
   * failure mode worth avoiding is a reassuring sentence that is no longer true, not a prompt
   * that arrives with a default threshold.
   */
  testReminderDays?: number | null;
  /** Now, in ms — injected so the staleness boundary is testable without faking the clock. */
  nowMs?: number;
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

  const testedAt = input.readiness?.device_tested_at ?? null;
  const tested = testedAt != null;

  if (tested) {
    // The device row says whether it is reachable RIGHT NOW; the test says it worked in the home.
    const offline = input.device?.is_online === false;

    /*
      OFFLINE WINS, AND IT MUST. A pendant that has stopped checking in is a fault whatever the
      age of its last test, and the stale branch below is not a fault at all — so ordering these
      the other way round would replace "your pendant has stopped checking in" with "it has been
      a while since it was tested" for exactly the member who needs the first sentence.
    */
    if (offline) {
      return {
        id: "pendant",
        state: "action_needed",
        headline: {
          key: "protection.pendant.offline",
          fallback: "Your pendant has stopped checking in with us.",
        },
        action: {
          kind: "support",
          action: "report_issue",
          label: { key: "protection.pendant.offlineAction", fallback: "Tell us about it" },
        },
      };
    }

    /*
      AN OVERDUE TEST IS NOT A FAULT — the most important line in this branch.

      `action_needed` is the state that tells a member something is WRONG with their alarm.
      Nothing is: the pendant is online, the membership is active, an operator is watching. The
      only thing that has lapsed is a habit we recommend. This file already draws exactly that
      distinction for a pendant in transit ("telling a member 'action needed' about something WE
      owe them blames them for our queue"), and the same reasoning lands here: a member who is
      told their alarm needs attention when it does not is a member who learns to ignore the one
      time it does.

      So `ok` in both branches, with a different sentence and a different button. No sixth
      `ProtectionState`, no change to the tone map, and `isProtectionGap` still answers false —
      an overdue test is not a task for the readiness queue.
    */
    /*
      THE THRESHOLD IS SANITISED HERE, not trusted from the caller.

      `?? DEFAULT` would have been enough for absent and null and wrong for everything else: a
      `NaN` (which is what `Number("")` gives, and what a settings read can produce) is not
      nullish, so it would have travelled straight into the comparison, where `age >= NaN` is
      false — a fourteen-month-old test silently reported as current. Zero and a negative are the
      same class of mistake pointing the other way. One sanitiser, in the one place that consumes
      the number, so no caller can get it wrong.
    */
    const stale = pendantTestIsStale(
      testedAt,
      parsePendantTestReminderDays(input.testReminderDays),
      input.nowMs ?? Date.now(),
    );

    return {
      id: "pendant",
      state: "ok",
      headline: stale
        ? {
            key: "protection.pendant.stale",
            fallback: "It has been a while since your pendant was tested. Last tested {{date}}.",
          }
        : {
            key: "protection.pendant.ok",
            fallback: "Your pendant is tested and checking in. Last tested {{date}}.",
          },
      headlineDate: testedAt,
      action: stale
        ? {
            /*
              The SAME destination the `awaitingTest` branch uses, which is the point: there is
              one way to arrange a test with us, and a second route to the same conversation
              would be a second thing to keep working.
            */
            kind: "route",
            to: "/dashboard/support",
            label: { key: "protection.pendant.staleAction", fallback: "Arrange a test" },
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
