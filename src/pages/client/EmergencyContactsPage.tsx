import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEmergencyContacts } from "@/hooks/useMemberProfile";
import { supabase } from "@/integrations/supabase/client";
import { LIMITS } from "@/config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, 
  Phone as PhoneIcon,
  Users,
  UserPlus,
  Shield,
  Mail,
  Edit,
  Trash2,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const contactSchema = z.object({
  contact_name: z.string().min(1, "Name is required").max(100),
  relationship: z.string().min(1, "Relationship is required"),
  phone: z.string().min(1, "Phone number is required").max(20),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
  speaks_spanish: z.boolean(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const RELATIONSHIP_KEYS = [
  { value: "Spouse", key: "spouse" },
  { value: "Partner", key: "partner" },
  { value: "Child", key: "child" },
  { value: "Son", key: "son" },
  { value: "Daughter", key: "daughter" },
  { value: "Sibling", key: "sibling" },
  { value: "Brother", key: "brother" },
  { value: "Sister", key: "sister" },
  { value: "Parent", key: "parent" },
  { value: "Friend", key: "friend" },
  { value: "Neighbor", key: "neighbor" },
  { value: "Caregiver", key: "caregiver" },
  { value: "Other", key: "other" },
];

export default function EmergencyContactsPage() {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  const { data: contacts, isLoading } = useEmergencyContacts();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contact_name: "",
      relationship: "",
      phone: "",
      email: "",
      notes: "",
      speaks_spanish: false,
    },
  });

  const openAddDialog = () => {
    form.reset({
      contact_name: "",
      relationship: "",
      phone: "",
      email: "",
      notes: "",
      speaks_spanish: false,
    });
    setEditingContact(null);
    setDialogOpen(true);
  };

  const openEditDialog = (contact: NonNullable<typeof contacts>[number]) => {
    form.reset({
      contact_name: contact.contact_name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email || "",
      notes: contact.notes || "",
      speaks_spanish: contact.speaks_spanish || false,
    });
    setEditingContact(contact.id);
    setDialogOpen(true);
  };

  const openDeleteDialog = (contactId: string) => {
    setDeletingContact(contactId);
    setDeleteDialogOpen(true);
  };

  const onSubmit = async (data: ContactFormData) => {
    if (!memberId) return;
    
    setIsSaving(true);
    try {
      if (editingContact) {
        // Update existing contact
        const { error } = await supabase
          .from("emergency_contacts")
          .update({
            contact_name: data.contact_name,
            relationship: data.relationship,
            phone: data.phone,
            email: data.email || null,
            notes: data.notes || null,
            speaks_spanish: data.speaks_spanish,
          })
          .eq("id", editingContact);

        if (error) throw error;
        toast.success(t("contacts.updated", "Contact updated successfully"));
      } else {
        // Add new contact
        const nextOrder = (contacts?.length || 0) + 1;
        const isPrimary = nextOrder === 1;

        const { error } = await supabase
          .from("emergency_contacts")
          .insert({
            member_id: memberId,
            contact_name: data.contact_name,
            relationship: data.relationship,
            phone: data.phone,
            email: data.email || null,
            notes: data.notes || null,
            speaks_spanish: data.speaks_spanish,
            priority_order: nextOrder,
            is_primary: isPrimary,
          });

        if (error) throw error;
        toast.success(t("contacts.added", "Contact added successfully"));
      }

      queryClient.invalidateQueries({ queryKey: ["emergency-contacts"] });
      setDialogOpen(false);
      form.reset();
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error(t("common.error", "Failed to save contact"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingContact) return;

    try {
      const { error } = await supabase
        .from("emergency_contacts")
        .delete()
        .eq("id", deletingContact);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["emergency-contacts"] });
      toast.success(t("contacts.deleted", "Contact deleted"));
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error(t("common.error", "Failed to delete contact"));
    } finally {
      setDeleteDialogOpen(false);
      setDeletingContact(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const canAddMore = (contacts?.length || 0) < LIMITS.EMERGENCY_CONTACTS;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {t("clientNav.emergencyContacts", "Emergency Contacts")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("contacts.subtitle", "People we call if you need help")}
          </p>
        </div>
        {canAddMore && (
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("contacts.addContact", "Add Contact")}
          </Button>
        )}
      </div>

      {/* Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{t("contacts.networkTitle", "Your Emergency Network")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("contacts.networkDesc", "These contacts will be called in order of priority if we can't reach you during an emergency. You can have up to 3 contacts.")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Grid */}
      {contacts && contacts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact, index) => (
            <Card key={contact.id} className={contact.is_primary ? "border-primary/50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {contact.contact_name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{contact.contact_name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                    </div>
                  </div>
                  <Badge variant={contact.is_primary ? "default" : "outline"}>
                    #{index + 1}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <PhoneIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{contact.phone}</span>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                {contact.speaks_spanish && (
                  <Badge variant="secondary" className="text-xs">
                    {t("contacts.speaksSpanish", "Speaks Spanish")}
                  </Badge>
                )}
                {contact.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {contact.notes}
                  </p>
                )}
                
                {/* Action Buttons */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => openEditDialog(contact)}
                  >
                    <Edit className="h-3 w-3" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive gap-1"
                    onClick={() => openDeleteDialog(contact.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("common.delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              {t("contacts.noContacts", "No Emergency Contacts")}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t("contacts.addPrompt", "Add emergency contacts so we can reach your loved ones if needed.")}
            </p>
            <Button onClick={openAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("contacts.addFirst", "Add Your First Contact")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Limit Notice */}
      {!canAddMore && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-muted-foreground">
              <UserPlus className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">
                {t("contacts.limitReached", "You've reached the maximum of 3 emergency contacts. Remove one to add another.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? t("contacts.editContact", "Edit Contact") : t("contacts.addContact", "Add Contact")}
            </DialogTitle>
            <DialogDescription>
              {t("contacts.dialogDesc", "Enter the details for your emergency contact.")}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">{t("common.name")} *</Label>
              <Input
                id="contact_name"
                {...form.register("contact_name")}
                placeholder={t("contacts.namePlaceholder")}
              />
              {form.formState.errors.contact_name && (
                <p className="text-sm text-destructive">{form.formState.errors.contact_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationship">{t("contacts.relationship", "Relationship")} *</Label>
              <Select
                value={form.watch("relationship")}
                onValueChange={(value) => form.setValue("relationship", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("contacts.selectRelationship")} />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_KEYS.map((rel) => (
                    <SelectItem key={rel.value} value={rel.value}>
                      {t(`contacts.relationships.${rel.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.relationship && (
                <p className="text-sm text-destructive">{form.formState.errors.relationship.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t("common.phone")} *</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                placeholder="+34 000 000 000"
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")} ({t("common.optional")})</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="email@example.com"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="speaks_spanish">{t("contacts.speaksSpanish", "Speaks Spanish")}</Label>
              <Switch
                id="speaks_spanish"
                checked={form.watch("speaks_spanish")}
                onCheckedChange={(checked) => form.setValue("speaks_spanish", checked)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t("common.notes")} ({t("common.optional")})</Label>
              <Textarea
                id="notes"
                {...form.register("notes")}
                placeholder={t("contacts.notesPlaceholder", "Any additional information...")}
                rows={2}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving} className="gap-2">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingContact ? t("common.save") : t("common.add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contacts.deleteTitle", "Delete Contact")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contacts.deleteConfirm", "Are you sure you want to remove this emergency contact? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
