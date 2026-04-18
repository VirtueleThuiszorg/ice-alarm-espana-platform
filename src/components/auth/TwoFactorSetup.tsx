import { useState, useEffect } from "react";
import { useTwoFactorAuth } from "@/hooks/useTwoFactorAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";

export function TwoFactorSetup() {
  const { getFactors, enroll, verify, unenroll, isEnrolling, isVerifying, error } =
    useTwoFactorAuth();

  const [factors, setFactors] = useState<{ verified: any[]; unverified: any[] }>({
    verified: [],
    unverified: [],
  });
  const [enrollmentData, setEnrollmentData] = useState<any>(null);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(true);

  const loadFactors = async () => {
    try {
      const data = await getFactors();
      setFactors({ verified: data.verified, unverified: data.unverified });
    } catch {
      // MFA not available or not configured
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFactors();
  }, []);

  const handleEnroll = async () => {
    const data = await enroll();
    if (data) {
      setEnrollmentData(data);
      setShowEnrollDialog(true);
      setVerifyCode("");
    }
  };

  const handleVerify = async () => {
    if (!enrollmentData || verifyCode.length !== 6) return;

    const success = await verify(enrollmentData.id, verifyCode);
    if (success) {
      toast.success("Two-factor authentication enabled!");
      setShowEnrollDialog(false);
      setEnrollmentData(null);
      setVerifyCode("");
      loadFactors();
    }
  };

  const handleDisable = async (factorId: string) => {
    const success = await unenroll(factorId);
    if (success) {
      toast.success("Two-factor authentication disabled");
      loadFactors();
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("Secret copied to clipboard");
  };

  const isEnabled = factors.verified.length > 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            <Badge variant={isEnabled ? "default" : "secondary"}>
              {isEnabled ? (
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Enabled
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <ShieldOff className="h-3 w-3" /> Disabled
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isEnabled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your account is protected with an authenticator app.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDisable(factors.verified[0].id)}
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                Disable 2FA
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use an authenticator app (Google Authenticator, Authy, etc.) to
                generate verification codes for sign-in.
              </p>
              <Button onClick={handleEnroll} disabled={isEnrolling}>
                {isEnrolling ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Enable 2FA
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app, then enter the
              6-digit code to verify.
            </DialogDescription>
          </DialogHeader>

          {enrollmentData && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={enrollmentData.totp.qr_code}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>

              {/* Manual entry secret */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Or enter this code manually:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                    {enrollmentData.totp.secret}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => copySecret(enrollmentData.totp.secret)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Verification code input */}
              <div className="space-y-2">
                <Label>Verification Code</Label>
                <Input
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={verifyCode.length !== 6 || isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Verify & Enable
              </Button>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
