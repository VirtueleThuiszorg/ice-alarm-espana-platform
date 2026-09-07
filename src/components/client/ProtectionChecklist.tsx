import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, AlertTriangle, PlusCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supportActionPath } from "@/lib/supportActions";
import {
  protectionChecklist,
  type ProtectionInput,
  type ProtectionRung,
  type ProtectionState,
} from "@/lib/protectionChecklist";

/**
 * "YOUR PROTECTION" ON HOME — the three parts, each with its state and one action.
 *
 * The reasoning for the states, and for where the facts come from, is in
 * `src/lib/protectionChecklist.ts`. What this file decides is how they LOOK, and there are two
 * rules doing the work:
 *
 * R2 — *"Brand red never on an alert, warning or status."* Every rung here is a status, so none
 * of them is red. The alert families carry the meaning, exactly as `MemberReadinessNotice` does.
 *
 * R1 — one red button per page. Three rungs with three primary actions would be three, so every
 * action is an OUTLINE button. Home keeps zero red buttons, which is within "maximum one" and
 * the honest answer for a page whose job is to report rather than to ask.
 *
 * AND NOT COLOUR ALONE. Each state has its own icon and its own sentence, because a member with
 * any of the three common colour deficiencies has to be able to read this, and because a printed
 * or high-contrast page loses the tint entirely.
 */

const TONE: Record<ProtectionState, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-alert-resolved" },
  in_progress: { icon: Clock, className: "text-primary" },
  action_needed: { icon: AlertTriangle, className: "text-alert-battery" },
  not_included: { icon: PlusCircle, className: "text-muted-foreground" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground" },
};

const RUNG_LABEL: Record<ProtectionRung["id"], { key: string; fallback: string }> = {
  membership: { key: "navigation.subscription", fallback: "Membership" },
  pendant: { key: "protection.pendantLabel", fallback: "Pendant" },
  contacts: { key: "navigation.emergencyContacts", fallback: "Emergency contacts" },
};

export function ProtectionChecklist({ input }: { input: ProtectionInput }) {
  const { t } = useTranslation();
  const rungs = protectionChecklist(input);

  return (
    <Card data-testid="protection-checklist">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t("protection.title", "Your protection")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rungs.map((rung) => {
          const tone = TONE[rung.state];
          const Icon = tone.icon;
          return (
            <div
              key={rung.id}
              data-testid={`protection-rung-${rung.id}`}
              data-state={rung.state}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.className}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(RUNG_LABEL[rung.id].key, RUNG_LABEL[rung.id].fallback)}
                  </p>
                  <p className="text-base">{t(rung.headline.key, rung.headline.fallback)}</p>
                </div>
              </div>

              {rung.action && (
                /* Outline, always. See the module comment: three rungs cannot each have the
                   page's one red button. */
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  data-testid={`protection-action-${rung.id}`}
                  asChild
                >
                  <Link
                    to={
                      rung.action.kind === "route"
                        ? rung.action.to
                        : supportActionPath(rung.action.action)
                    }
                  >
                    {t(rung.action.label.key, rung.action.label.fallback)}
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
