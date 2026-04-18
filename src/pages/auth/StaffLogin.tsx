import { useState } from "react";
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
import { Loader2, ArrowLeft, Shield, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

export default function StaffLogin() {
  const { refreshAuth } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/admin";

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [pendingStaffData, setPendingStaffData] = useState<{
    role: string;
  } | null>(null);

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

  const completeLogin = async (staffRole: string) => {
    await refreshAuth();
    toast.success(t("auth.loginTitle"));

    if (staffRole === "call_centre") {
      navigate("/call-centre");
    } else {
      navigate(from.startsWith("/admin") ? from : "/admin");
    }
  };

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
        const { data: staffData, error: staffError } = await supabase
          .from("staff")
          .select("id, role, is_active")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (staffError || !staffData) {
          await supabase.auth.signOut();
          toast.error(t("auth.errors.accessDenied"));
          return;
        }

        if (!staffData.is_active) {
          await supabase.auth.signOut();
          toast.error(t("auth.errors.accountDeactivated"));
          return;
        }

        // Check for 2FA factors
        const { data: mfaData } = await supabase.auth.mfa.listFactors();
        const verifiedFactors = (mfaData?.totp || []).filter(
          (f) => (f.status as string) === "verified"
        );

        if (verifiedFactors.length > 0) {
          // User has 2FA enabled — require TOTP verification
          setTotpFactorId(verifiedFactors[0].id);
          setPendingStaffData({ role: staffData.role });
          setNeeds2FA(true);
          return;
        }

        // No 2FA — for admin/super_admin, redirect to 2FA setup
        if (["admin", "super_admin"].includes(staffData.role)) {
          await refreshAuth();
          toast.info(
            t("auth.twoFactorRequired") ||
              "Two-factor authentication is required for admin accounts. Please set it up now."
          );
          navigate("/admin/settings?setup2fa=true");
          return;
        }

        // Non-admin without 2FA — allow login
        await completeLogin(staffData.role);
      }
    } catch (error) {
      toast.error(t("errors.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpVerify = async () => {
    if (!totpFactorId || !totpCode || totpCode.length !== 6) {
      toast.error(t("auth.twoFactorInvalid") || "Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      // Create challenge
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactorId });

      if (challengeError) {
        toast.error(challengeError.message);
        return;
      }

      // Verify
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactorId,
        challengeId: challenge.id,
        code: totpCode,
      });

      if (verifyError) {
        toast.error(t("auth.twoFactorInvalid") || "Invalid verification code");
        setTotpCode("");
        return;
      }

      // 2FA verified — complete login
      if (pendingStaffData) {
        await completeLogin(pendingStaffData.role);
      }
    } catch (error) {
      toast.error(t("errors.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="inline-block">
            <Logo size="md" />
          </Link>
          <LanguageSelector />
        </div>

        <Card className="border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              {needs2FA ? (
                <KeyRound className="h-6 w-6 text-primary" />
              ) : (
                <Shield className="h-6 w-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {needs2FA
                ? (t("auth.twoFactorTitle") || "Two-Factor Authentication")
                : t("auth.staffLogin")}
            </CardTitle>
            <CardDescription>
              {needs2FA
                ? (t("auth.twoFactorDesc") || "Enter the 6-digit code from your authenticator app")
                : t("auth.staffLoginDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {needs2FA ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp-code">
                    {t("auth.verificationCode") || "Verification Code"}
                  </Label>
                  <Input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleTotpVerify();
                      }
                    }}
                    className="text-center text-2xl tracking-widest"
                    autoFocus
                  />
                </div>

                <Button
                  onClick={handleTotpVerify}
                  className="w-full"
                  disabled={isLoading || totpCode.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("auth.verifying") || "Verifying..."}
                    </>
                  ) : (
                    t("auth.verify") || "Verify"
                  )}
                </Button>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setNeeds2FA(false);
                    setTotpCode("");
                    setTotpFactorId(null);
                    setPendingStaffData(null);
                    supabase.auth.signOut();
                  }}
                >
                  {t("common.cancel") || "Cancel"}
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.email")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="staff@icealarm.es"
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
                        <FormLabel>{t("auth.password")}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoading}>
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
            )}

            <div className="mt-6 text-center">
              <Link
                to="/"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t("auth.backToHome")}
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          {t("auth.memberQuestion")}{" "}
          <Link to="/login" className="text-primary hover:underline">
            {t("auth.loginHere")}
          </Link>
        </p>
      </div>
    </div>
  );
}
