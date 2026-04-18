import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Testimonial, TestimonialFormData } from "@/hooks/useTestimonials";

interface TestimonialFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TestimonialFormData) => Promise<void>;
  initialData?: Testimonial;
  isSubmitting: boolean;
}

const emptyForm: TestimonialFormData = {
  quote_en: "",
  quote_es: "",
  author_name: "",
  location_en: "",
  location_es: "",
  rating: 5,
  page: "both",
  display_order: 0,
  is_active: true,
};

export function TestimonialForm({ open, onOpenChange, onSubmit, initialData, isSubmitting }: TestimonialFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TestimonialFormData>(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(initialData ? {
        quote_en: initialData.quote_en,
        quote_es: initialData.quote_es,
        author_name: initialData.author_name,
        location_en: initialData.location_en,
        location_es: initialData.location_es,
        rating: initialData.rating,
        page: initialData.page,
        display_order: initialData.display_order,
        is_active: initialData.is_active,
      } : emptyForm);
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
    onOpenChange(false);
  };

  const isEdit = !!initialData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("adminTestimonials.editTestimonial", "Edit Testimonial") : t("adminTestimonials.addTestimonial", "Add Testimonial")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("adminTestimonials.authorName", "Author Name")}</Label>
              <Input
                value={form.author_name}
                onChange={(e) => setForm({ ...form, author_name: e.target.value })}
                placeholder="Margaret Thompson"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>{t("adminTestimonials.locationEn", "Location (EN)")}</Label>
                <Input
                  value={form.location_en}
                  onChange={(e) => setForm({ ...form, location_en: e.target.value })}
                  placeholder="British Expat, Alicante"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminTestimonials.locationEs", "Location (ES)")}</Label>
                <Input
                  value={form.location_es}
                  onChange={(e) => setForm({ ...form, location_es: e.target.value })}
                  placeholder="Expatriada Británica, Alicante"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("adminTestimonials.quoteEn", "Quote (English)")}</Label>
            <Textarea
              value={form.quote_en}
              onChange={(e) => setForm({ ...form, quote_en: e.target.value })}
              placeholder="The peace of mind this service gives our family..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("adminTestimonials.quoteEs", "Quote (Spanish)")}</Label>
            <Textarea
              value={form.quote_es}
              onChange={(e) => setForm({ ...form, quote_es: e.target.value })}
              placeholder="La tranquilidad que este servicio da a nuestra familia..."
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("adminTestimonials.rating", "Rating")}</Label>
              <Select
                value={String(form.rating)}
                onValueChange={(v) => setForm({ ...form, rating: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>{"★".repeat(n)}{"☆".repeat(5 - n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("adminTestimonials.page", "Display Page")}</Label>
              <Select
                value={form.page}
                onValueChange={(v) => setForm({ ...form, page: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">{t("adminTestimonials.pageLanding", "Landing Page")}</SelectItem>
                  <SelectItem value="pendant">{t("adminTestimonials.pagePendant", "Pendant Page")}</SelectItem>
                  <SelectItem value="both">{t("adminTestimonials.pageBoth", "Both Pages")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("adminTestimonials.displayOrder", "Display Order")}</Label>
              <Input
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <Label>{t("adminTestimonials.active", "Active")}</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Testimonial"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
