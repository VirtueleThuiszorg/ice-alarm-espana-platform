import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X, Minimize2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSOSTakeover } from "@/hooks/useSOSTakeover";
import { useSOSConference } from "@/hooks/useSOSConference";
import { useTwilioDevice } from "@/hooks/useTwilioDevice";
import { SOSVitalsStrip } from "./SOSVitalsStrip";
import { SOSMedicalPanel } from "./SOSMedicalPanel";
import { SOSSituationPanel } from "./SOSSituationPanel";
import { SOSActionPanel } from "./SOSActionPanel";
import { SOSCallControls } from "./SOSCallControls";
import { SOSParticipantStrip } from "./SOSParticipantStrip";
import { supabase } from "@/integrations/supabase/client";

interface SOSSecondaryAlertStripProps {
  pendingAlerts: Array<{ id: string; alert_type: string; received_at: string }>;
}

function SOSSecondaryAlertStrip({ pendingAlerts }: SOSSecondaryAlertStripProps) {
  const { t } = useTranslation();
  if (pendingAlerts.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-900/60 border-b border-orange-700">
      <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
      <span className="text-xs text-orange-300 font-medium">
        {t("sos.secondary.otherAlerts", "{{count}} other pending alert(s)", {
          count: pendingAlerts.length,
        })}
      </span>
      {pendingAlerts.map((a) => (
        <Badge key={a.id} variant="outline" className="text-xs border-orange-600 text-orange-300">
          {a.alert_type.replace("_", " ")}
        </Badge>
      ))}
    </div>
  );
}

