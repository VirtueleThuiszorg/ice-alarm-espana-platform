import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  missingRecommendedFields,
  missingRequiredFields,
  requestableFields,
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

/**
 * A read that says whether it ANSWERED, separately from what it found.
 *
 * `return error ? null : data` conflated the two, because `maybeSingle()` answers `data: null`
 * for a row that does not exist — so a member with no `medical_information` row looked exactly
 * like a member whose medical read had been refused. `missingRequiredFields` skips a group whose
 * source is null (an unread table is not an empty one), so those six requirements were silently
 * dropped for precisely the members who had never filled them in.
 *
 * `ok: false` is "we did not find out"; `ok: true` with `data: null` is "there is nothing there",
 * which IS a gap. The batched hook below has always made that distinction; this is
 * what makes the two agree, as this file's header claims they do.
 */
interface Answered<T> {
  ok: boolean;
  data: T | null;
}

async function readOne<T>(
  run: () => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<Answered<T>> {
  const { data, error } = await run();
  return error ? { ok: false, data: null } : { ok: true, data };
}

export interface MemberMissingInfo {
  missing: RequiredField[];
  count: number;
  /**
   * The subset of `missing` the MEMBER can supply — what their "Complete my details" badge
   * counts and what the dialog behind it offers. See the note where it is built.
   */
  memberCanFill: RequiredField[];
  /**
   * Things worth having that are NOT part of `count`.
   *
   * Kept as its own field rather than folded in, because the count is what staff triage by: a
   * badge that says 1 for a member whose record is complete apart from an optional map pin is a
   * badge people stop reading. See `MEMBER_RECOMMENDED_FIELDS`.
   */
  recommended: RequiredField[];
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

      const sub = subscription.data as { status?: string; has_pendant?: boolean | null } | null;
      /*
        ANSWERED, THEN EMPTY. Each source falls back to the shape that means "there is nothing
        there" only when the read actually came back; a read that failed passes the value
        `missingRequiredFields` skips, so a refused read never invents gaps.
      */
      const input: MemberRecordForRequiredCheck = {
        member: member.ok ? (member.data as Record<string, unknown> | null) : null,
        medical: medical.ok ? ((medical.data as Record<string, unknown> | null) ?? {}) : null,
        contacts: contacts.ok
          ? ((contacts.data as Array<{ phone?: string | null }> | null) ?? [])
          : null,
        device: device.ok ? (device.data as { imei?: string | null } | null) : undefined,
        deviceTestedAt: readiness.ok
          ? ((readiness.data as { device_tested_at?: string | null } | null)?.device_tested_at ??
            null)
          : undefined,
        subscriptionStatus: subscription.ok ? (sub?.status ?? null) : undefined,
        hasPendant: subscription.ok ? (sub?.has_pendant ?? null) : undefined,
      };

      const missing = missingRequiredFields(input);
      return {
        missing,
        count: missing.length,
        /*
          WHAT A MEMBER CAN ACTUALLY DO SOMETHING ABOUT — the number their own badge shows.

          `count` is the staff number: everything the file is short of, including the three items
          only we can close (a pendant assigned, a pendant tested, a subscription activated —
          that last one by the payment webhook alone, golden rule 4). A badge on the member's
          dashboard counting those opens a dialog with nothing in it, which is the dead control
          the header was written to remove. `requestableFields` is the same filter the emailed
          update link has always used, so there is still one definition and not a second.
        */
        memberCanFill: requestableFields(missing),
        // NOT added to `count`. That is the whole distinction this field exists to keep.
        recommended: missingRecommendedFields(input),
      };
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

      const medicalBy = by(medical.data as Array<{ member_id?: string }> | null);
      const contactsBy = by(contacts.data as Array<{ member_id?: string; phone?: string }> | null);
      const devicesBy = by(devices.data as Array<{ member_id?: string; imei?: string }> | null);
      const readinessBy = by(
        readiness.data as Array<{ member_id?: string; device_tested_at?: string | null }> | null,
      );
      const subsBy = by(
        subscriptions.data as Array<{
          member_id?: string;
          status?: string;
          has_pendant?: boolean | null;
        }> | null,
      );

      /*
        A FAILED BATCH IS "NOT ANSWERED" FOR EVERY MEMBER, not "empty" for every member.

        A refused `.in()` must not turn into "nobody has a medical record", which would show a
        full house of red badges down the whole list. So the answer, not the payload, decides:
        a read that did not come back passes the value the check skips. An EMPTY answer is a
        real gap, which is the distinction the single-member hook above now shares.
      */
      const answered = <T>(read: { ok: boolean }, value: T): T | null => (read.ok ? value : null);

      const out: Record<string, number> = {};
      for (const row of rows ?? []) {
        const sub = subsBy.get(row.id)?.[0] ?? null;
        out[row.id] = missingRequiredFields({
          member: row,
          medical: answered(medical, medicalBy.get(row.id)?.[0] ?? {}),
          contacts: answered(contacts, contactsBy.get(row.id) ?? []),
          device: answered(devices, devicesBy.get(row.id)?.[0] ?? null),
          deviceTestedAt: readiness.ok
            ? (readinessBy.get(row.id)?.[0]?.device_tested_at ?? null)
            : undefined,
          subscriptionStatus: subscriptions.ok ? (sub?.status ?? null) : undefined,
          hasPendant: subscriptions.ok ? (sub?.has_pendant ?? null) : undefined,
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
