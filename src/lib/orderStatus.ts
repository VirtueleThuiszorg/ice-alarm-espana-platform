/**
 * The order_status enum, in one place, with the labels and the badge treatment that go with it.
 *
 * WHY THIS FILE EXISTS
 *
 * `20260228170000_add_missing_order_statuses.sql` added `confirmed` and `awaiting_stock` to the
 * database enum. Three layers above it never learned:
 *
 *   - `src/integrations/supabase/types.ts` still listed five values, so TypeScript believed the
 *     other two were impossible
 *   - `useOrderActions.ts` hand-typed the same five in its parameter
 *   - `OrdersPage.tsx` hand-listed the same five in its filter, its badge switch and its actions
 *
 * The consequence was not cosmetic. `_shared/post-payment.ts:115` sets an order to
 * `awaiting_stock` when it cannot find a free EV-07B — so **the one order that needs a human is
 * the one the admin screen could not display, filter, or move.** It fell through the badge
 * switch's `default` as a bare grey chip and appeared in no filter.
 *
 * Hand-maintained copies of an enum drift the moment somebody writes a migration, and drift
 * silently. So this module derives its type from the generated one and refuses to compile if a
 * value is ever added without being handled here. See FULFILMENT_MODEL.md §1-B.
 */
import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/**
 * Every value, in the order a human thinks about them: the happy path in sequence, then the two
 * that mean "stopped". `awaiting_stock` sits where it actually happens — right after payment.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "awaiting_stock",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const satisfies readonly OrderStatus[];

/**
 * Compile-time exhaustiveness. If a migration adds a value to `order_status` and `types.ts` is
 * regenerated, this stops compiling until the value is added above — which is the whole point.
 * A runtime test cannot catch this, because the missing value simply never appears in a fixture.
 */
type Uncovered = Exclude<OrderStatus, (typeof ORDER_STATUSES)[number]>;
const _everyStatusIsHandled: Uncovered extends never ? true : never = true;
void _everyStatusIsHandled;

/**
 * i18n keys with English defaults inline. Deliberately NOT new keys in the locale files: #173
 * and #174 are both in flight on `src/i18n/locales/*.json`, and CLAUDE.md is explicit that
 * locale changes merge one at a time. Adding two keys here would make a third.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, { key: string; fallback: string }> = {
  pending: { key: "common.pending", fallback: "Pending" },
  confirmed: { key: "admin.orders.statusConfirmed", fallback: "Confirmed" },
  awaiting_stock: { key: "admin.orders.statusAwaitingStock", fallback: "Awaiting stock" },
  processing: { key: "common.processing", fallback: "Processing" },
  shipped: { key: "common.shipped", fallback: "Shipped" },
  delivered: { key: "common.delivered", fallback: "Delivered" },
  cancelled: { key: "common.cancelled", fallback: "Cancelled" },
};

/**
 * Badge treatment. `awaiting_stock` is the only one that reads as a problem, because it is one:
 * a paid member whose pendant cannot be allocated. It is NOT brand red — MEMBER_UX_RULES R2
 * reserves that — but it must not look like ordinary progress either.
 */
export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  confirmed: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  awaiting_stock: "bg-orange-500/15 text-orange-700 border-orange-500/40 font-semibold",
  processing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  shipped: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  delivered: "bg-alert-resolved/15 text-alert-resolved border-alert-resolved/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * The one forward move offered from each state, or null where there is nothing sensible to do
 * from the screen.
 *
 * This is NOT the fulfilment state machine of FULFILMENT_MODEL.md, and must not be mistaken for
 * one: it is a UI affordance list, enforced nowhere. The real ordering and the D9 role rules
 * belong in a BEFORE UPDATE trigger, because a rule that lives only in a React component is a
 * suggestion — anyone with a session can PATCH the row directly. That migration is held behind
 * the drift gate (PENDING_FOR_LEE.md D-3).
 *
 * `awaiting_stock -> processing` is the move a human makes once stock arrives. It does not
 * allocate a device; allocation is `_shared/post-payment.ts`'s job and re-running it is its own
 * piece of work (FULFILMENT_MODEL.md §8, increment 6).
 */
export const ORDER_STATUS_NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: "processing",
  confirmed: "processing",
  awaiting_stock: "processing",
  processing: "shipped",
  shipped: "delivered",
  delivered: null,
  cancelled: null,
};
