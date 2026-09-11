import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, Plus, Pin, PinOff, Edit, Trash2, Search,
  FileText, Stethoscope, CreditCard, HeadphonesIcon, 
  CalendarCheck, AlertCircle, Lock, Phone
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EditableCard } from "@/components/EditableCard";
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

/**
 * PAGINATION EXISTS BECAUSE OF THE KARMACRM MIGRATION.
 *
 * This tab used to fetch every note a member had, unpaginated, and filter them in the
 * browser. At a dozen hand-typed notes that was invisible. The karmaCRM history brings
 * 6,228 notes across 314 people — the largest single file has 773 of them, and the
 * longest note is 19,340 characters — so "fetch them all and filter in JS" would have
 * meant several megabytes down the wire before the tab could paint.
 *
 * So: the search box and the type filter now go to Postgres, and the notes arrive a page
 * at a time, newest first, with a Load more. Pinned notes are fetched separately and in
 * full — there are only ever a handful, and half a pinned note is worse than none.
 */
const PAGE_SIZE = 25;

/**
 * The search term reaches PostgREST as a filter value, so the characters that mean
 * something to PostgREST or to LIKE are taken out rather than escaped. CLAUDE.md is
 * explicit about not building filter strings out of user input.
 */
function sanitiseSearch(raw: string): string {
  return raw.replace(/[%_,()\\*]/g, " ").trim();
}

const noteSchema = z.object({
  note_type: z.enum(["general", "medical", "payment", "support", "followup", "complaint", "call"]),
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
  /** 'karmacrm' on an imported note, null on one somebody typed here. */
  source: string | null;
  staff: {
    first_name: string;
    last_name: string;
  } | null;
}

const noteTypeConfig: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  general: { icon: FileText, label: "General", color: "bg-secondary text-secondary-foreground" },
  medical: { icon: Stethoscope, label: "Medical", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  payment: { icon: CreditCard, label: "Payment", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  support: { icon: HeadphonesIcon, label: "Support", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  followup: { icon: CalendarCheck, label: "Follow-up", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  complaint: { icon: AlertCircle, label: "Complaint", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  call: { icon: Phone, label: "Call", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
};

interface NotesTabProps {
  memberId: string;
}

export function NotesTab({ memberId }: NotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [unpinnedTotal, setUnpinnedTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
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

  /* The typed value drives the input; the debounced one drives the query, so a search
     across 773 notes is one request rather than one per keystroke. */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const search = sanitiseSearch(debouncedQuery);

  /** One page of unpinned notes, plus the whole (short) pinned list on the first page. */
  const fetchPage = useCallback(
    async (pageIndex: number) => {
      const base = () => {
        let q = supabase
          .from("member_notes")
          .select("*, staff:staff_id (first_name, last_name)", { count: "exact" })
          .eq("member_id", memberId);
        if (search) q = q.ilike("content", `%${search}%`);
        if (typeFilter !== "all") q = q.eq("note_type", typeFilter);
        return q;
      };

      /* `.not("is_pinned", "is", true)` rather than `.eq(..., false)`: the column is
         nullable, and an equality filter silently drops every NULL row. */
      const page = await base()
        .not("is_pinned", "is", true)
        .order("created_at", { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);
      if (page.error) throw page.error;

      const rows = (page.data || []) as unknown as Note[];
      setNotes((prev) => (pageIndex === 0 ? rows : [...prev, ...rows]));
      setUnpinnedTotal(page.count ?? rows.length);

      if (pageIndex === 0) {
        // Pinned notes are never paged: a member has a handful at most, and they are
        // pinned precisely so nobody has to go looking for them.
        const pinnedResult = await base()
          .is("is_pinned", true)
          .order("created_at", { ascending: false });
        if (pinnedResult.error) throw pinnedResult.error;
        setPinnedNotes((pinnedResult.data || []) as unknown as Note[]);
      }
    },
    [memberId, search, typeFilter]
  );

  /* Any change of member, search or filter starts again at page 0. */
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setPage(0);
    fetchPage(0)
      .catch((error) => {
        if (cancelled) return;
        console.error("Error fetching notes:", error);
        toast.error("Failed to load notes");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    const next = page + 1;
    setIsLoadingMore(true);
    try {
      await fetchPage(next);
      setPage(next);
    } catch (error) {
      console.error("Error fetching more notes:", error);
      toast.error("Failed to load more notes");
    } finally {
      setIsLoadingMore(false);
    }
  };

  /** After a write, re-read what is on screen rather than only the first page. */
  const refresh = async () => {
    try {
      for (let i = 0; i <= page; i++) await fetchPage(i);
    } catch (error) {
      console.error("Error refreshing notes:", error);
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
      note_type: note.note_type as NoteFormValues["note_type"],
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
      await refresh();
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
      await refresh();
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
      await refresh();
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note");
    }
  };

  /* Both lists come back already searched and filtered by Postgres; `notes` is the
     unpinned page set and `pinnedNotes` is the whole pinned list. Nothing is filtered
     again here — a second, client-side filter over a page is how a Load more starts
     silently dropping rows. */
  const unpinnedNotes = notes;
  const hasMore = unpinnedNotes.length < unpinnedTotal;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <EditableCard
      testId="notes-card"
      mode="manage"
      title="CRM Notes"
      description="Internal notes and follow-ups for this member"
      manageHint="Press Edit to add, change, pin or delete a note. Searching and filtering work either way."
      headerExtra={
        /*
          THE SEARCH AND THE FILTER STAY OUTSIDE THE FIELDSET. They read; they change nothing.
          Inside, a disabled fieldset would make a locked card unsearchable, which punishes the
          commonest thing anybody does here — finding the note about the daughter's number.
        */
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              aria-label="Search notes"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by type">
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
      }
    >
      <div className="space-y-4">
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
          {hasMore && (
            <div className="pt-2 text-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isLoadingMore}
                data-testid="notes-load-more"
              >
                {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Load more
              </Button>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                Showing {unpinnedNotes.length} of {unpinnedTotal}
              </p>
            </div>
          )}
        </div>
      </div>
    </EditableCard>
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
        {/* An imported note has no staff row — karmaCRM's API reports the account, not the
            person, so the author is genuinely unknown. Saying so beats "By:  •". */}
        {note.staff
          ? `By: ${note.staff.first_name} ${note.staff.last_name}`
          : note.source === "karmacrm"
            ? "Imported from karmaCRM"
            : "Author not recorded"}
        {" • "}
        {format(new Date(note.created_at), "d MMM yyyy")} (
        {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })})
      </p>
    </div>
  );
}
