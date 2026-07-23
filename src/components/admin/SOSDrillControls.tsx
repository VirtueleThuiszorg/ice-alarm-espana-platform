import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FlaskConical, Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createDrillAlert, cleanupDrillAlerts } from "@/lib/sosDrill";

/**
 * Admin-only SOS drill controls (the sos-drill edge function re-checks the
 * admin role server-side). Creates a clearly-labelled, ladder-suppressed test
 * SOS alert so the emergency path (queue claim → SOS takeover → resolve) can
 * be drilled live without any calls or notifications leaving the building.
 */
export function SOSDrillControls() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const result = await createDrillAlert();
    setCreating(false);
    if (result.ok) {
      toast.success(
        t("adminAlerts.drill.created", "Drill alert created — it is now live in the call-centre queue. No calls or notifications will fire."),
      );
    } else {
      toast.error(result.error);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    const result = await cleanupDrillAlerts();
    setCleaning(false);
    if (result.ok) {
      toast.success(
        t("adminAlerts.drill.cleaned", "Drill data removed ({{count}} alert(s)).", {
          count: result.alertsDeleted ?? 0,
        }),
      );
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 border-dashed" disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {t("adminAlerts.drill.create", "Create drill alert")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminAlerts.drill.confirmTitle", "Start an SOS drill?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "adminAlerts.drill.confirmBody",
                "This creates a TEST SOS alert (clearly labelled 🧪 DRILL) in the live queue. It is escalation-suppressed: no calls, SMS or notifications will be sent to anyone. Logged-in operators WILL see and hear it — warn the team it's a drill. Resolve it as a false alarm when done, then use Clean up.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate}>
              {t("adminAlerts.drill.confirmAction", "Create drill alert")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="ghost" size="sm" className="gap-2" onClick={handleCleanup} disabled={cleaning}>
        {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
        {t("adminAlerts.drill.cleanup", "Clean up drills")}
      </Button>
    </div>
  );
}
