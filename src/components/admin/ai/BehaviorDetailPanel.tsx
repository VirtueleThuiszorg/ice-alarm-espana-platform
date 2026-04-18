import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FileText,
    Brain,
    Settings2,
    GraduationCap,
    Sparkles,
    Wrench,
    Save,
    Loader2,
    X,
    ScrollText,
    Play,
    CheckSquare,
    XSquare,
    Bot,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
    useAIAgent,
    useAIAgentConfig,
    useAIMemory,
    useAIRuns,
    useAIActions,
    useCreateMemory,
    useDeleteMemory,
    useUpdateAgent,
    useUpdateAgentConfig,
    useRunAgent,
} from "@/hooks/useAIAgents";
import type { AIAgent, AIAgentConfig } from "@/hooks/useAIAgents";
import { useIsabellaSettings, useUpdateIsabellaSetting } from "@/hooks/useIsabellaSettings";
import { useAuth } from "@/contexts/AuthContext";
import type { LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FunctionDef {
    key: string;
    nameKey: string;
    descKey: string;
}

export interface BehaviorSection {
    id: string;
    titleKey: string;
    descKey: string;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    cardIconBg: string;
    agentKey: string;
    functions: FunctionDef[];
}

interface BehaviorDetailPanelProps {
    section: BehaviorSection;
    onClose: () => void;
}

/* ─── Icon Background Helper ────────────────────────────────────────── */

const ICON_BG_MAP: Record<string, string> = {
    "text-red-500": "bg-red-500/15",
    "text-blue-500": "bg-blue-500/15",
    "text-amber-500": "bg-amber-500/15",
    "text-green-500": "bg-green-500/15",
    "text-yellow-500": "bg-yellow-500/15",
    "text-teal-500": "bg-teal-500/15",
    "text-purple-500": "bg-purple-500/15",
    "text-orange-500": "bg-orange-500/15",
    "text-pink-500": "bg-pink-500/15",
    "text-emerald-500": "bg-emerald-500/15",
};

/* ─── Sub-Components ────────────────────────────────────────────────── */

function PromptsTab({ agent: _agent, config }: { agent: AIAgent; config: AIAgentConfig }) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [systemInstruction, setSystemInstruction] = useState(config.system_instruction);
    const [businessContext, setBusinessContext] = useState(config.business_context || "");
    const updateConfig = useUpdateAgentConfig();

    const handleSave = async () => {
        try {
            await updateConfig.mutateAsync({
                configId: config.id,
                updates: { system_instruction: systemInstruction, business_context: businessContext },
            });
            toast({ title: t("common.saved", "Saved"), description: t("ai.instructionsSaved", "Instructions saved successfully") });
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.systemInstruction", "System Instruction")}</CardTitle>
                    <CardDescription className="text-xs">
                        {t("ai.systemInstructionDesc", "The core instructions that define how this agent behaves.")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={systemInstruction}
                        onChange={(e) => setSystemInstruction(e.target.value)}
                        rows={10}
                        className="font-mono text-sm"
                        placeholder={t("ai.behaviors.promptPlaceholder", "Enter the system prompt for this behavior...")}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.businessContext", "Business Context")}</CardTitle>
                    <CardDescription className="text-xs">
                        {t("ai.businessContextDesc", "Additional context about your business for the agent.")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Textarea
                        value={businessContext}
                        onChange={(e) => setBusinessContext(e.target.value)}
                        rows={5}
                        className="font-mono text-sm"
                        placeholder={t("ai.behaviors.contextPlaceholder", "Describe the business context, products, pricing, etc...")}
                    />
                    <Button onClick={handleSave} disabled={updateConfig.isPending} size="sm">
                        {updateConfig.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        {t("common.save", "Save")}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function MemoryTab({ agent }: { agent: AIAgent }) {
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
            await createMemory.mutateAsync({
                scope: "agent",
                agent_id: agent.id,
                title,
                content,
                importance,
                tags: [],
                scope_id: null,
            });
            toast({ title: t("common.created", "Created") });
            setOpen(false);
            setTitle("");
            setContent("");
            setImportance(5);
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMemory.mutateAsync(id);
            toast({ title: t("common.deleted", "Deleted") });
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    if (isLoading) return <Skeleton className="h-40" />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h4 className="text-sm font-medium">{t("ai.knowledgeBase", "Knowledge Base")}</h4>
                    <p className="text-xs text-muted-foreground">{t("ai.behaviors.memoryDesc", "Things Isabella remembers when handling this behavior.")}</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">{t("ai.addMemory", "Add Memory")}</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t("ai.addMemory", "Add Memory")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <Input placeholder={t("ai.memoryTitle", "Title")} value={title} onChange={(e) => setTitle(e.target.value)} />
                            <Textarea placeholder={t("ai.memoryContent", "Content")} value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
                            <div>
                                <label className="text-sm">
                                    {t("ai.importance", "Importance")}: {importance}
                                </label>
                                <Slider value={[importance]} onValueChange={(v) => setImportance(v[0])} min={1} max={10} step={1} />
                            </div>
                            <Button onClick={handleCreate} disabled={!title || !content} size="sm">
                                {t("common.create", "Create")}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            {memories && memories.length > 0 ? (
                <div className="grid gap-2">
                    {memories.map((m) => (
                        <div key={m.id} className="flex items-start justify-between p-3 border rounded-lg bg-card">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm">{m.title}</p>
                                    <Badge variant="outline" className="text-[10px]">
                                        ⭐ {m.importance}
                                    </Badge>
                                    {m.scope === "global" && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.content}</p>
                            </div>
                            {m.scope !== "global" && (
                                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDelete(m.id)}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 space-y-3">
                    <Brain className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                        {t("ai.behaviors.noMemories", "No memories yet. Add knowledge for Isabella to use.")}
                    </p>
                </div>
            )}
        </div>
    );
}

function ToolsTab({ agent, config }: { agent: AIAgent; config: AIAgentConfig }) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [mode, setMode] = useState(agent.mode);
    const [readPerms, setReadPerms] = useState<string[]>(config.read_permissions || []);
    const [writePerms, setWritePerms] = useState<string[]>(config.write_permissions || []);
    const [toolPolicy, setToolPolicy] = useState<Record<string, boolean>>(config.tool_policy || {});
    const updateAgent = useUpdateAgent();
    const updateConfig = useUpdateAgentConfig();

    const ALL_READ = ["orders", "members", "partners", "leads", "tickets", "conversations", "alerts", "tasks", "subscriptions", "payments", "products", "faqs", "knowledge_base"];
    const ALL_WRITE = ["task_create", "note_create", "whatsapp_notify", "escalate", "chat_reply", "lead_create", "ticket_create", "draft_response", "request_human"];

    const toggleRead = (p: string) => setReadPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
    const toggleWrite = (p: string) => setWritePerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
    const toggleToolPolicy = (key: string) => setToolPolicy((prev) => ({ ...prev, [key]: !prev[key] }));

    const handleSave = async () => {
        try {
            await updateAgent.mutateAsync({ agentId: agent.id, updates: { mode } });
            await updateConfig.mutateAsync({
                configId: config.id,
                updates: { read_permissions: readPerms, write_permissions: writePerms, tool_policy: toolPolicy },
            });
            toast({ title: t("common.saved", "Saved") });
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.operatingMode", "Operating Mode")}</CardTitle>
                    <CardDescription className="text-xs">
                        {t("ai.behaviors.operatingModeDesc", "Controls how Isabella acts: observe only, draft actions for approval, or act automatically.")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                        <SelectTrigger className="w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="advise_only">{t("ai.modes.adviseOnly", "Advise Only")}</SelectItem>
                            <SelectItem value="draft_only">{t("ai.modes.draftOnly", "Draft Only")}</SelectItem>
                            <SelectItem value="auto_act">{t("ai.modes.autoAct", "Auto Act")}</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.readPermissions", "Read Permissions")}</CardTitle>
                    <CardDescription className="text-xs">
                        {t("ai.behaviors.readPermsDesc", "Data sources Isabella can read when processing this behavior.")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                    {ALL_READ.map((p) => (
                        <Badge
                            key={p}
                            variant={readPerms.includes(p) ? "default" : "outline"}
                            className="cursor-pointer text-xs capitalize"
                            onClick={() => toggleRead(p)}
                        >
                            {p.replace(/_/g, " ")}
                        </Badge>
                    ))}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.writePermissions", "Write Permissions")}</CardTitle>
                    <CardDescription className="text-xs">
                        {t("ai.behaviors.writePermsDesc", "Actions Isabella is permitted to take.")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {ALL_WRITE.map((p) => (
                        <div key={p} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Switch checked={writePerms.includes(p)} onCheckedChange={() => toggleWrite(p)} />
                                <Label className="text-sm capitalize">{p.replace(/_/g, " ")}</Label>
                            </div>
                            {writePerms.includes(p) && mode === "auto_act" && (
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs text-muted-foreground">{t("ai.autoExecute", "Auto Execute")}</Label>
                                    <Switch checked={!!toolPolicy[p]} onCheckedChange={() => toggleToolPolicy(p)} />
                                </div>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>
            <Button onClick={handleSave} size="sm" disabled={updateAgent.isPending || updateConfig.isPending}>
                {(updateAgent.isPending || updateConfig.isPending) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <Save className="h-4 w-4 mr-2" />
                )}
                {t("common.save", "Save")}
            </Button>
        </div>
    );
}

function TrainingTab({ agent }: { agent: AIAgent }) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { data: memories, isLoading } = useAIMemory(agent.id);
    const createMemory = useCreateMemory();
    const deleteMemory = useDeleteMemory();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [importance, setImportance] = useState(5);

    const trainingEntries = (memories?.filter((m) => m.tags?.includes("training")) || []);

    const handleCreate = async () => {
        try {
            await createMemory.mutateAsync({
                scope: "agent",
                agent_id: agent.id,
                scope_id: null,
                title: title.trim(),
                content: content.trim(),
                importance,
                tags: ["training"],
            });
            toast({ title: t("common.created", "Created") });
            setOpen(false);
            setTitle("");
            setContent("");
            setImportance(5);
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    if (isLoading) return <Skeleton className="h-40" />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h4 className="text-sm font-medium">{t("ai.trainingData", "Training Data")}</h4>
                    <p className="text-xs text-muted-foreground">{t("ai.trainingDataDesc", "Q&A pairs and examples that help train this agent.")}</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">{t("ai.addTraining", "Add Training")}</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t("ai.addTraining", "Add Training")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <Input placeholder={t("ai.trainingTitlePlaceholder", "Question / Scenario title")} value={title} onChange={(e) => setTitle(e.target.value)} />
                            <Textarea placeholder={t("ai.trainingContentPlaceholder", "Answer / Example response")} value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
                            <div>
                                <label className="text-sm">{t("ai.importance", "Importance")}: {importance}</label>
                                <Slider value={[importance]} onValueChange={(v) => setImportance(v[0])} min={1} max={10} step={1} />
                            </div>
                            <Button onClick={handleCreate} disabled={!title.trim() || !content.trim()} size="sm">
                                {t("common.create", "Create")}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            {trainingEntries.length > 0 ? (
                <div className="space-y-2">
                    {trainingEntries.map((e) => (
                        <div key={e.id} className="p-3 border rounded-lg bg-card">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-sm">{e.title}</p>
                                        <Badge variant="outline" className="text-[10px]">⭐ {e.importance}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.content}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => deleteMemory.mutateAsync(e.id)}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 space-y-3">
                    <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                        {t("ai.noTrainingData", "No training data added yet. Click 'Add Training' to create a Q&A pair.")}
                    </p>
                </div>
            )}
        </div>
    );
}

function PersonalityTab({ agent: _agent, config }: { agent: AIAgent; config: AIAgentConfig }) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const updateConfig = useUpdateAgentConfig();

    const langPolicy = config.language_policy || {};
    const [tone, setTone] = useState(langPolicy.tone || "professional");
    const [formality, setFormality] = useState(langPolicy.formality || "semi-formal");
    const [responseLength, setResponseLength] = useState(langPolicy.response_length || "concise");
    const [language, setLanguage] = useState(langPolicy.primary_language || "en");
    const [empathy, setEmpathy] = useState(langPolicy.empathy_level ?? 7);

    const handleSave = async () => {
        try {
            await updateConfig.mutateAsync({
                configId: config.id,
                updates: {
                    language_policy: {
                        ...langPolicy,
                        tone,
                        formality,
                        response_length: responseLength,
                        primary_language: language,
                        empathy_level: empathy,
                    },
                },
            });
            toast({ title: t("common.saved", "Saved") });
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.behaviors.personality.tone", "Tone & Style")}</CardTitle>
                    <CardDescription className="text-xs">{t("ai.behaviors.personality.toneDesc", "How Isabella speaks when handling this behavior.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm">{t("ai.behaviors.personality.toneLabel", "Tone")}</Label>
                            <Select value={tone} onValueChange={setTone}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="professional">Professional</SelectItem>
                                    <SelectItem value="warm">Warm & Friendly</SelectItem>
                                    <SelectItem value="empathetic">Empathetic</SelectItem>
                                    <SelectItem value="direct">Direct & Efficient</SelectItem>
                                    <SelectItem value="reassuring">Reassuring</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">{t("ai.behaviors.personality.formalityLabel", "Formality")}</Label>
                            <Select value={formality} onValueChange={setFormality}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="formal">Formal</SelectItem>
                                    <SelectItem value="semi-formal">Semi-Formal</SelectItem>
                                    <SelectItem value="casual">Casual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">{t("ai.behaviors.personality.lengthLabel", "Response Length")}</Label>
                            <Select value={responseLength} onValueChange={setResponseLength}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="brief">Brief</SelectItem>
                                    <SelectItem value="concise">Concise</SelectItem>
                                    <SelectItem value="detailed">Detailed</SelectItem>
                                    <SelectItem value="comprehensive">Comprehensive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">{t("ai.behaviors.personality.languageLabel", "Primary Language")}</Label>
                            <Select value={language} onValueChange={setLanguage}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="es">Español</SelectItem>
                                    <SelectItem value="auto">Auto-Detect</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">
                            {t("ai.behaviors.personality.empathyLabel", "Empathy Level")}: {empathy}/10
                        </Label>
                        <Slider value={[empathy]} onValueChange={(v) => setEmpathy(v[0])} min={1} max={10} step={1} />
                        <p className="text-xs text-muted-foreground">
                            {empathy <= 3
                                ? t("ai.behaviors.personality.empathyLow", "Factual and direct")
                                : empathy <= 6
                                    ? t("ai.behaviors.personality.empathyMid", "Balanced and considerate")
                                    : t("ai.behaviors.personality.empathyHigh", "Highly empathetic and caring")}
                        </p>
                    </div>
                    <Button onClick={handleSave} size="sm" disabled={updateConfig.isPending}>
                        {updateConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {t("common.save", "Save")}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function FunctionsTab({ section }: { section: BehaviorSection }) {
    const { t } = useTranslation();
    const { data: settings } = useIsabellaSettings();
    const updateSetting = useUpdateIsabellaSetting();
    const { user } = useAuth();

    const settingsMap = (settings || []).reduce<Record<string, any>>((acc, s) => {
        acc[s.function_key] = s;
        return acc;
    }, {});

    const handleToggle = (functionKey: string, enabled: boolean) => {
        const setting = settingsMap[functionKey];
        if (!setting) return;
        updateSetting.mutate({ id: setting.id, enabled, staffId: user?.id });
    };

    const activeCount = section.functions.filter((f) => settingsMap[f.key]?.enabled).length;
    const allActive = activeCount === section.functions.length;
    const noneActive = activeCount === 0;

    const handleBatchToggle = (enable: boolean) => {
        section.functions.forEach((fn) => {
            const setting = settingsMap[fn.key];
            if (setting && setting.enabled !== enable) {
                updateSetting.mutate({ id: setting.id, enabled: enable, staffId: user?.id });
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-medium">{t("ai.behaviors.functionsTitle", "Operational Functions")}</h4>
                    <p className="text-xs text-muted-foreground">{t("ai.behaviors.functionsDesc", "Toggle individual functions Isabella handles in this behavior area.")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={activeCount > 0 ? "default" : "secondary"} className="text-xs">
                        {activeCount}/{section.functions.length} {t("ai.behaviors.active", "active")}
                    </Badge>
                    {!allActive && (
                        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleBatchToggle(true)}>
                            <CheckSquare className="h-3 w-3" />
                            {t("ai.behaviors.enableAll", "Enable All")}
                        </Button>
                    )}
                    {!noneActive && (
                        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleBatchToggle(false)}>
                            <XSquare className="h-3 w-3" />
                            {t("ai.behaviors.disableAll", "Disable All")}
                        </Button>
                    )}
                </div>
            </div>
            <div className="space-y-1">
                {section.functions.map((fn) => {
                    const setting = settingsMap[fn.key];
                    return (
                        <div
                            key={fn.key}
                            className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                            <div className="min-w-0">
                                <p className="font-medium text-sm">{t(fn.nameKey)}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{t(fn.descKey)}</p>
                            </div>
                            <Switch
                                checked={setting?.enabled ?? false}
                                onCheckedChange={(checked) => handleToggle(fn.key, checked)}
                                disabled={updateSetting.isPending}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AuditTab({ agent }: { agent: AIAgent }) {
    const { t } = useTranslation();
    const { data: runs, isLoading: runsLoading } = useAIRuns(agent.id, 20);
    const { data: actions, isLoading: actionsLoading } = useAIActions();

    if (runsLoading || actionsLoading) return <Skeleton className="h-40" />;

    const agentRuns = runs || [];
    const runIds = new Set(agentRuns.map((r) => r.id));
    const agentActions = (actions || []).filter((a) => runIds.has(a.run_id));

    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-sm font-medium mb-3">{t("ai.recentRuns", "Recent Runs")}</h4>
                {agentRuns.length > 0 ? (
                    <div className="space-y-1">
                        {agentRuns.slice(0, 10).map((run) => (
                            <div key={run.id} className="flex items-center justify-between py-2 px-3 border rounded-lg text-sm">
                                <div className="flex items-center gap-3">
                                    <Badge
                                        variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}
                                        className="text-[10px]"
                                    >
                                        {run.status}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    {run.tokens_used && <span>{run.tokens_used} tokens</span>}
                                    {run.duration_ms && <span>{run.duration_ms}ms</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 space-y-2">
                        <ScrollText className="h-8 w-8 mx-auto text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t("ai.behaviors.noRuns", "No runs recorded yet.")}</p>
                    </div>
                )}
            </div>

            <div>
                <h4 className="text-sm font-medium mb-3">{t("ai.recentActions", "Recent Actions")}</h4>
                {agentActions.length > 0 ? (
                    <div className="space-y-1">
                        {agentActions.slice(0, 10).map((action) => (
                            <div key={action.id} className="flex items-center justify-between py-2 px-3 border rounded-lg text-sm">
                                <div className="flex items-center gap-3">
                                    <Badge
                                        variant={action.status === "executed" ? "default" : action.status === "rejected" ? "destructive" : "secondary"}
                                        className="text-[10px]"
                                    >
                                        {action.status}
                                    </Badge>
                                    <span className="font-medium text-xs capitalize">{action.action_type.replace(/_/g, " ")}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">{t("ai.behaviors.noActions", "No actions recorded yet.")}</p>
                )}
            </div>
        </div>
    );
}

function SimulatorTab({ agent }: { agent: AIAgent }) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const runAgent = useRunAgent();
    const [context, setContext] = useState("{}");
    const [output, setOutput] = useState<string | null>(null);

    const handleRun = async () => {
        try {
            const parsed = JSON.parse(context);
            const result = await runAgent.mutateAsync({
                agentKey: agent.agent_key,
                context: parsed,
                simulationMode: true,
            });
            setOutput(JSON.stringify(result, null, 2));
            toast({ title: t("ai.simulationComplete", "Simulation completed") });
        } catch (err: any) {
            if (err instanceof SyntaxError) {
                toast({ title: t("ai.behaviors.invalidJson", "Invalid JSON"), description: err.message, variant: "destructive" });
            } else {
                toast({ title: t("common.error", "Error"), variant: "destructive" });
            }
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("ai.inputContext", "Input Context")}</CardTitle>
                    <CardDescription className="text-xs">{t("ai.inputContextDesc", "Provide JSON context to simulate an agent run.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Textarea
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        rows={6}
                        className="font-mono text-sm"
                        placeholder='{"event_type": "...", "data": {}}'
                    />
                    <Button onClick={handleRun} disabled={runAgent.isPending} size="sm">
                        {runAgent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        {t("ai.runSimulation", "Run Simulation")}
                    </Button>
                </CardContent>
            </Card>
            {output && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t("ai.output", "Output")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                            {output}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/* ─── Agent Name Helper ─────────────────────────────────────────────── */

const AGENT_NAMES: Record<string, string> = {
    customer_service_expert: "Customer Service & Sales Expert",
    main_brain: "Main Brain",
    member_specialist: "Member Specialist",
};

/* ─── Main Detail Panel ─────────────────────────────────────────────── */

export function BehaviorDetailPanel({ section, onClose }: BehaviorDetailPanelProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("functions");

    const { data: agent, isLoading: agentLoading } = useAIAgent(section.agentKey);
    const { data: config, isLoading: configLoading } = useAIAgentConfig(agent?.id);

    const Icon = section.icon;
    const isLoading = agentLoading || configLoading;
    const iconBgClass = ICON_BG_MAP[section.iconColor] || "bg-muted";

    return (
        <Card className="border-2 border-primary/20 shadow-lg animate-in slide-in-from-top-2 duration-300">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBgClass}`}>
                            <Icon className={`h-5 w-5 ${section.iconColor}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg">{t(section.titleKey)}</CardTitle>
                                <Badge variant="outline" className="text-[10px] gap-1">
                                    <Bot className="h-3 w-3" />
                                    {agent?.name || AGENT_NAMES[section.agentKey] || section.agentKey}
                                </Badge>
                            </div>
                            <CardDescription className="text-xs">{t(section.descKey)}</CardDescription>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                ) : !agent || !config ? (
                    <div className="text-center py-8">
                        <Bot className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-muted-foreground text-sm">
                            {t("ai.behaviors.noAgent", "No AI agent configured for this behavior yet.")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("ai.behaviors.noAgentHint", "You can still toggle individual functions below.")}
                        </p>
                        <div className="mt-6 text-left">
                            <FunctionsTab section={section} />
                        </div>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="w-full h-9 flex flex-wrap justify-start gap-0.5">
                            <TabsTrigger value="functions" className="text-xs gap-1.5">
                                <Wrench className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.functions", "Functions")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="prompts" className="text-xs gap-1.5">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.prompts", "Prompts")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="memory" className="text-xs gap-1.5">
                                <Brain className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.memory", "Memory")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="tools" className="text-xs gap-1.5">
                                <Settings2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.tools", "Tools")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="training" className="text-xs gap-1.5">
                                <GraduationCap className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.training", "Training")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="personality" className="text-xs gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.personality", "Personality")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="audit" className="text-xs gap-1.5">
                                <ScrollText className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.audit", "Audit Log")}</span>
                            </TabsTrigger>
                            <TabsTrigger value="simulator" className="text-xs gap-1.5">
                                <Play className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("ai.behaviors.tabs.simulator", "Simulator")}</span>
                            </TabsTrigger>
                        </TabsList>
                        <div className="mt-4">
                            <TabsContent value="functions" className="mt-0">
                                <FunctionsTab section={section} />
                            </TabsContent>
                            <TabsContent value="prompts" className="mt-0">
                                <PromptsTab agent={agent} config={config} />
                            </TabsContent>
                            <TabsContent value="memory" className="mt-0">
                                <MemoryTab agent={agent} />
                            </TabsContent>
                            <TabsContent value="tools" className="mt-0">
                                <ToolsTab agent={agent} config={config} />
                            </TabsContent>
                            <TabsContent value="training" className="mt-0">
                                <TrainingTab agent={agent} />
                            </TabsContent>
                            <TabsContent value="personality" className="mt-0">
                                <PersonalityTab agent={agent} config={config} />
                            </TabsContent>
                            <TabsContent value="audit" className="mt-0">
                                <AuditTab agent={agent} />
                            </TabsContent>
                            <TabsContent value="simulator" className="mt-0">
                                <SimulatorTab agent={agent} />
                            </TabsContent>
                        </div>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}
