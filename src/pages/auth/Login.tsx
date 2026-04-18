import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Loader2, ArrowLeft, Shield, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { t } = useTranslation();
  const { refreshAuth, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  // If user is already authenticated via a recovery link, redirect to reset-password
  useEffect(() => {
    if (user && window.location.hash.includes('type=recovery')) {
      navigate('/reset-password', { replace: true });
    }
  }, [user, navigate]);

  const loginSchema = z.object({
    email: z.string().email(t("validation.invalidEmail")),
    password: z.string().min(6, t("validation.passwordMin")),
  });

  type LoginFormValues = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.user) {
        // Check if user is staff first - redirect them to staff login
        const { data: staffData } = await supabase
          .from("staff")
          .select("id, role, is_active")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (staffData && staffData.is_active) {
          await refreshAuth();
          toast.success(t("auth.loginTitle"));
          if (staffData.role === "call_centre") {
            navigate("/call-centre");
          } else {
            navigate("/admin");
          }
          return;
        }

        // Check if user is a member
        const { data: memberData } = await supabase
          .from("members")
          .select("id")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (memberData) {
          await refreshAuth();
          toast.success(t("auth.loginTitle"));
          navigate(from);
        } else {
          toast.info(t("auth.registerSubtitle"));
          navigate("/complete-registration");
        }
      }
    } catch (error) {
      toast.error(t("errors.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
      <header className="flex items-center justify-between p-6">
        <Link to="/" className="inline-block">
          <Logo size="md" />
        </Link>
        <LanguageSelector />
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl shadow-primary/5">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">
                {t("auth.memberLogin")}
              </CardTitle>
              <CardDescription className="mt-1 text-base">
                {t("auth.memberLoginDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.email")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            className="h-11"
                            {...field}
                          />
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
                        <div className="flex items-center justify-between">
                          <FormLabel>{t("auth.password")}</FormLabel>
                          <Link
                            to="/forgot-password"
                            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                          >
                            {t("auth.forgotPassword")}
                          </Link>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="h-11 pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full h-11 font-semibold" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("auth.signingIn")}
                      </>
                    ) : (
                      t("common.signIn")
                    )}
                  </Button>
                </form>
              </Form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {t("auth.orContinueWith", "or")}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Link to="/join" className="block">
                  <Button variant="outline" className="w-full h-11">
                    {t("auth.noAccount")}{" "}
                    <span className="font-semibold text-primary ml-1">{t("common.joinNow")}</span>
                  </Button>
                </Link>
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/"
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t("auth.backToHome")}
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Staff & Partner login links */}
          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
            <Link to="/staff/login" className="hover:text-foreground transition-colors">
              {t("auth.staffMember")} {t("auth.loginHere")}
            </Link>
            <span className="text-border">•</span>
            <Link to="/partner/login" className="hover:text-foreground transition-colors">
              {t("auth.partnerLogin", "Partner Login")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
