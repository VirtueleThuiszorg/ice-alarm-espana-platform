import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PartnerVerify() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [partnerName, setPartnerName] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setStatus("error");
        setErrorMessage("No verification token provided");
        return;
      }

      try {
        const response = await supabase.functions.invoke("partner-verify", {
          body: { token },
        });

        if (response.error) {
          throw new Error(response.error.message || "Verification failed");
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }

        setPartnerName(response.data?.partner?.contact_name || "Partner");
        setStatus("success");
      } catch (error) {
        console.error("Verification error:", error);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Verification failed");
      }
    };

    verifyToken();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
        <header className="p-6">
          <Logo />
        </header>

        <main className="flex-1 flex items-center justify-center px-4 pb-16">
          <Card className="max-w-md w-full text-center">
            <CardHeader>
              <div className="mx-auto">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle className="text-2xl">{t("partnerVerify.verifyingTitle", "Verifying Your Account")}</CardTitle>
              <CardDescription>
                {t("partnerVerify.verifyingDesc", "Please wait while we verify your email address...")}
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
        <header className="p-6">
          <Logo />
        </header>

        <main className="flex-1 flex items-center justify-center px-4 pb-16">
          <Card className="max-w-md w-full text-center">
            <CardHeader>
              <div className="mx-auto rounded-full bg-red-100 p-4 w-fit dark:bg-red-900">
                <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl">{t("partnerVerify.failedTitle", "Verification Failed")}</CardTitle>
              <CardDescription className="text-base">
                {errorMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If you believe this is an error, please contact our support team or try
                registering again.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => navigate("/partner/join")}>
                  Register Again
                </Button>
                <Button variant="ghost" onClick={() => navigate("/")}>
                  Return to Homepage
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      <header className="p-6">
        <Logo />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto rounded-full bg-green-100 p-4 w-fit dark:bg-green-900">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Welcome, {partnerName}!</CardTitle>
            <CardDescription className="text-base">
              Your partner account has been verified and activated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You can now log in to your partner dashboard to start referring customers
              and earning commissions.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate("/partner/login")}>
                Go to Partner Login
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")}>
                Return to Homepage
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
