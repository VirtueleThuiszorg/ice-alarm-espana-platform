import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { UKFlag } from "@/components/flags/UKFlag";
import { SpainFlag } from "@/components/flags/SpainFlag";
import { cn } from "@/lib/utils";

interface LanguageSelectionModalProps {
  open: boolean;
  onLanguageSelect: (lang: string) => void;
}

export function LanguageSelectionModal({
  open,
  onLanguageSelect,
}: LanguageSelectionModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        className="max-w-md text-center p-8 sm:rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-semibold text-foreground">
            Choose Your Language
            <span className="block text-muted-foreground font-normal text-lg mt-1">
              Elija su idioma
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-8">
          {/* English Card */}
          <button
            onClick={() => onLanguageSelect("en")}
            className={cn(
              "flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-border",
              "bg-card hover:border-primary hover:bg-primary/5",
              "transition-all duration-200 ease-out",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              "group cursor-pointer"
            )}
          >
            <div className="w-20 h-14 rounded-md overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
              <UKFlag />
            </div>
            <span className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
              English
            </span>
          </button>

          {/* Spanish Card */}
          <button
            onClick={() => onLanguageSelect("es")}
            className={cn(
              "flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-border",
              "bg-card hover:border-primary hover:bg-primary/5",
              "transition-all duration-200 ease-out",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              "group cursor-pointer"
            )}
          >
            <div className="w-20 h-14 rounded-md overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
              <SpainFlag />
            </div>
            <span className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
              Español
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
