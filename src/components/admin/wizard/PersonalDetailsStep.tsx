import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Users } from "lucide-react";

interface PersonalDetailsStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const PersonForm = ({
  title,
  icon: Icon,
  values,
  onChange,
}: {
  title: string;
  icon: React.ElementType;
  values: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    nieDni: string;
    preferredLanguage: "en" | "es";
  };
  onChange: (field: string, value: string) => void;
}) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${title}-firstName`}>First Name *</Label>
        <Input
          id={`${title}-firstName`}
          value={values.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
          placeholder="Enter first name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-lastName`}>Last Name *</Label>
        <Input
          id={`${title}-lastName`}
          value={values.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
          placeholder="Enter last name"
        />
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${title}-email`}>Email *</Label>
        <Input
          id={`${title}-email`}
          type="email"
          value={values.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="email@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-phone`}>Phone *</Label>
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
        <Label htmlFor={`${title}-dob`}>Date of Birth *</Label>
        <Input
          id={`${title}-dob`}
          type="date"
          value={values.dateOfBirth}
          onChange={(e) => onChange("dateOfBirth", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-nieDni`}>NIE/DNI</Label>
        <Input
          id={`${title}-nieDni`}
          value={values.nieDni}
          onChange={(e) => onChange("nieDni", e.target.value)}
          placeholder="X0000000X"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${title}-language`}>Preferred Language</Label>
        <Select
          value={values.preferredLanguage}
          onValueChange={(value) => onChange("preferredLanguage", value)}
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

export function PersonalDetailsStep({ data, onUpdate }: PersonalDetailsStepProps) {
  const updatePrimaryMember = (field: string, value: string) => {
    onUpdate({
      primaryMember: {
        ...data.primaryMember,
        [field]: value,
      },
    });
  };

  const updatePartnerMember = (field: string, value: string) => {
    onUpdate({
      partnerMember: {
        ...data.partnerMember,
        firstName: data.partnerMember?.firstName || "",
        lastName: data.partnerMember?.lastName || "",
        email: data.partnerMember?.email || "",
        phone: data.partnerMember?.phone || "",
        dateOfBirth: data.partnerMember?.dateOfBirth || "",
        nieDni: data.partnerMember?.nieDni || "",
        preferredLanguage: data.partnerMember?.preferredLanguage || "es",
        [field]: value,
      },
    });
  };

  if (data.membershipType === "single") {
    return (
      <PersonForm
        title="Member Details"
        icon={User}
        values={data.primaryMember}
        onChange={updatePrimaryMember}
      />
    );
  }

  return (
    <Tabs defaultValue="primary" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="primary" className="gap-2">
          <User className="h-4 w-4" />
          Primary Member
        </TabsTrigger>
        <TabsTrigger value="partner" className="gap-2">
          <Users className="h-4 w-4" />
          Partner
        </TabsTrigger>
      </TabsList>
      <TabsContent value="primary" className="mt-6">
        <PersonForm
          title="Primary Member"
          icon={User}
          values={data.primaryMember}
          onChange={updatePrimaryMember}
        />
      </TabsContent>
      <TabsContent value="partner" className="mt-6">
        <PersonForm
          title="Partner"
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
            }
          }
          onChange={updatePartnerMember}
        />
      </TabsContent>
    </Tabs>
  );
}
