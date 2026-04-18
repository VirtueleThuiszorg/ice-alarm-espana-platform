import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddressStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
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

export function AddressStep({ data, onUpdate }: AddressStepProps) {
  const updateAddress = (field: string, value: string) => {
    onUpdate({
      address: {
        ...data.address,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-4 mb-6">
        <p className="text-sm text-muted-foreground">
          {data.membershipType === "couple"
            ? "This address will be used for both members. The pendant device will be shipped to this address."
            : "This address will be used for shipping the pendant device and as the primary location for emergency services."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="addressLine1">Address Line 1 *</Label>
          <Input
            id="addressLine1"
            value={data.address.addressLine1}
            onChange={(e) => updateAddress("addressLine1", e.target.value)}
            placeholder="Street address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addressLine2">Address Line 2</Label>
          <Input
            id="addressLine2"
            value={data.address.addressLine2}
            onChange={(e) => updateAddress("addressLine2", e.target.value)}
            placeholder="Apartment, floor, building (optional)"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              value={data.address.city}
              onChange={(e) => updateAddress("city", e.target.value)}
              placeholder="City"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="province">Province *</Label>
            <Select
              value={data.address.province}
              onValueChange={(value) => updateAddress("province", value)}
            >
              <SelectTrigger id="province">
                <SelectValue placeholder="Select province" />
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
            <Label htmlFor="postalCode">Postal Code *</Label>
            <Input
              id="postalCode"
              value={data.address.postalCode}
              onChange={(e) => updateAddress("postalCode", e.target.value)}
              placeholder="00000"
              maxLength={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
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
    </div>
  );
}
