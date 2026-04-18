import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { Loader2, KeyRound, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      const hash = window.location.hash;
      if (hash && hash.includes("type=recovery")) {
        setIsValid(true);
      } else if (sessionStorage.getItem('isRecoveryFlow') === 'true') {
        sessionStorage.removeItem('isRecoveryFlow');
        setIsValid(true);
      } else {
        // Also check if there's already a session (user clicked link)
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setIsValid(true);
        }
      }
      setIsChecking(false);
    };
    checkSession();

    // Listen for auth events (recovery link click)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValid(true);
        setIsChecking(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setSuccess(true);
      toast.success(t("auth.passwordUpdated", "Password updated successfully!"));
      
      // Sign out and redirect to login after 3 seconds
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login");
      }, 3000);
    } catch {
      toast.error(t("errors.unexpectedError", "An unexpected error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-accent/20">
      <header className="flex items-center p-6">
        <Link to="/" className="inline-block">
          <Logo size="md" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl shadow-primary/5">
            {success ? (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto rounded-full bg-emerald-500/10 p-4 w-fit mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.passwordUpdated", "Password Updated!")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base">
                    {t("auth.redirectingToLogin", "Your password has been reset. Redirecting you to login...")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Link to="/login">
                    <Button variant="outline" className="w-full">
                      {t("auth.unauthorized.backToLogin", "Back to Login")}
                    </Button>
                  </Link>
                </CardContent>
              </>
            ) : !isValid ? (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto rounded-full bg-destructive/10 p-4 w-fit mb-4">
                    <KeyRound className="h-8 w-8 text-destructive" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.invalidResetLink", "Invalid or Expired Link")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base">
                    {t("auth.invalidResetLinkDesc", "This password reset link is invalid or has expired. Please request a new one.")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Link to="/forgot-password">
                    <Button className="w-full">
                      {t("auth.requestNewLink", "Request New Link")}
                    </Button>
                  </Link>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit mb-4">
                    <KeyRound className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.setNewPassword", "Set New Password")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base">
                    {t("auth.setNewPasswordDesc", "Choose a strong password for your account.")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("auth.newPassword", "New Password")}</FormLabel>
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

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("auth.confirmPassword", "Confirm Password")}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showConfirm ? "text" : "password"}
                                  placeholder="••••••••"
                                  className="h-11 pr-10"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowConfirm(!showConfirm)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                            {t("auth.updatingPassword", "Updating...")}
                          </>
                        ) : (
                          t("auth.resetPassword", "Reset Password")
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
