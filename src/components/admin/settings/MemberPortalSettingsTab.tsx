import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MEMBER_ALERT_HISTORY_KEY,
  MEMBER_SETTING_SERVICE,
  memberAlertHistoryEnabled,
  memberAlertHistorySettingValue,
} from "@/lib/memberDisplaySettings";
import { MEMBER_ALERT_HISTORY_QUERY_KEY } from "@/hooks/useMemberAlertHistory";

/**
 * WHAT MEMBERS ARE SHOWN OF THEIR OWN ACCOUNT — Admin → Settings → Members.
 *
 * ONE SWITCH, and it governs display only. Alerts are still created by the SOS path, still
 * escalate, and every staff and operator view is untouched: what this decides is whether the
 * member's own portal offers an Alert History page, a recent-activity card and an alerts tile.
 *
 * WHY IT IS A SETTING AND NOT A DELETION. A member's alert history is a list of the times their
 * alarm went off. Empty for most members most of the time — which is the good outcome — and for
 * the members it is not empty for, it is a list of their own worst days on the screen they open
 * to check the alarm still works. Whether to show it is Lee's call, so the code makes it his
 * call rather than making it for him.
 *
 * WHY IT WRITES THROUGH `service: "member"`. `save-api-keys` computes
 * `key.startsWith(`${service}_`) ? key : `${service}_${key}`` — so sending this key with
 * `service: "settings"` would write `settings_member_alert_history_enabled`, which nothing
 * reads, and this switch would appear to work while doing nothing at all. `member_` is the
 * key's namespace and therefore the service, exactly as `HolidayPolicyCard` sends `holiday`.
 * `memberAlertHistory.test.ts` asserts it, because the failure is invisible from the screen.
 */
export function MemberPortalSettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: enabled, isLoading } = useQuery({
    queryKey: ["admin-member-display-settings"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", MEMBER_ALERT_HISTORY_KEY)
        .maybeSingle();
      if (error) throw error;
      return memberAlertHistoryEnabled(data?.value);
    },
  });

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.functions.invoke("save-api-keys", {
        body: {
          service: MEMBER_SETTING_SERVICE,
          keys: { [MEMBER_ALERT_HISTORY_KEY]: memberAlertHistorySettingValue(next) },
        },
      });
      if (error) throw await functionError(error, "Could not save the member portal settings");
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-member-display-settings"] });
      // The member-facing read, so a staff member previewing a member's dashboard sees the
      // change rather than a cached answer for the next five minutes.
      queryClient.invalidateQueries({ queryKey: MEMBER_ALERT_HISTORY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast({ title: t("adminSettings.saved", "Settings saved") });
    },
    onError: (error) => {
      toast({
        title: t("adminSettings.saveFailed", "Could not save"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="member-portal-settings">
      <CardHeader>
        <CardTitle>{t("adminSettings.memberPortal", "Member portal")}</CardTitle>
        <CardDescription>
          {t(
            "adminSettings.memberPortalDesc",
            "What members are shown of their own account. These change the member portal only — alerts are still recorded and still escalate, and every staff view is unaffected.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="member-alert-history">
              {t("adminSettings.memberAlertHistory", "Show members their alert history")}
            </Label>
            <p className="text-[0.8125rem] text-muted-foreground">
              {t(
                "adminSettings.memberAlertHistoryDesc",
                "Off: no Alert History page, no recent-activity card and no alerts tile in the member portal. On: members can read the times their own alarm was raised.",
              )}
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="member-alert-history"
              data-testid="member-alert-history-switch"
              checked={enabled === true}
              disabled={save.isPending}
              onCheckedChange={(next) => save.mutate(next)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
