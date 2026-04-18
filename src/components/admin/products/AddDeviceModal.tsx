import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAddDeviceStock, type NewDeviceInput } from "@/hooks/useDeviceStock";

interface AddDeviceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDeviceModal({ open, onOpenChange }: AddDeviceModalProps) {
  const addDevice = useAddDeviceStock();
  const [formData, setFormData] = useState<NewDeviceInput>({
    imei: "",
    serial_number: "",
    sim_iccid: "",
    sim_phone_number: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.imei.trim()) {
      return;
    }
    
    await addDevice.mutateAsync(formData);
    
    // Reset form and close modal
    setFormData({
      imei: "",
      serial_number: "",
      sim_iccid: "",
      sim_phone_number: "",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add EV-07B Device to Stock</DialogTitle>
          <DialogDescription>
            Enter the device details to add a new EV-07B pendant to inventory.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="imei">IMEI *</Label>
            <Input
              id="imei"
              placeholder="Enter 15-digit IMEI"
              value={formData.imei}
              onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
              required
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground">
              The unique 15-digit identifier for the device
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sim_phone_number">SIM Phone Number</Label>
            <Input
              id="sim_phone_number"
              placeholder="+34 XXX XXX XXX (optional — add later during provisioning)"
              value={formData.sim_phone_number}
              onChange={(e) => setFormData({ ...formData, sim_phone_number: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Optional — can be added later during device provisioning
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial_number">Serial Number</Label>
            <Input
              id="serial_number"
              placeholder="Optional serial number"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sim_iccid">SIM ICCID</Label>
            <Input
              id="sim_iccid"
              placeholder="Optional SIM card identifier"
              value={formData.sim_iccid}
              onChange={(e) => setFormData({ ...formData, sim_iccid: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addDevice.isPending}>
              {addDevice.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add Device
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
