import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sunrise, X } from "lucide-react";

interface MorningRitualPromptProps {
  onComplete: () => void;
}

export function MorningRitualPrompt({ onComplete }: MorningRitualPromptProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [identitySeed, setIdentitySeed] = useState<string | null>(null);
  const [coreValues, setCoreValues] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkIfShouldShow();
  }, [user]);

  const checkIfShouldShow = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if user has seen morning ritual today
    const today = new Date().toISOString().split('T')[0];
    const lastRitualKey = `weave_morning_ritual_${user.id}`;
    const lastRitual = localStorage.getItem(lastRitualKey);

    // Only show in morning hours (5am - 11am) and if not seen today
    const hour = new Date().getHours();
    const isMorning = hour >= 5 && hour < 11;
    const seenToday = lastRitual === today;

    if (!isMorning || seenToday) {
      setLoading(false);
      onComplete();
      return;
    }

    // Check if user has identity seed (only show to users who have set up)
    try {
      const { data: identity } = await supabase
        .from("identity_seeds")
        .select("content, core_values")
        .eq("user_id", user.id)
        .maybeSingle();

      if (identity?.content) {
        setIdentitySeed(identity.content);
        setCoreValues(identity.core_values);
        setOpen(true);
      } else {
        onComplete();
      }
    } catch (error) {
      console.error("Error checking identity:", error);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`weave_morning_ritual_${user.id}`, today);
    }
    setOpen(false);
    onComplete();
  };

  const handleSkip = () => {
    // Skip without marking as complete (will show again tomorrow morning)
    setOpen(false);
    onComplete();
  };

  if (loading || !open) return null;

  // Extract first sentence or key phrase from identity seed
  const identityPreview = identitySeed?.split('.')[0] || identitySeed?.substring(0, 100);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/40">
        <div className="p-6 space-y-4">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Sunrise className="h-5 w-5" />
                <span className="text-sm font-medium">Morning</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-2 -mt-2"
                onClick={handleSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogTitle className="text-xl font-semibold text-left">
              Remember who you're becoming
            </DialogTitle>
            <DialogDescription className="sr-only">
              Your morning grounding ritual to start the day aligned with your identity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Identity reminder */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/20">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {identityPreview}...
              </p>
            </div>

            {/* Core values if set */}
            {coreValues && (
              <div className="flex flex-wrap gap-2">
                {coreValues.split(',').slice(0, 4).map((value, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary"
                  >
                    {value.trim()}
                  </span>
                ))}
              </div>
            )}

            {/* Simple grounding prompt */}
            <p className="text-sm text-muted-foreground">
              Take a breath. The person you're becoming shows up today through small actions.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
            >
              Skip today
            </Button>
            <Button
              className="flex-1"
              onClick={handleDismiss}
            >
              I'm ready
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
