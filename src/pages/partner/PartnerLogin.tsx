import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Loader2, Handshake } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PARTNER_DASHBOARD_PATH } from "@/config/constants";
import { partnerLoginRefusal } from "@/lib/partnerLoginRefusal";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function PartnerLogin() {
  const { t } = useTranslation();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        throw authError;
      }

      // Check if this user is a partner
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, status")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (partnerError) {
        throw new Error("Failed to verify partner account");
      }

      if (!partner) {
        await supabase.auth.signOut();
        // The lookup above is by user_id, not email — an application row from
        // /partner has no user_id, so this is what its applicant sees. Worded to
        // match what actually happened rather than blaming the address.
        throw new Error(
          "No partner account is linked to this login yet. If you applied through the partner page, we will email you an invitation once your application is reviewed."
        );
      }

      // ALLOWLIST, not a denylist. get_user_role_info grants is_partner ONLY for
      // status='active', so anything else must be refused HERE with a reason the
      // partner can act on. The previous code denied only `pending` and
      // `suspended`, which let `invited` fall through: the login succeeded and
      // ProtectedRoute then bounced them to /unauthorized with no explanation.
      // `partner_status` already gained a fourth value once (`invited`,
      // 20260303160000), so a denylist here is a standing liability.
      if (partner.status !== "active") {
        await supabase.auth.signOut();
        throw new Error(partnerLoginRefusal(partner.status));
      }

      // Populate the role context BEFORE navigating. /partner-dashboard is
      // `ProtectedRoute requirePartner`, which reads isPartner/partnerId out of
      // AuthContext — not out of the `partners` row we just queried above. Without
      // this await, the redirect races AuthContext's onAuthStateChange listener and
      // ProtectedRoute can evaluate while isPartner is still false, bouncing a
      // legitimate partner to /unauthorized.
      //
      // It also covers the sticky case the listener cannot: it only refetches when
      // `session.user.id !== lastFetchedUserId.current`, so a partner whose role was
      // fetched earlier in this page load while still `pending` (get_user_role_info
      // gates is_partner on status='active') would never be re-read after
      // verification. refreshAuth forces the re-read.
      //
      // The staff and member login pages have always awaited refreshAuth here; this
      // page was the only one that did not.
      await refreshAuth();

      toast.success("Welcome back!");
      navigate(PARTNER_DASHBOARD_PATH);
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      <header className="p-6">
        <Logo />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit mb-2">
              <Handshake className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t("partnerLogin.title", "Partner Login")}</CardTitle>
            <CardDescription>
              {t("partnerLogin.subtitle", "Sign in to access your partner dashboard")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="your@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <p className="text-muted-foreground">
                Don't have a partner account?{" "}
                <Link to="/partner/join" className="text-primary hover:underline font-medium">
                  Join now
                </Link>
              </p>
            </div>

            <div className="mt-4 text-center">
              <Link to="/" className="text-sm text-muted-foreground hover:underline">
                Return to homepage
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
