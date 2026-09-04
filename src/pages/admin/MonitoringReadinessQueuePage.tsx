import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Phone, RefreshCw, ShieldCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/**
 * Paid but not monitoring-ready — the preventive control.
 *
 * A member is `active` when the payment webhook clears (golden rule 4). A member is
 * MONITORING-READY only when at least one emergency_contacts row exists for them. The pendant
 * ships on payment and there is no shipping hold, so the window between the two is real and can
 * be days long — and the join wizard is about to stop collecting contacts before payment, which
 * will make this the normal path rather than the exception.
 *
 * The other two readiness surfaces are REACTIVE: the operator card and the escalation alert both
 * fire once an SOS is already happening. This screen exists so that call never happens
 * unprepared. It is therefore a WORKLIST, not a dashboard tile: oldest wait first, phone number
 * in the row, and the wait duration stated in days so it cannot be skimmed past.
 *
 * Readiness is read from the member_monitoring_readiness view (READINESS_MODEL.md §2). It is NOT
 * re-derived here — per ICE_OPERATOR_CARD_SPEC.md §5.1.4 the SOS card derives from the contact
 * rows it already holds and the view serves this queue; the two must not swap roles.
 *
 * NO AUTOMATED CHASING. Email is not deliverable (unset secret, icealarm.es unverified with
 * Resend, SPF/DKIM/DMARC unpublished), and a silent chase failure is indistinguishable from a
 * member ignoring you. Human calls only.
 */

/** A wait this long is not a queue any more, it is a member nobody phoned. */
const URGENT_DAYS = 7;

interface QueueRow {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  preferredLanguage: string | null;
  paidSince: string | null;
  daysWaiting: number | null;
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export default function MonitoringReadinessQueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin-monitoring-readiness-queue"],
    queryFn: async (): Promise<QueueRow[]> => {
      // Readiness comes from the view; identity and contact details from members. Both reads are
      // RLS-scoped: the view delegates to emergency_contacts' policies, so a non-staff caller
      // gets nothing here rather than a filtered-but-present list.
      const { data: readiness, error: readinessError } = await supabase
        .from("member_monitoring_readiness")
        .select("member_id, monitoring_ready, emergency_contact_count, paid_since")
        .eq("monitoring_ready", false)
        .not("paid_since", "is", null)
        .order("paid_since", { ascending: true });

      if (readinessError) throw readinessError;

      const rows = readiness ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.member_id).filter((id): id is string => !!id);
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone, email, city, preferred_language, status")
        .in("id", ids)
        .eq("status", "active");

      if (membersError) throw membersError;

      const byId = new Map((members ?? []).map((m) => [m.id, m]));

