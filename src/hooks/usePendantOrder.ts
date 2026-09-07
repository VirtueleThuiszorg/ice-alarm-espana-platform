import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FulfilmentState } from "@/lib/fulfilmentState";
import type { OrderStatus } from "@/lib/orderStatus";

/**
 * THE ORDER A PENDANT BELONGS TO — the join every fulfilment surface outside `/admin/orders`
 * needs, and the one place the gap in it is stated.
 *
 * `fulfilment_state` lives on `orders`, but the screens that move it are about a DEVICE or a
 * MEMBER: the provisioning checklist is opened on a device, and "Test call completed" is
 * recorded on a member's record. The link between them is `order_items.device_id`.
 *
 * THE GAP, WHICH IS REAL AND NOT HYPOTHETICAL. `DeviceTab.assignDevice` assigns a pendant to a
 * member by writing `devices.member_id` — and, until this increment, wrote nothing to
 * `order_items`. A pendant assigned that way is invisible to this join, and therefore invisible
 * to `member_monitoring_readiness`, whose tested-pendant condition goes
 * `orders → order_items → devices`. So that member could never become monitoring-ready no
 * matter how many test calls anybody made.
 *
 * A hook that quietly returned `null` there would hide it. `linkedToOrder: false` is a distinct
 * answer from "no order at all", and the screens say which.
 */

export interface PendantOrder {
  id: string;
  orderNumber: string | null;
  memberId: string;
  fulfilmentState: FulfilmentState;
  fulfilmentStateReason: string | null;
  status: OrderStatus | null;
  testedAt: string | null;
  /** The staff member `tested_by` names, when there is one and it is readable. */
  testedByName: string | null;
}

async function fetchOrder(orderId: string): Promise<PendantOrder | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, member_id, fulfilment_state, fulfilment_state_reason, status, tested_at, tested_by",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let testedByName: string | null = null;
  if (data.tested_by) {
    // A separate read rather than a join: `staff` is readable by staff only, and a member
    // reading their own order must not have the whole query fail on a row they cannot see.
    const { data: staff } = await supabase
      .from("staff")
      .select("first_name, last_name")
      .eq("id", data.tested_by)
      .maybeSingle();
    if (staff) testedByName = `${staff.first_name} ${staff.last_name}`.trim();
  }

  return {
    id: data.id,
    orderNumber: data.order_number,
    memberId: data.member_id,
    fulfilmentState: data.fulfilment_state,
    fulfilmentStateReason: data.fulfilment_state_reason,
    status: data.status,
    testedAt: data.tested_at,
    testedByName,
  };
}


/**
 * THE MEMBER'S PENDANT ORDER, whether or not a device has been put on it yet.
 *
 * `usePendantOrderForMember`'s `order` is reached through `devices → order_items`, because that
 * is the path `member_monitoring_readiness` takes and the one whose gap the hook exists to
 * expose. But a member reading their OWN pendant page in the window between paying and the
 * device arriving has no device, so that path finds nothing — and the page could only say "you
 * have no pendant", which for somebody who has paid for one is the wrong sentence entirely.
 *
 * `item_type = 'pendant'` is the identifier, exactly as `linkDeviceToPendantOrder` uses: a
 * registration fee or a subscription line is not a thing you can put a device on.
 *
 * RLS: `orders!inner` embeds under the member's own policies — "Members can view own orders" and
 * "Members can view own order items" — so this returns their order and nobody else's.
 */
async function fetchMemberPendantOrder(memberId: string): Promise<PendantOrder | null> {
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, created_at, orders!inner(member_id)")
    .eq("item_type", "pendant")
    .eq("orders.member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const orderId = (data ?? [])[0]?.order_id;
  return orderId ? await fetchOrder(orderId) : null;
}

/**
 * The most recent order whose items name this device.
 *
 * `null` order with `linkedToOrder: false` means the pendant is not on any order — see the gap
 * above. `isLoading` is distinguished from both, because "we do not know yet" must never render
 * as "there is nothing".
 */
export function usePendantOrderForDevice(deviceId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["member-fulfilment", "device", deviceId],
    enabled: !!deviceId,
    queryFn: async (): Promise<{ order: PendantOrder | null; linkedToOrder: boolean }> => {
      const { data: items, error } = await supabase
        .from("order_items")
        .select("order_id, created_at")
        .eq("device_id", deviceId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const orderId = items?.[0]?.order_id;
      if (!orderId) return { order: null, linkedToOrder: false };

      return { order: await fetchOrder(orderId), linkedToOrder: true };
    },
  });

  return {
    order: query.data?.order ?? null,
    linkedToOrder: query.data?.linkedToOrder ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * The pendant order this member's assigned device sits on. Same read, reached from the member
 * side, so the member record does not have to know how the join works.
 */
export function usePendantOrderForMember(memberId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["member-fulfilment", "member", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<{
      order: PendantOrder | null;
      linkedToOrder: boolean;
      hasDevice: boolean;
    }> => {
      const { data: devices, error: deviceError } = await supabase
        .from("devices")
        .select("id")
        .eq("member_id", memberId as string);
      if (deviceError) throw deviceError;

      const deviceIds = (devices ?? []).map((d) => d.id);
      if (deviceIds.length === 0) return { order: null, linkedToOrder: false, hasDevice: false };

      const { data: items, error } = await supabase
        .from("order_items")
        .select("order_id, created_at")
        .in("device_id", deviceIds)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const orderId = items?.[0]?.order_id;
      if (!orderId) return { order: null, linkedToOrder: false, hasDevice: true };

      return { order: await fetchOrder(orderId), linkedToOrder: true, hasDevice: true };
    },
  });

  /*
    A SECOND, SEPARATE ANSWER — and the two are not the same question.

    `order` above is "the order this member's DEVICE sits on", which is what readiness needs and
    whose absence is the gap this hook exists to expose. `memberPendantOrder` is "this member's
    pendant order, device or not", which is what the member's own pendant page needs in the
    window between paying and the device arriving.

    Kept as its own field rather than folded into `order`, because `linkedToOrder: false` with a
    non-null `order` would quietly change what `PendantFulfilmentCard` reads — and that card's
    whole job is to say "this pendant is on no order", which is the readiness dead-end.
  */
  const memberOrderQuery = useQuery({
    queryKey: ["member-fulfilment", "member-pendant-order", memberId],
    enabled: !!memberId,
    queryFn: () => fetchMemberPendantOrder(memberId as string),
  });

  return {
    order: query.data?.order ?? null,
    linkedToOrder: query.data?.linkedToOrder ?? false,
    hasDevice: query.data?.hasDevice ?? false,
    /** The member's pendant order regardless of device linkage. See the comment above. */
    memberPendantOrder: memberOrderQuery.data ?? null,
    memberPendantOrderLoading: memberOrderQuery.isLoading,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
