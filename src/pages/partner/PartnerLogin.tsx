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
        throw new Error("No partner account found for this email. Please register first.");
      }

      if (partner.status === "pending") {
        await supabase.auth.signOut();
        throw new Error("Your account is pending verification. Please check your email for the verification link.");
      }

      if (partner.status === "suspended") {
        await supabase.auth.signOut();
        throw new Error("Your partner account has been suspended. Please contact support.");
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