      // Preserve the view's oldest-first ordering; drop anyone whose member row is not `active`
      // (readiness is a second axis, so a suspended member is not this queue's problem).
      return rows
        .filter((r) => r.member_id && byId.has(r.member_id))
        .map((r) => {
          const m = byId.get(r.member_id as string)!;
          return {
            memberId: m.id,
            firstName: m.first_name,
            lastName: m.last_name,
            phone: m.phone,
            email: m.email,
            city: m.city,
            preferredLanguage: m.preferred_language,
            paidSince: r.paid_since,
            daysWaiting: daysBetween(r.paid_since),
          };
        });
    },
  });

  const longestWait = useMemo(
    () => (data ?? []).reduce((max, r) => Math.max(max, r.daysWaiting ?? 0), 0),
    [data],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserRoundX className="h-6 w-6 text-destructive" aria-hidden="true" />
            {t("admin.readinessQueue.title", "Paid — no emergency contacts")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t(
              "admin.readinessQueue.subtitle",
              "These members have paid and their pendant has shipped, but nobody can be called for them. Phone them, oldest first, and record their emergency contacts.",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
          aria-label={t("common.refresh", "Refresh")}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          {t("common.refresh", "Refresh")}
        </Button>
      </div>

      {/*
        No automated chase. Stated on the screen so nobody adds one without reading why:
        email is not deliverable yet and a silent failure would look like a member ignoring us.
      */}
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t(
          "admin.readinessQueue.noAutoChase",
          "This queue does not send anything automatically. Email delivery is not yet verified, and a chase that fails silently is indistinguishable from a member who ignored it. Call them.",
        )}
      </p>

      {isError && (
        <div
          role="alert"
          data-testid="readiness-queue-error"
          className="rounded-md border-2 border-destructive bg-destructive/10 p-4"
        >
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t("admin.readinessQueue.loadFailed", "This queue could not be loaded")}
          </p>
          {/*
            A failed read must never render as an empty queue. An empty queue means "nobody is
            waiting", and showing that when we simply could not read is the same false all-clear
            emergency-contact-notify used to give (READINESS_MODEL.md §1-A).
          */}
          <p className="mt-1 text-sm text-destructive">
            {t(
              "admin.readinessQueue.loadFailedBody",
              "This is NOT the same as an empty queue — members may be waiting and unseen. Retry, and escalate if it persists.",
            )}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {!isError && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {t("admin.readinessQueue.waiting", "Members waiting")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={data && data.length > 0 ? "destructive" : "secondary"}>
                {isLoading ? "—" : (data?.length ?? 0)}
              </Badge>
              {longestWait >= URGENT_DAYS && (
                <Badge variant="destructive" data-testid="readiness-queue-longest">
                  {t("admin.readinessQueue.longestWait", "longest {{days}}d", {
                    days: longestWait,
                  })}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("admin.readinessQueue.loading", "Loading queue…")}
              </p>
            ) : (data?.length ?? 0) === 0 ? (
              <p
                data-testid="readiness-queue-empty"
                className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground"
              >
                <ShieldCheck className="h-4 w-4 text-alert-resolved" aria-hidden="true" />
                {t(
                  "admin.readinessQueue.empty",
                  "Every paid member has at least one emergency contact.",
                )}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.readinessQueue.member", "Member")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.phone", "Phone")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.city", "City")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.language", "Lang")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.paidSince", "Paid since")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.waitingFor", "Waiting")}</TableHead>
                      <TableHead className="text-right">
                        {t("admin.readinessQueue.action", "Action")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.map((row) => {
                      const urgent = (row.daysWaiting ?? 0) >= URGENT_DAYS;
                      const name =
                        `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
                        t("common.unknown", "Unknown");
                      return (
                        <TableRow key={row.memberId} data-testid="readiness-queue-row">
                          <TableCell className="font-medium">{name}</TableCell>
                          <TableCell>
                            {/*
                              The phone number is the point of the screen, so it is a real link
                              an operator can click, not text they have to retype.
                            */}
                            {row.phone ? (
                              <a
                                href={`tel:${row.phone}`}
                                className="font-mono text-sm underline underline-offset-2"
                              >
                                {row.phone}
                              </a>
                            ) : (
                              <span className="text-xs font-semibold text-destructive">
                                {t("admin.readinessQueue.noPhone", "NO PHONE ON FILE")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.city ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm uppercase text-muted-foreground">
                            {row.preferredLanguage ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.paidSince
                              ? new Date(row.paidSince).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {/* Not colour alone: urgent rows also carry the icon and "d". */}
                            <span
                              className={
                                urgent
                                  ? "flex items-center gap-1 font-bold text-destructive"
                                  : "text-sm"
                              }
                            >
                              {urgent && (
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {row.daysWaiting === null
                                ? "—"
                                : t("admin.readinessQueue.days", "{{days}}d", {
                                    days: row.daysWaiting,
                                  })}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => navigate(`/admin/members/${row.memberId}`)}
                            >
                              <Phone className="mr-1.5 h-3.5 w-3.5" />
                              {t("admin.readinessQueue.openMember", "Open & record")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
