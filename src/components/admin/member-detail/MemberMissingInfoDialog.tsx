import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Lightbulb, Loader2, MapPin, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemberMissingInfo, useMemberMissingInfoRealtime } from "@/hooks/useMemberMissingInfo";
import {
  REQUIRED_GROUP_LABELS,
  REQUIRED_REASON_LABELS,
  groupRequiredFields,
} from "@/lib/memberRequiredFields";
import { MemberUpdateRequestModal } from "@/components/admin/member-detail/MemberUpdateRequestModal";

/**
 * WHAT IS MISSING, WHY IT MATTERS, AND ONE PRESS TO ASK FOR IT.
 *
 * THE COUNT IS THE POINT. A record with eleven gaps looks exactly like a complete one from the
 * outside: twelve tabs, all of them rendering, none of them saying anything is absent. The
 * badge is the only place the number appears before somebody goes looking.
 *
 * EVERY ITEM SAYS WHY, and the reason is data rather than a tooltip — the same sentence the
 * member sees on their own link. "We need your blood group" reads as bureaucracy; "read out to
 * the ambulance crew on arrival" is a reason somebody acts on, whether that somebody is the
 * member or the staff member deciding whether to chase it today.
 *
 * WHAT ONLY WE CAN DO IS SHOWN AND NOT TICKABLE. A pendant that has never been tested is a gap
 * on this list — it is the most dangerous one — but it is not something to ask the member for
 * on a form. It is a phone call we owe them.
 */
interface MemberMissingInfoDialogProps {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    nie_dni: string | null;
    address_line_2: string | null;
    preferred_language: string | null;
  };
}

export function MemberMissingInfoDialog({ member }: MemberMissingInfoDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);

  // The badge needs the count before anybody opens anything, so this read is NOT gated on the
  // dialog: a number nobody can see until they click is not a warning.
  const { data, isLoading } = useMemberMissingInfo(member.id);
  // The member answers on their own phone; the badge must move without a page reload.
  useMemberMissingInfoRealtime(member.id);
  const missing = data?.missing ?? [];
  const count = data?.count ?? 0;
  /*
    SUGGESTIONS, NOT GAPS. `recommended` is deliberately NOT part of `count` — see
    MEMBER_RECOMMENDED_FIELDS. It is also NOT pre-ticked and NOT sendable: the one item on it is
    the home-location pin, and the member sets that from their own dashboard, signed in. Putting
    a map picker behind an anonymous update-link token would let whoever holds that link decide
    where an ambulance is sent, which is a different conversation from a postal address.
  */
  const recommended = data?.recommended ?? [];
  const askable = missing.filter((f) => f.memberCanSupply);

  useEffect(() => {
    // Pre-ticked, as the brief asks: the common case is "ask for all of it".
    setTicked(askable.map((f) => f.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askable.map((f) => f.key).join(",")]);

  const toggle = (key: string) =>
    setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="member-missing-trigger">
            <AlertTriangle
              className={`mr-2 h-4 w-4 ${count > 0 ? "text-alert-battery" : "text-muted-foreground"}`}
            />
            {t("adminMemberDetail.missing.open", "Missing info")}
            {isLoading ? null : (
              <Badge
                variant={count > 0 ? "destructive" : "secondary"}
                className="ml-2"
                data-testid="member-missing-count"
              >
                {count}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("adminMemberDetail.missing.title", "Missing from {{name}}'s record", {
                name: `${member.first_name} ${member.last_name}`,
              })}
            </DialogTitle>
            <DialogDescription>
              {t(
                "adminMemberDetail.missing.subtitle",
                "Required for monitoring, billing or our legal obligations. Everything else is optional and not counted here.",
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : count === 0 && recommended.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Check className="h-12 w-12 text-alert-resolved mb-4" />
              <p className="font-medium">
                {t("adminMemberDetail.missing.none", "Nothing required is missing")}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[55vh] pr-4">
              <div className="space-y-5">
                {count === 0 && (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Check className="h-5 w-5 shrink-0 text-alert-resolved" />
                    <p className="text-sm font-medium">
                      {t("adminMemberDetail.missing.none", "Nothing required is missing")}
                    </p>
                  </div>
                )}
                {groupRequiredFields(missing).map(({ group, fields }) => (
                  <section key={group} data-testid={`member-missing-group-${group}`}>
                    <h3 className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(REQUIRED_GROUP_LABELS[group].key, REQUIRED_GROUP_LABELS[group].fallback)}
                    </h3>
                    <div className="space-y-3">
                      {fields.map((field) => (
                        <div
                          key={field.key}
                          className="flex gap-3"
                          data-testid={`member-missing-${field.key}`}
                        >
                          <Checkbox
                            id={`missing-${field.key}`}
                            className="mt-1"
                            checked={ticked.includes(field.key)}
                            disabled={!field.memberCanSupply}
                            onCheckedChange={() => toggle(field.key)}
                          />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <label
                                htmlFor={`missing-${field.key}`}
                                className="text-sm font-medium"
                              >
                                {t(field.label.key, field.label.fallback)}
                              </label>
                              <Badge variant="secondary" className="text-xs">
                                {t(
                                  REQUIRED_REASON_LABELS[field.why].key,
                                  REQUIRED_REASON_LABELS[field.why].fallback,
                                )}
                              </Badge>
                              {field.memberCanSupply ? null : (
                                <Badge variant="outline" className="text-xs">
                                  {t("adminMemberDetail.missing.ours", "Ours to do")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {t(field.because.key, field.because.fallback)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                {recommended.length > 0 && (
                  <section data-testid="member-recommended">
                    <h3 className="mb-2 flex items-center gap-1.5 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("adminMemberDetail.missing.suggested", "Worth having (not required)")}
                    </h3>
                    <div className="space-y-3">
                      {recommended.map((field) => (
                        <div
                          key={field.key}
                          className="flex gap-3"
                          data-testid={`member-recommended-${field.key}`}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {t(field.label.key, field.label.fallback)}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {t(
                                  REQUIRED_REASON_LABELS[field.why].key,
                                  REQUIRED_REASON_LABELS[field.why].fallback,
                                )}
                              </Badge>
                              {/*
                                NO CHECKBOX, and the badge says where it happens instead. This
                                cannot travel on the update link: that link needs no login, and a
                                map picker behind it would let whoever holds it decide where an
                                ambulance is sent.
                              */}
                              <Badge variant="outline" className="text-xs">
                                {t("adminMemberDetail.missing.onDashboard", "They set this on their own dashboard")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {t(field.because.key, field.because.fallback)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.close", "Close")}
            </Button>
            <Button
              onClick={() => setAskOpen(true)}
              disabled={ticked.length === 0}
              data-testid="member-missing-send"
            >
              <Send className="mr-2 h-4 w-4" />
              {t("adminMemberDetail.missing.send", "Send to member")} ({ticked.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        The send flow is the existing one, handed the selection made here — same endpoint, same
        one-time token, same link panel. A second sender would be a second place for the link
        to stop being shown.
      */}
      <MemberUpdateRequestModal
        open={askOpen}
        onOpenChange={setAskOpen}
        member={member}
        preselectedFields={ticked}
        onSent={() => {
          // The badge is re-read on submit, and again when the member actually sends their
          // answers back — a count that only changes on a page reload is a count staff stop
          // believing.
          queryClient.invalidateQueries({ queryKey: ["member-missing-info", member.id] });
          queryClient.invalidateQueries({ queryKey: ["members-missing-counts"] });
        }}
      />
    </>
  );
}
