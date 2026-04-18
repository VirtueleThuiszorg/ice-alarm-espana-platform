import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Mic,
  MicOff,
  Bot,
  UserPlus,
  CheckCircle,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SOSCallControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  isIsabellaHolding: boolean;
  onIsabellaHold: () => void;
  onPatchBackIn: () => void;
  onAddParticipant: (name: string, phone: string) => void;
  onResolveAlert: (notes: string, isFalseAlarm: boolean, resolutionType?: string) => void;
}

export function SOSCallControls({
  isMuted,
  onToggleMute,
  isIsabellaHolding,
  onIsabellaHold,
  onPatchBackIn,
  onAddParticipant,
  onResolveAlert,
}: SOSCallControlsProps) {
  const { t } = useTranslation();
  const [showResolve, setShowResolve] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [isFalseAlarm, setIsFalseAlarm] = useState(false);
  const [resolutionType, setResolutionType] = useState<string>("");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");

  const handleResolve = () => {
    if (resolveNotes.trim().length < 10) return;
    onResolveAlert(resolveNotes, isFalseAlarm, resolutionType || undefined);
    setShowResolve(false);
  };

  const handleAddParticipant = () => {
    if (!addName.trim() || !addPhone.trim()) return;
    onAddParticipant(addName.trim(), addPhone.trim());
    setAddName("");
    setAddPhone("");
    setShowAddParticipant(false);
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3 px-4 py-3 bg-zinc-900/80 border-t border-zinc-700/50">
        {/* Mute/Unmute */}
        <Button
          size="lg"
          className={cn(
            "gap-2 font-semibold",
            isMuted
              ? "bg-red-700 hover:bg-red-800 text-white"
              : "bg-green-700 hover:bg-green-800 text-white"
          )}
          onClick={onToggleMute}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {isMuted
            ? t("sos.controls.unmute", "Unmute")
            : t("sos.controls.mute", "Mute")}
        </Button>

        {/* Isabella Hold / Patch Back In */}
        {!isIsabellaHolding ? (
          <Button
            size="lg"
            variant="outline"
            className="gap-2 border-purple-600 text-purple-300 hover:bg-purple-900/30"
            onClick={onIsabellaHold}
          >
            <Bot className="h-5 w-5" />
            {t("sos.controls.isabellaHold", "Isabella Takes Over")}
          </Button>
        ) : (
          <Button
            size="lg"
            className="gap-2 bg-purple-700 hover:bg-purple-800 text-white animate-pulse"
            onClick={onPatchBackIn}
          >
            <Bot className="h-5 w-5" />
            {t("sos.controls.patchBackIn", "Patch Back In")}
          </Button>
        )}

        {/* Add Participant */}
        <Button
          size="lg"
          variant="outline"
          className="gap-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          onClick={() => setShowAddParticipant(true)}
        >
          <UserPlus className="h-5 w-5" />
          {t("sos.controls.addParticipant", "Add Participant")}
        </Button>

        {/* Resolve Alert */}
        <Button
          size="lg"
          className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white ml-auto"
          onClick={() => setShowResolve(true)}
        >
          <CheckCircle className="h-5 w-5" />
          {t("sos.controls.resolveAlert", "Resolve Alert")}
        </Button>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={showResolve} onOpenChange={setShowResolve}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{t("sos.resolve.title", "Resolve Alert")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400">
                {t("sos.resolve.resolutionType", "Resolution Type")}
              </Label>
              <Select value={resolutionType} onValueChange={setResolutionType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder={t("sos.resolve.selectType", "Select type...")} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="ambulance_dispatched">{t("sos.resolve.ambulanceDispatched", "Ambulance Dispatched")}</SelectItem>
                  <SelectItem value="member_safe">{t("sos.resolve.memberSafe", "Member Safe")}</SelectItem>
                  <SelectItem value="false_alarm">{t("sos.resolve.falseAlarm", "False Alarm")}</SelectItem>
                  <SelectItem value="contact_handling">{t("sos.resolve.contactHandling", "Contact Handling")}</SelectItem>
                  <SelectItem value="other">{t("sos.resolve.other", "Other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-400">
                {t("sos.resolve.notes", "Resolution Notes")} *
              </Label>
              <Textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder={t("sos.resolve.notesPlaceholder", "Describe what happened and actions taken (min 10 chars)...")}
                className="bg-zinc-800 border-zinc-700 text-zinc-200 min-h-[100px]"
              />
              {resolveNotes.trim().length > 0 && resolveNotes.trim().length < 10 && (
                <p className="text-xs text-red-400 mt-1">
                  {t("sos.resolve.minChars", "Minimum 10 characters required")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="false-alarm"
                checked={isFalseAlarm}
                onCheckedChange={(checked) => setIsFalseAlarm(checked as boolean)}
              />
              <Label htmlFor="false-alarm" className="text-zinc-300">
                {t("sos.resolve.isFalseAlarm", "This was a false alarm")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResolve(false)} className="text-zinc-400">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-800"
              disabled={resolveNotes.trim().length < 10}
              onClick={handleResolve}
            >
              {t("sos.resolve.confirm", "Resolve Alert")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Participant Dialog */}
      <Dialog open={showAddParticipant} onOpenChange={setShowAddParticipant}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{t("sos.addParticipant.title", "Add Participant to Conference")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-zinc-400">{t("sos.addParticipant.name", "Name")}</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Contact name"
                className="bg-zinc-800 border-zinc-700 text-zinc-200"
              />
            </div>
            <div>
              <Label className="text-zinc-400">{t("sos.addParticipant.phone", "Phone Number")}</Label>
              <Input
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="+34 6XX XXX XXX"
                className="bg-zinc-800 border-zinc-700 text-zinc-200"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddParticipant(false)} className="text-zinc-400">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              className="bg-blue-700 hover:bg-blue-800"
              disabled={!addName.trim() || !addPhone.trim()}
              onClick={handleAddParticipant}
            >
              <Phone className="h-4 w-4 mr-1" />
              {t("sos.addParticipant.call", "Call & Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
