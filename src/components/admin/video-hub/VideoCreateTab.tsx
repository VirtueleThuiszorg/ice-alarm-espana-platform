import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft, ChevronRight, Wand2, Save, Loader2, Plus, Trash2,
  Layout, Zap, AlertCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVideoTemplates } from "@/hooks/useVideoTemplates";
import { useVideoProjects, VideoProject } from "@/hooks/useVideoProjects";
import { useVideoBrandSettings } from "@/hooks/useVideoBrandSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VideoCreateTabProps {
  onComplete: () => void;
  editingProject?: VideoProject | null;
  initialTemplateId?: string | null;
  isQuickCreate?: boolean;
}

interface ProjectDataJson {
  headline?: string;
  bullets?: string[];
  ctaText?: string;
  contactLine?: string;
  includeDisclaimer?: boolean;
  backgroundUrl?: string;
  productIcons?: string[];
}

interface ValidationErrors {
  name?: string;
  template_id?: string;
  headline?: string;
  bullets?: string[];
  ctaText?: string;
  language?: string;
  format?: string;
  duration?: string;
}

// Only two creation paths: Template (default) and Quick
type CreationMode = "template" | "quick";

// Step flows
const STEPS_BY_MODE: Record<CreationMode, string[]> = {
  template: ["template", "format", "content", "assets", "preview"],
  quick: ["quick-setup", "preview"],
};

// Fields required for each step (for step-level validation)
const STEP_FIELDS: Record<string, string[]> = {
  template: ["name", "template_id"],
  format: ["format", "duration", "language"],
  content: ["headline", "bullets", "ctaText"],
  assets: [], // No required validation fields
  preview: [], // All fields validated here
  "quick-setup": ["name", "headline", "bullets", "ctaText", "format", "duration", "language"],
};

// Validation constants
const MAX_HEADLINE_LENGTH = 60;
const MAX_BULLET_LENGTH = 80;
const MIN_BULLETS = 3;
const MAX_BULLETS = 6;

