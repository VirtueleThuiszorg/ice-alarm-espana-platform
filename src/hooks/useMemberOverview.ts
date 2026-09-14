import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildMemberOverview,
  type MemberOverviewData,
  type OverviewSection,
} from "@/lib/memberOverview";

/**
 * THE SIX READS BEHIND THE OVERVIEW SHEET — and they only happen when somebody opens it.
 *
 * `enabled` is the whole reason this is a hook rather than a component-level fetch: the member
 * record already runs a dozen queries on load, and six more for a dialog most visits never open
 * would be paid by every visit. It is gated on the dialog being open.
 *
 * RLS-SCOPED, NO SERVICE ROLE. Everything here is read as the signed-in staff member, so the
 * sheet can never show more than the tabs behind it would.
 *
 * A FAILED READ CONTRIBUTES NOTHING RATHER THAN FAILING THE SHEET. If `medical_information` is
 * unreadable the medical section is absent, exactly as it is for a member with no medical row —
 * which is honest, because the sheet's promise is "what we have here", and it never claims a
 * section is empty. The alternative, one error wiping the dialog, would hide the name and
 * address too.
 */

export interface MemberOverviewResult {
  sections: OverviewSection[];
  /** True when somebody other than the member pays — the sheet says so out loud. */
  hasPayer: boolean;
  /**
   * WHO THE DOCUMENT IS ABOUT, for its masthead strip — name, photo, status.
   *
   * Not a new read: it is the `members` row this hook already fetches for the sections. It is
   * lifted out separately because a header is not a field on the sheet — the name belongs at the
   * top in 16pt beside the avatar, not as row one of "Identity", and the status belongs there as
   * a humanised chip rather than the raw enum a `status` row would print.
   */
  subject: {
    name: string;
    photoUrl: string | null;
    /** Raw enum; `statusLabel.ts` turns it into words. Never rendered as-is. */
    status: string | null;
  } | null;
}

async function readOne<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await run();
  return error ? null : data;
}

export function useMemberOverview(memberId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["member-overview", memberId],
    enabled: !!memberId && enabled,
    queryFn: async (): Promise<MemberOverviewResult> => {
      const id = memberId as string;

      const [member, medical, contacts, device, readiness, subscription] = await Promise.all([
        readOne(() => supabase.from("members").select("*").eq("id", id).maybeSingle()),
        readOne(() =>
          supabase.from("medical_information").select("*").eq("member_id", id).maybeSingle(),
        ),
        readOne(() =>
          supabase
            .from("emergency_contacts")
            .select("*")
            .eq("member_id", id)
            .order("priority_order", { ascending: true }),
        ),
        readOne(() => supabase.from("devices").select("*").eq("member_id", id).maybeSingle()),
        // The view is the authority on whether the pendant was ever tested (READINESS_MODEL.md
        // §2). Re-deriving it from orders here would be a second opinion.
        readOne(() =>
          supabase
            .from("member_monitoring_readiness")
            .select("device_tested_at")
            .eq("member_id", id)
            .maybeSingle(),
        ),
        // The CURRENT subscription, active or not. A suspended member's plan is still a fact
        // about them, and a sheet that omits it reads as "no membership".
        readOne(() =>
          supabase
            .from("subscriptions")
            .select("*")
            .eq("member_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ]);

      const payerId = (subscription as { payer_id?: string | null } | null)?.payer_id ?? null;
      const payer = payerId
        ? await readOne(() =>
            supabase
              .from("payers")
              .select("full_name, email, phone, relationship")
              .eq("id", payerId)
              .maybeSingle(),
          )
        : null;

      const data: MemberOverviewData = {
        member: member as Record<string, unknown> | null,
        medical: medical as Record<string, unknown> | null,
        contacts: contacts as MemberOverviewData["contacts"],
        device: device as MemberOverviewData["device"],
        deviceTestedAt:
          (readiness as { device_tested_at?: string | null } | null)?.device_tested_at ?? null,
        subscription: subscription as MemberOverviewData["subscription"],
        payer: payer as MemberOverviewData["payer"],
      };

      const row = (member ?? {}) as Record<string, unknown>;
      const name = [row.title, row.first_name, row.last_name]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(" ");

      return {
        sections: buildMemberOverview(data),
        hasPayer: !!payer,
        subject: member
          ? {
              name,
              photoUrl: typeof row.photo_url === "string" ? row.photo_url : null,
              status: typeof row.status === "string" ? row.status : null,
            }
          : null,
      };
    },
  });
}
