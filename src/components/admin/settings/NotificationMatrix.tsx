import { Fragment, useState } from "react";
import { AlertTriangle, Loader2, Lock, Send, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNotificationMatrix } from "@/hooks/useNotificationMatrix";
import {
  CHANNEL_LABELS,
  EVENT_SPECS,
  GROUP_LABELS,
  GROUP_ORDER,
  NOTIFY_CHANNELS,
  cellState,
  isAlwaysOn,
  matrixView,
  prefEnabled,
  routeEnabled,
  specsByGroup,
  wouldReach,
} from "@/lib/notifyMatrix";

/**
 * WHO HEARS WHAT, AND ON WHAT.
 *
 * Two matrices, and the order matters. The top one is COMPANY POLICY (`notification_routes`,
 * event × channel): does a paid sale go out by SMS at all? The bottom one is the PERSON
 * (`staff_notification_prefs`): does Martijn want it. The router reads both, in that order,
 * after checking the channel is switched on and has credentials — so this screen is laid out in
 * the same order, and says which of the three stopped a notification.
 *
 * A SWITCH FLIPS A ROW, NEVER A REDEPLOY. That is the point of the tables.
 *
 * THE FOUR ARE NOT SWITCHES. `system.runner_failure` and the three `escalation.*` events are
 * sent regardless of both tables, because each one says the SAFETY MACHINERY ITSELF has failed
 * and no preference may silence the alarm that says the SOS ladder is broken. They render as
 * locked and always-on: a switch that changes nothing is a false affordance, and this is the
 * worst possible place for one.
 */

const STATE_STYLES: Record<string, string> = {
  on: "",
  always_on: "",
  off: "",
  on_but_dead: "opacity-50",
  off_and_dead: "opacity-50",
};