function ModalElapsedCounter({ since }: { since: string }) {
  const [display, setDisplay] = useState("0:00");

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Date.now() - new Date(since).getTime());
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setDisplay(`${min}:${sec.toString().padStart(2, "0")}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [since]);

  return <span className="font-mono font-bold text-white text-sm">{display}</span>;
}

interface SOSTakeoverScreenProps {
  onClose: () => void;
}

export function SOSTakeoverScreen({ onClose }: SOSTakeoverScreenProps) {
  const { t } = useTranslation();
  const { activeAlert, pendingAlerts, resolveAlert } = useSOSTakeover();
  const {
    conference,
    participants,
    isabellaLogs,
    escalations,
    joinConference,
    leaveConference,
    muteParticipant,
    unmuteParticipant,
    addParticipantByPhone,
  } = useSOSConference(activeAlert?.id || null);

  const { connect, disconnect, toggleMute, isMuted } = useTwilioDevice();

  const [isInConference, setIsInConference] = useState(false);
  const [isIsabellaHolding, setIsIsabellaHolding] = useState(false);
  const [memberSpecialInstructions, setMemberSpecialInstructions] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [doctorPhone, setDoctorPhone] = useState<string | null>(null);
  const [acceptedByName, setAcceptedByName] = useState<string | null>(null);
  const [privateCall, setPrivateCall] = useState<{
    contactName: string;
    phone: string;
    ecId?: string;
    startTime: number;
  } | null>(null);

  // Fetch member name, special instructions, and doctor phone
  useEffect(() => {
    if (!activeAlert?.member_id) return;

    const fetchExtra = async () => {
      const [memberRes, medRes] = await Promise.all([
        supabase
          .from("members")
          .select("first_name, last_name, special_instructions")
          .eq("id", activeAlert.member_id)
          .maybeSingle(),
        supabase
          .from("medical_information")
          .select("doctor_phone")
          .eq("member_id", activeAlert.member_id)
          .maybeSingle(),
      ]);
      if (memberRes.data) {
        setMemberName(`${memberRes.data.first_name} ${memberRes.data.last_name}`);
        setMemberSpecialInstructions(memberRes.data.special_instructions || null);
      }
      setDoctorPhone(medRes.data?.doctor_phone || null);
    };
    fetchExtra();
  }, [activeAlert?.member_id]);

  // Fetch accepting staff name
  useEffect(() => {
    if (!activeAlert?.accepted_by_staff_id) return;

    const fetchStaff = async () => {
      const { data } = await supabase
        .from("staff")
        .select("first_name, last_name")
        .eq("id", activeAlert.accepted_by_staff_id!)
        .maybeSingle();
      if (data) setAcceptedByName(`${data.first_name} ${data.last_name}`);
    };
    fetchStaff();
  }, [activeAlert?.accepted_by_staff_id]);

  // Track if current staff is in conference
  useEffect(() => {
    const staffParticipant = participants.find(
      (p) => p.participant_type === "staff" && !p.left_at
    );
    setIsInConference(!!staffParticipant);
  }, [participants]);

  // Track Isabella holding state
  useEffect(() => {
    const ai = participants.find(
      (p) => p.participant_type === "ai" && !p.left_at
    );
    const staff = participants.find(
      (p) => p.participant_type === "staff" && !p.left_at
    );
    setIsIsabellaHolding(!!(ai && !ai.is_muted && staff?.is_muted));
  }, [participants]);

  const handleJoinConference = useCallback(async () => {
    await joinConference();
  }, [joinConference]);

  const handleIsabellaHold = useCallback(async () => {
    // Mute staff, unmute Isabella
    const staffP = participants.find((p) => p.participant_type === "staff" && !p.left_at);
    const aiP = participants.find((p) => p.participant_type === "ai" && !p.left_at);
    if (staffP) await muteParticipant(staffP.id);
    if (aiP) await unmuteParticipant(aiP.id);
  }, [participants, muteParticipant, unmuteParticipant]);

  const handlePatchBackIn = useCallback(async () => {
    // Unmute staff, mute Isabella
    const staffP = participants.find((p) => p.participant_type === "staff" && !p.left_at);
    const aiP = participants.find((p) => p.participant_type === "ai" && !p.left_at);
    if (staffP) await unmuteParticipant(staffP.id);
    if (aiP) await muteParticipant(aiP.id);
  }, [participants, muteParticipant, unmuteParticipant]);

  const handleAddParticipant = useCallback(
    (name: string, phone: string) => {
      addParticipantByPhone(name, phone, "external_service");
    },
    [addParticipantByPhone]
  );

  const handleAddToCall = useCallback(
    (name: string, phone: string, type: string, ecId?: string) => {
      addParticipantByPhone(name, phone, type, ecId);
    },
    [addParticipantByPhone]
  );

  const handleCallPrivately = useCallback(
    async (phone: string, contactName: string, ecId?: string) => {
      const call = await connect({ To: phone });
      if (call) {
        setPrivateCall({ contactName, phone, ecId, startTime: Date.now() });
        call.on("disconnect", () => setPrivateCall(null));
      }
    },
    [connect]
  );

  const handleBridgeToConference = useCallback(() => {
    if (!privateCall) return;
    // End the private call
    disconnect();
    // Add the contact to the conference
    addParticipantByPhone(
      privateCall.contactName,
      privateCall.phone,
      "emergency_contact",
      privateCall.ecId
    );
    setPrivateCall(null);
  }, [privateCall, disconnect, addParticipantByPhone]);

  const handleEndPrivateCall = useCallback(() => {
    disconnect();
    setPrivateCall(null);
  }, [disconnect]);

  const handleResolveAlert = useCallback(
    async (notes: string, isFalseAlarm: boolean, _resolutionType?: string) => {
      if (!activeAlert) return;
      await resolveAlert(activeAlert.id, notes, isFalseAlarm);
    },
    [activeAlert, resolveAlert]
  );

  const handleLeaveParticipant = useCallback(
    async (_participantId: string) => {
      await leaveConference();
    },
    [leaveConference]
  );

  if (!activeAlert) return null;

  const alertTypeLabel =
    activeAlert.alert_type === "sos_button"
      ? "SOS ALERT"
      : activeAlert.alert_type === "fall_detected"
        ? "FALL DETECTED"
        : activeAlert.alert_type.replace("_", " ").toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — dark class activates dark CSS variables for all shadcn components */}
      <div className="dark relative w-[96%] h-[94%] max-w-[1800px] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700/50 flex flex-col overflow-hidden text-zinc-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-900/90 border-b border-red-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
              <Badge className="bg-red-600 text-white font-bold text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {alertTypeLabel}
              </Badge>
            </div>
            <span className="text-white font-semibold text-sm">
              {memberName || "Loading..."}
            </span>
            {activeAlert.location_address && (
              <span className="text-red-200 text-xs hidden md:block">
                {activeAlert.location_address}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-red-200">
              <Clock className="h-3.5 w-3.5" />
              <ModalElapsedCounter since={activeAlert.received_at} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-200 hover:text-white hover:bg-red-800/50"
              onClick={onClose}
              title={t("sos.modal.minimize", "Minimize")}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-200 hover:text-white hover:bg-red-800/50"
              onClick={onClose}
              title={t("sos.modal.close", "Close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Secondary alerts strip */}
        <SOSSecondaryAlertStrip pendingAlerts={pendingAlerts} />

        {/* Vitals strip */}
        <SOSVitalsStrip
          alertId={activeAlert.id}
          alertType={activeAlert.alert_type}
          memberId={activeAlert.member_id}
          receivedAt={activeAlert.received_at}
          isUnresponsive={!!(activeAlert as any).is_unresponsive}
        />

        {/* Main three-column layout */}
        <div className="flex-1 min-h-0 flex">
          {/* Left: Medical (30%) */}
          <div className="w-[30%] border-r border-zinc-700/50 flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {t("sos.section.medical", "Medical Profile")}
              </h3>
            </div>
            <div className="flex-1 min-h-0 p-3 overflow-hidden">
              <SOSMedicalPanel
                memberId={activeAlert.member_id}
                specialInstructions={memberSpecialInstructions}
              />
            </div>
          </div>

          {/* Centre: Situation (40%) */}
          <div className="w-[40%] border-r border-zinc-700/50 flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {t("sos.section.situation", "Situation Overview")}
              </h3>
            </div>
            <div className="flex-1 min-h-0 p-3 overflow-hidden">
              <SOSSituationPanel
                alertId={activeAlert.id}
                memberId={activeAlert.member_id}
                receivedAt={activeAlert.received_at}
                alertStatus={activeAlert.status}
                acceptedAt={activeAlert.accepted_at}
                acceptedByName={acceptedByName}
                locationLat={activeAlert.location_lat}
                locationLng={activeAlert.location_lng}
                locationAddress={activeAlert.location_address}
                isabellaLogs={isabellaLogs}
                participants={participants}
                escalations={escalations}
              />
            </div>
          </div>

          {/* Right: Actions (30%) */}
          <div className="w-[30%] flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {t("sos.section.actions", "Actions & Contacts")}
              </h3>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <SOSActionPanel
                alertId={activeAlert.id}
                memberId={activeAlert.member_id}
                conferenceId={conference?.id || null}
                isInConference={isInConference}
                onJoinConference={handleJoinConference}
                onAddToCall={handleAddToCall}
                onCallPrivately={handleCallPrivately}
                privateCall={privateCall}
                onBridgeToConference={handleBridgeToConference}
                onEndPrivateCall={handleEndPrivateCall}
                doctorPhone={doctorPhone}
              />
            </div>
          </div>
        </div>

        {/* Participant strip */}
        {isInConference && (
          <SOSParticipantStrip
            participants={participants}
            onMute={muteParticipant}
            onUnmute={unmuteParticipant}
            onRemove={handleLeaveParticipant}
          />
        )}

        {/* Call controls — only when in conference */}
        {isInConference && (
          <SOSCallControls
            isMuted={isMuted}
            onToggleMute={toggleMute}
            isIsabellaHolding={isIsabellaHolding}
            onIsabellaHold={handleIsabellaHold}
            onPatchBackIn={handlePatchBackIn}
            onAddParticipant={handleAddParticipant}
            onResolveAlert={handleResolveAlert}
          />
        )}
      </div>
    </div>
  );
}
