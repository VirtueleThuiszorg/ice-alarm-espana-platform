import { useTranslation } from "react-i18next";
import { Power, PowerOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface BehaviorProfile {
    id: string;
    key: string;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    gradientBg: string;
    name: string;
    description: string;
    enabled: boolean;
    mode: string;
    functionsCount?: number;
    activeFunctions?: number;
}

interface BehaviorProfileCardProps {
    profile: BehaviorProfile;
    isSelected: boolean;
    onSelect: (key: string) => void;
    onToggleEnabled: (key: string, enabled: boolean) => void;
    isToggling?: boolean;
}

export function BehaviorProfileCard({
    profile,
    isSelected,
    onSelect,
    onToggleEnabled,
    isToggling,
}: BehaviorProfileCardProps) {
    const { t } = useTranslation();
    const Icon = profile.icon;

    const getModeLabel = (mode: string) => {
        switch (mode) {
            case "auto_act":
                return t("ai.modes.autoAct", "Auto Act");
            case "draft_only":
                return t("ai.modes.draftOnly", "Draft Only");
            case "advise_only":
                return t("ai.modes.adviseOnly", "Advise Only");
            default:
                return mode;
        }
    };

    const getModeColor = (mode: string) => {
        switch (mode) {
            case "auto_act":
                return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
            case "draft_only":
                return "border-amber-500/30 bg-amber-500/10 text-amber-600";
            case "advise_only":
                return "border-blue-500/30 bg-blue-500/10 text-blue-600";
            default:
                return "";
        }
    };

    return (
        <Card
            className={cn(
                "relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg group",
                isSelected
                    ? "ring-2 ring-primary shadow-lg scale-[1.02]"
                    : "hover:scale-[1.01]",
                !profile.enabled && "opacity-60"
            )}
            onClick={() => onSelect(profile.key)}
        >
            {/* Top accent bar */}
            <div
                className={cn(
                    "absolute top-0 left-0 right-0 h-1 transition-all duration-300",
                    profile.enabled
                        ? `bg-gradient-to-r ${profile.gradientBg}`
                        : "bg-muted"
                )}
            />

            <CardHeader className="pb-3 pt-5">
                <div className="flex items-start justify-between">
                    <div
                        className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                            profile.enabled
                                ? `${profile.iconBg} shadow-sm`
                                : "bg-muted"
                        )}
                    >
                        <Icon
                            className={cn(
                                "h-5 w-5 transition-colors duration-300",
                                profile.enabled ? profile.iconColor : "text-muted-foreground"
                            )}
                        />
                    </div>
                    <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Switch
                            checked={profile.enabled}
                            onCheckedChange={(checked) => onToggleEnabled(profile.key, checked)}
                            disabled={isToggling}
                            className="data-[state=checked]:bg-emerald-500"
                        />
                    </div>
                </div>
                <CardTitle className="text-base mt-3 flex items-center gap-2">
                    {profile.name}
                    {profile.enabled ? (
                        <Power className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                        <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                    {profile.description}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn("text-[10px]", getModeColor(profile.mode))}>
                        {getModeLabel(profile.mode)}
                    </Badge>
                    {profile.functionsCount !== undefined && (
                        <Badge variant="secondary" className="text-[10px]">
                            {profile.activeFunctions ?? 0}/{profile.functionsCount}{" "}
                            {t("ai.behaviors.functions", "functions")}
                        </Badge>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
