import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Phone, RefreshCw, ShieldCheck, UserRoundX } from "lucide-react";
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
import { READINESS_GAP_STAFF, type ReadinessGap } from "@/lib/readinessGap";
import {
  ATTENTION_PAYMENT_STAFF,
  mergeAttentionRows,
  type AttentionRow,
} from "@/lib/attentionQueue";

/**
 * The admin attention queue — paid members who need a phone call, on two axes.
 *
 * ITEM 8 ADDED THE SECOND AXIS: a subscription whose renewal payment FAILED (`past_due`). P4
 * decided the behaviour — Stripe retries, monitoring CONTINUES, and staff are told — and the
 * reason staff must be told is that somebody has to ring the member before the retries run out,
 * or a life-safety subscription lapses quietly. Until then the only surface a `past_due` reached
 * was a status badge on a page somebody would have to already be looking at (WIRING_REGISTER
 * absence row A2). It is the same work, on the same phone, from the same list.
 *
 * A member on both axes appears ONCE, because it is one call. The merge is in
 * `@/lib/attentionQueue` so that rule is testable without a database.
 *
 * Paid but not monitoring-ready — the original, preventive half.
 *
 * A member is `active` when the payment webhook clears (golden rule 4). Monitoring readiness is
 * a different axis, and since D4 it is TWO conditions rather than one:
 *
 *   1. at least one `emergency_contacts` row — somebody to call
 *   2. an order in `fulfilment_state = 'tested'` — somebody has proved the pendant reaches an
 *      operator, from the home it will be used in
 *
 * So this queue has TWO ROW KINDS, and it must name which one applies: "no contacts" and
 * "pendant not tested" are different calls, and telling an operator only that a member is "not
 * ready" makes them open the record to find out what for.
 *
 * BOTH ARE WORKED BY PHONE, which is why they share one worklist rather than getting a screen
 * each. The second is in fact the same call as the first for a member missing both — record a
 * contact, then have them press the pendant — and splitting them would mean phoning that member
 * twice.
 *
 * THE COUNT JUMPED WHEN D4 SHIPPED and it was not a regression. No order had ever been in
 * `tested`, so every paid member appeared here overnight. That is the first honest reading this
 * queue has produced, and it comes down as the calls get made — not by relaxing the condition.
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

/**
 * The row shape lives in `@/lib/attentionQueue` because the MERGE is the part worth testing
 * without a database: a member on both axes appears once, the older wait wins, and a member
 * whose record could not be read is dropped rather than shown as a call with no phone number.
 */
