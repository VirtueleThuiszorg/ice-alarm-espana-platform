import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Power, ShieldAlert, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUpdateAgent } from "@/hooks/useAIAgents";
import type { AIAgent } from "@/hooks/useAIAgents";

interface DeadSwitchProps {
    agents: AIAgent[];
}

export function DeadSwitch({ agents }: DeadSwitchProps) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const updateAgent = useUpdateAgent();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const allEnabled = agents.length > 0 && agents.every((a) => a.enabled);
    const someEnabled = agents.some((a) => a.enabled);
    const isActive = someEnabled;

    const handleToggleRequest = (newState: boolean) => {
        if (!newState) {
            // Killing — show confirmation
            setConfirmOpen(true);
        } else {
            // Enabling — no confirmation needed
            executeToggle(true);
        }
    };

    const executeToggle = async (enable: boolean) => {
        setIsSaving(true);
        try {
            await Promise.all(
                agents.map((agent) =>
                    updateAgent.mutateAsync({
                        agentId: agent.id,
                        updates: { enabled: enable },
                    })
                )
            );
            toast({
                title: enable
                    ? t("ai.behaviors.deadSwitch.enabled", "Isabella Activated")
                    : t("ai.behaviors.deadSwitch.disabled", "Isabella Killed"),
                description: enable
                    ? t("ai.behaviors.deadSwitch.enabledDesc", "All AI agents are now active and processing.")
                    : t("ai.behaviors.deadSwitch.disabledDesc", "All AI agents have been immediately disabled."),
                variant: enable ? "default" : "destructive",
            });
        } catch {
            toast({
                title: t("common.error", "Error"),
                description: t("ai.behaviors.deadSwitch.error", "Failed to toggle AI status"),
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
            setConfirmOpen(false);
        }
    };

    const enabledCount = agents.filter((a) => a.enabled).length;

    return (
        <>
            <div
                className={`relative overflow-hidden rounded-xl border-2 transition-all duration-500 ${isActive
                    ? "border-emerald-500/40 bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-teal-500/5"
                    : "border-red-500/40 bg-gradient-to-r from-red-500/5 via-red-500/10 to-rose-500/5"
                    }`}
            >
                {/* Animated pulse bar */}
                <div
                    className={`absolute top-0 left-0 right-0 h-1 ${isActive
                        ? "bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500"
                        : "bg-gradient-to-r from-red-400 via-red-500 to-rose-500"
                        }`}
                >
                    {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                    )}
                </div>

                <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                        <div
                            className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-500 ${isActive
                                ? "bg-emerald-500/15 text-emerald-500 shadow-lg shadow-emerald-500/20"
                                : "bg-red-500/15 text-red-500 shadow-lg shadow-red-500/20"
                                }`}
                        >
                            {isActive ? (
                                <Power className="h-6 w-6" />
                            ) : (
                                <ShieldAlert className="h-6 w-6" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-bold tracking-tight">
                                    {t("ai.behaviors.deadSwitch.title", "Isabella AI — Master Control")}
                                </h2>
                                <Badge
                                    variant="outline"
                                    className={`font-semibold text-xs uppercase tracking-wider ${isActive
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                        : "border-red-500/30 bg-red-500/10 text-red-600"
                                        }`}
                                >
                                    {isActive
                                        ? allEnabled
                                            ? t("ai.behaviors.deadSwitch.allActive", "All Active")
                                            : t("ai.behaviors.deadSwitch.partialActive", "{{count}} of {{total}} Active", {
                                                count: enabledCount,
                                                total: agents.length,
                                            })
                                        : t("ai.behaviors.deadSwitch.killed", "Killed")}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {isActive
                                    ? t("ai.behaviors.deadSwitch.activeDesc", "Isabella is processing events across all enabled behaviors.")
                                    : t("ai.behaviors.deadSwitch.killedDesc", "All AI processing is stopped. No automated actions will be taken.")}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <Switch
                            checked={isActive}
                            onCheckedChange={handleToggleRequest}
                            disabled={isSaving}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-red-500 scale-125"
                        />
                    </div>
                </div>
            </div>

            {/* Kill Confirmation Dialog */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <ShieldAlert className="h-5 w-5" />
                            {t("ai.behaviors.deadSwitch.confirmTitle", "Kill All AI Processing?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "ai.behaviors.deadSwitch.confirmDesc",
                                "This will immediately stop all of Isabella's AI agents. No automated responses, no outreach, no monitoring — everything stops. You can re-enable at any time."
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => executeToggle(false)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <ShieldAlert className="h-4 w-4 mr-2" />
                            )}
                            {t("ai.behaviors.deadSwitch.confirmButton", "Kill Isabella")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
