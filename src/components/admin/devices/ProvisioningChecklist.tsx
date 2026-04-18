import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  RotateCcw,
  Terminal,
  Wrench,
  Wifi,
  Phone,
  TestTube,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
} from "lucide-react";
import {
  useDeviceProvisioning,
  type ProvisioningStep,
} from "@/hooks/useDeviceProvisioning";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProvisioningChecklistProps {
  deviceId: string;
  simPhoneNumber?: string | null;
  onSmsCommandNeeded?: (command: string) => void;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  hardware: { icon: Wrench, color: "text-blue-600" },
  network: { icon: Wifi, color: "text-purple-600" },
  contacts: { icon: Phone, color: "text-green-600" },
  testing: { icon: TestTube, color: "text-orange-600" },
};

function StepItem({
  step,
  state,
  onComplete,
  onUncomplete,
  isUpdating,
  onSmsCommand,
}: {
  step: ProvisioningStep;
  state: { completed: boolean; completed_at: string | null; notes: string | null };
  onComplete: (notes?: string) => void;
  onUncomplete: () => void;
  isUpdating: boolean;
  onSmsCommand?: (command: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");

  return (
    <div
      className={`border rounded-lg p-3 transition-all ${
        state.completed
          ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
          : "bg-card hover:bg-accent/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          className="mt-0.5 shrink-0"
          onClick={() => {
            if (state.completed) {
              onUncomplete();
            } else {
              setExpanded(true);
            }
          }}
          disabled={isUpdating}
        >
          {state.completed ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium ${
                state.completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {step.label}
            </span>
            {step.smsCommand && (
              <Badge variant="outline" className="text-[10px] h-4">
                SMS
              </Badge>
            )}
          </div>

          {/* Collapsed: show completed info */}
          {state.completed && state.completed_at && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Completed {format(new Date(state.completed_at), "dd MMM yyyy, HH:mm")}
              {state.notes && ` — ${state.notes}`}
            </p>
          )}

          {/* Expanded: show details and action */}
          {!state.completed && expanded && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">{step.description}</p>

              <div className="flex items-center gap-2">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isUpdating}
                  onClick={() => {
                    onComplete(notes || undefined);
                    setNotes("");
                    setExpanded(false);
                  }}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Done
                </Button>
              </div>

              {step.smsCommand && onSmsCommand && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onSmsCommand(step.smsCommand!)}
                >
                  <Terminal className="h-3 w-3 mr-1" />
                  Send SMS: {step.smsCommand}
                </Button>
              )}
            </div>
          )}

          {/* Collapsed: show description on hover */}
          {!state.completed && !expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {step.description}
            </p>
          )}
        </div>

        {/* Expand/collapse */}
        {!state.completed && (
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface QuickProvisionButtonProps {
  deviceId: string;
  simPhoneNumber?: string | null;
  onStepComplete: (stepKey: string) => void;
}

function QuickProvisionButton({ deviceId: _deviceId, simPhoneNumber, onStepComplete }: QuickProvisionButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [defaults, setDefaults] = useState<Record<string, string>>({});

  const loadDefaults = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_default_apn",
        "settings_default_server_ip_port",
        "settings_default_sos_number",
        "settings_default_reporting_mode",
      ]);

    const map: Record<string, string> = {};
    data?.forEach((s) => { map[s.key] = s.value; });
    setDefaults(map);
    setShowConfirm(true);
  };

  const smsSteps = [
    { key: "status_check", label: "Status Check", command: "STATUS#" },
    { key: "set_apn", label: "Set APN", command: `APN,${defaults.settings_default_apn || "internet"}#` },
    { key: "set_server", label: "Set Server IP:Port", command: `IP,${defaults.settings_default_server_ip_port || ""}#` },
    { key: "set_sos", label: "Set SOS Number", command: `A1,${defaults.settings_default_sos_number || ""}#` },
    { key: "set_reporting", label: "Set Reporting Mode", command: `MODE,${defaults.settings_default_reporting_mode || "1,300"}#` },
    { key: "set_volume", label: "Set Volume", command: "VOLUME,5,5#" },
  ];

  const executeProvision = async () => {
    if (!simPhoneNumber) {
      toast.error("No SIM phone number — assign one first");
      return;
    }

    setIsProvisioning(true);
    const total = smsSteps.length;

    for (let i = 0; i < total; i++) {
      const step = smsSteps[i];
      setCurrentStep(step.label);
      setProgress(Math.round(((i + 1) / total) * 100));

      try {
        // Send SMS command via Twilio
        const { error } = await supabase.functions.invoke("twilio-sms", {
          body: {
            to: simPhoneNumber,
            message: step.command,
          },
        });

        if (error) {
          console.error(`Quick provision step ${step.key} failed:`, error);
          toast.error(`Failed at: ${step.label}`);
        } else {
          onStepComplete(step.key);
        }
      } catch (err) {
        console.error(`Quick provision step ${step.key} error:`, err);
      }

      // Wait 3 seconds between commands
      if (i < total - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    setIsProvisioning(false);
    setShowConfirm(false);
    setProgress(0);
    setCurrentStep("");
    toast.success("Quick provisioning complete");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-xs"
        onClick={loadDefaults}
        disabled={isProvisioning}
      >
        <Zap className="h-3 w-3 mr-1" />
        Quick Provision
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Provision Device</DialogTitle>
            <DialogDescription>
              The following SMS commands will be sent to the device with 3-second delays:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {smsSteps.map((step, i) => (
              <div key={step.key} className="flex items-center gap-2 p-2 rounded bg-muted text-sm">
                <span className="font-medium w-6 text-center">{i + 1}.</span>
                <span className="flex-1">{step.label}</span>
                <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono">{step.command}</code>
              </div>
            ))}
          </div>
          {isProvisioning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{currentStep}...</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={isProvisioning}>
              Cancel
            </Button>
            <Button onClick={executeProvision} disabled={isProvisioning || !simPhoneNumber}>
              {isProvisioning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {isProvisioning ? "Provisioning..." : "Start Provisioning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProvisioningChecklist({ deviceId, simPhoneNumber, onSmsCommandNeeded }: ProvisioningChecklistProps) {
  const {
    checklist,
    completeStep,
    uncompleteStep,
    resetChecklist,
    completedCount,
    totalCount,
    progressPercent,
    isFullyProvisioned,
    PROVISIONING_STEPS,
  } = useDeviceProvisioning(deviceId);

  // Group steps by category
  const groupedSteps: Record<string, ProvisioningStep[]> = {};
  PROVISIONING_STEPS.forEach((step) => {
    if (!groupedSteps[step.category]) {
      groupedSteps[step.category] = [];
    }
    groupedSteps[step.category].push(step);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5" />
              Device Provisioning Checklist
            </CardTitle>
            <CardDescription className="mt-1">
              {isFullyProvisioned
                ? "All provisioning steps are complete. Device is ready for deployment."
                : `${completedCount} of ${totalCount} steps completed`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!isFullyProvisioned && (
              <QuickProvisionButton
                deviceId={deviceId}
                simPhoneNumber={simPhoneNumber}
                onStepComplete={(stepKey) =>
                  completeStep.mutate({ stepKey, notes: "Quick Provision" })
                }
              />
            )}
            {completedCount > 0 && !isFullyProvisioned && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => resetChecklist.mutate()}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-xs font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {isFullyProvisioned && (
          <div className="mt-3 flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Fully Provisioned
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {Object.entries(groupedSteps).map(([categoryKey, steps]) => {
          const config = CATEGORY_CONFIG[categoryKey] || { icon: ClipboardList, color: "text-foreground" };
          const Icon = config.icon;
          const categoryCompleted = steps.every((s) => checklist[s.key]?.completed);

          return (
            <div key={categoryKey}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`h-4 w-4 ${config.color}`} />
                <h4 className="text-sm font-semibold capitalize">{categoryKey.replace("_", " ")} Setup</h4>
                {categoryCompleted && (
                  <Badge variant="outline" className="text-[10px] h-4 text-green-600 border-green-300">
                    Complete
                  </Badge>
                )}
              </div>

              <div className="space-y-2 ml-1">
                {steps.map((step) => (
                  <StepItem
                    key={step.key}
                    step={step}
                    state={
                      checklist[step.key] || {
                        completed: false,
                        completed_at: null,
                        notes: null,
                      }
                    }
                    onComplete={(notes) =>
                      completeStep.mutate({ stepKey: step.key, notes })
                    }
                    onUncomplete={() =>
                      uncompleteStep.mutate({ stepKey: step.key })
                    }
                    isUpdating={completeStep.isPending || uncompleteStep.isPending}
                    onSmsCommand={onSmsCommandNeeded}
                  />
                ))}
              </div>

              <Separator className="mt-4" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
