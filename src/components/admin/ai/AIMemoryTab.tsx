import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAIMemory, useCreateMemory, useDeleteMemory } from "@/hooks/useAIAgents";
import type { AIAgent } from "@/hooks/useAIAgents";

interface AIMemoryTabProps { agent: AIAgent; }

export function AIMemoryTab({ agent }: AIMemoryTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: memories, isLoading } = useAIMemory(agent.id);
  const createMemory = useCreateMemory();
  const deleteMemory = useDeleteMemory();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(5);

  const handleCreate = async () => {
    try {
      await createMemory.mutateAsync({ scope: "agent", agent_id: agent.id, title, content, importance, tags: [], scope_id: null });
      toast({ title: t("common.created", "Created") });
      setOpen(false);
      setTitle(""); setContent(""); setImportance(5);
    } catch { toast({ title: t("common.error", "Error"), variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMemory.mutateAsync(id); toast({ title: t("common.deleted", "Deleted") }); }
    catch { toast({ title: t("common.error", "Error"), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{t("ai.knowledgeBase", "Knowledge Base")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t("ai.addMemory", "Add Memory")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("ai.addMemory", "Add Memory")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={t("ai.memoryTitle", "Title")} value={title} onChange={e => setTitle(e.target.value)} />
              <Textarea placeholder={t("ai.memoryContent", "Content")} value={content} onChange={e => setContent(e.target.value)} rows={4} />
              <div><label className="text-sm">{t("ai.importance", "Importance")}: {importance}</label><Slider value={[importance]} onValueChange={v => setImportance(v[0])} min={1} max={10} step={1} /></div>
              <Button onClick={handleCreate} disabled={!title || !content}>{t("common.create", "Create")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <p>{t("common.loading", "Loading...")}</p> : (
        <div className="grid gap-3">
          {memories?.map(m => (
            <Card key={m.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">{m.title}<Badge variant="outline" className="ml-2"><Star className="h-3 w-3 mr-1" />{m.importance}</Badge>{m.scope === "global" && <Badge variant="secondary">Global</Badge>}</CardTitle>
                </div>
                {m.scope !== "global" && <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>}
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{m.content}</p></CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
