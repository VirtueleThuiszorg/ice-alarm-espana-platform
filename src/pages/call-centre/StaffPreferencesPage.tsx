import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  Shield,
  Bell,
  Clock,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

const profileSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  preferredLanguage: z.enum(["en", "es"]),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface StaffData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  preferredLanguage: "en" | "es";
  createdAt: Date;
  lastLoginAt: Date | null;
  isActive: boolean;
}

export default function StaffPreferencesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [staffData, setStaffData] = useState<StaffData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Notification preferences (stored locally for now - could be extended to DB)
  const [notifications, setNotifications] = useState({
    alertSounds: true,
    desktopNotifications: true,
    emailSummary: false,
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      preferredLanguage: "en",
    },
  });

  useEffect(() => {
    fetchStaffData();
  }, [user?.id]);

  const fetchStaffData = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      const staffInfo: StaffData = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        preferredLanguage: (data.preferred_language as "en" | "es") || "en",
        createdAt: new Date(data.created_at ?? Date.now()),
        lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : null,
        isActive: data.is_active ?? true,
      };

      setStaffData(staffInfo);

      // Populate form
      form.reset({
        firstName: staffInfo.firstName,
        lastName: staffInfo.lastName,
        email: staffInfo.email,
        phone: staffInfo.phone || "",
        preferredLanguage: staffInfo.preferredLanguage,
      });
    } catch (error) {
      console.error("Error fetching staff data:", error);
      toast.error(t("staffPreferences.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (values: ProfileFormData) => {
    if (!staffData?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("staff")
        .update({
          first_name: values.firstName,
          last_name: values.lastName,
          email: values.email,
          phone: values.phone || null,
          preferred_language: values.preferredLanguage,
        })
        .eq("id", staffData.id);

      if (error) throw error;

      toast.success(t("staffPreferences.profileUpdated"));
      fetchStaffData();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t("staffPreferences.failedToUpdate"));
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-purple-500 text-white">{t("staffPreferences.roles.superAdmin")}</Badge>;
      case "admin":
        return <Badge className="bg-primary text-primary-foreground">{t("staffPreferences.roles.admin")}</Badge>;
      case "call_centre":
        return <Badge variant="secondary">{t("staffPreferences.roles.callCentre")}</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-background/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="w-6 h-6" />
              {t("staffPreferences.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("staffPreferences.subtitle")}
            </p>
          </div>
          {staffData && (
            <div className="flex items-center gap-2">
              {getRoleBadge(staffData.role)}
              {staffData.isActive ? (
                <Badge className="bg-alert-resolved text-alert-resolved-foreground">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {t("staffPreferences.active")}
                </Badge>
              ) : (
                <Badge variant="secondary">{t("staffPreferences.inactive")}</Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 max-w-4xl mx-auto space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {t("staffPreferences.personalInfo")}
              </CardTitle>
              <CardDescription>
                {t("staffPreferences.personalInfoDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("staffPreferences.firstName")}</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("staffPreferences.lastName")}</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("staffPreferences.email")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-10" placeholder="john@example.com" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("staffPreferences.phone")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-10" placeholder="+34 600 000 000" {...field} />
                            </div>
                          </FormControl>
                          <FormDescription>{t("staffPreferences.phoneDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="preferredLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("staffPreferences.preferredLanguage")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[200px]">
                              <Globe className="w-4 h-4 mr-2" />
                              <SelectValue placeholder={t("staffPreferences.selectLanguage")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="en">🇬🇧 English</SelectItem>
                            <SelectItem value="es">🇪🇸 Español</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("staffPreferences.languageDesc")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {t("staffPreferences.saveChanges")}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                {t("staffPreferences.notifications")}
              </CardTitle>
              <CardDescription>
                {t("staffPreferences.notificationsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("staffPreferences.alertSounds")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("staffPreferences.alertSoundsDesc")}
                  </p>
                </div>
                <Switch
                  checked={notifications.alertSounds}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, alertSounds: checked }))
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("staffPreferences.desktopNotifications")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("staffPreferences.desktopNotificationsDesc")}
                  </p>
                </div>
                <Switch
                  checked={notifications.desktopNotifications}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, desktopNotifications: checked }))
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("staffPreferences.emailSummary")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("staffPreferences.emailSummaryDesc")}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailSummary}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, emailSummary: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t("staffPreferences.accountInfo")}
              </CardTitle>
              <CardDescription>
                {t("staffPreferences.accountInfoDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">{t("staffPreferences.staffId")}</Label>
                  <p className="font-mono text-sm">{staffData?.id.slice(0, 8)}...</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">{t("staffPreferences.role")}</Label>
                  <div>{staffData && getRoleBadge(staffData.role)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">{t("staffPreferences.accountCreated")}</Label>
                  <p className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {staffData?.createdAt ? format(staffData.createdAt, "dd MMMM yyyy") : "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">{t("staffPreferences.lastLogin")}</Label>
                  <p className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {staffData?.lastLoginAt
                      ? format(staffData.lastLoginAt, "dd MMM yyyy, HH:mm")
                      : t("staffPreferences.never")}
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">{t("staffPreferences.loginEmail")}</Label>
                  <p className="text-sm">{user?.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("staffPreferences.loginEmailDesc")}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t("staffPreferences.password")}</Label>
                  <p className="text-sm">••••••••••••</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("staffPreferences.passwordDesc")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
