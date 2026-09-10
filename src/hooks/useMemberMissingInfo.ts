import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  missingRequiredFields,
  type MemberRecordForRequiredCheck,
  type RequiredField,
} from "@/lib/memberRequiredFields";

/**
 * WHAT IS MISSING FROM A MEMBER'S FILE — read once, from the one definition.
 *
 * Every surface that has ever answered this question answered it differently:
 * `MemberUpdateRequestModal` had its own inline list, the readiness queue reads the view, the
 * protection checklist counts rungs. `memberRequiredFields.ts` reconciled them into one list;
 * these hooks are the only reads behind it, so the header badge, the dialog and the members
 * list cannot disagree about the number.
 *
 * A NULL SOURCE IS NOT A GAP. `missingRequiredFields` treats an unread table as "not answered"
 * rather than "empty", which is why every read below is allowed to fail quietly: a badge that
 * says "6 missing" while a query is in flight is a badge staff learn to ignore.
 */

async function readOne<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await run();
  return error ? null : data;
}

export interface MemberMissingInfo {
  missing: RequiredField[];
  count: number;
}

export function useMemberMissingInfo(memberId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["member-missing-info", memberId],
    enabled: !!memberId && enabled,
    queryFn: async (): Promise<MemberMissingInfo> => {
      const id = memberId as string;
      const [member, medical, contacts, device, readiness, subscription] = await Promise.all([
        readOne(() => supabase.from("members").select("*").eq("id", id).maybeSingle()),
        readOne(() =>
          supabase.from("medical_information").select("*").eq("member_id", id).maybeSingle(),
        ),
        readOne(() => supabase.from("emergency_contacts").select("phone").eq("member_id", id)),
        readOne(() => supabase.from("devices").select("imei").eq("member_id", id).maybeSingle()),
        readOne(() =>
          supabase
            .from("member_monitoring_readiness")
            .select("device_tested_at")
            .eq("member_id", id)
            .maybeSingle(),
        ),
        readOne(() =>
          supabase
            .from("subscriptions")
            .select("status, has_pendant, created_at")
            .eq("member_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ]);

      const sub = subscription as { status?: string; has_pendant?: boolean | null } | null;
      const input: MemberRecordForRequiredCheck = {
        member: member as Record<string, unknown> | null,
        medical: medical as Record<string, unknown> | null,
        contacts: contacts as Array<{ phone?: string | null }> | null,
        device: device as { imei?: string | null } | null,
        deviceTestedAt:
          (readiness as { device_tested_at?: string | null } | null)?.device_tested_at ?? null,
        subscriptionStatus: sub?.status ?? null,
        hasPendant: sub?.has_pendant ?? null,
      };

      const missing = missingRequiredFields(input);
      return { missing, count: missing.length };
    },
  });
}

export interface MemberListRow {
  id: string;
  [column: string]: unknown;
}

/**
 * The same number for a page of the members list — FIVE batched reads, not six per row.
 *
 * Twenty members would be a hundred and twenty round trips done one at a time, which is how a
 * column like this gets added, gets blamed for the list being slow, and gets deleted again.
 */
export function useMembersMissingCounts(rows: MemberListRow[] | undefined) {
  const ids = (rows ?? []).map((r) => r.id).sort();
  return useQuery({
    queryKey: ["members-missing-counts", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const [medical, contacts, devices, readiness, subscriptions] = await Promise.all([
        readOne(() => supabase.from("medical_information").select("*").in("member_id", ids)),
        readOne(() =>
          supabase.from("emergency_contacts").select("member_id, phone").in("member_id", ids),
        ),
        readOne(() => supabase.from("devices").select("member_id, imei").in("member_id", ids)),
        readOne(() =>
          supabase
            .from("member_monitoring_readiness")
            .select("member_id, device_tested_at")
            .in("member_id", ids),
        ),
        readOne(() =>
          supabase
            .from("subscriptions")
            .select("member_id, status, has_pendant")
            .in("member_id", ids),
        ),
      ]);

      const by = <T extends { member_id?: string | null }>(list: T[] | null) => {
        const map = new Map<string, T[]>();
        for (const item of list ?? []) {
          const key = item.member_id ?? "";
          const bucket = map.get(key);
          if (bucket) bucket.push(item);
          else map.set(key, [item]);
        }
        return map;
      };

      const medicalBy = by(medical as Array<{ member_id?: string }> | null);
      const contactsBy = by(contacts as Array<{ member_id?: string; phone?: string }> | null);
      const devicesBy = by(devices as Array<{ member_id?: string; imei?: string }> | null);
      const readinessBy = by(
        readiness as Array<{ member_id?: string; device_tested_at?: string | null }> | null,
      );
      const subsBy = by(
        subscriptions as Array<{
          member_id?: string;
          status?: string;
          has_pendant?: boolean | null;
        }> | null,
      );

      /*
        A FAILED BATCH IS "NOT ANSWERED" FOR EVERY MEMBER, not "empty" for every member.

        `.in()` returning null because the read failed must not turn into "nobody has a medical
        record", which would show a full house of red badges down the whole list. Null is
        carried through as undefined so the check skips those items entirely.
      */
      const asNull = <T>(list: unknown, value: T): T | null => (list === null ? null : value);

      const out: Record<string, number> = {};
      for (const row of rows ?? []) {
        const sub = subsBy.get(row.id)?.[0] ?? null;
        out[row.id] = missingRequiredFields({
          member: row,
          medical: asNull(medical, medicalBy.get(row.id)?.[0] ?? {}),
          contacts: asNull(contacts, contactsBy.get(row.id) ?? []),
          device: asNull(devices, devicesBy.get(row.id)?.[0] ?? null),
          deviceTestedAt:
            readiness === null
              ? undefined
              : (readinessBy.get(row.id)?.[0]?.device_tested_at ?? null),
          subscriptionStatus: subscriptions === null ? undefined : (sub?.status ?? null),
          hasPendant: subscriptions === null ? undefined : (sub?.has_pendant ?? null),
        }).length;
      }
      return out;
    },
  });
}

/**
 * KEEP THE BADGE HONEST WHEN THE MEMBER ANSWERS.
 *
 * React Query is configured with `staleTime: 2 minutes` and
 * `refetchOnWindowFocus: false` (App.tsx), and the member fills their link in on their own
 * phone, in another building. Without this the count a staff member is looking at while on
 * the phone to them does not move when they press submit — and "it still says 7" is how
 * somebody concludes the link is broken and re-sends it.
 *
 * Invalidate-only, like `useMembersRealtime`: the broadcast payload is ignored entirely and
 * the refetch goes back through the caller's own RLS, so realtime never becomes a way to read
 * a row the viewer may not see.
 */
export function useMemberMissingInfoRealtime(memberId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!memberId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["member-missing-info", memberId] });
      queryClient.invalidateQueries({ queryKey: ["members-missing-counts"] });
    };
    const channel = supabase.channel(`member-missing-${memberId}`);
    // The three tables a member's own update link writes to. Device and subscription changes
    // are ours, and the surfaces that make them invalidate their own queries.
    for (const table of ["members", "medical_information", "emergency_contacts"]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: table === "members" ? `id=eq.${memberId}` : `member_id=eq.${memberId}`,
        },
        invalidate,
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, queryClient]);
}
