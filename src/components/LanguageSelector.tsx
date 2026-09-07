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
import { MEMBER_LANGUAGES, memberLanguage } from "@/lib/memberLanguages";

/*
  ONE list, shared with the profile form and derived from the database enum.

  Both places used to hard-code their own two-value array while `members.preferred_language` is
  `en | es | nl` and `nl.json` is a complete, CI-enforced translation — so Dutch was unreachable
  from the running application. See `src/lib/memberLanguages.ts`, and D-15 for the question of
  whether R3's "EN/ES" was meant to hide it.
*/
const languages = MEMBER_LANGUAGES;

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
          .update({ preferred_language: memberLanguage(langCode) })
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
