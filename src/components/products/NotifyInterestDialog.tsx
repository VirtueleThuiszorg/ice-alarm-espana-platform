import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isValidEmail } from "@/lib/productInterest";
import { readPublicSubmitRefusal } from "@/lib/publicSubmit";

interface NotifyInterestDialogProps {
  productName: string;
  /** Button size, to match the surrounding layout. */
  size?: "sm" | "default";
  variant?: "outline" | "default";
}

/**
 * "Notify Me" for coming-soon products. Captures email interest as a `product_interest` lead and
 * shows a confirmation. Used on the products listing (inside a card Link, hence the propagation
 * guard) and the product detail page.
 *
 * THROUGH `public-submit`, NOT STRAIGHT INTO THE TABLE. This used to insert into `leads` from the
 * browser with the anon key. The client-side `isValidEmail` below is kept — it saves a round trip
 * and shows the error instantly — but it is a convenience, not the rule: the rule is
 * `isPublicEmail` on the server, which is the only one a script POSTing at the endpoint meets.
 * Taking the browser off the table is the first half; the anon INSERT policy that let it write
 * there is revoked in the migration that follows, once this is deployed.
 *
 * ONE FIELD, on purpose. Asking for a phone number to tell somebody a product is back would lose
 * most of the people who would otherwise ask.
 */
export function NotifyInterestDialog({ productName, size = "sm", variant = "outline" }: NotifyInterestDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The hidden field a script fills and a person cannot see. See ContactPage for the reasoning. */
  const [honeypot, setHoneypot] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("products.notify.error", "Something went wrong. Please try again."));
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("public-submit", {
        body: {
          form: "product_interest",
          fields: { email, product_name: productName },
          company: honeypot,
        },
      });
      if (fnError) {
        const refusal = await readPublicSubmitRefusal(fnError);
        setError(
          refusal.rateLimited
            ? t(
                "products.notify.tooMany",
                "You have asked a few times already. Please wait a little.",
              )
            : t("products.notify.error", "Something went wrong. Please try again."),
        );
        return;
      }
      if (!data?.ok) throw new Error("public-submit did not confirm the submission");
      setSubmitted(true);
    } catch {
      setError(t("products.notify.error", "Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="gap-2"
          // The listing renders this inside a card <Link> — don't navigate on click.
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <Bell className="h-4 w-4" /> {t("products.notifyMe", "Notify Me")}
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        {submitted ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-status-active mx-auto mb-3" />
            <p className="font-medium">{t("products.notify.success", "Thanks! We'll be in touch when it's ready.")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Invisible to the eye and to a screen reader; a script fills it, a person cannot. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="notify-company">Company</label>
              <input
                id="notify-company"
                name="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                data-testid="notify-honeypot"
              />
            </div>
            <DialogHeader>
              <DialogTitle>{t("products.notify.title", "Get notified")}</DialogTitle>
              <DialogDescription>
                {t("products.notify.description", "Enter your email and we'll let you know when {{product}} is available.", { product: productName })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="notify-email">{t("products.notify.emailLabel", "Email address")}</Label>
              <Input
                id="notify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("products.notify.submit", "Notify me")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
