import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ShieldX, ArrowLeft, Home } from "lucide-react";

export default function Unauthorized() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <Logo size="md" />
          </Link>
        </div>

        <Card className="border-destructive/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">{t("auth.unauthorized.title")}</CardTitle>
            <CardDescription>
              {t("auth.unauthorized.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              {t("auth.unauthorized.contactAdmin")}
            </p>
            
            <div className="flex flex-col gap-2">
              <Button asChild variant="default" className="w-full">
                <Link to="/">
                  <Home className="mr-2 h-4 w-4" />
                  {t("auth.unauthorized.goHome")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("auth.unauthorized.backToLogin")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
