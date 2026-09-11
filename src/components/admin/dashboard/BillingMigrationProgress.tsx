import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRightLeft, Download, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  santanderExportCsv,
  summariseMigration,
  toMigrationRow,
  type MemberProgressRow,
} from "@/lib/billingMigrationProgress";
import { resolveLegacyPlan } from "../../../../supabase/functions/_shared/legacy-plan";

/**
 * HOW FAR THROUGH THE MIGRATION WE ARE, and — the part the office actually needs — WHO THE BANK
 * SHOULD STILL BE COLLECTING FROM THIS MONTH.
 *
 * The second is not a report, it is an instruction. Somebody runs the Santander collection by
 * hand, and the list they run it from has to exclude anybody with a Stripe link outstanding.
 * Include one who has paid and they are charged twice in a month, by us, for the same
 * monitoring. That exclusion lives in `santanderExportCsv`, which is a pure function with its
 * own tests, because it is the single most expensive thing on this screen to get wrong.
 *
 * WHAT THE THREE NUMBERS MEAN, because "in progress" is not one of them:
 *
 *   On Santander     the bank still collects. The export includes them.
 *   Link out         a Stripe link is unpaid and they have LEFT the export. Not "moved".
 *   On Stripe        the payment webhook has seen their money. Only this one is done.
 */
export function BillingMigrationProgress() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing-migration-progress"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("members")
        .select(
          // ONE STRING LITERAL, not a concatenation: supabase-js types the result FROM this
          // literal, and `a + b` erases that — every field below becomes an error on
          // `GenericStringError`. Long line on purpose.
          "id, first_name, last_name, email, phone, billing_source, legacy_billing_day, legacy_next_renewal, switch_expires_at, subscriptions (plan_type, amount, billing_frequency, created_at), crm_profiles (legacy_membership_type, legacy_payment_type)",
        )
        .in("billing_source", ["legacy", "switch_pending", "stripe"]);
      if (error) throw error;

      /*
        THE MAPPING IS NOT DONE HERE. `toMigrationRow` builds the row this screen decides from —
        including `billingSource`, which is what keeps a member with a live Stripe link out of the
        bank collection — and it lives in the tested module beside the rule that reads it. While it
        was a closure in this function the only assertions that could reach it were regexes over
        this file, so a mapper that read the wrong column would have passed every test and cost a
        member their second payment of the month.
      */
      return (rows ?? []).map((r) =>
        toMigrationRow(r as unknown as MemberProgressRow, resolveLegacyPlan),
      );
    },
  });

  const summary = useMemo(() => summariseMigration(data ?? [], new Date()), [data]);

  const download = () => {
    const csv = santanderExportCsv(data ?? [], new Date());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `santander-collection-${format(new Date(), "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="billing-migration-progress">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-5 w-5" />
              Billing migration
            </CardTitle>
            <CardDescription>
              Moving legacy members off the Santander collection, timed to each one&rsquo;s own
              payment date.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={download}
            disabled={isLoading}
            data-testid="santander-export"
          >
            <Download className="h-4 w-4" />
            This month&rsquo;s Santander list
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="On Santander"
                value={summary.legacy}
                testId="migration-count-legacy"
                to="/admin/members?billing=legacy"
              />
              {/* NOT "moved". They have left the export and paid nobody yet. */}
              <Stat
                label="Link out"
                value={summary.switchPending}
                testId="migration-count-switch-pending"
                to="/admin/members?billing=switch_pending"
              />
              <Stat
                label="On Stripe"
                value={summary.stripe}
                testId="migration-count-stripe"
                to="/admin/members?billing=stripe"
              />
            </div>

            {/*
              THE THREE QUEUES A PERSON HAS TO EMPTY. All three are silent failures otherwise: a
              member with no billing date is one the runner can never reach, a member with no
              establishable plan is one it will not price, and a lapsed link is somebody back in
              the bank collection whom nobody has moved.
            */}
            {(summary.needsDate > 0 || summary.needsPlan > 0 || summary.lapsed > 0) && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                {summary.needsDate > 0 && (
                  <p className="flex items-start gap-2 text-sm" data-testid="migration-needs-date">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      <Link to="/admin/members?billing=needs_date" className="font-medium underline">
                        {summary.needsDate} member(s) have no billing date
                      </Link>{" "}
                      — the runner cannot time a link for them, so they will never be moved
                      automatically.
                    </span>
                  </p>
                )}
                {summary.needsPlan > 0 && (
                  <p className="flex items-start gap-2 text-sm" data-testid="migration-needs-plan">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      {summary.needsPlan} member(s) have no plan anybody can read off Karma's
                      record — the import stored its defaults for them, so the runner will not
                      price a link and rings the office instead. Confirm the plan on their record,
                      under <strong>Move to Stripe billing</strong>.
                    </span>
                  </p>
                )}
                {summary.lapsed > 0 && (
                  <p className="flex items-start gap-2 text-sm" data-testid="migration-lapsed">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      {summary.lapsed} link(s) have expired without being used. Those members are
                      back on Santander billing and need ringing.
                    </span>
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">
                Due this month{" "}
                <Badge variant="outline" data-testid="migration-due-count">
                  {summary.dueThisMonth.length}
                </Badge>
              </p>
              {summary.dueThisMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody on Santander billing renews for the rest of this month.
                </p>
              ) : (
                <ul className="space-y-1 text-sm" data-testid="migration-due-list">
                  {summary.dueThisMonth.slice(0, 8).map((m) => (
                    <li key={m.id} className="flex flex-wrap justify-between gap-x-3">
                      <Link to={`/admin/members/${m.id}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {m.nextRenewal ? format(new Date(m.nextRenewal), "d MMM") : "—"} ·{" "}
                        {m.billingFrequency === "annual" ? "annual" : "monthly"}
                      </span>
                    </li>
                  ))}
                  {summary.dueThisMonth.length > 8 && (
                    <li className="text-muted-foreground">
                      …and {summary.dueThisMonth.length - 8} more.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  testId,
  to,
}: {
  label: string;
  value: number;
  testId: string;
  to: string;
}) {
  return (
    <Link to={to} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <p className="text-2xl font-bold" data-testid={testId}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}
