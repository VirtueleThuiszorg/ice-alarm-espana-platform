import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { JoinWizardData, MemberDetails } from "@/types/wizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Users, Info } from "lucide-react";

interface PersonFormProps {
  title: string;
  icon: React.ElementType;
  values: MemberDetails;
  onChange: (field: keyof MemberDetails, value: string | undefined) => void;
  t: TFunction;
}

const PersonForm = ({ title, icon: Icon, values, onChange, t }: PersonFormProps) => (
  <div className="space-y-6">
    <div className="flex items-center gap-2 mb-4">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${title}-firstName`}>{t("joinWizard.personal.firstName")} *</Label>
        <Input
          id={`${title}-firstName`}
          value={values.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
          placeholder={t("joinWizard.personal.enterFirstName")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-lastName`}>{t("joinWizard.personal.lastName")} *</Label>
        <Input
          id={`${title}-lastName`}
          value={values.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
          placeholder={t("joinWizard.personal.enterLastName")}
        />
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${title}-email`}>{t("joinWizard.personal.emailAddress")} *</Label>
        <Input
          id={`${title}-email`}
          type="email"
          value={values.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="email@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-phone`}>{t("joinWizard.personal.phoneNumber")} *</Label>
        <Input
          id={`${title}-phone`}
          type="tel"
          value={values.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="+34 600 000 000"
        />
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor={`${title}-dob`}>{t("joinWizard.personal.dateOfBirth")} *</Label>
        <Input
          id={`${title}-dob`}
          type="date"
          value={values.dateOfBirth}
          onChange={(e) => onChange("dateOfBirth", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-nieDni`}>{t("joinWizard.personal.nieDni")}</Label>
        <Input
          id={`${title}-nieDni`}
          value={values.nieDni}
          onChange={(e) => onChange("nieDni", e.target.value)}
          placeholder="X0000000X"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-language`}>{t("joinWizard.personal.preferredLanguage")}</Label>
        <Select
          value={values.preferredLanguage}
          onValueChange={(value) => onChange("preferredLanguage", value as "en" | "es")}
        >
          <SelectTrigger id={`${title}-language`}>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
);

interface JoinPersonalStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

export function JoinPersonalStep({ data, onUpdate }: JoinPersonalStepProps) {
  const { t } = useTranslation();
  
  const updatePrimaryMember = (field: keyof MemberDetails, value: string | undefined) => {
    onUpdate({
      primaryMember: {
        ...data.primaryMember,
        [field]: value,
      },
    });
  };

  const updatePartnerMember = (field: keyof MemberDetails, value: string | undefined) => {
    onUpdate({
      partnerMember: {
        firstName: data.partnerMember?.firstName || "",
        lastName: data.partnerMember?.lastName || "",
        email: data.partnerMember?.email || "",
        phone: data.partnerMember?.phone || "",
        dateOfBirth: data.partnerMember?.dateOfBirth || "",
        nieDni: data.partnerMember?.nieDni || "",
        preferredLanguage: data.partnerMember?.preferredLanguage || "es",
        preferredContactMethod: data.partnerMember?.preferredContactMethod,
        preferredContactTime: data.partnerMember?.preferredContactTime,
        specialInstructions: data.partnerMember?.specialInstructions,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.personal.title")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {t("joinWizard.personal.subtitle", { 
            memberType: data.membershipType === "couple" 
              ? t("joinWizard.personal.bothMembers") 
              : t("joinWizard.personal.theMember") 
          })}
        </p>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          {t("joinWizard.personal.infoNote")}
        </p>
      </div>

      {data.membershipType === "single" ? (
        <PersonForm
          title={t("joinWizard.personal.yourDetails")}
          icon={User}
          values={data.primaryMember}
          onChange={updatePrimaryMember}
          t={t}
        />
      ) : (
        <Tabs defaultValue="primary" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="primary" className="gap-2">
              <User className="h-4 w-4" />
              {t("joinWizard.personal.primaryMember")}
            </TabsTrigger>
            <TabsTrigger value="partner" className="gap-2">
              <Users className="h-4 w-4" />
              {t("joinWizard.personal.partner")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="primary" className="mt-6">
            <PersonForm
              title={t("joinWizard.personal.primaryMember")}
              icon={User}
              values={data.primaryMember}
              onChange={updatePrimaryMember}
              t={t}
            />
          </TabsContent>
          <TabsContent value="partner" className="mt-6">
            <PersonForm
              title={t("joinWizard.personal.partner")}
              icon={Users}
              values={
                data.partnerMember || {
                  firstName: "",
                  lastName: "",
                  email: "",
                  phone: "",
                  dateOfBirth: "",
                  nieDni: "",
                  preferredLanguage: "es",
                  preferredContactMethod: undefined,
                  preferredContactTime: undefined,
                  specialInstructions: undefined,
                }
              }
              onChange={updatePartnerMember}
              t={t}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
