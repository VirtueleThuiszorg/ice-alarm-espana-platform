import { useState } from "react";
import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Phone, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmergencyContactsStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const relationships = [
  "Spouse/Partner",
  "Son",
  "Daughter",
  "Sibling",
  "Friend",
  "Neighbor",
  "Caregiver",
  "Other Family",
  "Other",
];

export function EmergencyContactsStep({ data, onUpdate }: EmergencyContactsStepProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({
    contactName: "",
    relationship: "",
    phone: "",
    email: "",
    speaksSpanish: false,
    notes: "",
  });

  const resetForm = () => {
    setContactForm({
      contactName: "",
      relationship: "",
      phone: "",
      email: "",
      speaksSpanish: false,
      notes: "",
    });
    setEditIndex(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
    setContactForm(data.emergencyContacts[index]);
    setEditIndex(index);
    setDialogOpen(true);
  };

  const saveContact = () => {
    if (!contactForm.contactName || !contactForm.relationship || !contactForm.phone) {
      return;
    }

    const newContacts = [...data.emergencyContacts];
    if (editIndex !== null) {
      newContacts[editIndex] = contactForm;
    } else {
      newContacts.push(contactForm);
    }

    onUpdate({ emergencyContacts: newContacts });
    setDialogOpen(false);
    resetForm();
  };

  const deleteContact = (index: number) => {
    const newContacts = data.emergencyContacts.filter((_, i) => i !== index);
    onUpdate({ emergencyContacts: newContacts });
  };

  const canAddMore = data.emergencyContacts.length < 3;

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Emergency contacts are critical</p>
          <p>
            These contacts will be notified in case of an emergency. Please ensure all phone numbers
            are correct and contacts are aware they may receive calls from our emergency center.
          </p>
        </div>
      </div>

      {/* Contact Cards */}
      <div className="space-y-4">
        {data.emergencyContacts.map((contact, index) => (
          <Card key={index} className={cn(index === 0 && "border-primary")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {contact.contactName}
                  {index === 0 && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(index)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteContact(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>{contact.relationship}</span>
                  {contact.speaksSpanish && (
                    <span className="bg-muted px-2 py-0.5 rounded text-xs">Speaks Spanish</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.phone}</span>
                </div>
                {contact.email && <span className="text-muted-foreground">{contact.email}</span>}
                {contact.notes && (
                  <p className="text-muted-foreground italic">"{contact.notes}"</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Button */}
      {canAddMore && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openAddDialog} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add Emergency Contact ({data.emergencyContacts.length}/3)
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editIndex !== null ? "Edit Contact" : "Add Emergency Contact"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Full Name *</Label>
                  <Input
                    id="contactName"
                    value={contactForm.contactName}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, contactName: e.target.value })
                    }
                    placeholder="Contact's full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relationship">Relationship *</Label>
                  <Select
                    value={contactForm.relationship}
                    onValueChange={(value) =>
                      setContactForm({ ...contactForm, relationship: value })
                    }
                  >
                    <SelectTrigger id="relationship">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      {relationships.map((rel) => (
                        <SelectItem key={rel} value={rel}>
                          {rel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, phone: e.target.value })
                    }
                    placeholder="+34 600 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, email: e.target.value })
                    }
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="speaksSpanish"
                  checked={contactForm.speaksSpanish}
                  onCheckedChange={(checked) =>
                    setContactForm({ ...contactForm, speaksSpanish: checked })
                  }
                />
                <Label htmlFor="speaksSpanish">Speaks Spanish</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={contactForm.notes}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, notes: e.target.value })
                  }
                  placeholder="Any special instructions for contacting this person..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveContact}>
                {editIndex !== null ? "Save Changes" : "Add Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Max contacts message */}
      {!canAddMore && (
        <p className="text-center text-sm text-muted-foreground">
          Maximum of 3 emergency contacts reached
        </p>
      )}
    </div>
  );
}
