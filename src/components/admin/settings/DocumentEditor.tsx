import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Loader2 } from "lucide-react";
import {
  Documentation,
  DocumentCategory,
  DocumentStatus,
  VisibilityType,
  CreateDocumentInput,
  UpdateDocumentInput,
  useCreateDocument,
  useUpdateDocument,
} from "@/hooks/useDocumentation";

interface DocumentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: Documentation | null;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'general', label: 'General Procedures' },
  { value: 'member_guide', label: 'Member Guides' },
  { value: 'staff', label: 'Staff Instructions' },
  { value: 'device', label: 'Device Guides' },
  { value: 'emergency', label: 'Emergency Protocols' },
  { value: 'partner', label: 'Partner Information' },
];

const VISIBILITY_OPTIONS: { value: VisibilityType; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'member', label: 'Members' },
  { value: 'ai', label: 'AI Agents' },
];

export function DocumentEditor({ open, onOpenChange, document }: DocumentEditorProps) {
  const createMutation = useCreateDocument();
  const updateMutation = useUpdateDocument();
  const isEditing = !!document;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("general");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<VisibilityType[]>(["admin"]);
  const [importance, setImportance] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [status, setStatus] = useState<DocumentStatus>("draft");

  // Reset form when document changes or dialog opens
  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setCategory(document.category);
      setContent(document.content);
      setVisibility(document.visibility);
      setImportance(document.importance);
      setTags(document.tags);
      setLanguage(document.language as "en" | "es");
      setStatus(document.status);
    } else {
      setTitle("");
      setCategory("general");
      setContent("");
      setVisibility(["admin"]);
      setImportance(5);
      setTags([]);
      setLanguage("en");
      setStatus("draft");
    }
  }, [document, open]);

  const handleVisibilityChange = (value: VisibilityType, checked: boolean) => {
    if (checked) {
      setVisibility([...visibility, value]);
    } else {
      setVisibility(visibility.filter((v) => v !== value));
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    if (isEditing && document) {
      const input: UpdateDocumentInput = {
        id: document.id,
        title,
        category,
        content,
        visibility,
        importance,
        tags,
        language,
        status,
      };
      await updateMutation.mutateAsync(input);
    } else {
      const input: CreateDocumentInput = {
        title,
        category,
        content,
        visibility,
        importance,
        tags,
        language,
        status,
      };
      await createMutation.mutateAsync(input);
    }
    onOpenChange(false);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Document" : "Add Document"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown supported)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your document content here..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex flex-wrap gap-4">
              {VISIBILITY_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`vis-${opt.value}`}
                    checked={visibility.includes(opt.value)}
                    onCheckedChange={(checked) =>
                      handleVisibilityChange(opt.value, checked as boolean)
                    }
                  />
                  <Label htmlFor={`vis-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Importance */}
          <div className="space-y-2">
            <Label>Importance (AI Priority): {importance}</Label>
            <Slider
              value={[importance]}
              onValueChange={([v]) => setImportance(v)}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Higher importance = higher priority for AI agents
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Language & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "es")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DocumentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
