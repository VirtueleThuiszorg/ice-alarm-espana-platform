import { useState } from "react";
import { Link } from "react-router-dom";
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
import { LanguageSelector } from "@/components/LanguageSelector";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setSentEmail(values.email);
      setEmailSent(true);
      toast.success(t("auth.resetLinkSent", "Password reset link sent!"));
    } catch {
      toast.error(t("errors.unexpectedError", "An unexpected error occurred"));
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
            {emailSent ? (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto rounded-full bg-emerald-500/10 p-4 w-fit mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.checkYourEmail", "Check Your Email")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base">
                    {t("auth.resetEmailSentTo", "We've sent a password reset link to")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-6">
                  <p className="font-medium text-foreground bg-muted rounded-lg py-3 px-4">
                    {sentEmail}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("auth.checkSpam", "Didn't receive it? Check your spam folder or try again.")}
                  </p>
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setEmailSent(false);
                        form.reset();
                      }}
                    >
                      {t("auth.tryAgain", "Try Again")}
                    </Button>
                    <Link to="/login" className="block">
                      <Button variant="ghost" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t("auth.unauthorized.backToLogin", "Back to Login")}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit mb-4">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.forgotPassword", "Forgot Password?")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base">
                    {t("auth.forgotPasswordDesc", "Enter your email and we'll send you a link to reset your password.")}
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
                            <FormLabel>{t("auth.email", "Email")}</FormLabel>
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

                      <Button type="submit" className="w-full h-11 font-semibold" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("common.sending", "Sending...")}
                          </>
                        ) : (
                          t("auth.sendResetLink", "Send Reset Link")
                        )}
                      </Button>
                    </form>
                  </Form>

                  <div className="mt-6 text-center">
                    <Link
                      to="/login"
                      className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      {t("auth.unauthorized.backToLogin", "Back to Login")}
                    </Link>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
