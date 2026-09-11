import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableCard } from "@/components/EditableCard";
import { useLegacyBillingDate } from "@/hooks/useLegacyBillingDate";
import { nextRenewalFrom } from "@/lib/legacyBillingSchedule";

/**
 * WHEN SANTANDER TAKES THIS MEMBER'S MONEY — the only screen that can say so.
 *
 * The import derives this where Karma wrote it down. For everybody else it is a phone call or a
 * bank statement, and until somebody types it in, the billing-migration runner cannot time this
 * member's switch link: send it before their debit and they pay twice that month, send it after
 * and Stripe bills a month they have already paid Santander for. So a missing date is not a
 * cosmetic gap — it is a member who never gets moved.
 *
 * ── WHY TWO FIELDS AND NOT ONE ────────────────────────────────────────────────
 *
 * The DAY is the member's, permanently: "the 31st" is what their standing order says, and it
 * stays 31 through February. The DATE is when the next one actually falls, which is not always
 * the day — a 31st member's November debit is the 30th, and the office sometimes knows a debit
 * was missed and the next one is further out than the arithmetic says.
 *
 * Storing only the date would lose the 31 the first time it landed in a short month; storing
 * only the day would make this screen unable to record what the office actually knows. So both,
 * with the date FILLED IN from the day as you type it — the common case needs one number typed
 * and the other appears, and the rare case can be corrected.
 */
export function LegacyBillingDateCard({
  memberId,
  billingSource,
  billingDay,
  nextRenewal,
  onSaved,
}: {
  memberId: string;
  billingSource: string | null;
  billingDay: number | null;
  nextRenewal: string | null;
  onSaved?: () => void;
}) {
  const save = useLegacyBillingDate();
  const [day, setDay] = useState(billingDay === null ? "" : String(billingDay));
  const [date, setDate] = useState(nextRenewal ?? "");

  useEffect(() => {
    setDay(billingDay === null ? "" : String(billingDay));
    setDate(nextRenewal ?? "");
  }, [billingDay, nextRenewal]);

  /*
    A member Stripe bills has no Santander date, and asking for one would be asking staff to
    invent it. Rendered nowhere rather than rendered empty: an empty field on a record is a
    question, and this one has no answer.
  */
  if (billingSource !== "legacy") return null;

  const parsedDay = day.trim() === "" ? null : Number(day.trim());
  const dayValid = parsedDay === null || (Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31);
  const isDirty =
    (parsedDay ?? null) !== billingDay || (date || null) !== (nextRenewal ?? null);

  const onDayChange = (raw: string) => {
    setDay(raw);
    const n = raw.trim() === "" ? null : Number(raw.trim());
    if (n === null) {
      setDate("");
      return;
    }
    if (Number.isInteger(n) && n >= 1 && n <= 31) {
      // The arithmetic, so the common case is one number typed. Overwritable below.
      setDate(nextRenewalFrom(n, new Date()));
    }
  };

  const onSave = async () => {
    if (!dayValid) {
      toast.error("The billing day must be a day of the month, between 1 and 31.");
      return false;
    }
    if (parsedDay !== null && !date) {
      toast.error("A next debit date is needed alongside the billing day.");
      return false;
    }
    try {
      const result = await save.mutateAsync({
        memberId,
        day: parsedDay,
        nextRenewal: parsedDay === null ? null : date,
        previous: { day: billingDay, nextRenewal },
      });
      if (result.logged) {
        toast.success(
          parsedDay === null ? "Billing date cleared." : "Billing date saved.",
        );
      } else {
        // The change is real and unrecorded — the one state the audit row exists to prevent.
        toast.warning(
          "Saved, but it could NOT be recorded in the activity log. Note the change by hand.",
        );
      }
      onSaved?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The billing date could not be saved.");
      return false;
    }
  };

  return (
    <EditableCard
      testId="legacy-billing-date-card"
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Santander billing date
        </span>
      }
      description="When this member's payment leaves their bank. The billing migration times their Stripe switch link to it."
      headerExtra={
        billingDay === null ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            Needs a billing date
          </Badge>
        ) : (
          <Badge variant="outline">
            {nextRenewal ? `Next debit ${format(new Date(nextRenewal), "PPP")}` : `Day ${billingDay}`}
          </Badge>
        )
      }
      isDirty={isDirty}
      saving={save.isPending}
      onSave={onSave}
      onCancel={() => {
        setDay(billingDay === null ? "" : String(billingDay));
        setDate(nextRenewal ?? "");
      }}
      emptyState={billingDay === null}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="legacy-billing-day">Day of the month</Label>
          <Input
            id="legacy-billing-day"
            data-testid="legacy-billing-day"
            inputMode="numeric"
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            placeholder="e.g. 15"
            aria-invalid={!dayValid}
            aria-describedby="legacy-billing-day-hint"
          />
          <p id="legacy-billing-day-hint" className="text-xs text-muted-foreground">
            1–31. Leave it blank if nobody knows yet — the member stays in the “needs a billing
            date” list rather than getting a guessed one.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="legacy-next-renewal">Next debit</Label>
          <Input
            id="legacy-next-renewal"
            data-testid="legacy-next-renewal"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby="legacy-next-renewal-hint"
          />
          <p id="legacy-next-renewal-hint" className="text-xs text-muted-foreground">
            Filled in from the day above. Change it if the office knows the next one falls
            elsewhere — a 31st member's November debit is the 30th.
          </p>
        </div>
      </div>
    </EditableCard>
  );
}
