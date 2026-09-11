import type { Database } from "@/integrations/supabase/types";

/**
 * WHAT A MEMBER'S STATUS IS CALLED, AND WHAT COLOUR IT IS — one mapping.
 *
 * WHAT WAS WRONG. Three `getStatusBadge` switches (the record header, the members list, and a
 * third for subscriptions) each handled the statuses their author remembered and ended with
 *
 *     default: return <Badge variant="outline">{status}</Badge>;
 *
 * — which renders the RAW ENUM. `pending_review` is the status the CRM import writes, so all
 * 431 imported members carry it, and on their records the chip literally read `pending_review`.
 * Not an edge case: the commonest state in the table, shown to staff as a database value.
 *
 * A `default` that renders its input is the shape of the bug. This module has no default: the
 * map is `Record<MemberStatus, …>` and TypeScript fails the build if the enum gains a value
 * nobody has named. That is the whole reason it is a keyed object rather than a switch.
 *
 * ── THE COLOURS ARE MEANINGS, NOT DECORATION ────────────────────────────────
 *
 * MEMBER_UX_RULES R1 rations red for alarm and critical actions, so nothing here is brand red.
 * `pending_review` is AMBER because it is the one that needs somebody to do something — an
 * imported client the platform has never billed. `suspended` is GREY rather than red: a
 * suspended member is a business state, and an operator who sees red on a member record should
 * be looking at an emergency.
 *
 * ── WHAT THE BRIEF ASKED FOR THAT DOES NOT EXIST ────────────────────────────
 *
 * "cancelled → muted red outline". There is no `cancelled` member status: the enum is
 * active | inactive | pending_review | suspended. `cancelled` belongs to `subscription_status`,
 * which is a different fact about a different row and is rendered by a different chip. Adding
 * a `cancelled` case here would have produced a branch nothing can reach and an implication
 * that a member can be cancelled. Recorded rather than invented.
 */

export type MemberStatus = Database["public"]["Enums"]["member_status"];

export interface StatusPresentation {
  /** i18n key, with the English as the fallback the rest of this codebase passes to `t`. */
  key: string;
  fallback: string;
  /**
   * The chip's classes. Full literals rather than a colour name plus interpolation, because
   * Tailwind's scanner cannot see a class that is assembled at runtime and would drop them
   * from the build — the failure being an unstyled chip in production and a green test.
   */
  className: string;
}

export const MEMBER_STATUS_PRESENTATION: Record<MemberStatus, StatusPresentation> = {
  active: {
    key: "memberStatus.active",
    fallback: "Active",
    className: "border-transparent bg-emerald-100 text-emerald-900",
  },
  pending_review: {
    key: "memberStatus.pendingReview",
    fallback: "Pending review",
    // The one that means somebody has to act, so it is the one that is not grey.
    className: "border-transparent bg-amber-100 text-amber-900",
  },
  inactive: {
    key: "memberStatus.inactive",
    fallback: "Inactive",
    className: "border-transparent bg-slate-200 text-slate-800",
  },
  suspended: {
    key: "memberStatus.suspended",
    fallback: "Suspended",
    className: "border-transparent bg-slate-200 text-slate-800",
  },
};

/**
 * A status off a row, which is `string | null` in the generated types and can be a value the
 * enum has since dropped. An unknown one is NOT rendered raw — it says so in words, because
 * "unknown status" is information an operator can act on and `member_status_v2` is not.
 */
export function memberStatusPresentation(status: string | null | undefined): StatusPresentation {
  if (status && status in MEMBER_STATUS_PRESENTATION) {
    return MEMBER_STATUS_PRESENTATION[status as MemberStatus];
  }
  return {
    key: "memberStatus.unknown",
    fallback: "Unknown status",
    className: "border-transparent bg-slate-200 text-slate-800",
  };
}