type QueueRow = AttentionRow;

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
        // `device_tested_at` is the second condition, added by 20260907100100. Selected so this
        // screen can name the gap instead of re-deriving it from orders — READINESS_MODEL.md §2.
        .select(
          "member_id, monitoring_ready, emergency_contact_count, device_tested_at, paid_since",
        )
        .eq("monitoring_ready", false)
        .not("paid_since", "is", null)
        .order("paid_since", { ascending: true });

      if (readinessError) throw readinessError;

      const readinessRows = readiness ?? [];

      // ── the second axis: a renewal that failed ────────────────────────────
      //
      // P4: a failed charge makes the subscription `past_due`, monitoring CONTINUES, and staff
      // are told — because somebody has to ring the member before Stripe stops retrying, or a
      // life-safety subscription lapses quietly. Until item 8 the only surface a `past_due`
      // reached was a status badge on a page somebody had to already be looking at
      // (WIRING_REGISTER absence row A2).
      const { data: pastDue, error: pastDueError } = await supabase
        .from("subscriptions")
        .select("member_id, renewal_date")
        .eq("status", "past_due")
        .order("renewal_date", { ascending: true });

      // Thrown, not swallowed. A half-read queue rendered as a whole one is the false all-clear
      // this screen exists to avoid (READINESS_MODEL.md §1-A) — and it would be the worse half,
      // because a missing payment row is a member about to lose cover.
      if (pastDueError) throw pastDueError;

      const pastDueRows = pastDue ?? [];
      if (readinessRows.length === 0 && pastDueRows.length === 0) return [];

      const ids = [
        ...new Set(
          [...readinessRows.map((r) => r.member_id), ...pastDueRows.map((r) => r.member_id)].filter(
            (id): id is string => !!id,
          ),
        ),
      ];

      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone, email, city, preferred_language, status")
        .in("id", ids)
        .eq("status", "active");

      if (membersError) throw membersError;

      // Anyone whose member row is not `active` is dropped by the query above: readiness is a
      // second axis, so a suspended member is not this queue's problem — and neither is a
      // past_due subscription belonging to somebody already suspended.
      return mergeAttentionRows(readinessRows, pastDueRows, members ?? []);
    },
  });

  const longestWait = useMemo(
    () => (data ?? []).reduce((max, r) => Math.max(max, r.daysWaiting ?? 0), 0),
    [data],
  );

  const countByGap = useMemo(() => {
    const counts: Record<Exclude<ReadinessGap, "none">, number> = {
      contacts: 0,
      pendant: 0,
      both: 0,
      unknown: 0,
    };
    for (const r of data ?? []) {
      if (r.gap !== "none") counts[r.gap] += 1;
    }
    return counts;
  }, [data]);

  /**
   * Counted separately, not folded into `countByGap`.
   *
   * A payment problem is not a readiness gap — a `past_due` member may be perfectly ready — and
   * adding it to those buckets would make the readiness numbers wrong. It is also a different
   * conversation: "take a new card" rather than "record a contact".
   */
  const pastDueCount = useMemo(
    () => (data ?? []).filter((r) => r.paymentPastDue).length,
    [data],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserRoundX className="h-6 w-6 text-destructive" aria-hidden="true" />
            {t("admin.readinessQueue.title", "Paid — needs a call")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t(
              "admin.readinessQueue.subtitle",
              "These members have paid and need a phone call: somebody to call in an emergency is missing, or a pendant nobody has proved reaches an operator, or a renewal payment has failed. All three are fixed by phoning them, oldest first. Monitoring continues while a payment is chased.",
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={data && data.length > 0 ? "destructive" : "secondary"}>
                {isLoading ? "—" : (data?.length ?? 0)}
              </Badge>
              {/*
                Split by kind, because the two are different amounts of work and a single total
                hides which. A queue of forty untested pendants is an afternoon of calls; forty
                members with nobody to call is a different conversation with the join wizard.
              */}
              {!isLoading &&
                (["contacts", "pendant", "both", "unknown"] as const).map((kind) => {
                  const n = countByGap[kind];
                  if (!n) return null;
                  const label = READINESS_GAP_STAFF[kind];
                  return (
                    <Badge
                      key={kind}
                      variant="outline"
                      data-testid={`readiness-count-${kind}`}
                    >
                      {t(label.key, label.fallback)}: {n}
                    </Badge>
                  );
                })}
              {!isLoading && pastDueCount > 0 && (
                <Badge variant="destructive" data-testid="readiness-count-payment">
                  {t(ATTENTION_PAYMENT_STAFF.key, ATTENTION_PAYMENT_STAFF.fallback)}:{" "}
                  {pastDueCount}
                </Badge>
              )}
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
                  "Every paid member has somebody to call, a pendant that has been tested, and a payment that went through.",
                )}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.readinessQueue.member", "Member")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.missing", "What is missing")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.phone", "Phone")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.city", "City")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.language", "Lang")}</TableHead>
                      <TableHead>{t("admin.readinessQueue.waitingSince", "Waiting since")}</TableHead>
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
                        <TableRow
                          key={row.memberId}
                          data-testid="readiness-queue-row"
                          data-gap={row.gap}
                        >
                          <TableCell className="font-medium">{name}</TableCell>
                          <TableCell>
                            {/*
                              The row kind, and the call it implies. Naming only the state
                              ("not ready") makes an operator open the record to find out what
                              for; naming the work means they can dial straight away.
                            */}
                            {row.gap !== "none" && (
                              <div className="space-y-0.5">
                                <span
                                  data-testid={`readiness-gap-${row.gap}`}
                                  className={
                                    row.gap === "unknown"
                                      ? "flex items-center gap-1 text-xs font-bold text-destructive"
                                      : "text-sm font-medium"
                                  }
                                >
                                  {row.gap === "unknown" && (
                                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  {t(
                                    READINESS_GAP_STAFF[row.gap].key,
                                    READINESS_GAP_STAFF[row.gap].fallback,
                                  )}
                                </span>
                                <p className="max-w-xs text-xs text-muted-foreground">
                                  {t(
                                    READINESS_GAP_STAFF[row.gap].work.key,
                                    READINESS_GAP_STAFF[row.gap].work.fallback,
                                  )}
                                </p>
                              </div>
                            )}
                            {/*
                              THE PAYMENT AXIS, alongside the readiness one rather than instead
                              of it. A member can need both — and it is still one phone call, so
                              it is still one row. "Do NOT suspend the service" is in the work
                              text because P4 decided it: monitoring continues while we chase.
                            */}
                            {row.paymentPastDue && (
                              <div className="mt-1 space-y-0.5">
                                <span
                                  data-testid="readiness-gap-payment"
                                  className="flex items-center gap-1 text-sm font-bold text-destructive"
                                >
                                  <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                                  {t(ATTENTION_PAYMENT_STAFF.key, ATTENTION_PAYMENT_STAFF.fallback)}
                                </span>
                                <p className="max-w-xs text-xs text-muted-foreground">
                                  {t(
                                    ATTENTION_PAYMENT_STAFF.work.key,
                                    ATTENTION_PAYMENT_STAFF.work.fallback,
                                  )}
                                </p>
                              </div>
                            )}
                          </TableCell>
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
                            {row.waitingSince
                              ? new Date(row.waitingSince).toLocaleDateString()
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
