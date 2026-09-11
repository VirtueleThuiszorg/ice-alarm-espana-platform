import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { logActivity } from "@/lib/auditLog";
import {
  DEFAULT_RUNNER_SETTINGS,
  RUNNER_SETTING_KEYS,
} from "../../../../supabase/functions/_shared/billing-migration-runner";

/**
 * THE SWITCH THAT STARTS 431 PHONE-CALLS-AVOIDED, or 431 unexpected texts.
 *
 * The migration runner wakes daily and writes to the legacy members whose Santander date is
 * approaching. Turning it on is not a configuration change; it is the decision to start writing
 * to several hundred elderly people about money, a few each day, for months.
 *
 * SO IT ARRIVES OFF, AND THE PREVIEW COMES FIRST. `Preview today's list` calls the runner with
 * `dryRun=1` — the SAME computation that would send, returned instead of performed. A preview
 * written separately would one day disagree with what happens, and this is the screen where
 * somebody has to be able to believe it.
 *
 * THE LEAD TIMES ARE HERE BECAUSE THEY ARE A JUDGEMENT, not a constant. Three days before a
 * monthly debit is close enough that "your payment is due on the 15th" is true and far enough
 * that somebody who needs to ring their son has the weekend. Whether that is right is Lee's to
 * decide after the first hundred, and changing it should not need a deploy.
 */