export function VideoCreateTab({ onComplete, editingProject, initialTemplateId, isQuickCreate = false }: VideoCreateTabProps) {
  const { t } = useTranslation();
  const { templates, isLoading: templatesLoading } = useVideoTemplates();
  const { createProject, updateProject, isCreating, isUpdating } = useVideoProjects();
  const { settings } = useVideoBrandSettings();

  const isEditMode = !!editingProject;

  // Mode selection
  const [creationMode, setCreationMode] = useState<CreationMode | null>(() => {
    if (isQuickCreate) return "quick";
    if (initialTemplateId) return "template";
    return null;
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [isRendering, setIsRendering] = useState(false);

  // Project data
  const [projectData, setProjectData] = useState({
    name: "",
    template_id: "",
    format: "16:9",
    duration: 15,
    language: "en",
    headline: "",
    bullets: ["", "", ""],
    ctaText: "",
    contactLine: "",
    includeDisclaimer: true,
    backgroundUrl: "",
    productIcons: [] as string[],
  });

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Initialize form when editing
  useEffect(() => {
    if (editingProject) {
      const dataJson = editingProject.data_json as ProjectDataJson;
      const bullets = dataJson?.bullets?.length ? dataJson.bullets : ["", "", ""];
      // Ensure minimum 3 bullets
      while (bullets.length < MIN_BULLETS) {
        bullets.push("");
      }
      setProjectData({
        name: editingProject.name,
        template_id: editingProject.template_id || "",
        format: editingProject.format,
        duration: editingProject.duration,
        language: editingProject.language,
        headline: dataJson?.headline || "",
        bullets,
        ctaText: dataJson?.ctaText || "",
        contactLine: dataJson?.contactLine || "",
        includeDisclaimer: dataJson?.includeDisclaimer ?? true,
        backgroundUrl: dataJson?.backgroundUrl || "",
        productIcons: dataJson?.productIcons || [],
      });
      setCreationMode(editingProject.template_id ? "template" : "quick");
      setCurrentStep(0);
    } else if (initialTemplateId) {
      setProjectData(prev => ({ ...prev, template_id: initialTemplateId }));
      setCreationMode("template");
    } else if (isQuickCreate) {
      setCreationMode("quick");
    }
  }, [editingProject, initialTemplateId, isQuickCreate]);

  // Get selected template
  const selectedTemplate = useMemo(() => {
    if (!projectData.template_id || !templates) return null;
    return templates.find(t => t.id === projectData.template_id);
  }, [projectData.template_id, templates]);

  // Validate project data
  const validate = useCallback((): ValidationErrors => {
    const errors: ValidationErrors = {};

    // Name required
    if (!projectData.name.trim()) {
      errors.name = t("videoHub.validation.nameRequired", "Project name is required");
    }

    // Template required for template mode
    if (creationMode === "template" && !projectData.template_id) {
      errors.template_id = t("videoHub.validation.templateRequired", "Please select a template");
    }

    // Headline required (max 60 chars)
    if (!projectData.headline.trim()) {
      errors.headline = t("videoHub.validation.headlineRequired", "Headline is required");
    } else if (projectData.headline.length > MAX_HEADLINE_LENGTH) {
      errors.headline = t("videoHub.validation.headlineTooLong", `Headline must be ${MAX_HEADLINE_LENGTH} characters or less`);
    }

    // Bullets: 3-6 required, non-empty, max 80 chars each
    const filledBullets = projectData.bullets.filter(b => b.trim());
    if (filledBullets.length < MIN_BULLETS) {
      errors.bullets = [t("videoHub.validation.bulletsRequired", `At least ${MIN_BULLETS} bullet points are required`)];
    } else {
      const bulletErrors: string[] = [];
      projectData.bullets.forEach((bullet, index) => {
        if (bullet.trim() && bullet.length > MAX_BULLET_LENGTH) {
          bulletErrors[index] = t("videoHub.validation.bulletTooLong", `Bullet ${index + 1} must be ${MAX_BULLET_LENGTH} characters or less`);
        }
      });
      if (bulletErrors.some(e => e)) {
        errors.bullets = bulletErrors;
      }
    }

    // CTA required (default from brand settings if empty)
    if (!projectData.ctaText.trim() && !settings?.default_cta_en && !settings?.default_cta_es) {
      errors.ctaText = t("videoHub.validation.ctaRequired", "Call-to-action text is required");
    }

    // Language must be EN or ES only
    if (!["en", "es"].includes(projectData.language)) {
      errors.language = t("videoHub.validation.languageRequired", "Language must be English or Spanish");
    }

    // Format/duration must be allowed by template
    if (selectedTemplate) {
      if (!selectedTemplate.allowed_formats?.includes(projectData.format)) {
        errors.format = t("videoHub.validation.formatNotAllowed", "This format is not allowed by the selected template");
      }
      if (!selectedTemplate.allowed_durations?.includes(projectData.duration)) {
        errors.duration = t("videoHub.validation.durationNotAllowed", "This duration is not allowed by the selected template");
      }
    }

    return errors;
  }, [projectData, creationMode, selectedTemplate, settings, t]);

  // Run validation on data change
  useEffect(() => {
    const errors = validate();
    setValidationErrors(errors);
  }, [validate]);

  const isValid = useMemo(() => {
    return Object.keys(validationErrors).length === 0;
  }, [validationErrors]);

  const currentSteps = creationMode ? STEPS_BY_MODE[creationMode] : [];

  const handleNext = () => {
    if (currentStep < currentSteps.length - 1) {
      const stepName = currentSteps[currentStep];
      const stepFields = STEP_FIELDS[stepName] || [];

      // Mark current step fields as touched
      setTouched(prev => {
        const newTouched = new Set(prev);
        stepFields.forEach(field => newTouched.add(field));
        return newTouched;
      });

      // Run validation fresh against current data (avoids stale-state race)
      const freshErrors = validate();
      const stepHasErrors = stepFields.some(field => freshErrors[field as keyof ValidationErrors]);

      if (stepHasErrors) {
        toast.error(t("videoHub.validation.fixStepErrors", "Please fix errors on this step before continuing"));
        return;
      }

      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (!isEditMode) {
      setCreationMode(null);
    }
  };

  const prepareProjectPayload = useCallback(() => {
    const effectiveCta = projectData.ctaText.trim() ||
      (projectData.language === "es" ? settings?.default_cta_es : settings?.default_cta_en) ||
      t("videoHub.create.defaultCtaFallback");

    return {
      name: projectData.name.trim(),
      template_id: creationMode === "template" ? projectData.template_id || null : null,
      format: projectData.format,
      duration: projectData.duration,
      language: projectData.language,
      data_json: {
        headline: projectData.headline.trim(),
        bullets: projectData.bullets.filter(b => b.trim()),
        ctaText: effectiveCta,
        contactLine: projectData.contactLine.trim(),
        includeDisclaimer: projectData.includeDisclaimer,
        backgroundUrl: projectData.backgroundUrl.trim(),
        productIcons: projectData.productIcons,
      },
    };
  }, [projectData, creationMode, settings, t]);

  const handleSaveDraft = async () => {
    // Mark all fields as touched
    setTouched(new Set(["name", "template_id", "headline", "bullets", "ctaText", "language", "format", "duration"]));

    if (!isValid) {
      toast.error(t("videoHub.validation.fixErrors", "Please fix the validation errors before saving"));
      return;
    }

    try {
      const payload = prepareProjectPayload();

      if (isEditMode && editingProject) {
        await updateProject({
          id: editingProject.id,
          ...payload,
          status: editingProject.status,
        });
        toast.success(t("videoHub.create.projectUpdated"));
      } else {
        await createProject({
          ...payload,
          status: "draft",
        });
        toast.success(t("videoHub.create.draftSaved"));
      }
      onComplete();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(t("common.error"));
    }
  };

  const handleRender = async () => {
    // Mark all fields as touched
    setTouched(new Set(["name", "template_id", "headline", "bullets", "ctaText", "language", "format", "duration"]));

    if (!isValid) {
      toast.error(t("videoHub.validation.fixErrors", "Please fix the validation errors before rendering"));
      return;
    }

    setIsRendering(true);

    try {
      const payload = prepareProjectPayload();
      let projectId: string;

      if (isEditMode && editingProject) {
        await updateProject({
          id: editingProject.id,
          ...payload,
          status: "rendering",
        });
        projectId = editingProject.id;
      } else {
        const newProject = await createProject({
          ...payload,
          status: "rendering",
        });
        projectId = newProject.id;
      }

      const { data, error } = await supabase.functions.invoke("video-render-queue", {
        body: { project_id: projectId },
      });

      if (error) {
        console.error("Render queue error:", error);
        throw new Error(error.message || t("videoHub.create.renderFailed"));
      }

      if (data?.error) {
        console.error("Render queue returned error:", data.error);
        throw new Error(data.error);
      }

      toast.success(data?.message || t("videoHub.create.renderQueued"));
      onComplete();
    } catch (error: any) {
      console.error("Render error:", error);
      toast.error(error?.message || t("videoHub.create.renderFailed"));
    } finally {
      setIsRendering(false);
    }
  };

  const addBullet = () => {
    if (projectData.bullets.length < MAX_BULLETS) {
      setProjectData({ ...projectData, bullets: [...projectData.bullets, ""] });
    }
  };

  const removeBullet = (index: number) => {
    if (projectData.bullets.length > MIN_BULLETS) {
      const newBullets = projectData.bullets.filter((_, i) => i !== index);
      setProjectData({ ...projectData, bullets: newBullets });
    }
  };

  const updateBullet = (index: number, value: string) => {
    const newBullets = [...projectData.bullets];
    newBullets[index] = value;
    setProjectData({ ...projectData, bullets: newBullets });
    setTouched(prev => new Set(prev).add("bullets"));
  };

  const handleFieldBlur = (field: string) => {
    setTouched(prev => new Set(prev).add(field));
  };

  const isSaving = isCreating || isUpdating;
  const isProcessing = isSaving || isRendering;

  // MODE SELECTION SCREEN
  if (!creationMode && !isEditMode) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">{t("videoHub.create.chooseMode")}</h2>
          <p className="text-muted-foreground mt-2">{t("videoHub.create.chooseModeDesc")}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
          {/* Template Mode (Primary) */}
          <Card
            className="cursor-pointer transition-all hover:border-primary hover:shadow-lg group border-2"
            onClick={() => setCreationMode("template")}
          >
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2 group-hover:scale-110 transition-transform">
                <Layout className="h-7 w-7" />
              </div>
              <CardTitle>{t("videoHub.create.modes.template.title")}</CardTitle>
              <CardDescription>{t("videoHub.create.modes.template.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t("videoHub.create.modes.template.badge1")}</Badge>
                <Badge variant="secondary">{t("videoHub.create.modes.template.badge2")}</Badge>
                <Badge className="bg-primary text-primary-foreground">{t("common.recommended", "Recommended")}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Quick Mode */}
          <Card
            className="cursor-pointer transition-all hover:border-primary hover:shadow-lg group"
            onClick={() => setCreationMode("quick")}
          >
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-2 group-hover:scale-110 transition-transform">
                <Zap className="h-7 w-7" />
              </div>
              <CardTitle>{t("videoHub.create.modes.quick.title")}</CardTitle>
              <CardDescription>{t("videoHub.create.modes.quick.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t("videoHub.create.modes.quick.badge1")}</Badge>
                <Badge variant="secondary">{t("videoHub.create.modes.quick.badge2")}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // STEP CONTENT BY MODE
  const renderStepContent = () => {
    const stepName = currentSteps[currentStep];

    // TEMPLATE MODE STEPS
    if (creationMode === "template") {
      switch (stepName) {
        case "template":
          return (
            <TemplateSelectionStep
              templates={templates}
              templatesLoading={templatesLoading}
              projectData={projectData}
              setProjectData={setProjectData}
              validationErrors={validationErrors}
              touched={touched}
              onBlur={handleFieldBlur}
              t={t}
            />
          );
        case "format":
          return (
            <FormatDurationStep
              projectData={projectData}
              setProjectData={setProjectData}
              selectedTemplate={selectedTemplate}
              validationErrors={validationErrors}
              t={t}
            />
          );
        case "content":
          return (
            <ContentStep
              projectData={projectData}
              setProjectData={setProjectData}
              settings={settings}
              addBullet={addBullet}
              removeBullet={removeBullet}
              updateBullet={updateBullet}
              validationErrors={validationErrors}
              touched={touched}
              onBlur={handleFieldBlur}
              t={t}
            />
          );
        case "assets":
          return <AssetsStep projectData={projectData} setProjectData={setProjectData} settings={settings} t={t} />;
        case "preview":
          return (
            <PreviewStep
              projectData={projectData}
              settings={settings}
              validationErrors={validationErrors}
              isValid={isValid}
              t={t}
            />
          );
      }
    }

    // QUICK MODE STEPS
    if (creationMode === "quick") {
      switch (stepName) {
        case "quick-setup":
          return (
            <QuickSetupStep
              projectData={projectData}
              setProjectData={setProjectData}
              settings={settings}
              templates={templates}
              templatesLoading={templatesLoading}
              addBullet={addBullet}
              removeBullet={removeBullet}
              updateBullet={updateBullet}
              validationErrors={validationErrors}
              touched={touched}
              onBlur={handleFieldBlur}
              t={t}
            />
          );
        case "preview":
          return (
            <PreviewStep
              projectData={projectData}
              settings={settings}
              validationErrors={validationErrors}
              isValid={isValid}
              t={t}
            />
          );
      }
    }

    return null;
  };

  const getModeIcon = () => {
    switch (creationMode) {
      case "template": return <Layout className="h-5 w-5" />;
      case "quick": return <Zap className="h-5 w-5" />;
      default: return <Wand2 className="h-5 w-5" />;
    }
  };

  const getModeTitle = () => {
    if (isEditMode) return t("videoHub.create.editProject");
    switch (creationMode) {
      case "template": return t("videoHub.create.modes.template.title");
      case "quick": return t("videoHub.create.modes.quick.title");
      default: return t("videoHub.tabs.create");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {getModeIcon()}
            {getModeTitle()}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("videoHub.create.step")} {currentStep + 1} {t("videoHub.create.of")} {currentSteps.length}
          </p>
        </div>
        {!isEditMode && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCreationMode(null); setCurrentStep(0); }}
          >
            {t("videoHub.create.changeMode")}
          </Button>
        )}
      </div>

      {/* Step Progress */}
      <div className="flex gap-2">
        {currentSteps.map((step, index) => (
          <div
            key={step}
            className={`h-2 flex-1 rounded-full transition-colors ${index <= currentStep ? "bg-primary" : "bg-muted"
              }`}
          />
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {currentStep === 0 && !isEditMode ? t("videoHub.create.changeMode") : t("common.back")}
        </Button>

        <div className="flex gap-2">
          {currentStep === currentSteps.length - 1 ? (
            <>
              <Button variant="outline" onClick={handleSaveDraft} disabled={isProcessing}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isEditMode ? t("videoHub.create.updateProject") : t("videoHub.create.saveDraft")}
              </Button>
              <Button onClick={handleRender} disabled={isProcessing || !isValid}>
                {isRendering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {t("videoHub.create.render")}
              </Button>
            </>
          ) : (
            <Button onClick={handleNext}>
              {t("common.next")}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== STEP COMPONENTS ==========

// Template Selection Step
function TemplateSelectionStep({ templates, templatesLoading, projectData, setProjectData, validationErrors, touched, onBlur, t }: any) {
  return (
    <div className="space-y-4">
      <div className="mb-4">
        <Label>{t("videoHub.create.projectName")} *</Label>
        <Input
          value={projectData.name}
          onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
          onBlur={() => onBlur("name")}
          placeholder={t("videoHub.create.projectNamePlaceholder")}
          className={`mt-1 ${touched.has("name") && validationErrors.name ? "border-destructive" : ""}`}
        />
        {touched.has("name") && validationErrors.name && (
          <p className="text-sm text-destructive mt-1">{validationErrors.name}</p>
        )}
      </div>

      <Label>{t("videoHub.projects.template")} *</Label>
      {touched.has("template_id") && validationErrors.template_id && (
        <p className="text-sm text-destructive mt-1">{validationErrors.template_id}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-2">
        {templatesLoading ? (
          <p>{t("common.loading")}</p>
        ) : (
          templates?.map((template: any) => (
            <Card
              key={template.id}
              className={`cursor-pointer transition-all hover:border-primary ${projectData.template_id === template.id ? "border-2 border-primary" : ""
                }`}
              onClick={() => {
                // Auto-sync format/duration to first allowed values if current is invalid
                const allowedFormats = template.allowed_formats || ["16:9"];
                const allowedDurations = template.allowed_durations || [15];
                const newFormat = allowedFormats.includes(projectData.format)
                  ? projectData.format
                  : allowedFormats[0];
                const newDuration = allowedDurations.includes(projectData.duration)
                  ? projectData.duration
                  : allowedDurations[0];

                setProjectData({
                  ...projectData,
                  template_id: template.id,
                  format: newFormat,
                  duration: newDuration
                });
                onBlur("template_id");
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{template.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {template.allowed_durations?.map((d: number) => (
                    <Badge key={d} variant="secondary" className="text-xs">
                      {d}s
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// Format & Duration Step
function FormatDurationStep({ projectData, setProjectData, selectedTemplate, validationErrors, t }: any) {
  const allowedFormats = selectedTemplate?.allowed_formats || ["9:16", "16:9", "1:1"];
  const allowedDurations = selectedTemplate?.allowed_durations || [10, 15, 30, 60];

  return (
    <div className="space-y-8">
      <div>
        <Label className="text-base font-medium">{t("videoHub.projects.format")} *</Label>
        {validationErrors.format && (
          <p className="text-sm text-destructive mt-1">{validationErrors.format}</p>
        )}
        <RadioGroup
          value={projectData.format}
          onValueChange={(value) => setProjectData({ ...projectData, format: value })}
          className="mt-3 grid gap-4 md:grid-cols-3"
        >
          {["9:16", "16:9", "1:1"].map((format) => {
            const isAllowed = allowedFormats.includes(format);
            return (
              <div key={format}>
                <RadioGroupItem
                  value={format}
                  id={`format-${format}`}
                  className="peer sr-only"
                  disabled={!isAllowed}
                />
                <Label
                  htmlFor={`format-${format}`}
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 peer-data-[state=checked]:border-primary cursor-pointer ${!isAllowed ? "opacity-50 cursor-not-allowed" : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  <span className="text-lg font-medium">
                    {t(`videoHub.formats.${format === "9:16" ? "portrait" : format === "16:9" ? "landscape" : "square"}`)}
                  </span>
                  <span className="text-sm text-muted-foreground">{format}</span>
                  {!isAllowed && (
                    <span className="text-xs text-destructive mt-1">{t("videoHub.validation.notAllowed", "Not allowed")}</span>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-base font-medium">{t("videoHub.projects.duration")} *</Label>
        {validationErrors.duration && (
          <p className="text-sm text-destructive mt-1">{validationErrors.duration}</p>
        )}
        <RadioGroup
          value={projectData.duration.toString()}
          onValueChange={(value) => setProjectData({ ...projectData, duration: parseInt(value) })}
          className="mt-3 grid gap-4 md:grid-cols-4"
        >
          {[10, 15, 30, 60].map((duration) => {
            const isAllowed = allowedDurations.includes(duration);
            return (
              <div key={duration}>
                <RadioGroupItem
                  value={duration.toString()}
                  id={`duration-${duration}`}
                  className="peer sr-only"
                  disabled={!isAllowed}
                />
                <Label
                  htmlFor={`duration-${duration}`}
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 peer-data-[state=checked]:border-primary cursor-pointer ${!isAllowed ? "opacity-50 cursor-not-allowed" : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  <span className="text-lg font-medium">{duration}s</span>
                  <span className="text-sm text-muted-foreground">{t(`videoHub.durations.${duration}s`)}</span>
                  {!isAllowed && (
                    <span className="text-xs text-destructive mt-1">{t("videoHub.validation.notAllowed", "Not allowed")}</span>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
}

// Content Step
function ContentStep({ projectData, setProjectData, settings, addBullet, removeBullet, updateBullet, validationErrors, touched, onBlur, t }: any) {
  const filledBulletCount = projectData.bullets.filter((b: string) => b.trim()).length;

  return (
    <div className="space-y-6">
      <div>
        <Label>{t("videoHub.create.headline")} * <span className="text-muted-foreground text-xs">({projectData.headline.length}/{MAX_HEADLINE_LENGTH})</span></Label>
        <Input
          value={projectData.headline}
          onChange={(e) => setProjectData({ ...projectData, headline: e.target.value })}
          onBlur={() => onBlur("headline")}
          placeholder={t("videoHub.create.headlinePlaceholder")}
          maxLength={MAX_HEADLINE_LENGTH}
          className={`mt-1 ${touched.has("headline") && validationErrors.headline ? "border-destructive" : ""}`}
        />
        {touched.has("headline") && validationErrors.headline && (
          <p className="text-sm text-destructive mt-1">{validationErrors.headline}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>
            {t("videoHub.create.bulletPoints")} *
            <span className="text-muted-foreground text-xs ml-2">({filledBulletCount}/{MIN_BULLETS}-{MAX_BULLETS} required)</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addBullet} disabled={projectData.bullets.length >= MAX_BULLETS}>
            <Plus className="mr-1 h-3 w-3" />
            {t("videoHub.create.addBullet")}
          </Button>
        </div>
        {touched.has("bullets") && validationErrors.bullets?.[0] && typeof validationErrors.bullets[0] === "string" && !validationErrors.bullets[0].includes("Bullet") && (
          <p className="text-sm text-destructive mt-1">{validationErrors.bullets[0]}</p>
        )}
        <div className="mt-2 space-y-2">
          {projectData.bullets.map((bullet: string, index: number) => (
            <div key={index}>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={bullet}
                    onChange={(e) => updateBullet(index, e.target.value)}
                    placeholder={`${t("videoHub.create.bullet")} ${index + 1}`}
                    maxLength={MAX_BULLET_LENGTH}
                    className={validationErrors.bullets?.[index] ? "border-destructive" : ""}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {bullet.length}/{MAX_BULLET_LENGTH}
                  </span>
                </div>
                {projectData.bullets.length > MIN_BULLETS && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeBullet(index)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {validationErrors.bullets?.[index] && (
                <p className="text-sm text-destructive mt-1">{validationErrors.bullets[index]}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{t("videoHub.create.ctaText")} *</Label>
          <Input
            value={projectData.ctaText}
            onChange={(e) => setProjectData({ ...projectData, ctaText: e.target.value })}
            onBlur={() => onBlur("ctaText")}
            placeholder={settings?.default_cta_en || t("videoHub.create.defaultCtaFallback")}
            className={`mt-1 ${touched.has("ctaText") && validationErrors.ctaText ? "border-destructive" : ""}`}
          />
          {settings?.default_cta_en && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("videoHub.create.defaultCta", "Default")}: {projectData.language === "es" ? settings?.default_cta_es : settings?.default_cta_en}
            </p>
          )}
          {touched.has("ctaText") && validationErrors.ctaText && (
            <p className="text-sm text-destructive mt-1">{validationErrors.ctaText}</p>
          )}
        </div>
        <div>
          <Label>{t("videoHub.create.contactLine")}</Label>
          <Input
            value={projectData.contactLine}
            onChange={(e) => setProjectData({ ...projectData, contactLine: e.target.value })}
            placeholder="+34 900 123 456"
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={projectData.includeDisclaimer}
          onCheckedChange={(checked) => setProjectData({ ...projectData, includeDisclaimer: checked })}
        />
        <Label>{t("videoHub.create.disclaimer")}</Label>
      </div>

      <div>
        <Label>{t("videoHub.create.selectLanguage")} *</Label>
        {validationErrors.language && (
          <p className="text-sm text-destructive mt-1">{validationErrors.language}</p>
        )}
        <RadioGroup
          value={projectData.language}
          onValueChange={(value) => setProjectData({ ...projectData, language: value })}
          className="mt-2 flex gap-4"
        >
          {["en", "es"].map((lang) => (
            <div key={lang} className="flex items-center gap-2">
              <RadioGroupItem value={lang} id={`lang-${lang}`} />
              <Label htmlFor={`lang-${lang}`}>{t(`videoHub.create.languages.${lang}`)}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

// Assets Step
function AssetsStep({ projectData, setProjectData, settings, t }: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("videoHub.settings.logo")}</CardTitle>
          <CardDescription>{t("videoHub.assets.logoLocked")}</CardDescription>
        </CardHeader>
        <CardContent>
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-16 object-contain" />
          ) : (
            <div className="flex h-16 items-center justify-center rounded bg-muted">
              <span className="text-sm text-muted-foreground">{t("videoHub.assets.defaultLogo")}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Label>{t("videoHub.assets.backgroundUrl")}</Label>
        <Input
          value={projectData.backgroundUrl}
          onChange={(e) => setProjectData({ ...projectData, backgroundUrl: e.target.value })}
          placeholder="https://..."
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("videoHub.assets.backgroundHint")}</p>
      </div>

      <div>
        <Label className="text-base">{t("videoHub.assets.productIcons")}</Label>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {[
            { key: "SOS Pendant", labelKey: "videoHub.assets.products.sosPendant" },
            { key: "Dosell", labelKey: "videoHub.assets.products.dosell" },
            { key: "Vivago", labelKey: "videoHub.assets.products.vivago" },
            { key: "Fall Detector", labelKey: "videoHub.assets.products.fallDetector" },
          ].map(({ key: product, labelKey }) => {
            const isSelected = projectData.productIcons.includes(product);
            return (
              <Card
                key={product}
                className={`cursor-pointer transition-all hover:border-primary ${isSelected ? "border-2 border-primary bg-primary/5" : ""
                  }`}
                onClick={() => {
                  if (isSelected) {
                    setProjectData({
                      ...projectData,
                      productIcons: projectData.productIcons.filter((p: string) => p !== product),
                    });
                  } else {
                    setProjectData({
                      ...projectData,
                      productIcons: [...projectData.productIcons, product],
                    });
                  }
                }}
              >
                <CardContent className="flex flex-col items-center justify-center p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Wand2 className="h-6 w-6" />
                  </div>
                  <span className="mt-2 text-sm font-medium">{t(labelKey)}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Preview Step
function PreviewStep({ projectData, settings, validationErrors, isValid, t }: any) {
  const errorCount = Object.keys(validationErrors).length;

  // Map field names to human-readable labels
  const fieldLabels: Record<string, string> = {
    name: t("videoHub.projects.name"),
    template_id: t("videoHub.create.template"),
    headline: t("videoHub.create.headline"),
    bullets: t("videoHub.create.bulletPoints"),
    ctaText: t("videoHub.create.ctaText"),
    language: t("videoHub.projects.language"),
    format: t("videoHub.projects.format"),
    duration: t("videoHub.projects.duration"),
  };

  return (
    <div className="space-y-6">
      {!isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-medium">{t("videoHub.validation.hasErrors", `Please fix ${errorCount} validation error(s) before rendering:`)}</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {Object.entries(validationErrors).map(([field, error]) => (
                <li key={field}>
                  <span className="font-medium">{fieldLabels[field] || field}:</span>{" "}
                  {Array.isArray(error) ? error.filter(Boolean).join(", ") : String(error)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("videoHub.create.previewTitle")}</CardTitle>
          <CardDescription>{t("videoHub.create.previewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="mx-auto flex items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/50"
            style={{
              aspectRatio: projectData.format === "9:16" ? "9/16" : projectData.format === "1:1" ? "1/1" : "16/9",
              maxHeight: "400px",
            }}
          >
            <div className="text-center p-8">
              <Wand2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{projectData.headline || t("videoHub.create.headlinePlaceholder")}</p>
              {projectData.bullets.filter((b: string) => b).length > 0 && (
                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                  {projectData.bullets.filter((b: string) => b).map((bullet: string, i: number) => (
                    <li key={i}>• {bullet}</li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-primary font-medium">
                {projectData.ctaText || (projectData.language === "es" ? settings?.default_cta_es : settings?.default_cta_en) || "Call Now"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="font-medium mb-2">{t("videoHub.create.summary")}</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("videoHub.projects.name")}:</dt>
              <dd className={!projectData.name ? "text-destructive" : ""}>{projectData.name || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("videoHub.projects.format")}:</dt>
              <dd>{projectData.format}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("videoHub.projects.duration")}:</dt>
              <dd>{projectData.duration}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("videoHub.projects.language")}:</dt>
              <dd>{projectData.language === "es" ? "Español" : "English"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("videoHub.create.disclaimer")}:</dt>
              <dd>{projectData.includeDisclaimer ? t("common.yes") : t("common.no")}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="font-medium mb-2">{t("videoHub.assets.productIcons")}</h4>
          {projectData.productIcons.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {projectData.productIcons.map((icon: string) => (
                <Badge key={icon} variant="secondary">{icon}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("videoHub.assets.noIcons")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Quick Setup Step (streamlined essentials)
function QuickSetupStep({ projectData, setProjectData, settings, templates, templatesLoading: _templatesLoading, addBullet, removeBullet, updateBullet, validationErrors, touched, onBlur, t }: any) {
  const filledBulletCount = projectData.bullets.filter((b: string) => b.trim()).length;

  return (
    <div className="space-y-6">
      {/* Project Name & Template */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{t("videoHub.create.projectName")} *</Label>
          <Input
            value={projectData.name}
            onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
            onBlur={() => onBlur("name")}
            placeholder={t("videoHub.create.projectNamePlaceholder")}
            className={`mt-1 ${touched.has("name") && validationErrors.name ? "border-destructive" : ""}`}
          />
          {touched.has("name") && validationErrors.name && (
            <p className="text-sm text-destructive mt-1">{validationErrors.name}</p>
          )}
        </div>
        <div>
          <Label>{t("videoHub.projects.template")}</Label>
          <Select value={projectData.template_id || "_none"} onValueChange={(v) => setProjectData({ ...projectData, template_id: v === "_none" ? "" : v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={t("videoHub.create.selectTemplate", "Select template (optional)")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t("videoHub.create.selectTemplate", "Select template (optional)")}</SelectItem>
              {templates?.map((template: any) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Format, Duration, Language */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>{t("videoHub.projects.format")} *</Label>
          <Select value={projectData.format} onValueChange={(v) => setProjectData({ ...projectData, format: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">{t("videoHub.formats.landscape")}</SelectItem>
              <SelectItem value="9:16">{t("videoHub.formats.portrait")}</SelectItem>
              <SelectItem value="1:1">{t("videoHub.formats.square")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("videoHub.projects.duration")} *</Label>
          <Select value={String(projectData.duration)} onValueChange={(v) => setProjectData({ ...projectData, duration: parseInt(v) })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="15">15s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("videoHub.projects.language")} *</Label>
          <Select value={projectData.language} onValueChange={(v) => setProjectData({ ...projectData, language: v })}>
            <SelectTrigger className={`mt-1 ${validationErrors.language ? "border-destructive" : ""}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
            </SelectContent>
          </Select>
          {validationErrors.language && (
            <p className="text-sm text-destructive mt-1">{validationErrors.language}</p>
          )}
        </div>
      </div>

      {/* Headline */}
      <div>
        <Label>{t("videoHub.create.headline")} * <span className="text-muted-foreground text-xs">({projectData.headline.length}/{MAX_HEADLINE_LENGTH})</span></Label>
        <Input
          value={projectData.headline}
          onChange={(e) => setProjectData({ ...projectData, headline: e.target.value })}
          onBlur={() => onBlur("headline")}
          placeholder={t("videoHub.create.headlinePlaceholder")}
          maxLength={MAX_HEADLINE_LENGTH}
          className={`mt-1 ${touched.has("headline") && validationErrors.headline ? "border-destructive" : ""}`}
        />
        {touched.has("headline") && validationErrors.headline && (
          <p className="text-sm text-destructive mt-1">{validationErrors.headline}</p>
        )}
      </div>

      {/* Bullets */}
      <div>
        <div className="flex items-center justify-between">
          <Label>
            {t("videoHub.create.bulletPoints")} *
            <span className="text-muted-foreground text-xs ml-2">({filledBulletCount}/{MIN_BULLETS}-{MAX_BULLETS})</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addBullet} disabled={projectData.bullets.length >= MAX_BULLETS}>
            <Plus className="mr-1 h-3 w-3" />
            {t("videoHub.create.addBullet")}
          </Button>
        </div>
        {touched.has("bullets") && validationErrors.bullets?.[0] && typeof validationErrors.bullets[0] === "string" && !validationErrors.bullets[0].includes("Bullet") && (
          <p className="text-sm text-destructive mt-1">{validationErrors.bullets[0]}</p>
        )}
        <div className="mt-2 space-y-2">
          {projectData.bullets.map((bullet: string, index: number) => (
            <div key={index}>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={bullet}
                    onChange={(e) => updateBullet(index, e.target.value)}
                    placeholder={`${t("videoHub.create.bullet")} ${index + 1}`}
                    maxLength={MAX_BULLET_LENGTH}
                    className={validationErrors.bullets?.[index] ? "border-destructive" : ""}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {bullet.length}/{MAX_BULLET_LENGTH}
                  </span>
                </div>
                {projectData.bullets.length > MIN_BULLETS && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeBullet(index)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {validationErrors.bullets?.[index] && (
                <p className="text-sm text-destructive mt-1">{validationErrors.bullets[index]}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div>
        <Label>{t("videoHub.create.ctaText")} *</Label>
        <Input
          value={projectData.ctaText}
          onChange={(e) => setProjectData({ ...projectData, ctaText: e.target.value })}
          onBlur={() => onBlur("ctaText")}
          placeholder={settings?.default_cta_en || "Call Now"}
          className={`mt-1 ${touched.has("ctaText") && validationErrors.ctaText ? "border-destructive" : ""}`}
        />
        {settings?.default_cta_en && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("videoHub.create.defaultCta", "Default")}: {projectData.language === "es" ? settings?.default_cta_es : settings?.default_cta_en}
          </p>
        )}
        {touched.has("ctaText") && validationErrors.ctaText && (
          <p className="text-sm text-destructive mt-1">{validationErrors.ctaText}</p>
        )}
      </div>
    </div>
  );
}
