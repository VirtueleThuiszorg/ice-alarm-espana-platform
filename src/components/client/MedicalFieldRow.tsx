import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Lock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BLOOD_TYPES, type MedicalField } from "@/lib/medicalFields";
import { FieldLabel, NotAdded } from "@/components/FieldControl";
import { useEditableCard } from "@/components/editableCardContext";

/**
 * One field, read or edited — MEMBER_UX_RULES R6.
 *
 * *"Read-only by default. Edit per section, then Save. Fields as label (13px uppercase Slate) /
 * value (16px Ink). Empty = 'Not added' + inline Add. Never 'contact support to change'."*
 *
 * EMPTY IS NOT BLANK. A field with nothing in it renders "Not added" rather than an empty line,
 * because on this page an empty line is indistinguishable from a field that failed to load — and
 * this is the page whose subtitle promises it is exactly what an operator sees.
 */

/* `FieldLabel` and `NotAdded` moved to `@/components/ui/editable-card` — the staff record needs
   both, and R6's label size is one decision, not one per page. Re-exported here so the callers
   that read a medical field find them beside it. */
export { FieldLabel, NotAdded };

/** A value the member may read but not change, with the reason on the screen (R7's pattern). */
export function LockedValue({
  value,
  secret,
  reason,
}: {
  value: string | null;
  secret?: boolean;
  reason: string;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  if (!value) return <NotAdded />;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-base" data-testid={secret ? "secret-value" : "locked-value"}>
          {secret && !revealed ? (
            /* Masked with a fixed number of dots, not `value.length` — the length of a code is
               itself worth guessing at. */
            <span aria-hidden="true">••••••</span>
          ) : (
            value
          )}
        </span>
        {secret && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            data-testid="reveal-secret"
            aria-pressed={revealed}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="ml-1.5 text-sm">
              {revealed ? t("common.hide", "Hide") : t("common.show", "Show")}
            </span>
          </Button>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {reason}
      </p>
    </div>
  );
}

export interface MedicalFieldRowProps {
  field: MedicalField;
  /** The current value: a string for scalar fields, a string[] for lists. */
  value: string | string[] | null;
  onChange: (value: string | string[]) => void;
}

/**
 * THE LOCK COMES FROM THE CARD, not from a prop.
 *
 * It was `isEditing: boolean`, passed down from a single page-level Edit button that unlocked
 * all seventeen fields in five sections at once. R6 asks for *"Edit per section"*, and a page
 * where one button opens everything is a page where a member correcting their doctor's phone
 * number has their allergies live at the same time. Reading `useEditableCard()` means the field
 * cannot disagree with the card it is drawn in, and there is no prop to forget on the next one.
 */
export function MedicalFieldRow({ field, value, onChange }: MedicalFieldRowProps) {
  const { t } = useTranslation();
  const { editing: isEditing } = useEditableCard();
  const [pending, setPending] = useState("");
  const label = t(field.label.key, field.label.fallback);
  const list = Array.isArray(value) ? value : [];
  const text = typeof value === "string" ? value : "";

  const hint = field.hint ? t(field.hint.key, field.hint.fallback) : null;

  return (
    <div className="space-y-1.5" data-testid={`medical-field-${field.column}`}>
      <Label htmlFor={`medical-${field.column}`}>
        <FieldLabel>{label}</FieldLabel>
      </Label>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

      {field.kind === "list" ? (
        <div className="space-y-2">
          {list.length === 0 && !isEditing && <NotAdded />}
          {list.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {list.map((item, i) => (
                <Badge key={`${item}-${i}`} variant="secondary" className="text-base font-normal">
                  {item}
                  {isEditing && (
                    <button
                      type="button"
                      aria-label={t("common.remove", "Remove")}
                      className="ml-1.5"
                      onClick={() => onChange(list.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
          {isEditing && (
            <div className="flex gap-2">
              <Input
                id={`medical-${field.column}`}
                value={pending}
                onChange={(e) => setPending(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the item rather than submitting the form. On a page of sixteen
                  // fields, a stray Enter that saves everything is a member's whole record
                  // written from a half-finished line.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (pending.trim()) {
                      onChange([...list, pending.trim()]);
                      setPending("");
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (pending.trim()) {
                    onChange([...list, pending.trim()]);
                    setPending("");
                  }
                }}
              >
                {t("common.add", "Add")}
              </Button>
            </div>
          )}
        </div>
      ) : !isEditing ? (
        text ? (
          field.kind === "phone" ? (
            /* A phone number an operator or a member can press, not text to retype. */
            <a href={`tel:${text.replace(/\s/g, "")}`} className="text-base underline underline-offset-2">
              {text}
            </a>
          ) : (
            <p className="whitespace-pre-wrap text-base">{text}</p>
          )
        ) : (
          <NotAdded />
        )
      ) : field.kind === "textarea" ? (
        <Textarea
          id={`medical-${field.column}`}
          value={text}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "bloodType" ? (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={`medical-${field.column}`}>
            <SelectValue placeholder={t("medical.chooseBloodType", "Choose")} />
          </SelectTrigger>
          <SelectContent>
            {BLOOD_TYPES.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`medical-${field.column}`}
          type={field.kind === "phone" ? "tel" : "text"}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
