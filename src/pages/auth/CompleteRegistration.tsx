import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/ui/logo";
import { Loader2, ArrowLeft, User, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

const spanishProvinces = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Barcelona",
  "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real", "Córdoba", "Cuenca",
  "Girona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva", "Huesca", "Islas Baleares",
  "Jaén", "La Coruña", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga",
  "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife",
  "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid",
  "Vizcaya", "Zamora", "Zaragoza"
];

export default function CompleteRegistration() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { user, refreshAuth } = useAuth();

  const registrationSchema = z.object({
    first_name: z.string().min(1, t("registration.firstNameRequired")).max(100),
    last_name: z.string().min(1, t("registration.lastNameRequired")).max(100),
    phone: z.string().min(9, t("validation.invalidPhone")).max(20),
    date_of_birth: z.string().min(1, t("registration.dobRequired")),
    nie_dni: z.string().optional(),
    address_line_1: z.string().min(1, t("validation.addressRequired")).max(200),
    address_line_2: z.string().optional(),
    city: z.string().min(1, t("registration.cityRequired")).max(100),
    province: z.string().min(1, t("registration.provinceRequired")).max(100),
    postal_code: z.string().min(4, t("registration.postalCodeRequired")).max(10),
    preferred_language: z.enum(["en", "es"]),
    special_instructions: z.string().optional(),
  });

  type RegistrationFormValues = z.infer<typeof registrationSchema>;

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      date_of_birth: "",
      nie_dni: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      province: "",
      postal_code: "",
      preferred_language: "en",
      special_instructions: "",
    },
  });

  const onSubmit = async (values: RegistrationFormValues) => {
    if (!user) {
      toast.error(t("registration.pleaseLogin"));
      navigate("/login");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from("members").insert({
        user_id: user.id,
        email: user.email!,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        date_of_birth: values.date_of_birth,
        nie_dni: values.nie_dni || null,
        address_line_1: values.address_line_1,
        address_line_2: values.address_line_2 || null,
        city: values.city,
        province: values.province,
        postal_code: values.postal_code,
        preferred_language: values.preferred_language,
        special_instructions: values.special_instructions || null,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      await refreshAuth();
      toast.success(t("registration.success"));
      navigate("/dashboard");
    } catch (error) {
      toast.error(t("errors.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              {t("registration.pleaseLoginFirst")}{" "}
              <Link to="/login" className="text-primary hover:underline">
                {t("auth.login")}
              </Link>{" "}
              {t("registration.toComplete")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <Logo size="md" />
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t("registration.title")}</CardTitle>
            <CardDescription>
              {t("registration.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <User className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium hidden sm:inline">{t("registration.steps.personal")}</span>
              </div>
              <div className="h-px w-8 bg-border" />
              <div className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium hidden sm:inline">{t("registration.steps.address")}</span>
              </div>
              <div className="h-px w-8 bg-border" />
              <div className={`flex items-center gap-2 ${step >= 3 ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Phone className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium hidden sm:inline">{t("registration.steps.preferences")}</span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Step 1: Personal Details */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="first_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("profile.firstName")}</FormLabel>
                            <FormControl>
                              <Input placeholder="John" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="last_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("profile.lastName")}</FormLabel>
                            <FormControl>
                              <Input placeholder="Smith" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.phone")}</FormLabel>
                          <FormControl>
                            <Input placeholder="+34 600 000 000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile.dateOfBirth")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nie_dni"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("registration.nieDniOptional")}</FormLabel>
                          <FormControl>
                            <Input placeholder="X1234567A" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end">
                      <Button type="button" onClick={() => setStep(2)}>
                        {t("common.next")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Address */}
                {step === 2 && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="address_line_1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile.addressLine1")}</FormLabel>
                          <FormControl>
                            <Input placeholder="Calle Principal 1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="address_line_2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile.addressLine2")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("registration.addressLine2Placeholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("profile.city")}</FormLabel>
                            <FormControl>
                              <Input placeholder="Albox" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="postal_code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("profile.postalCode")}</FormLabel>
                            <FormControl>
                              <Input placeholder="04800" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="province"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile.province")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t("registration.selectProvince")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {spanishProvinces.map((province) => (
                                <SelectItem key={province} value={province}>
                                  {province}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-between">
                      <Button type="button" variant="outline" onClick={() => setStep(1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t("common.back")}
                      </Button>
                      <Button type="button" onClick={() => setStep(3)}>
                        {t("common.next")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Preferences */}
                {step === 3 && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="preferred_language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile.preferredLanguage")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t("registration.selectLanguage")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="es">Español</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="special_instructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("registration.specialInstructions")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("registration.specialInstructionsPlaceholder")}
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-between">
                      <Button type="button" variant="outline" onClick={() => setStep(2)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t("common.back")}
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("registration.completing")}
                          </>
                        ) : (
                          t("registration.completeRegistration")
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