export function BillingMigrationCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    enabled: false,
    monthlyLeadDays: String(DEFAULT_RUNNER_SETTINGS.monthlyLeadDays),
    annualNoticeDays: String(DEFAULT_RUNNER_SETTINGS.annualNoticeDays),
    annualReminderDays: String(DEFAULT_RUNNER_SETTINGS.annualReminderDays),
    annualEscalateDays: String(DEFAULT_RUNNER_SETTINGS.annualEscalateDays),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["billing-migration-settings"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", Object.values(RUNNER_SETTING_KEYS));
      if (error) throw error;
      const value = (key: string) => rows?.find((r) => r.key === key)?.value ?? null;
      return {
        enabled: value(RUNNER_SETTING_KEYS.enabled) === "true",
        monthlyLeadDays: value(RUNNER_SETTING_KEYS.monthlyLeadDays) ?? String(DEFAULT_RUNNER_SETTINGS.monthlyLeadDays),
        annualNoticeDays: value(RUNNER_SETTING_KEYS.annualNoticeDays) ?? String(DEFAULT_RUNNER_SETTINGS.annualNoticeDays),
        annualReminderDays: value(RUNNER_SETTING_KEYS.annualReminderDays) ?? String(DEFAULT_RUNNER_SETTINGS.annualReminderDays),
        annualEscalateDays: value(RUNNER_SETTING_KEYS.annualEscalateDays) ?? String(DEFAULT_RUNNER_SETTINGS.annualEscalateDays),
      };
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: typeof form) => {
      const { error } = await supabase.functions.invoke("save-api-keys", {
        body: {
          // `billing_migration`, matching the key family. `save-api-keys` prefixes every key
          // with `${service}_` unless it already starts with it — the wrong service here would
          // store `settings_billing_migration_enabled`, a name nothing reads, and the switch
          // would save and change nothing. Pinned by src/test/settingsKeyParity.test.ts.
          service: "billing_migration",
          keys: {
            [RUNNER_SETTING_KEYS.enabled]: String(next.enabled),
            [RUNNER_SETTING_KEYS.monthlyLeadDays]: next.monthlyLeadDays,
            [RUNNER_SETTING_KEYS.annualNoticeDays]: next.annualNoticeDays,
            [RUNNER_SETTING_KEYS.annualReminderDays]: next.annualReminderDays,
            [RUNNER_SETTING_KEYS.annualEscalateDays]: next.annualEscalateDays,
          },
        },
      });
      if (error) throw await functionError(error, "Could not save the billing migration settings");

      // "Who started the migration, and when" is the first question if anybody gets a message
      // they did not expect.
      await logActivity({
        action: "update",
        entityType: "settings",
        entityId: RUNNER_SETTING_KEYS.enabled,
        oldValues: data ?? {},
        newValues: next,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["billing-migration-settings"] });
      toast.success(form.enabled ? "Billing migration is running daily." : "Billing migration is off.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("billing-migration-run", {
        body: { dryRun: true },
      });
      if (error) throw await functionError(error, "Could not preview today's run");
      return result as {
        enabled: boolean;
        reason?: string;
        consideredMembers?: number;
        planned: Array<{ memberName: string; kind: string; renewal: string; daysUntilRenewal: number }>;
      };
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const KIND_LABEL: Record<string, string> = {
    switch_link: "Stripe link",
    annual_notice: "Annual notice",
    annual_reminder: "Annual reminder",
    staff_bell: "Ring them",
  };

  return (
    <Card className="mb-6" data-testid="billing-migration-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              Billing migration
            </CardTitle>
            <CardDescription>
              Moves legacy members off the Santander collection and onto Stripe, a few each day,
              timed to the date their own payment is taken. Nobody pays twice and nobody loses
              monitoring.
            </CardDescription>
          </div>
          <Badge variant={data?.enabled ? "default" : "outline"} data-testid="billing-migration-state">
            {isLoading ? "…" : data?.enabled ? "Running daily" : "Off"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="billing-migration-enabled" className="text-base">
              Send links automatically
            </Label>
            <p className="text-sm text-muted-foreground">
              While this is off, nothing is sent and the daily job does nothing. Staff can still
              move individual members by hand from their record.
            </p>
          </div>
          <Switch
            id="billing-migration-enabled"
            data-testid="billing-migration-enabled"
            disabled={!canEdit || save.isPending}
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="monthly-lead"
            testId="billing-monthly-lead"
            label="Monthly members: days before their payment date"
            hint="They are charged again next month whatever happens, so one link is enough."
            value={form.monthlyLeadDays}
            disabled={!canEdit}
            onChange={(v) => setForm((f) => ({ ...f, monthlyLeadDays: v }))}
          />
          <Field
            id="annual-notice"
            testId="billing-annual-notice"
            label="Annual members: days before renewal for the first notice"
            hint="An annual member who misses the switch waits twelve months for another chance."
            value={form.annualNoticeDays}
            disabled={!canEdit}
            onChange={(v) => setForm((f) => ({ ...f, annualNoticeDays: v }))}
          />
          <Field
            id="annual-reminder"
            testId="billing-annual-reminder"
            label="…and for the reminder"
            hint="Sent only if they still have not moved."
            value={form.annualReminderDays}
            disabled={!canEdit}
            onChange={(v) => setForm((f) => ({ ...f, annualReminderDays: v }))}
          />
          <Field
            id="annual-escalate"
            testId="billing-annual-escalate"
            label="…and when we ring them"
            hint="Not another text — a bell for the office to pick up the phone."
            value={form.annualEscalateDays}
            disabled={!canEdit}
            onChange={(v) => setForm((f) => ({ ...f, annualEscalateDays: v }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate(form)} disabled={!canEdit || save.isPending} data-testid="billing-migration-save">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={() => preview.mutate()}
            disabled={preview.isPending}
            data-testid="billing-migration-preview"
          >
            {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Preview today&rsquo;s list
          </Button>
        </div>

        {/* THE PREVIEW IS THE RUN, minus the sending. Same module, same settings, same day. */}
        {preview.data && (
          <div className="space-y-3 rounded-lg border p-4" data-testid="billing-migration-preview-result">
            {!preview.data.enabled ? (
              /* An empty list and a switched-off runner look identical, and "0 members due
                 today" would read as "there is nothing to do". */
              <p className="flex items-start gap-2 text-sm text-amber-600">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {preview.data.reason ?? "The migration is switched off, so nothing is planned."}
              </p>
            ) : preview.data.planned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody is due today. {preview.data.consideredMembers ?? 0} legacy member(s) have a
                billing date on file.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {preview.data.planned.length} member(s) would be written to today, out of{" "}
                  {preview.data.consideredMembers ?? 0} with a billing date on file.
                </p>
                <ul className="space-y-1 text-sm">
                  {preview.data.planned.map((p, i) => (
                    <li key={`${p.memberName}-${i}`} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{p.memberName}</span>
                      <span className="text-muted-foreground">
                        {KIND_LABEL[p.kind] ?? p.kind} · renews {p.renewal} ({p.daysUntilRenewal} days)
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  testId,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  testId: string;
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={testId}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
