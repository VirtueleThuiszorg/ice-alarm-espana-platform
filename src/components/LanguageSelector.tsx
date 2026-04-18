import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const languages = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

interface LanguageSelectorProps {
  variant?: "default" | "icon-only";
}

export function LanguageSelector({ variant = "default" }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const { memberId } = useAuth();
  const currentLang = i18n.language?.split("-")[0] || "en";

  const handleLanguageChange = async (langCode: string) => {
    // Change i18n language (persists to localStorage automatically)
    await i18n.changeLanguage(langCode);

    // Persist to user profile if logged in
    try {
      if (memberId) {
        await supabase
          .from("members")
          .update({ preferred_language: langCode as "en" | "es" })
          .eq("id", memberId);
      }
      // Note: Staff table also has preferred_language if needed
    } catch (error) {
      console.error("Failed to save language preference:", error);
    }
  };

  const currentLanguage = languages.find((l) => l.code === currentLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon-only" ? (
          <Button variant="ghost" size="icon" className="touch-target">
            <Globe className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="ghost" className="gap-2 touch-target">
            <span className="text-lg">{currentLanguage.flag}</span>
            <span className="hidden sm:inline">{currentLanguage.label}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="gap-2 cursor-pointer"
          >
            <span className="text-lg">{lang.flag}</span>
            <span>{lang.label}</span>
            {currentLang === lang.code && (
              <Check className="h-4 w-4 ml-auto text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
