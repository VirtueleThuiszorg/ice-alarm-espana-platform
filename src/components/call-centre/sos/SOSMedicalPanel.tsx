import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Heart,
  Pill,
  AlertTriangle,
  Droplets,
  Stethoscope,
  Building2,
  Info,
  Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Card not needed - using explicit dark styled divs within the SOS dark modal
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SOSMedicalPanelProps {
  memberId: string;
  specialInstructions?: string | null;
}

interface MedicalInfo {
  medical_conditions: string[] | null;
  medications: string[] | null;
  allergies: string[] | null;
  blood_type: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  hospital_preference: string | null;
  additional_notes: string | null;
}

const CRITICAL_CONDITIONS = [
  "diabetes", "heart", "cardiac", "stroke", "epilepsy", "seizure",
  "copd", "asthma", "dementia", "alzheimer", "pacemaker",
];

const WARNING_MEDICATIONS = [
  "warfarin", "heparin", "insulin", "nitroglycerin", "digoxin",
  "metformin", "aspirin", "clopidogrel", "blood thinner",
];

function isCritical(condition: string): boolean {
  const lower = condition.toLowerCase();
  return CRITICAL_CONDITIONS.some((c) => lower.includes(c));
}

function isWarningMed(med: string): boolean {
  const lower = med.toLowerCase();
  return WARNING_MEDICATIONS.some((w) => lower.includes(w));
}

export function SOSMedicalPanel({ memberId, specialInstructions }: SOSMedicalPanelProps) {
  const { t } = useTranslation();
  const [medical, setMedical] = useState<MedicalInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedical = async () => {
      const { data } = await supabase
        .from("medical_information")
        .select("medical_conditions, medications, allergies, blood_type, doctor_name, doctor_phone, hospital_preference, additional_notes")
        .eq("member_id", memberId)
        .maybeSingle();
      setMedical(data);
      setLoading(false);
    };
    fetchMedical();
  }, [memberId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Always visible: Blood type + Doctor + Hospital + Special Instructions */}
      <div className="shrink-0 space-y-2">
        {/* Blood type — large, prominent */}
        {medical?.blood_type && (
          <div className="flex items-center gap-3 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
            <Droplets className="h-6 w-6 text-red-400" />
            <div>
              <span className="text-xs text-zinc-500 uppercase">{t("sos.medical.bloodType", "Blood Type")}</span>
              <p className="text-2xl font-bold text-red-300">{medical.blood_type}</p>
            </div>
          </div>
        )}

        {/* Doctor */}
        {medical?.doctor_name && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-zinc-200">{medical.doctor_name}</p>
                {medical.doctor_phone && (
                  <p className="text-xs text-zinc-400 font-mono">{medical.doctor_phone}</p>
                )}
              </div>
            </div>
            {medical.doctor_phone && (
              <Button
                variant="ghost"
                size="sm"
                className="text-green-400 hover:text-green-300 hover:bg-green-900/30"
                onClick={() => window.open(`tel:${medical.doctor_phone}`, "_self")}
              >
                <Phone className="h-3.5 w-3.5 mr-1" />
                {t("sos.medical.callDoctor", "Call")}
              </Button>
            )}
          </div>
        )}

        {/* Hospital */}
        {medical?.hospital_preference && (
          <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            <Building2 className="h-4 w-4 text-zinc-400" />
            <div>
              <span className="text-xs text-zinc-500">{t("sos.medical.hospital", "Hospital Preference")}</span>
              <p className="text-sm font-medium text-zinc-200">{medical.hospital_preference}</p>
            </div>
          </div>
        )}

        {/* Special Instructions */}
        {specialInstructions && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400 uppercase">
                {t("sos.medical.specialInstructions", "Special Instructions")}
              </span>
            </div>
            <p className="text-sm text-yellow-200">{specialInstructions}</p>
          </div>
        )}
      </div>

      {/* Scrollable section: Conditions, Medications, Allergies */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 pr-2">
          {/* Conditions */}
          {medical?.medical_conditions && medical.medical_conditions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1.5 flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {t("sos.medical.conditions", "Conditions")}
              </h4>
              <div className="flex flex-wrap gap-1">
                {medical.medical_conditions.map((c, i) => (
                  <Badge
                    key={i}
                    className={cn(
                      "text-xs",
                      isCritical(c)
                        ? "bg-red-600 text-white hover:bg-red-600"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Medications */}
          {medical?.medications && medical.medications.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1.5 flex items-center gap-1">
                <Pill className="h-3 w-3" />
                {t("sos.medical.medications", "Medications")}
              </h4>
              <div className="flex flex-wrap gap-1">
                {medical.medications.map((m, i) => (
                  <Badge
                    key={i}
                    className={cn(
                      "text-xs",
                      isWarningMed(m)
                        ? "bg-orange-700 text-orange-100 hover:bg-orange-700"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    {isWarningMed(m) && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Allergies */}
          {medical?.allergies && medical.allergies.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-2">
              <h4 className="text-xs font-semibold text-red-400 uppercase mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t("sos.medical.allergies", "ALLERGIES")}
              </h4>
              <div className="flex flex-wrap gap-1">
                {medical.allergies.map((a, i) => (
                  <Badge key={i} className="bg-red-700 text-white text-xs hover:bg-red-700">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Additional Medical Notes */}
          {medical?.additional_notes && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1.5 flex items-center gap-1">
                <Info className="h-3 w-3" />
                {t("sos.medical.additionalNotes", "Additional Notes")}
              </h4>
              <p className="text-sm text-zinc-300">{medical.additional_notes}</p>
            </div>
          )}

          {/* Empty state */}
          {!medical && (
            <div className="text-center py-4 text-zinc-500 text-sm">
              {t("sos.medical.noMedicalInfo", "No medical information on file")}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
