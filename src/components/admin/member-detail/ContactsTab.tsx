import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { 
  Loader2, Plus, Phone, Mail, MessageSquare, Edit, Trash2, 
  GripVertical, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createWhatsAppUrl, createTelUrl } from "@/hooks/useInputValidation";

const contactSchema = z.object({
  contact_name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
  speaks_spanish: z.boolean().default(false),
  is_primary: z.boolean().default(false),
  notes: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface Contact {
  id: string;
  contact_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  speaks_spanish: boolean | null;
  is_primary: boolean | null;
  priority_order: number;
  notes: string | null;
}

interface ContactsTabProps {
  memberId: string;
}

export function ContactsTab({ memberId }: ContactsTabProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contact_name: "",
      relationship: "",
      phone: "",
      email: "",
      speaks_spanish: false,
      is_primary: false,
      notes: "",
    },
  });

  useEffect(() => {
    fetchContacts();
  }, [memberId]);

  const fetchContacts = async () => {
    try {
      const { data, error } = await supabase
        .from("emergency_contacts")
        .select("*")
        .eq("member_id", memberId)
        .order("priority_order", { ascending: true });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error(t("emergencyContacts.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingContact(null);
    form.reset({
      contact_name: "",
      relationship: "",
      phone: "",
      email: "",
      speaks_spanish: false,
      is_primary: false,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    form.reset({
      contact_name: contact.contact_name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email || "",
      speaks_spanish: contact.speaks_spanish ?? false,
      is_primary: contact.is_primary ?? false,
      notes: contact.notes || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ContactFormValues) => {
    if (contacts.length >= 3 && !editingContact) {
      toast.error(t("emergencyContacts.maxContactsReached"));
      return;
    }

    setIsSaving(true);
    try {
      if (editingContact) {
        const { error } = await supabase
          .from("emergency_contacts")
          .update(data)
          .eq("id", editingContact.id);
        if (error) throw error;
        toast.success(t("emergencyContacts.updated"));
      } else {
        const { error } = await supabase
          .from("emergency_contacts")
          .insert([{
            contact_name: data.contact_name || "",
            phone: data.phone || "",
            relationship: data.relationship || "",
            email: data.email,
            speaks_spanish: data.speaks_spanish,
            is_primary: data.is_primary,
            notes: data.notes,
            member_id: memberId,
            priority_order: contacts.length + 1,
          }]);
        if (error) throw error;
        toast.success(t("emergencyContacts.added"));
      }
      
      setIsDialogOpen(false);
      fetchContacts();
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error(t("emergencyContacts.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    if (!confirm(t("emergencyContacts.deleteConfirm"))) return;
    
    try {
      const { error } = await supabase
        .from("emergency_contacts")
        .delete()
        .eq("id", contactId);
      if (error) throw error;
      toast.success(t("emergencyContacts.deleted"));
      fetchContacts();
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error(t("emergencyContacts.deleteFailed"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Emergency Contacts</CardTitle>
          <CardDescription>Up to 3 emergency contacts can be added.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} disabled={contacts.length >= 3}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContact ? "Edit Contact" : "Add Emergency Contact"}</DialogTitle>
              <DialogDescription>
                {editingContact ? "Update contact details." : "Add a new emergency contact for this member."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="Son, Daughter, Neighbor..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+34 XXX XXX XXX" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (optional)</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex gap-6">
                  <FormField
                    control={form.control}
                    name="speaks_spanish"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Speaks Spanish</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_primary"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Primary Contact</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Best time to call, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingContact ? "Update" : "Add"} Contact
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No emergency contacts added yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <div
                key={contact.id}
                className="flex items-start gap-4 p-4 border rounded-lg bg-muted/30"
              >
                <div className="flex items-center text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                  <span className="ml-1 text-sm font-medium">{index + 1}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{contact.contact_name}</h4>
                    <span className="text-sm text-muted-foreground">({contact.relationship})</span>
                    {contact.is_primary && (
                      <Badge variant="default" className="text-xs">Primary</Badge>
                    )}
                    {contact.speaks_spanish && (
                      <Badge variant="secondary" className="text-xs">Habla Español</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </span>
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </span>
                    )}
                  </div>
                  {contact.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{contact.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    asChild
                  >
                    <a href={createTelUrl(contact.phone)}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    asChild
                  >
                    <a href={createWhatsAppUrl(contact.phone)} target="_blank" rel="noopener noreferrer">
                      <MessageSquare className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => openEditDialog(contact)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteContact(contact.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
