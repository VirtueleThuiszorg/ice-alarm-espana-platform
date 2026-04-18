import { useTranslation } from "react-i18next";
import { JoinWizardData, AddressDetails } from "@/types/wizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MapPin, Truck, User, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface JoinAddressStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

const spanishProvinces = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz",
  "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real",
  "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva",
  "Huesca", "Islas Baleares", "Jaén", "La Coruña", "La Rioja", "Las Palmas", "León",
  "Lérida", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Orense", "Palencia",
  "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza"
];

const initialAddress: AddressDetails = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Spain",
};

function AddressForm({
  title,
  icon: Icon,
  address,
  onChange,
}: {
  title: string;
  icon: React.ElementType;
  address: AddressDetails;
  onChange: (field: keyof AddressDetails, value: string) => void;
}) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${title}-addressLine1`}>{t("joinWizard.address.streetAddress")} *</Label>
        <Input
          id={`${title}-addressLine1`}
          value={address.addressLine1}
          onChange={(e) => onChange("addressLine1", e.target.value)}
          placeholder={t("joinWizard.address.streetPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${title}-addressLine2`}>{t("joinWizard.address.apartment")}</Label>
        <Input
          id={`${title}-addressLine2`}
          value={address.addressLine2}
          onChange={(e) => onChange("addressLine2", e.target.value)}
          placeholder={t("joinWizard.address.apartmentPlaceholder")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${title}-city`}>{t("joinWizard.address.city")} *</Label>
          <Input
            id={`${title}-city`}
            value={address.city}
            onChange={(e) => onChange("city", e.target.value)}
            placeholder={t("joinWizard.address.city")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${title}-province`}>{t("joinWizard.address.province")} *</Label>
          <Select
            value={address.province}
            onValueChange={(value) => onChange("province", value)}
          >
            <SelectTrigger id={`${title}-province`}>
              <SelectValue placeholder={t("joinWizard.address.selectProvince")} />
            </SelectTrigger>
            <SelectContent>
              {spanishProvinces.map((province) => (
                <SelectItem key={province} value={province}>
                  {province}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${title}-postalCode`}>{t("joinWizard.address.postalCode")} *</Label>
          <Input
            id={`${title}-postalCode`}
            value={address.postalCode}
            onChange={(e) => onChange("postalCode", e.target.value)}
            placeholder="00000"
            maxLength={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${title}-country`}>{t("joinWizard.address.country")}</Label>
          <Select
            value={address.country}
            onValueChange={(value) => onChange("country", value)}
          >
            <SelectTrigger id={`${title}-country`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Spain">Spain</SelectItem>
              <SelectItem value="Portugal">Portugal</SelectItem>
              <SelectItem value="Andorra">Andorra</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function JoinAddressStep({ data, onUpdate }: JoinAddressStepProps) {
  const { t } = useTranslation();
  
  const updateAddress = (field: keyof AddressDetails, value: string) => {
    onUpdate({
      address: {
        ...data.address,
        [field]: value,
      },
    });
  };

  const updatePartnerAddress = (field: keyof AddressDetails, value: string) => {
    onUpdate({
      partnerAddress: {
        ...(data.partnerAddress || initialAddress),
        [field]: value,
      },
    });
  };

  const toggleSeparateAddresses = (checked: boolean) => {
    onUpdate({
      separateAddresses: checked,
      partnerAddress: checked ? (data.partnerAddress || initialAddress) : undefined,
    });
  };

  const isCouple = data.membershipType === "couple";

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.address.title")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {t("joinWizard.address.subtitle")}
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
          <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">{t("joinWizard.address.emergencyResponse")}</p>
            <p className="text-xs text-muted-foreground">
              {t("joinWizard.address.emergencyResponseDesc")}
            </p>
          </div>
        </div>
        {data.includePendant && (
          <div className="bg-muted/50 border rounded-lg p-4 flex items-start gap-3">
            <Truck className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">{t("joinWizard.address.shippingAddress")}</p>
              <p className="text-xs text-muted-foreground">
                {t("joinWizard.address.shippingAddressDesc")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Couple Option: Toggle for separate addresses */}
      {isCouple && (
        <div className="bg-muted/30 border rounded-lg p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="separate-addresses" className="text-sm font-medium cursor-pointer">
              {t("joinWizard.address.separateAddresses", "Members live at different addresses")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("joinWizard.address.separateAddressesDesc", "Enable this if you and your partner have separate home addresses")}
            </p>
          </div>
          <Switch
            id="separate-addresses"
            checked={data.separateAddresses || false}
            onCheckedChange={toggleSeparateAddresses}
          />
        </div>
      )}

      {/* Address Forms */}
      {isCouple && data.separateAddresses ? (
        <Tabs defaultValue="primary" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="primary" className="gap-2">
              <User className="h-4 w-4" />
              {t("joinWizard.personal.primaryMember", "Primary Member")}
            </TabsTrigger>
            <TabsTrigger value="partner" className="gap-2">
              <Users className="h-4 w-4" />
              {t("joinWizard.personal.partner", "Partner")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="primary" className="mt-6">
            <AddressForm
              title={data.primaryMember.firstName || t("joinWizard.personal.primaryMember", "Primary Member")}
              icon={User}
              address={data.address}
              onChange={updateAddress}
            />
          </TabsContent>
          <TabsContent value="partner" className="mt-6">
            <AddressForm
              title={data.partnerMember?.firstName || t("joinWizard.personal.partner", "Partner")}
              icon={Users}
              address={data.partnerAddress || initialAddress}
              onChange={updatePartnerAddress}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="addressLine1">{t("joinWizard.address.streetAddress")} *</Label>
            <Input
              id="addressLine1"
              value={data.address.addressLine1}
              onChange={(e) => updateAddress("addressLine1", e.target.value)}
              placeholder={t("joinWizard.address.streetPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine2">{t("joinWizard.address.apartment")}</Label>
            <Input
              id="addressLine2"
              value={data.address.addressLine2}
              onChange={(e) => updateAddress("addressLine2", e.target.value)}
              placeholder={t("joinWizard.address.apartmentPlaceholder")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">{t("joinWizard.address.city")} *</Label>
              <Input
                id="city"
                value={data.address.city}
                onChange={(e) => updateAddress("city", e.target.value)}
                placeholder={t("joinWizard.address.city")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">{t("joinWizard.address.province")} *</Label>
              <Select
                value={data.address.province}
                onValueChange={(value) => updateAddress("province", value)}
              >
                <SelectTrigger id="province">
                  <SelectValue placeholder={t("joinWizard.address.selectProvince")} />
                </SelectTrigger>
                <SelectContent>
                  {spanishProvinces.map((province) => (
                    <SelectItem key={province} value={province}>
                      {province}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="postalCode">{t("joinWizard.address.postalCode")} *</Label>
              <Input
                id="postalCode"
                value={data.address.postalCode}
                onChange={(e) => updateAddress("postalCode", e.target.value)}
                placeholder="00000"
                maxLength={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t("joinWizard.address.country")}</Label>
              <Select
                value={data.address.country}
                onValueChange={(value) => updateAddress("country", value)}
              >
                <SelectTrigger id="country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Spain">Spain</SelectItem>
                  <SelectItem value="Portugal">Portugal</SelectItem>
                  <SelectItem value="Andorra">Andorra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
