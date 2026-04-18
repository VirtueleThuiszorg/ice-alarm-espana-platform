import { useState } from "react";
import { Phone, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CallMeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;
  defaultName?: string;
  defaultLanguage?: "en" | "es";
  conversationId?: string | null;
}

type CallStatus = "idle" | "calling" | "success" | "error";

export function CallMeModal({
  open,
  onOpenChange,
  defaultPhone = "",
  defaultName = "",
  defaultLanguage = "es",
  conversationId = null,
}: CallMeModalProps) {
  const { t } = useTranslation();
  const [callerName, setCallerName] = useState(defaultName);
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone);
  const [language, setLanguage] = useState<"en" | "es">(defaultLanguage);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const validatePhone = (phone: string): boolean => {
    const cleanPhone = phone.replace(/\s/g, "");
    return /^\+[0-9]{8,15}$/.test(cleanPhone);
  };

  const handleRequestCall = async () => {
    if (!validatePhone(phoneNumber)) {
      toast({
        title: t("callMe.invalidPhone", "Invalid phone number"),
        description: t(
          "callMe.invalidPhoneDesc",
          "Please enter a valid phone number starting with + (e.g., +34612345678)"
        ),
        variant: "destructive",
      });
      return;
    }

    setStatus("calling");
    setErrorMessage("");

    try {
      const { data, error } = await supabase.functions.invoke("twilio-call-me", {
        body: {
          phoneNumber: phoneNumber.replace(/\s/g, ""),
          callerName: callerName.trim().slice(0, 50) || undefined,
          language,
          conversationId: conversationId || undefined,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to request call");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setStatus("success");
      toast({
        title: t("callMe.success", "Call incoming!"),
        description: t(
          "callMe.successDesc",
          "Please answer your phone. Our AI assistant will speak with you shortly."
        ),
      });

      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
        setStatus("idle");
      }, 3000);
    } catch (err) {
      console.error("Call request error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(message);
      setStatus("error");
      toast({
        title: t("callMe.error", "Call failed"),
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (status !== "calling") {
      onOpenChange(false);
      // Reset state after modal closes
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage("");
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            {t("callMe.title", "Call and Speak")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "callMe.description",
              "Enter your phone number and our AI assistant will call you immediately."
            )}
          </DialogDescription>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {t("callMe.callingNow", "Calling you now...")}
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              {t("callMe.answerPhone", "Please answer your phone")}
            </p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {t("callMe.errorTitle", "Unable to call")}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs">
              {errorMessage}
            </p>
            <Button onClick={() => setStatus("idle")} className="mt-4">
              {t("callMe.tryAgain", "Try again")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("callMe.nameLabel", "Your Name")}</Label>
              <Input
                id="name"
                type="text"
                placeholder={t("callMe.namePlaceholder", "Enter your name")}
                value={callerName}
                onChange={(e) => setCallerName(e.target.value)}
                disabled={status === "calling"}
                maxLength={50}
                className="text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t("callMe.phoneLabel", "Phone Number")}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+34 612 345 678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={status === "calling"}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "callMe.phoneHint",
                  "Use international format starting with + (e.g., +34 for Spain)"
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t("callMe.languageLabel", "Language")}</Label>
              <Select
                value={language}
                onValueChange={(val) => setLanguage(val as "en" | "es")}
                disabled={status === "calling"}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">🇪🇸 Español</SelectItem>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleRequestCall}
              disabled={!phoneNumber.trim() || status === "calling"}
              className="w-full"
              size="lg"
            >
              {status === "calling" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("callMe.requesting", "Requesting call...")}
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  {t("callMe.callMeNow", "Call me now")}
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              {t(
                "callMe.notice",
                "By requesting a call, you agree to receive an automated call from our AI assistant."
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
