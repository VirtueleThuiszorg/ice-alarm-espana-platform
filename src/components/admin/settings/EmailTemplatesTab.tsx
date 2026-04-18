import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Loader2,
  Save,
  Eye,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useEmailTemplates, type EmailTemplate, type EmailTemplateUpdate } from "@/hooks/useEmailTemplates";

const MODULE_COLORS: Record<string, string> = {
  member: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  outreach: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  support: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  system: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

export function EmailTemplatesTab() {
  const { t } = useTranslation();
  const { templates, isLoading, updateTemplate, isUpdating, toggleTemplate, isToggling } = useEmailTemplates();
  
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editState, setEditState] = useState<EmailTemplateUpdate>({});
  const [previewLanguage, setPreviewLanguage] = useState<"en" | "es">("en");
  const [showPreview, setShowPreview] = useState(false);

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditState({
      name: template.name,
      description: template.description,
      subject_en: template.subject_en,
      subject_es: template.subject_es,
      body_html_en: template.body_html_en,
      body_html_es: template.body_html_es,
    });
  };

  const handleSave = () => {
    if (!selectedTemplate) return;
    updateTemplate({ id: selectedTemplate.id, updates: editState });
  };

  const handleToggle = (template: EmailTemplate) => {
    toggleTemplate({ id: template.id, isActive: !template.is_active });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("settings.templates.title", "Email Templates")}
          </CardTitle>
          <CardDescription>
            {t("settings.templates.subtitle", "Manage email templates used across the platform")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Template List */}
            <div className="lg:col-span-1 space-y-2">
              <Label className="text-sm font-medium">Templates</Label>
              <div className="border rounded-lg divide-y max-h-[600px] overflow-auto">
                {templates?.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                      selectedTemplate?.id === template.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{template.name}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={MODULE_COLORS[template.module]}>
                          {template.module}
                        </Badge>
                        {!template.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            {t("common.inactive", "Inactive")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {template.slug}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Editor */}
            <div className="lg:col-span-2">
              {selectedTemplate ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{selectedTemplate.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedTemplate.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={selectedTemplate.is_active}
                        onCheckedChange={() => handleToggle(selectedTemplate)}
                        disabled={isToggling}
                      />
                      <span className="text-sm">
                        {selectedTemplate.is_active ? t("common.active", "Active") : t("common.inactive", "Inactive")}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  {/* Variables info */}
                  {selectedTemplate.variables.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {t("settings.templates.variables", "Available Variables")}:
                      </Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTemplate.variables.map((v) => (
                          <code key={v} className="text-xs bg-background px-1.5 py-0.5 rounded">
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  <Tabs defaultValue="en" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="en">English</TabsTrigger>
                      <TabsTrigger value="es">Español</TabsTrigger>
                    </TabsList>

                    <TabsContent value="en" className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("settings.templates.subjectEn", "Subject (English)")}</Label>
                        <Input
                          value={editState.subject_en || ""}
                          onChange={(e) => setEditState((prev) => ({ ...prev, subject_en: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("settings.templates.bodyEn", "Body (English)")}</Label>
                        <Textarea
                          value={editState.body_html_en || ""}
                          onChange={(e) => setEditState((prev) => ({ ...prev, body_html_en: e.target.value }))}
                          rows={12}
                          className="font-mono text-sm"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="es" className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("settings.templates.subjectEs", "Subject (Spanish)")}</Label>
                        <Input
                          value={editState.subject_es || ""}
                          onChange={(e) => setEditState((prev) => ({ ...prev, subject_es: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("settings.templates.bodyEs", "Body (Spanish)")}</Label>
                        <Textarea
                          value={editState.body_html_es || ""}
                          onChange={(e) => setEditState((prev) => ({ ...prev, body_html_es: e.target.value }))}
                          rows={12}
                          className="font-mono text-sm"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={isUpdating}>
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {t("settings.templates.save", "Save Template")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPreviewLanguage("en");
                        setShowPreview(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {t("settings.templates.preview", "Preview")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    Select a template to edit
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t("settings.templates.preview", "Preview")}: {selectedTemplate?.name}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={previewLanguage === "en" ? "default" : "outline"}
                  onClick={() => setPreviewLanguage("en")}
                >
                  EN
                </Button>
                <Button
                  size="sm"
                  variant={previewLanguage === "es" ? "default" : "outline"}
                  onClick={() => setPreviewLanguage("es")}
                >
                  ES
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription>
              Subject: {previewLanguage === "en" ? editState.subject_en : editState.subject_es}
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg p-4 bg-white">
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  previewLanguage === "en" ? editState.body_html_en || "" : editState.body_html_es || "",
                  {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'div', 'span', 'b', 'i', 'h1', 'h2', 'h3', 'h4', 'table', 'tr', 'td', 'th', 'img', 'thead', 'tbody', 'hr'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'width', 'height', 'target', 'rel'],
                  }
                ),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
