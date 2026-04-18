import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Send,
  Terminal,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  MessageSquare,
  Wifi,
  Phone,
  MapPin,
  Volume2,
  Lightbulb,
  Settings,
} from "lucide-react";
import {
  useDeviceSmsCommands,
  type SmsCommandDefinition,
  type SmsCommandEntry,
} from "@/hooks/useDeviceSmsCommands";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface SmsCommandPanelProps {
  deviceId: string;
  simPhoneNumber: string | null;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  status: Terminal,
  network: Wifi,
  sos: Phone,
  gps: MapPin,
  audio: Volume2,
  led_ble: Lightbulb,
  system: Settings,
};

function CommandButton({
  cmd,
  simPhoneNumber,
  deviceId,
  onSend,
  isSending,
  defaultValue,
}: {
  cmd: SmsCommandDefinition;
  simPhoneNumber: string;
  deviceId: string;
  onSend: (params: { deviceId: string; simPhoneNumber: string; command: string; label: string }) => void;
  isSending: boolean;
  defaultValue?: string;
}) {
  const [paramValue, setParamValue] = useState(defaultValue || "");

  const handleSend = () => {
    const fullCommand = cmd.requiresParam
      ? `${cmd.command}${paramValue}#`
      : cmd.command;
    onSend({
      deviceId,
      simPhoneNumber,
      command: fullCommand,
      label: cmd.label,
    });
    setParamValue("");
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{cmd.label}</span>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {cmd.command}{cmd.requiresParam ? "<param>#" : ""}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">{cmd.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Expected: <span className="italic">{cmd.expectedResponse}</span>
        </p>

        {cmd.requiresParam && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              placeholder={cmd.paramPlaceholder}
              className="h-7 text-xs font-mono max-w-[200px]"
            />
            <span className="text-xs text-muted-foreground">{cmd.paramLabel}</span>
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-8"
        disabled={isSending || (cmd.requiresParam && !paramValue.trim())}
        onClick={handleSend}
      >
        <Send className="h-3 w-3 mr-1" />
        Send
      </Button>
    </div>
  );
}

function CommandLogEntry({ entry }: { entry: SmsCommandEntry }) {
  const statusIcon =
    entry.status === "delivered" ? (
      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
    ) : entry.status === "failed" ? (
      <XCircle className="h-3.5 w-3.5 text-red-600" />
    ) : entry.status === "timeout" ? (
      <Clock className="h-3.5 w-3.5 text-yellow-600" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
    );

  return (
    <div className="flex items-start gap-2 p-2 text-xs border-b last:border-0">
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{entry.label}</span>
          <Badge variant="outline" className="text-[10px] h-4">
            {entry.status}
          </Badge>
        </div>
        <code className="text-muted-foreground font-mono block mt-0.5">
          → {entry.command}
        </code>
        {entry.response && (
          <code className="text-green-700 dark:text-green-400 font-mono block mt-0.5">
            ← {entry.response}
          </code>
        )}
        <span className="text-muted-foreground mt-0.5 block">
          {formatDistanceToNow(new Date(entry.sent_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

const DEFAULT_KEY_MAP: Record<string, string> = {
  apn: "settings_default_apn",
  ip_port: "settings_default_server_ip_port",
  sos_a1: "settings_default_sos_number",
  mode: "settings_default_reporting_mode",
};

export function SmsCommandPanel({ deviceId, simPhoneNumber }: SmsCommandPanelProps) {
  const {
    commandLog,
    loadCommandLog,
    sendCommand,
    clearLog,
    isSending,
    EV07B_COMMANDS,
    SMS_COMMAND_CATEGORIES,
  } = useDeviceSmsCommands(deviceId);

  const [defaults, setDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCommandLog();

    // Fetch default provisioning values
    const fetchDefaults = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", Object.values(DEFAULT_KEY_MAP));

      if (data) {
        const map: Record<string, string> = {};
        data.forEach((s) => { map[s.key] = s.value; });
        setDefaults(map);
      }
    };
    fetchDefaults();
  }, [loadCommandLog]);

  if (!simPhoneNumber) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No SIM Number Configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              A SIM phone number must be assigned to this device before SMS commands can be sent.
              Add a SIM number in the device provisioning checklist.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Command Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-5 w-5" />
            EV-07B SMS Commands
          </CardTitle>
          <CardDescription>
            Send configuration and status commands to the device via SMS.
            Target: <code className="font-mono text-xs">{simPhoneNumber}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {SMS_COMMAND_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.key] || Terminal;
              const commands = EV07B_COMMANDS.filter((c) => c.category === cat.key);
              if (commands.length === 0) return null;

              return (
                <AccordionItem key={cat.key} value={cat.key}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {cat.label}
                      <Badge variant="secondary" className="text-[10px] h-4 ml-1">
                        {commands.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {commands.map((cmd) => (
                        <CommandButton
                          key={cmd.key}
                          cmd={cmd}
                          simPhoneNumber={simPhoneNumber}
                          deviceId={deviceId}
                          onSend={(params) => sendCommand.mutate(params)}
                          isSending={isSending}
                          defaultValue={DEFAULT_KEY_MAP[cmd.key] ? defaults[DEFAULT_KEY_MAP[cmd.key]] : undefined}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Command Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              Command History
              {commandLog.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {commandLog.length}
                </Badge>
              )}
            </CardTitle>
            {commandLog.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => clearLog.mutate()}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {commandLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No commands sent yet. Use the commands above to configure the device.
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-0">
                {[...commandLog].reverse().map((entry, i) => (
                  <CommandLogEntry key={i} entry={entry} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
