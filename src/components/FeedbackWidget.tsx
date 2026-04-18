import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback, FeedbackCategory } from "@/hooks/useFeedback";
import { cn } from "@/lib/utils";
import { X, MessageSquare, Send, Clock, Ban } from "lucide-react";

export function FeedbackWidget() {
  const { t } = useTranslation();
  const {
    submitFeedback,
    dismissFeedback,
    dismissFeedbackPermanently,
    shouldShowFeedback,
    isSubmitting,
  } = useFeedback();

  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("service");
  const [submitted, setSubmitted] = useState(false);

  // Check if the widget should show on mount
  useEffect(() => {
    // Small delay to avoid showing immediately on page load
    const timer = setTimeout(() => {
      if (shouldShowFeedback()) {
        setIsVisible(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [shouldShowFeedback]);

  if (!isVisible || submitted) return null;

  const handleSubmit = async () => {
    if (selectedRating === null) return;

    const success = await submitFeedback({
      rating: selectedRating,
      comment: comment.trim() || undefined,
      category,
    });

    if (success) {
      setSubmitted(true);
      // Auto-hide after showing thank you
      setTimeout(() => setIsVisible(false), 3000);
    }
  };

  const handleRemindLater = () => {
    dismissFeedback();
    setIsVisible(false);
  };

  const handleDontAskAgain = () => {
    dismissFeedbackPermanently();
    setIsVisible(false);
  };

  const getSelectedRatingColor = (score: number): string => {
    if (score <= 6) return "ring-red-500 bg-red-500 text-white";
    if (score <= 8) return "ring-yellow-500 bg-yellow-500 text-white";
    return "ring-green-500 bg-green-500 text-white";
  };

  // Minimized view: just a small prompt
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 left-6 z-40 animate-in slide-in-from-bottom-4 duration-500">
        <Card className="shadow-lg border-primary/20 max-w-[280px]">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {t(
                    "feedback.quickPrompt",
                    "How's your experience with ICE Alarm?"
                  )}
                </p>
                <div className="flex gap-1.5 mt-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => setIsMinimized(false)}
                  >
                    {t("feedback.giveFeedback", "Give Feedback")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleRemindLater}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {t("feedback.later", "Later")}
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDontAskAgain}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label={t("feedback.close", "Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Expanded view: full NPS widget
  return (
    <div className="fixed bottom-6 left-6 z-40 animate-in slide-in-from-bottom-4 duration-500">
      <Card className="shadow-xl border-primary/20 w-[340px] max-w-[calc(100vw-48px)]">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {t("feedback.title", "Share Your Feedback")}
            </h3>
            <button
              onClick={() => setIsMinimized(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("feedback.minimize", "Minimize")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* NPS Question */}
          <p className="text-sm text-muted-foreground mb-3">
            {t(
              "feedback.npsQuestion",
              "How likely are you to recommend ICE Alarm to a friend or colleague?"
            )}
          </p>

          {/* NPS Score Buttons (0-10) */}
          <div className="flex gap-1 mb-1">
            {Array.from({ length: 11 }, (_, i) => i).map((score) => (
              <button
                key={score}
                onClick={() => setSelectedRating(score)}
                className={cn(
                  "h-8 w-full rounded text-xs font-medium transition-all",
                  selectedRating === score
                    ? `ring-2 ring-offset-1 ${getSelectedRatingColor(score)}`
                    : `bg-muted hover:opacity-80 text-muted-foreground ${
                        selectedRating === null
                          ? ""
                          : "opacity-50"
                      }`
                )}
              >
                {score}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-4">
            <span>{t("feedback.notLikely", "Not likely")}</span>
            <span>{t("feedback.veryLikely", "Very likely")}</span>
          </div>

          {/* Category selector */}
          {selectedRating !== null && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(
                  [
                    { value: "service", label: t("feedback.catService", "Service") },
                    { value: "app", label: t("feedback.catApp", "App") },
                    { value: "support", label: t("feedback.catSupport", "Support") },
                    { value: "other", label: t("feedback.catOther", "Other") },
                  ] as { value: FeedbackCategory; label: string }[]
                ).map((cat) => (
                  <Button
                    key={cat.value}
                    size="sm"
                    variant={category === cat.value ? "default" : "outline"}
                    className="h-6 text-xs rounded-full"
                    onClick={() => setCategory(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Optional Comment */}
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t(
                  "feedback.commentPlaceholder",
                  "Any additional comments? (optional)"
                )}
                className="text-sm resize-none mb-3"
                rows={2}
              />
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleRemindLater}
              >
                <Clock className="h-3 w-3 mr-1" />
                {t("feedback.remindLater", "Remind Later")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleDontAskAgain}
              >
                <Ban className="h-3 w-3 mr-1" />
                {t("feedback.dontAsk", "Don't Ask")}
              </Button>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={selectedRating === null || isSubmitting}
              onClick={handleSubmit}
            >
              <Send className="h-3 w-3 mr-1" />
              {isSubmitting
                ? t("feedback.submitting", "Sending...")
                : t("feedback.submit", "Submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
