import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Phone,
  PhoneCall,
  UserPlus,
  History,
  FileText,
  Stethoscope,
  Building2,
  CheckCircle,
  Mail,
  Shield,
  Siren,
  Users,
  Star,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
// Card not needed - using explicit dark styled divs within the SOS dark modal
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface EmergencyContact {
  id: string;
  contact_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  speaks_spanish: boolean | null;
  is_primary: boolean | null;
  priority_order: number;
  notes: string | null;
}

interface PreviousAlert {
  id: string;
  alert_type: string;
  received_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  is_false_alarm: boolean | null;
}

interface PrivateCallState {
  contactName: string;
  phone: string;
  ecId?: string;
  startTime: number;
}

interface SOSActionPanelProps {
  alertId: string;
  memberId: string;
  conferenceId: string | null;
  isInConference: boolean;
  onJoinConference: () => void;
  onAddToCall: (name: string, phone: string, type: string, ecId?: string) => void;
  onCallPrivately: (phone: string, contactName: string, ecId?: string) => void;
  privateCall: PrivateCallState | null;
  onBridgeToConference: () => void;
  onEndPrivateCall: () => void;
  doctorPhone?: string | null;
}

function PrivateCallElapsed({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return <span>{mm}:{ss}</span>;
}

export function SOSActionPanel({
  alertId,
  memberId,
  conferenceId,
  isInConference,
  onJoinConference,
  onAddToCall,
  onCallPrivately,
  privateCall,
  onBridgeToConference,
  onEndPrivateCall,
  doctorPhone,
}: SOSActionPanelProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [previousAlerts, setPreviousAlerts] = useState<PreviousAlert[]>([]);
  const [notes, setNotes] = useState("");
  const [emergencyServicesCalled, setEmergencyServicesCalled] = useState(false);
  const [nextOfKinNotified, setNextOfKinNotified] = useState(false);
  const [memberPhone, setMemberPhone] = useState<string | null>(null);
  const [hospitalPreference, setHospitalPreference] = useState<string | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch emergency contacts
  useEffect(() => {
    const fetchContacts = async () => {
      const { data } = await supabase
        .from("emergency_contacts")
        .select("id, contact_name, relationship, phone, email, speaks_spanish, is_primary, priority_order, notes")
        .eq("member_id", memberId)
        .order("priority_order");
      if (data) setContacts(data);
    };
    fetchContacts();
  }, [memberId]);

  // Fetch member phone and hospital preference
  useEffect(() => {
    const fetchMemberAndMedical = async () => {
      const [memberRes, medRes] = await Promise.all([
        supabase
          .from("members")
          .select("phone")
          .eq("id", memberId)
          .maybeSingle(),
        supabase
          .from("medical_information")
          .select("hospital_preference")
          .eq("member_id", memberId)
          .maybeSingle(),
      ]);
      if (memberRes.data?.phone) setMemberPhone(memberRes.data.phone);
      if (medRes.data?.hospital_preference) setHospitalPreference(medRes.data.hospital_preference);
    };
    fetchMemberAndMedical();
  }, [memberId]);

  // Fetch previous alerts
  useEffect(() => {
    const fetchPrev = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, alert_type, received_at, resolved_at, resolution_notes, is_false_alarm")
        .eq("member_id", memberId)
        .eq("status", "resolved")
        .neq("id", alertId)
        .order("received_at", { ascending: false })
        .limit(5);
      if (data) setPreviousAlerts(data);
    };
    fetchPrev();
  }, [memberId, alertId]);

  // Fetch existing notes and service flags
  useEffect(() => {
    const fetchAlert = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("resolution_notes, emergency_services_called, next_of_kin_notified")
        .eq("id", alertId)
        .maybeSingle();
      if (data) {
        if (data.resolution_notes) setNotes(data.resolution_notes);
        setEmergencyServicesCalled(!!data.emergency_services_called);
        setNextOfKinNotified(!!data.next_of_kin_notified);
      }
    };
    fetchAlert();
  }, [alertId]);

  // Auto-save notes every 30 seconds
  const saveNotes = useCallback(async () => {
    if (!notes.trim()) return;
    await supabase
      .from("alerts")
      .update({ resolution_notes: notes })
      .eq("id", alertId);
  }, [alertId, notes]);

  useEffect(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(saveNotes, 30000);
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, [notes, saveNotes]);

  const handleNotesBlur = () => saveNotes();

  const toggleEmergencyServices = async () => {
    const newValue = !emergencyServicesCalled;
    setEmergencyServicesCalled(newValue);
    await supabase
      .from("alerts")
      .update({ emergency_services_called: newValue })
      .eq("id", alertId);
  };

  const toggleNextOfKin = async () => {
    const newValue = !nextOfKinNotified;
    setNextOfKinNotified(newValue);
    await supabase
      .from("alerts")
      .update({ next_of_kin_notified: newValue })
      .eq("id", alertId);
  };

  const falseAlarmCount = previousAlerts.filter((a) => a.is_false_alarm).length;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1 pr-3">
        {/* Join Call Button */}
        {!isInConference ? (
          <Button
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-lg py-6"
            onClick={onJoinConference}
            disabled={!conferenceId}
          >
            <PhoneCall className="h-5 w-5 mr-2" />
            {t("sos.action.joinCall", "JOIN CALL")}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-300 font-semibold">
              {t("sos.action.connected", "Connected to Conference")}
            </span>
          </div>
        )}

        {/* Service Tracking Flags */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={toggleEmergencyServices}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
              emergencyServicesCalled
                ? "bg-red-900/40 border-red-600 text-red-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
            )}
          >
            <Siren className="h-3.5 w-3.5 shrink-0" />
            <span>112 {emergencyServicesCalled ? "Called" : "Not Called"}</span>
          </button>
          <button
            onClick={toggleNextOfKin}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
              nextOfKinNotified
                ? "bg-blue-900/40 border-blue-600 text-blue-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
            )}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>NOK {nextOfKinNotified ? "Notified" : "Not Notified"}</span>
          </button>
        </div>

        {/* Private Call Active Indicator */}
        {privateCall && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-sm font-semibold text-yellow-300">
                  {t("sos.action.privateCallActive", "Private Call Active")}
                </span>
              </div>
              <span className="text-xs text-yellow-400 font-mono">
                <PrivateCallElapsed startTime={privateCall.startTime} />
              </span>
            </div>
            <p className="text-xs text-yellow-200">
              {privateCall.contactName} — {privateCall.phone}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1 text-xs bg-blue-700 hover:bg-blue-800 text-white"
                disabled={!conferenceId}
                onClick={onBridgeToConference}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                {t("sos.action.bridgeToConference", "Bridge to Conference")}
              </Button>
              <Button
                size="sm"
                className="text-xs bg-red-700 hover:bg-red-800 text-white"
                onClick={onEndPrivateCall}
              >
                <Phone className="h-3 w-3 mr-1" />
                {t("sos.action.endCall", "End Call")}
              </Button>
            </div>
          </div>
        )}

        {/* Emergency Contacts */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700/50">
            <Phone className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">
              {t("sos.action.emergencyContacts", "Emergency Contacts")}
            </span>
            <Badge className="ml-auto text-xs bg-zinc-700 text-zinc-400 border-0">
              {contacts.length}
            </Badge>
          </div>
          <div className="px-3 py-2 space-y-2">
            {/* Member direct dial */}
            {memberPhone && (
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-green-400" />
                    <p className="text-sm font-medium text-green-300">
                      {t("sos.action.callMember", "Call Member Directly")}
                    </p>
                  </div>
                  <span className="text-xs text-green-400 font-mono">{memberPhone}</span>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-green-700 hover:bg-green-800 text-white"
                    disabled={!!privateCall}
                    onClick={() => onCallPrivately(memberPhone, "Member")}
                  >
                    <Phone className="h-3 w-3 mr-1" />
                    {t("sos.action.callPrivately", "Call Privately")}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-blue-700 hover:bg-blue-800 text-white"
                    disabled={!conferenceId}
                    onClick={() => onAddToCall("Member", memberPhone, "member")}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    {t("sos.action.addToCall", "Add to Call")}
                  </Button>
                </div>
              </div>
            )}

            {contacts.length === 0 ? (
              <p className="text-xs text-zinc-500">{t("sos.action.noContacts", "No emergency contacts on file")}</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="bg-zinc-900/50 border border-zinc-700/30 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {contact.is_primary && <Star className="h-3 w-3 inline mr-1 text-yellow-400" />}
                        {contact.contact_name}
                        <span className="text-zinc-500 text-xs ml-1">({contact.relationship})</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-400 font-mono">{contact.phone}</span>
                        {contact.email && (
                          <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                            <Mail className="h-2.5 w-2.5" />
                            {contact.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {contact.speaks_spanish && <span className="text-xs">🇪🇸</span>}
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        #{contact.priority_order}
                      </span>
                    </div>
                  </div>
                  {/* Contact notes */}
                  {contact.notes && (
                    <div className="flex items-start gap-1 bg-zinc-800/50 rounded px-2 py-1">
                      <Info className="h-3 w-3 text-zinc-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-zinc-400">{contact.notes}</p>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                      disabled={!!privateCall}
                      onClick={() => onCallPrivately(contact.phone, contact.contact_name, contact.id)}
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      {t("sos.action.callPrivately", "Call Privately")}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-blue-700 hover:bg-blue-800 text-white"
                      disabled={!conferenceId}
                      onClick={() =>
                        onAddToCall(
                          contact.contact_name,
                          contact.phone,
                          "emergency_contact",
                          contact.id
                        )
                      }
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      {t("sos.action.addToCall", "Add to Call")}
                    </Button>
                    {contact.email && (
                      <Button
                        size="sm"
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                        onClick={() => window.open(`mailto:${contact.email}`, "_blank")}
                      >
                        <Mail className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase px-1 flex items-center gap-1.5">
            <PhoneCall className="h-3 w-3" />
            {t("sos.action.quickActions", "Quick Actions")}
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              size="sm"
              className="text-xs bg-red-700 hover:bg-red-800 text-white font-semibold"
              onClick={() => {
                window.open("tel:112", "_self");
                if (!emergencyServicesCalled) toggleEmergencyServices();
              }}
            >
              <Siren className="h-3 w-3 mr-1" />
              112
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs",
                doctorPhone
                  ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
              disabled={!doctorPhone}
              onClick={() => doctorPhone && window.open(`tel:${doctorPhone}`, "_self")}
            >
              <Stethoscope className="h-3 w-3 mr-1" />
              {t("sos.action.doctor", "Doctor")}
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs",
                hospitalPreference
                  ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
              disabled={!hospitalPreference}
              onClick={() => {
                if (hospitalPreference) {
                  window.open(`https://www.google.com/maps/search/${encodeURIComponent(hospitalPreference)}`, "_blank");
                }
              }}
              title={hospitalPreference || t("sos.action.noHospital", "No hospital preference on file")}
            >
              <Building2 className="h-3 w-3 mr-1" />
              {t("sos.action.hospital", "Hospital")}
            </Button>
          </div>
          {hospitalPreference && (
            <p className="text-[10px] text-zinc-500 px-1 truncate">
              <Building2 className="h-2.5 w-2.5 inline mr-0.5" />
              {hospitalPreference}
            </p>
          )}
        </div>

        {/* Previous Alerts */}
        {previousAlerts.length > 0 && (
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700/50">
              <History className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">
                {t("sos.action.previousAlerts", "Previous Alerts")}
              </span>
              {falseAlarmCount > 0 && (
                <Badge className="ml-auto text-xs bg-yellow-800/60 text-yellow-300 border-0">
                  {falseAlarmCount} false alarm{falseAlarmCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {previousAlerts.map((alert) => (
                <div key={alert.id} className="bg-zinc-900/50 rounded px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {alert.alert_type.replace("_", " ")}
                      </span>
                      <span className="text-zinc-500">
                        {alert.received_at ? new Date(alert.received_at).toLocaleDateString() : "—"}
                      </span>
                      {alert.is_false_alarm && (
                        <span className="text-[10px] bg-yellow-800/60 text-yellow-300 px-1 py-0 rounded">
                          False
                        </span>
                      )}
                    </div>
                    {alert.resolved_at && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  {alert.resolution_notes && (
                    <p className="text-zinc-500 mt-1 truncate">{alert.resolution_notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700/50">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">
              {t("sos.action.notes", "Notes")}
            </span>
          </div>
          <div className="px-3 py-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder={t("sos.action.notesPlaceholder", "Staff notes during call...")}
              className="bg-zinc-900/50 border-zinc-700/50 text-zinc-300 placeholder:text-zinc-600 min-h-[80px] text-sm"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              {t("sos.action.autoSave", "Auto-saves every 30 seconds")}
            </p>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
