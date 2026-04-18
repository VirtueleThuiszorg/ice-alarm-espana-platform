import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  User,
  Flag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface ShiftNote {
  id: string;
  noteContent: string;
  requiresFollowup: boolean;
  followupCompleted: boolean;
  createdAt: Date;
  staffName: string;
  memberName?: string;
  memberId?: string;
}

export default function ShiftNotesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [requiresFollowup, setRequiresFollowup] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "followup" | "completed">("all");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchNotes();
    fetchMembers();
  }, []);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("shift_notes")
        .select(`
          id,
          note_content,
          requires_followup,
          followup_completed,
          created_at,
          staff:staff_id (
            first_name,
            last_name
          ),
          member:member_id (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedNotes: ShiftNote[] = (data || []).map((note: any) => ({
        id: note.id,
        noteContent: note.note_content,
        requiresFollowup: note.requires_followup,
        followupCompleted: note.followup_completed,
        createdAt: new Date(note.created_at),
        staffName: note.staff ? `${note.staff.first_name} ${note.staff.last_name}` : "Unknown",
        memberName: note.member ? `${note.member.first_name} ${note.member.last_name}` : undefined,
        memberId: note.member_id,
      }));

      setNotes(formattedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast({ title: t("common.error", "Error"), description: t("shiftNotes.failedToLoad", "Failed to load shift notes"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .order("first_name");

      if (error) throw error;

      setMembers((data || []).map((m: any) => ({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`,
      })));
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast({ title: t("common.error", "Error"), description: t("shiftNotes.noteRequired", "Note content is required"), variant: "destructive" });
      return;
    }

    try {
      // Get staff id for current user
      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", user?.id ?? "")
        .single();

      const { error } = await supabase
        .from("shift_notes")
        .insert({
          note_content: newNote,
          requires_followup: requiresFollowup,
          staff_id: staffData?.id,
          member_id: selectedMemberId || null,
        });

      if (error) throw error;

      toast({ title: t("shiftNotes.noteAdded", "Note added"), description: t("shiftNotes.noteSaved", "Shift note has been saved") });
      setNewNote("");
      setRequiresFollowup(false);
      setSelectedMemberId("");
      setIsDialogOpen(false);
      fetchNotes();
    } catch (error) {
      console.error("Error adding note:", error);
      toast({ title: t("common.error", "Error"), description: t("shiftNotes.failedToAdd", "Failed to add note"), variant: "destructive" });
    }
  };

  const handleToggleFollowup = async (noteId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from("shift_notes")
        .update({ followup_completed: completed })
        .eq("id", noteId);

      if (error) throw error;

      setNotes(notes.map(note => 
        note.id === noteId ? { ...note, followupCompleted: completed } : note
      ));

      toast({ title: completed ? t("shiftNotes.markedCompleted", "Marked as completed") : t("shiftNotes.markedPending", "Marked as pending") });
    } catch (error) {
      console.error("Error updating note:", error);
      toast({ title: t("common.error", "Error"), description: t("shiftNotes.failedToUpdate", "Failed to update note"), variant: "destructive" });
    }
  };

  const filteredNotes = notes.filter(note => {
    if (filter === "followup") return note.requiresFollowup && !note.followupCompleted;
    if (filter === "completed") return note.followupCompleted;
    return true;
  });

  const pendingFollowups = notes.filter(n => n.requiresFollowup && !n.followupCompleted).length;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-background/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{t("shiftNotes.title", "Shift Notes")}</h1>
            <p className="text-muted-foreground">{t("shiftNotes.subtitle", "View and manage shift handover notes")}</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {t("shiftNotes.addNote", "Add Note")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("shiftNotes.addShiftNote", "Add Shift Note")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>{t("shiftNotes.note", "Note")}</Label>
                  <Textarea
                    placeholder={t("shiftNotes.notePlaceholder", "Enter shift note...")}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>

                <div>
                  <Label>{t("shiftNotes.relatedMember", "Related Member (Optional)")}</Label>
                  <Select value={selectedMemberId} onValueChange={(val) => setSelectedMemberId(val === "none" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("shiftNotes.selectMember", "Select a member...")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("shiftNotes.none", "None")}</SelectItem>
                      {members.map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="followup" 
                    checked={requiresFollowup}
                    onCheckedChange={(checked) => setRequiresFollowup(checked as boolean)}
                  />
                  <Label htmlFor="followup" className="flex items-center gap-1 cursor-pointer">
                    <Flag className="w-4 h-4 text-alert-battery" />
                    {t("shiftNotes.requiresFollowup", "Requires follow-up")}
                  </Label>
                </div>

                <Button onClick={handleAddNote} className="w-full">
                  {t("shiftNotes.saveNote", "Save Note")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button 
            variant={filter === "all" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilter("all")}
          >
            {t("shiftNotes.allNotes", "All Notes")}
            <Badge variant="secondary" className="ml-2">{notes.length}</Badge>
          </Button>
          <Button 
            variant={filter === "followup" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilter("followup")}
          >
            <Flag className="w-3 h-3 mr-1 text-alert-battery" />
            {t("shiftNotes.needsFollowup", "Needs Follow-up")}
            {pendingFollowups > 0 && (
              <Badge className="ml-2 bg-alert-battery">{pendingFollowups}</Badge>
            )}
          </Button>
          <Button 
            variant={filter === "completed" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilter("completed")}
          >
            <CheckCircle className="w-3 h-3 mr-1 text-status-active" />
            {t("shiftNotes.completed", "Completed")}
          </Button>
        </div>
      </div>

      {/* Notes List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("shiftNotes.loading", "Loading notes...")}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">{t("shiftNotes.noNotes", "No notes found")}</p>
              <p className="text-sm">{t("shiftNotes.startDocumenting", "Add a note to start documenting your shift")}</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <Card key={note.id} className={note.requiresFollowup && !note.followupCompleted ? "border-l-4 border-l-alert-battery" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          <User className="w-3 h-3 mr-1" />
                          {note.staffName}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {note.createdAt.toLocaleDateString()} {note.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Badge>
                        {note.memberName && (
                          <Badge variant="secondary" className="text-xs">
                            Re: {note.memberName}
                          </Badge>
                        )}
                        {note.requiresFollowup && !note.followupCompleted && (
                          <Badge className="bg-alert-battery text-white text-xs">
                            <Flag className="w-3 h-3 mr-1" />
                            {t("shiftNotes.needsFollowup", "Needs Follow-up")}
                          </Badge>
                        )}
                        {note.followupCompleted && (
                          <Badge className="bg-status-active text-white text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {t("shiftNotes.completed", "Completed")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{note.noteContent}</p>
                    </div>
                    
                    {note.requiresFollowup && (
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          checked={note.followupCompleted}
                          onCheckedChange={(checked) => handleToggleFollowup(note.id, checked as boolean)}
                        />
                        <Label className="text-xs text-muted-foreground">{t("shiftNotes.done", "Done")}</Label>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
