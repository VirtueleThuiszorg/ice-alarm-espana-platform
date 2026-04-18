import { useLiveVisitors } from "@/hooks/useLiveVisitors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Radio, Monitor, Smartphone, Tablet, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function LiveVisitorsCard() {
  const { activeNow, last5min, last15min, activeSessions, isLoading } = useLiveVisitors(10000);

  const DeviceIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "desktop": return <Monitor className="h-3 w-3" />;
      case "mobile": return <Smartphone className="h-3 w-3" />;
      case "tablet": return <Tablet className="h-3 w-3" />;
      default: return <Monitor className="h-3 w-3" />;
    }
  };

  return (
    <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 via-green-500/[0.02] to-transparent relative overflow-hidden group hover:shadow-md transition-all">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            Live Now
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-9 w-9 rounded-xl bg-green-500/10 flex items-center justify-center transition-transform group-hover:scale-110">
                  <Radio className="h-4 w-4 text-green-600" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-medium">Real-time tracking</p>
                <p className="text-xs text-muted-foreground">Updates every 10 seconds</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main live count */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn(
            "text-3xl font-bold tracking-tight transition-all",
            activeNow > 0 ? "text-green-600" : "text-muted-foreground"
          )}>
            {isLoading ? "..." : activeNow}
          </span>
          <span className="text-xs text-muted-foreground">
            {activeNow === 1 ? "visitor" : "visitors"} now
          </span>
        </div>

        {/* Time breakdown - compact */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-muted-foreground">5m:</span>
            <span className="font-semibold">{last5min}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">15m:</span>
            <span className="font-semibold">{last15min}</span>
          </div>
        </div>

        {/* Active sessions preview */}
        {activeSessions.length > 0 && (
          <div className="pt-2 border-t border-green-500/10 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Active Pages
            </p>
            <div className="space-y-1 max-h-[80px] overflow-y-auto">
              {activeSessions.slice(0, 3).map((session) => (
                <div 
                  key={session.visitor_id} 
                  className="flex items-center gap-1.5 text-xs p-1.5 rounded-md bg-muted/40"
                >
                  <DeviceIcon type={session.device_type} />
                  <span className="flex-1 truncate font-medium text-[11px]">
                    {session.page_path === "/" ? "Homepage" : session.page_path}
                  </span>
                </div>
              ))}
              {activeSessions.length > 3 && (
                <p className="text-[10px] text-muted-foreground text-center py-0.5">
                  +{activeSessions.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Empty state - compact */}
        {!isLoading && activeNow === 0 && (
          <div className="flex items-center gap-2 py-2 text-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No visitors right now
            </p>
          </div>
        )}
      </CardContent>
      
      {/* Subtle gradient accent */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-green-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Card>
  );
}
