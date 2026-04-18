import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Mail, Share2, MessageCircle, Map, Check, AlertCircle } from "lucide-react";
import { PhoneSmsSection } from "./PhoneSmsSection";
import { WhatsAppSection } from "./WhatsAppSection";
import { SocialMediaSection } from "./SocialMediaSection";
import { MapsSection } from "./MapsSection";
import { EmailSettingsTab } from "./EmailSettingsTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";

interface CommunicationsTabProps {
  // Twilio
  twilioKeys: {
    account_sid: string;
    phone_number: string;
    whatsapp_number: string;
  };
  setTwilioKeys: React.Dispatch<React.SetStateAction<{
    account_sid: string;
    phone_number: string;
    whatsapp_number: string;
  }>>;
  twilioAuthTokenInput: string;
  setTwilioAuthTokenInput: React.Dispatch<React.SetStateAction<string>>;
  twilioAuthTokenStored: boolean;
  showTwilioToken: boolean;
  setShowTwilioToken: React.Dispatch<React.SetStateAction<boolean>>;
  twilioTestStatus: "idle" | "testing" | "success" | "error";
  twilioTestMessage: string;
  handleSaveTwilio: () => void;
  handleTestTwilio: () => Promise<void>;

  // Facebook
  facebookPageId: string;
  setFacebookPageId: React.Dispatch<React.SetStateAction<string>>;
  facebookTokenInput: string;
  setFacebookTokenInput: React.Dispatch<React.SetStateAction<string>>;
  facebookTokenStored: boolean;
  showFacebookToken: boolean;
  setShowFacebookToken: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveFacebook: () => void;

  // Google Maps
  googleMapsKey: string;
  setGoogleMapsKey: React.Dispatch<React.SetStateAction<string>>;
  handleSaveGoogleMaps: () => void;

  // WhatsApp save handler
  handleSaveWhatsApp: () => void;

  // Status helpers
  isSaving: boolean;
  twilioConfigured: boolean;
  whatsappConfigured: boolean;
  facebookConfigured: boolean;
  mapsConfigured: boolean;
}

export function CommunicationsTab({
  twilioKeys,
  setTwilioKeys,
  twilioAuthTokenInput,
  setTwilioAuthTokenInput,
  twilioAuthTokenStored,
  showTwilioToken,
  setShowTwilioToken,
  twilioTestStatus,
  twilioTestMessage,
  handleSaveTwilio,
  handleTestTwilio,
  facebookPageId,
  setFacebookPageId,
  facebookTokenInput,
  setFacebookTokenInput,
  facebookTokenStored,
  showFacebookToken,
  setShowFacebookToken,
  handleSaveFacebook,
  googleMapsKey,
  setGoogleMapsKey,
  handleSaveGoogleMaps,
  handleSaveWhatsApp,
  isSaving,
  twilioConfigured,
  whatsappConfigured,
  facebookConfigured,
  mapsConfigured,
}: CommunicationsTabProps) {
  const [subTab, setSubTab] = useState("phone");

  // Parse URL hash for deep linking
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("communications/")) {
      const tabMatch = hash.match(/communications\/(\w+)/);
      if (tabMatch && tabMatch[1]) {
        const targetTab = tabMatch[1];
        if (["phone", "email", "social", "whatsapp", "maps"].includes(targetTab)) {
          setSubTab(targetTab);
        }
      }
    }
  }, []);

  // Update URL when sub-tab changes
  const handleSubTabChange = (value: string) => {
    setSubTab(value);
    // Update hash without triggering navigation
    const currentUrl = new URL(window.location.href);
    currentUrl.hash = `communications/${value}`;
    window.history.replaceState(null, "", currentUrl.toString());
  };

  const StatusBadge = ({ configured }: { configured: boolean }) => {
    if (configured) {
      return <Check className="h-3 w-3 text-alert-resolved ml-1" />;
    }
    return <AlertCircle className="h-3 w-3 text-warning ml-1" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Communications</h2>
        <p className="text-muted-foreground">
          Configure phone, email, social media and messaging integrations
        </p>
      </div>

      <Tabs value={subTab} onValueChange={handleSubTabChange}>
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
          <TabsTrigger value="phone" className="flex items-center gap-1.5">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Phone & SMS</span>
            <span className="sm:hidden">Phone</span>
            <StatusBadge configured={twilioConfigured} />
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
            <StatusBadge configured={true} />
          </TabsTrigger>
          <TabsTrigger value="social" className="flex items-center gap-1.5">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Social</span>
            <StatusBadge configured={facebookConfigured} />
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
            <StatusBadge configured={whatsappConfigured} />
          </TabsTrigger>
          <TabsTrigger value="maps" className="flex items-center gap-1.5">
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Maps</span>
            {mapsConfigured && <Check className="h-3 w-3 text-alert-resolved ml-1" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phone" className="mt-6">
          <PhoneSmsSection
            twilioKeys={twilioKeys}
            setTwilioKeys={setTwilioKeys}
            twilioAuthTokenInput={twilioAuthTokenInput}
            setTwilioAuthTokenInput={setTwilioAuthTokenInput}
            twilioAuthTokenStored={twilioAuthTokenStored}
            showTwilioToken={showTwilioToken}
            setShowTwilioToken={setShowTwilioToken}
            twilioTestStatus={twilioTestStatus}
            twilioTestMessage={twilioTestMessage}
            handleSaveTwilio={handleSaveTwilio}
            handleTestTwilio={handleTestTwilio}
            isSaving={isSaving}
            isConfigured={twilioConfigured}
          />
        </TabsContent>

        <TabsContent value="email" className="mt-6 space-y-6">
          <EmailSettingsTab />
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="social" className="mt-6">
          <SocialMediaSection
            facebookPageId={facebookPageId}
            setFacebookPageId={setFacebookPageId}
            facebookTokenInput={facebookTokenInput}
            setFacebookTokenInput={setFacebookTokenInput}
            facebookTokenStored={facebookTokenStored}
            showFacebookToken={showFacebookToken}
            setShowFacebookToken={setShowFacebookToken}
            handleSaveFacebook={handleSaveFacebook}
            isSaving={isSaving}
            isConfigured={facebookConfigured}
          />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-6">
          <WhatsAppSection
            whatsappNumber={twilioKeys.whatsapp_number}
            setWhatsappNumber={(value) =>
              setTwilioKeys((prev) => ({ ...prev, whatsapp_number: value }))
            }
            handleSave={handleSaveWhatsApp}
            isSaving={isSaving}
            isConfigured={whatsappConfigured}
          />
        </TabsContent>

        <TabsContent value="maps" className="mt-6">
          <MapsSection
            googleMapsKey={googleMapsKey}
            setGoogleMapsKey={setGoogleMapsKey}
            handleSaveGoogleMaps={handleSaveGoogleMaps}
            isSaving={isSaving}
            isConfigured={mapsConfigured}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
