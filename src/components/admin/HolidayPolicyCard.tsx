import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { HOLIDAY_POLICY_QUERY_KEY, useHolidayPolicy } from "@/hooks/useHolidayPolicy";
import {
  CARRY_OVER_SICKNESS_NOTE,
  FESTIVOS_CONVENIO_NOTE,
  STATUTORY_HOLIDAY_DAYS,
  holidayPolicyToSettings,
  type HolidayPolicy,
} from "../../../supabase/functions/_shared/holiday-policy";

/**
 * THE HOLIDAY RULES, WHERE THE PERSON APPLYING THEM IS.
 *
 * Lee's ruling (10 Sep): the legal rules are settings, not code. Two of the three are convenio
 * questions nobody has answered yet — and a convenio changes without a deploy, which is the whole
 * argument for a setting. They live on this page rather than in Admin → Settings because the
 * person who needs to know "do festivos count?" is the person looking at a request to approve,
 * and a rule three clicks away in another section is a rule nobody reads.
 *
 * Read by any member of staff (they are not credentials, and an operator is entitled to know the
 * rules they are held to); written only by a SUPER_ADMIN, because `system_settings` is
 * super_admin-manage under RLS and `save-api-keys` — the one write path — refuses anyone else.
 * Who changed it and when is recorded by that function in `system_settings.updated_by` /
 * `updated_at`; "who turned carry-over on" is the first question in the argument that follows.
 *
 * `service: "holiday"` is not cosmetic. `save-api-keys` prefixes every key with
 * `${service}_` UNLESS the key already starts with it, so a `service` that does not match the
 * key's own prefix stores the setting under a name the read does not look for — it saves, it
 * says it saved, and the value never comes back. Every key here starts with `holiday_`.
 *
 * THERE IS NO PAY-OUT CONTROL and there must never be one: ET art. 38.1 makes vacaciones
 * non-substitutable by compensation, and Lee ruled the same. src/test/holidayPolicy.test.ts fails
 * if the word appears in this file.
 */
export function HolidayPolicyCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HolidayPolicy | null>(null);

  // The same query the approvals warning and the per-person table read, so saving here refreshes
  // all three rather than leaving one screen on the old rule.
  const { data: policy, isLoading } = useHolidayPolicy();

  useEffect(() => {
    if (policy) setDraft(policy);
  }, [policy]);

  const save = useMutation({
    mutationFn: async (next: HolidayPolicy) => {
      const { error } = await supabase.functions.invoke("save-api-keys", {
        body: { service: "holiday", keys: holidayPolicyToSettings(next) },
      });
      if (error) throw await functionError(error, "Could not save the holiday policy");
      return next;
    },
    onSuccess: (next) => {
      setDraft(next);
      void queryClient.invalidateQueries({ queryKey: HOLIDAY_POLICY_QUERY_KEY });
      toast.success("Holiday policy saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = draft;
  const dirty = !!current && !!policy && JSON.stringify(current) !== JSON.stringify(policy);

  const set = <K extends keyof HolidayPolicy>(key: K, value: HolidayPolicy[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <Card className="border-muted">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" aria-hidden="true" />
          Holiday policy
        </CardTitle>
        <CardDescription>
          The rules every balance on this page is calculated against. {STATUTORY_HOLIDAY_DAYS}{" "}
          días naturales a year is the statutory minimum (ET art. 38.1) and is set per person in
          Admin → Staff; what follows is the part the convenio decides.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !current ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading the policy…
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl space-y-1">
                <Label htmlFor="festivos-count" className="text-sm font-medium">
                  Festivos count against vacaciones
                </Label>
                <p className="text-xs text-muted-foreground">{FESTIVOS_CONVENIO_NOTE}</p>
              </div>
              <Switch
                id="festivos-count"
                checked={current.festivosCountAgainstVacaciones}
                disabled={!canEdit}
                onCheckedChange={(v) => set("festivosCountAgainstVacaciones", v)}
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl space-y-1">
                <Label htmlFor="carry-over" className="text-sm font-medium">
                  Carry unused days into next year
                </Label>
                <p className="text-xs text-muted-foreground">{CARRY_OVER_SICKNESS_NOTE}</p>
              </div>
              <Switch
                id="carry-over"
                checked={current.carryOverEnabled}
                disabled={!canEdit}
                onCheckedChange={(v) => set("carryOverEnabled", v)}
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl space-y-1">
                <Label htmlFor="short-notice" className="text-sm font-medium">
                  Warn when approving dates fewer than this many days ahead
                </Label>
                <p className="text-xs text-muted-foreground">
                  ET art. 38.3 says the dates must be known at least two months before they
                  start. A warning, never a block — both sides can agree to less.
                </p>
              </div>
              <Input
                id="short-notice"
                type="number"
                min={0}
                inputMode="numeric"
                className="w-24"
                disabled={!canEdit}
                value={current.shortNoticeWarningDays}
                onChange={(e) =>
                  set("shortNoticeWarningDays", Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl space-y-1">
                <Label htmlFor="prorata" className="text-sm font-medium">
                  Pro-rata the entitlement for a mid-year start
                </Label>
                <p className="text-xs text-muted-foreground">
                  Read from each person's hire date, and only applies when that date falls inside
                  the year. Somebody with no hire date on file is shown the full entitlement and
                  flagged, never a reduced guess.
                </p>
              </div>
              <Switch
                id="prorata"
                checked={current.prorataEnabled}
                disabled={!canEdit}
                onCheckedChange={(v) => set("prorataEnabled", v)}
              />
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Days are taken, never exchanged for money — that is not a setting, it is ET art.
              38.1, and there is deliberately no control for it anywhere in the platform.
            </p>

            {canEdit ? (
              <Button
                onClick={() => current && save.mutate(current)}
                disabled={!dirty || save.isPending}
              >
                {save.isPending ? "Saving…" : "Save policy"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                These are the rules in force. Changing them is a super-admin action.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