export function NotificationMatrix({ canEdit }: { canEdit: boolean }) {
  const {
    isLoading,
    error,
    routes,
    prefs,
    staff,
    flags,
    liveness,
    isSaving,
    setChannelFlag,
    setRoute,
    setPref,
    sendTest,
    isTesting,
    proven,
    schemaMissing,
  } = useNotificationMatrix();

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const selectedStaff = staff.find((s) => s.id === selectedStaffId) ?? staff[0] ?? null;

  // One decision, made in notifyMatrix.ts so it is testable: an empty grid must never be what
  // "not applied yet" or "could not be read" looks like.
  const view = matrixView({ isLoading, error, schemaMissing });

  if (view === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  if (view === "error") {
    // Never an empty grid on a failed read: "nothing is routed anywhere" is a true and
    // frightening statement, and it must not be what a broken query looks like.
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">These settings could not be read.</p>
            <p className="text-muted-foreground">{error?.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (view === "schema_missing") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not applied yet</CardTitle>
          <CardDescription>
            The notification tables are in a migration that has not been applied to production
            yet (<code>20260909120000_notify_staff.sql</code>). Until <code>supabase db push</code>{" "}
            runs, there is nothing to switch — the router treats every route as off, apart from the
            four alerts that say the safety machinery has failed. See PENDING_FOR_LEE.md.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── the channels themselves ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>
            Your switch, and whether the channel can actually send. Nothing below can send on a
            channel that is off here — including the four alerts that ignore every other switch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIFY_CHANNELS.map((channel) => {
            const state = liveness[channel];
            return (
              <div key={channel} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{CHANNEL_LABELS[channel]}</span>
                    {state.live ? (
                      <Badge variant="secondary">Live</Badge>
                    ) : state.reason === "switch_off" ? (
                      <Badge variant="outline">Off</Badge>
                    ) : state.reason === "no_credentials" ? (
                      <Badge variant="destructive">Not configured</Badge>
                    ) : (
                      <Badge variant="outline">Unproven</Badge>
                    )}
                  </div>
                  {state.detail && (
                    <p className="text-sm text-muted-foreground">{state.detail}</p>
                  )}
                </div>
                <Switch
                  checked={flags[channel] === true}
                  disabled={!canEdit || isSaving}
                  onCheckedChange={(on) => void setChannelFlag(channel, on)}
                  aria-label={`${CHANNEL_LABELS[channel]} on or off for everybody`}
                />
              </div>
            );
          })}

          {selectedStaff && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={isTesting || !canEdit}
                onClick={() => void sendTest(selectedStaff.id)}
              >
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Send a test notification to {selectedStaff.first_name}
              </Button>
              <p className="text-sm text-muted-foreground">
                {proven
                  ? "The badges above now come from the function that does the sending."
                  : "Push and email credentials are server-side. A test is the only way to prove them from here."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── company policy ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the company sends</CardTitle>
          <CardDescription>
            One switch per event and channel. This is policy for everybody; a person can still
            switch their own copy off below — except for the four locked rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">Event</TableHead>
                {NOTIFY_CHANNELS.map((channel) => (
                  <TableHead key={channel} className="text-center">
                    <span className={cn(!liveness[channel].live && "text-muted-foreground line-through")}>
                      {CHANNEL_LABELS[channel]}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {GROUP_ORDER.map((group) => (
                // Fragment WITH a key: a bare <> inside a map has no key, and React then
                // re-creates every row in the group on each render — which loses the focus ring
                // somebody is tabbing through nineteen rows of switches with.
                <Fragment key={group}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={1 + NOTIFY_CHANNELS.length} className="py-2 font-medium">
                      {GROUP_LABELS[group]}
                      {group === "safety" && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          always sent — no switch may silence these
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  {specsByGroup(group).map((spec) => (
                    <TableRow key={spec.event}>
                      <TableCell className="align-top">
                        <div className="font-medium">{spec.label}</div>
                        <div className="text-xs text-muted-foreground">{spec.detail}</div>
                        <code className="text-[10px] text-muted-foreground">{spec.event}</code>
                      </TableCell>
                      {NOTIFY_CHANNELS.map((channel) => {
                        const state = cellState(spec.event, channel, routes, liveness);
                        const locked = isAlwaysOn(spec.event);
                        return (
                          <TableCell key={channel} className={cn("text-center", STATE_STYLES[state])}>
                            {locked ? (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                                title="Sent regardless — this event says the safety machinery has failed."
                              >
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                always
                              </span>
                            ) : (
                              <Switch
                                checked={routeEnabled(routes, spec.event, channel)}
                                disabled={!canEdit || isSaving}
                                onCheckedChange={(on) => void setRoute(spec.event, channel, on)}
                                aria-label={`${spec.label} by ${CHANNEL_LABELS[channel]}`}
                              />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── one person ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">One person's own switches</CardTitle>
          <CardDescription>
            Their choice, within what the company sends. A row here cannot make a notification
            arrive that policy has switched off — so each cell says which gate stops it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={selectedStaff?.id ?? ""}
            onValueChange={(value) => setSelectedStaffId(value)}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Choose a member of staff" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.first_name} {member.last_name ?? ""} — {member.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedStaff && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[16rem]">Event</TableHead>
                    {NOTIFY_CHANNELS.map((channel) => (
                      <TableHead key={channel} className="text-center">
                        {CHANNEL_LABELS[channel]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {EVENT_SPECS.map((spec) => (
                    <TableRow key={spec.event}>
                      <TableCell className="align-top">
                        <div className="font-medium">{spec.label}</div>
                        <code className="text-[10px] text-muted-foreground">{spec.event}</code>
                      </TableCell>
                      {NOTIFY_CHANNELS.map((channel) => {
                        const verdict = wouldReach(spec.event, channel, {
                          routes,
                          prefs,
                          staffId: selectedStaff.id,
                          liveness,
                        });
                        const locked = isAlwaysOn(spec.event);
                        return (
                          <TableCell key={channel} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              {locked ? (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Lock className="h-3 w-3" aria-hidden="true" />
                                  always
                                </span>
                              ) : (
                                <Switch
                                  checked={prefEnabled(prefs, selectedStaff.id, spec.event, channel)}
                                  disabled={!canEdit || isSaving}
                                  onCheckedChange={(on) =>
                                    void setPref(selectedStaff.id, spec.event, channel, on)
                                  }
                                  aria-label={`${selectedStaff.first_name}: ${spec.label} by ${CHANNEL_LABELS[channel]}`}
                                />
                              )}
                              {/* WOULD THEY ACTUALLY BE TOLD — the question a matrix of
                                  switches otherwise leaves unanswered. */}
                              {!verdict.reach && (
                                <span className="text-[10px] text-muted-foreground">
                                  {verdict.blockedBy === "channel"
                                    ? "channel off"
                                    : verdict.blockedBy === "route"
                                      ? "not company policy"
                                      : "their choice"}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!canEdit && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Read-only: only an admin or super_admin can change these.
        </p>
      )}
    </div>
  );
}

export default NotificationMatrix;
