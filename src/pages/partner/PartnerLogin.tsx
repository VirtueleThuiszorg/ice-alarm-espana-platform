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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function PartnerLogin() {
  const { t } = useTranslation();
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

      toast.success("Welcome back!");
      navigate("/partner-dashboard");
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
