import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, Plus, Pin, PinOff, Edit, Trash2, Search,
  FileText, Stethoscope, CreditCard, HeadphonesIcon, 
  CalendarCheck, AlertCircle, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";

const noteSchema = z.object({
  note_type: z.enum(["general", "medical", "payment", "support", "followup", "complaint"]),
  content: z.string().min(1, "Note content is required"),
  is_pinned: z.boolean().default(false),
  is_private: z.boolean().default(false),
  followup_date: z.string().optional(),
});

type NoteFormValues = z.infer<typeof noteSchema>;

interface Note {
  id: string;
  note_type: string;
  content: string;
  is_pinned: boolean | null;
  is_private: boolean | null;
  followup_date: string | null;
  followup_completed: boolean | null;
  created_at: string;
  staff: {
    first_name: string;
    last_name: string;
  } | null;
}

const noteTypeConfig: Record<string, { icon: any; label: string; color: string }> = {
  general: { icon: FileText, label: "General", color: "bg-secondary" },
  medical: { icon: Stethoscope, label: "Medical", color: "bg-red-500/10 text-red-500" },
  payment: { icon: CreditCard, label: "Payment", color: "bg-green-500/10 text-green-500" },
  support: { icon: HeadphonesIcon, label: "Support", color: "bg-blue-500/10 text-blue-500" },
  followup: { icon: CalendarCheck, label: "Follow-up", color: "bg-yellow-500/10 text-yellow-500" },
  complaint: { icon: AlertCircle, label: "Complaint", color: "bg-orange-500/10 text-orange-500" },
};

interface NotesTabProps {
  memberId: string;
}

export function NotesTab({ memberId }: NotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      note_type: "general",
      content: "",
      is_pinned: false,
      is_private: false,
      followup_date: "",
    },
  });

  useEffect(() => {
    fetchNotes();
  }, [memberId]);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("member_notes")
        .select(`
          *,
          staff:staff_id (first_name, last_name)
        `)
        .eq("member_id", memberId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes((data || []) as Note[]);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingNote(null);
    form.reset({
      note_type: "general",
      content: "",
      is_pinned: false,
      is_private: false,
      followup_date: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (note: Note) => {
    setEditingNote(note);
    form.reset({
      note_type: note.note_type as any,
      content: note.content,
      is_pinned: note.is_pinned ?? false,
      is_private: note.is_private ?? false,
      followup_date: note.followup_date || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: NoteFormValues) => {
    setIsSaving(true);
    try {
      // Get current staff ID
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();

      if (editingNote) {
        const { error } = await supabase
          .from("member_notes")
          .update({
            ...data,
            followup_date: data.followup_date || null,
          })
          .eq("id", editingNote.id);
        if (error) throw error;
        toast.success("Note updated");
      } else {
        const { error } = await supabase
          .from("member_notes")
          .insert([{
            content: data.content || "",
            note_type: data.note_type,
            is_pinned: data.is_pinned,
            is_private: data.is_private,
            member_id: memberId,
            staff_id: staffData?.id,
            followup_date: data.followup_date || null,
          }]);
        if (error) throw error;
        toast.success("Note added");
      }

      setIsDialogOpen(false);
      fetchNotes();
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (note: Note) => {
    try {
      const { error } = await supabase
        .from("member_notes")
        .update({ is_pinned: !note.is_pinned })
        .eq("id", note.id);
      if (error) throw error;
      fetchNotes();
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast.error("Failed to update note");
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      const { error } = await supabase
        .from("member_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
      toast.success("Note deleted");
      fetchNotes();
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note");
    }
  };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch = note.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || note.note_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.is_pinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.is_pinned);

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
          <CardTitle>CRM Notes</CardTitle>
          <CardDescription>Internal notes and follow-ups for this member</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Note
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingNote ? "Edit Note" : "Add Note"}</DialogTitle>
              <DialogDescription>
                {editingNote ? "Update the note details." : "Add a new note for this member."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="note_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(noteTypeConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <config.icon className="h-4 w-4" />
                                {config.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter note details..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="followup_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-6">
                  <FormField
                    control={form.control}
                    name="is_pinned"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Pin this note</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_private"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Private (admin only)</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingNote ? "Update" : "Add"} Note
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(noteTypeConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pinned Notes */}
        {pinnedNotes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Pin className="h-4 w-4" />
              PINNED
            </h4>
            {pinnedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onTogglePin={togglePin}
                onEdit={openEditDialog}
                onDelete={deleteNote}
              />
            ))}
          </div>
        )}

        {/* Recent Notes */}
        <div className="space-y-2">
          {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
            <h4 className="text-sm font-medium text-muted-foreground">RECENT NOTES</h4>
          )}
          {unpinnedNotes.length === 0 && pinnedNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No notes found</p>
            </div>
          ) : (
            unpinnedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onTogglePin={togglePin}
                onEdit={openEditDialog}
                onDelete={deleteNote}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NoteCard({
  note,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  note: Note;
  onTogglePin: (note: Note) => void;
  onEdit: (note: Note) => void;
  onDelete: (noteId: string) => void;
}) {
  const config = noteTypeConfig[note.note_type] || noteTypeConfig.general;
  const Icon = config.icon;

  return (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Badge className={config.color}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
          {note.is_private && (
            <Badge variant="outline" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Private
            </Badge>
          )}
          {note.followup_date && !note.followup_completed && (
            <Badge variant="secondary" className="text-xs">
              Follow-up: {format(new Date(note.followup_date), "MMM d")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onTogglePin(note)}
          >
            {note.is_pinned ? (
              <PinOff className="h-4 w-4" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(note)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(note.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
      <p className="text-xs text-muted-foreground">
        By: {note.staff?.first_name} {note.staff?.last_name} • {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
      </p>
    </div>
  );
}
