import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { logActivity } from "@/lib/auditLog";
import {
  ASYNC_EVENTS_CONFIRMED_KEY,
  CHECKOUT_PAYMENT_METHODS_KEY,
  SUPPORTED_PAYMENT_METHODS,
  ALWAYS_OFFERED,
  isAsyncPaymentMethod,
  isMethodSelectable,
  normaliseSelection,
  parseCheckoutPaymentMethods,
  type CheckoutPaymentMethod,
} from "../../../../supabase/functions/_shared/checkout-payment-methods";

/**
 * WHAT A CUSTOMER MAY PAY WITH — and why three of the four are locked until you say so.
 *
 * THE DEFECT THIS CLOSES. Neither checkout function set `payment_method_types`, so Stripe's
 * DASHBOARD defaults decided, and in the EEA that means SEPA Direct Debit sits next to the card.
 * A SEPA checkout completes with `payment_status: "unpaid"` — the mandate is signed, the money
 * is days away — and activation depends on `checkout.session.async_payment_succeeded`. Unless
 * that event is enabled on the webhook destination, THE CUSTOMER PAYS AND IS NEVER ACTIVATED,
 * with no error anywhere: the webhook logs "waiting for payment" and stops.
 *
 * SO THE ASYNC METHODS ARE GREYED, WITH THE REASON WRITTEN OUT, until an admin ticks the
 * acknowledgement. There is no API that reports which events a destination subscribes to, so
 * the honest design is to ask, record who said yes, and audit it — not to guess.
 *
 * Card cannot be unticked. A checkout with no payment methods is not a checkout.
 */

const LABELS: Record<CheckoutPaymentMethod, { name: string; detail: string }> = {
  card: { name: "Card", detail: "Settles immediately. Always offered." },
  sepa_debit: {
    name: "SEPA Direct Debit",
    detail: "Common in Spain, and asynchronous: the money arrives days after checkout.",
  },
  bancontact: { name: "Bancontact", detail: "Belgium. Can fall back to a delayed flow." },
  ideal: { name: "iDEAL", detail: "Netherlands. Can fall back to a delayed flow." },
};

export function CheckoutPaymentMethodsCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CheckoutPaymentMethod[]>([ALWAYS_OFFERED]);
  const [confirmed, setConfirmed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["checkout-payment-methods"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [CHECKOUT_PAYMENT_METHODS_KEY, ASYNC_EVENTS_CONFIRMED_KEY]);
      if (error) throw error;
      const value = (key: string) => rows?.find((r) => r.key === key)?.value ?? null;
      return {
        methods: parseCheckoutPaymentMethods(value(CHECKOUT_PAYMENT_METHODS_KEY)),
        asyncEventsConfirmed: value(ASYNC_EVENTS_CONFIRMED_KEY) === "true",
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setSelected(data.methods);
    setConfirmed(data.asyncEventsConfirmed);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: { methods: CheckoutPaymentMethod[]; asyncEventsConfirmed: boolean }) => {
      // The acknowledgement is applied HERE too, not only by the disabled attribute: a stale tab
      // must not be able to enable SEPA while the destination is deaf.
      const methods = normaliseSelection(next.methods, next.asyncEventsConfirmed);

      // `service: "checkout"`, NOT "settings", and the card did nothing at all until this line
      // was right. `save-api-keys` prefixes every key with `${service}_` unless the key already
      // starts with it, so `service: "settings"` stored these two as
      // `settings_checkout_payment_methods` / `settings_checkout_async_events_confirmed` — names
      // nothing reads. The switches saved, said "Checkout offers: …", and changed nothing:
      // `_shared/checkout-payment-methods.ts` and this card's own read both look for the
      // unprefixed rows. Same convention as HolidayPolicyCard — the service must match the
      // family the keys belong to. Pinned by src/test/settingsKeyParity.test.ts.
      const { error } = await supabase.functions.invoke("save-api-keys", {
        body: {
          service: "checkout",
          keys: {
            [CHECKOUT_PAYMENT_METHODS_KEY]: methods.join(","),
            [ASYNC_EVENTS_CONFIRMED_KEY]: String(next.asyncEventsConfirmed),
          },
        },
      });
      if (error) throw await functionError(error, "Could not save the payment methods");

      // Audited with both values: "who turned SEPA on" is the first question after a customer
      // pays and is not activated.
      await logActivity({
        action: "update",
        entityType: "settings",
        entityId: CHECKOUT_PAYMENT_METHODS_KEY,
        oldValues: {
          methods: data?.methods.join(",") ?? "",
          asyncEventsConfirmed: data?.asyncEventsConfirmed ?? false,
        },
        newValues: { methods: methods.join(","), asyncEventsConfirmed: next.asyncEventsConfirmed },
      });
      return methods;
    },
    onSuccess: (methods) => {
      setSelected(methods);
      void queryClient.invalidateQueries({ queryKey: ["checkout-payment-methods"] });
      toast.success(`Checkout offers: ${methods.join(", ")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (method: CheckoutPaymentMethod, on: boolean) => {
    setSelected((prev) => (on ? [...new Set([...prev, method])] : prev.filter((m) => m !== method)));
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          Checkout payment methods
        </CardTitle>
        <CardDescription>
          What <code>/join</code> and a staff payment link offer. Without this, Stripe's dashboard
          defaults decide — and those include methods whose money arrives days later.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <>
            {SUPPORTED_PAYMENT_METHODS.map((method) => {
              const gate = isMethodSelectable(method, confirmed);
              const locked = method === ALWAYS_OFFERED;
              return (
                <div key={method} className="flex items-start gap-3">
                  <Checkbox
                    id={`pm-${method}`}
                    className="mt-0.5"
                    checked={locked || selected.includes(method)}
                    disabled={locked || !gate.selectable || !canEdit || save.isPending}
                    onCheckedChange={(value) => toggle(method, value === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`pm-${method}`} className="flex items-center gap-2">
                      {LABELS[method].name}
                      {locked && <Badge variant="secondary">always on</Badge>}
                      {isAsyncPaymentMethod(method) && (
                        <Badge variant="outline">asynchronous</Badge>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">{LABELS[method].detail}</p>
                    {/* The reason, on the control itself. A greyed checkbox with no explanation
                        is a control somebody assumes is broken. */}
                    {!gate.selectable && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">{gate.reason}</p>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="async-confirmed"
                    className="mt-0.5"
                    checked={confirmed}
                    disabled={!canEdit || save.isPending}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                  />
                  <Label htmlFor="async-confirmed" className="font-medium">
                    Async events confirmed
                  </Label>
                </div>
                <p className="text-sm">
                  Tick this only once the Stripe webhook destination is subscribed to{" "}
                  <code>checkout.session.async_payment_succeeded</code> and{" "}
                  <code>checkout.session.failed</code>. Until then an asynchronous method means a
                  customer who pays and is <strong>never activated</strong>, with no error
                  anywhere.
                </p>
              </div>
            </div>

            <Button
              onClick={() => save.mutate({ methods: selected, asyncEventsConfirmed: confirmed })}
              disabled={!canEdit || save.isPending}
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save payment methods
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CheckoutPaymentMethodsCard;
