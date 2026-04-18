import { useTranslation } from "react-i18next";
import { Settings, Save, Infinity as InfinityIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useOutreachCaps, type CapSetting, type OutreachCapsSettings } from "@/hooks/useOutreachCaps";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachControlPanel } from "./OutreachControlPanel";

interface CapRowProps {
  label: string;
  description: string;
  value: CapSetting;
  onChange: (value: CapSetting) => void;
}

function CapRow({ label, description, value, onChange }: CapRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b last:border-b-0">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: parseInt(e.target.value) || 1 })}
            disabled={!value.enabled}
            className="w-20 text-center"
          />
          <span className="text-xs text-muted-foreground">{t("outreach.caps.perDay")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          />
          <span className="text-xs text-muted-foreground w-16">
            {value.enabled ? <span>{t("outreach.caps.limited")}</span> : (
              <span className="flex items-center gap-1">
                <InfinityIcon className="h-3 w-3" />
                {t("outreach.caps.unlimited")}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function OutreachSettingsTab() {
   const { t } = useTranslation();
   const { settings, isLoading, updateSetting, isUpdating } = useOutreachCaps();
   const [localSettings, setLocalSettings] = useState<OutreachCapsSettings>(settings);
   const [hasChanges, setHasChanges] = useState(false);

   useEffect(() => {
     setLocalSettings(settings);
   }, [settings]);

   const handleChange = (key: keyof OutreachCapsSettings, value: CapSetting) => {
     setLocalSettings((prev) => ({ ...prev, [key]: value }));
     setHasChanges(true);
   };

   const handleSave = async () => {
     const keys = Object.keys(localSettings) as (keyof OutreachCapsSettings)[];
     for (const key of keys) {
       if (JSON.stringify(localSettings[key]) !== JSON.stringify(settings[key])) {
         await updateSetting({ key, value: localSettings[key] });
       }
     }
     setHasChanges(false);
   };

   const capRows: { key: keyof OutreachCapsSettings; labelKey: string; descKey: string }[] = [
     {
       key: "max_qualified_per_day",
       labelKey: "outreach.caps.maxQualified",
       descKey: "outreach.caps.maxQualifiedDesc",
     },
     {
       key: "max_ai_ratings_per_day",
       labelKey: "outreach.caps.maxRatings",
       descKey: "outreach.caps.maxRatingsDesc",
     },
     {
       key: "max_ai_research_per_day",
       labelKey: "outreach.caps.maxResearch",
       descKey: "outreach.caps.maxResearchDesc",
     },
     {
       key: "max_ai_emails_per_day",
       labelKey: "outreach.caps.maxEmails",
       descKey: "outreach.caps.maxEmailsDesc",
     },
     {
       key: "max_emails_per_inbox_per_day",
       labelKey: "outreach.caps.maxEmailsInbox",
       descKey: "outreach.caps.maxEmailsInboxDesc",
     },
   ];

   return (
     <Tabs defaultValue="control" className="w-full space-y-4">
       <TabsList>
         <TabsTrigger value="control">Control Panel</TabsTrigger>
         <TabsTrigger value="caps">Rate Limits</TabsTrigger>
       </TabsList>

       <TabsContent value="control" className="space-y-4">
         <OutreachControlPanel />
       </TabsContent>

       <TabsContent value="caps">
         <Card>
           <CardHeader>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5 text-primary" />
                 <div>
                   <CardTitle>{t("outreach.caps.title")}</CardTitle>
                   <CardDescription>{t("outreach.caps.subtitle")}</CardDescription>
                 </div>
               </div>
               {hasChanges && (
                 <Button onClick={handleSave} disabled={isUpdating} size="sm">
                   <Save className="mr-2 h-4 w-4" />
                   {t("common.save")}
                 </Button>
               )}
             </div>
           </CardHeader>
           <CardContent>
             {isLoading ? (
               <div className="py-8 text-center text-muted-foreground">
                 {t("common.loading")}
               </div>
             ) : (
               <div className="divide-y">
                 {capRows.map(({ key, labelKey, descKey }) => (
                   <CapRow
                     key={key}
                     label={t(labelKey)}
                     description={t(descKey)}
                     value={localSettings[key]}
                     onChange={(value) => handleChange(key, value)}
                   />
                 ))}
               </div>
             )}
           </CardContent>
         </Card>
       </TabsContent>
     </Tabs>
   );
 }
