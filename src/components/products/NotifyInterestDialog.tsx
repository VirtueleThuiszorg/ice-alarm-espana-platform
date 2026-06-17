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
import { buildProductInterestLead, isValidEmail } from "@/lib/productInterest";

interface NotifyInterestDialogProps {
  productName: string;
  /** Button size, to match the surrounding layout. */
  size?: "sm" | "default";
  variant?: "outline" | "default";
}

/**
 * "Notify Me" for coming-soon products. Captures email interest into the `leads` table
 * (tagged product_interest) and shows a confirmation. Used on the products listing (inside
 * a card Link, hence the propagation guard) and the product detail page.
 */
export function NotifyInterestDialog({ productName, size = "sm", variant = "outline" }: NotifyInterestDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("products.notify.error", "Something went wrong. Please try again."));
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from("leads")
        .insert(buildProductInterestLead(productName, email));
      if (insertError) throw insertError;
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
