import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sunrise, X, Sparkles } from "lucide-react";

interface MorningRitualPromptProps {
  onComplete: () => void;
}

// Daily focus prompts that rotate
const DAILY_FOCUSES = [
  "What would the person you're becoming do first today?",
  "One small action today that proves you're changing.",
  "Today's edge: where will you stretch just a little?",
  "What conversation with yourself ends today?",
  "Today, prove it to yourself through action.",
  "What would feel like a win by tonight?",
  "Where does today's energy want to go?",
];

export function MorningRitualPrompt({ onComplete }: MorningRitualPromptProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [identitySeed, setIdentitySeed] = useState<string | null>(null);
  const [coreValues, setCoreValues] = useState<string | null>(null);
  const [dailyFocus, setDailyFocus] = useState<string>("");
  const [recentInsight, setRecentInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkIfShouldShow();
  }, [user]);

  const checkIfShouldShow = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const lastRitualKey = `weave_morning_ritual_${user.id}`;
    const lastRitual = localStorage.getItem(lastRitualKey);

    const hour = new Date().getHours();
    const isMorning = hour >= 5 && hour < 11;
    const seenToday = lastRitual === today;

    if (!isMorning || seenToday) {
      setLoading(false);
      onComplete();
      return;
    }

    try {
      // Get identity and a recent insight in parallel
      const [identityRes, insightRes] = await Promise.all([
        supabase
          .from("identity_seeds")
          .select("content, core_values")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("insights")
          .select("content")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

      if (identityRes.data?.content) {
        setIdentitySeed(identityRes.data.content);
        setCoreValues(identityRes.data.core_values);
        
        // Pick daily focus based on day of year for variety
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        setDailyFocus(DAILY_FOCUSES[dayOfYear % DAILY_FOCUSES.length]);
        
        // Pick a random recent insight if available
        if (insightRes.data && insightRes.data.length > 0) {
          const randomInsight = insightRes.data[Math.floor(Math.random() * insightRes.data.length)];
          const content = randomInsight.content;
          // Extract first sentence or truncate
          const firstSentence = content.split('.')[0];
          if (firstSentence.length > 120) {
            setRecentInsight(firstSentence.substring(0, 117) + "...");
          } else {
            setRecentInsight(firstSentence);
          }
        }
        
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
      const key = `weave_morning_ritual_${user.id}`;
      localStorage.setItem(key, today);
    }
    setOpen(false);
    onComplete();
  };

  const handleSkip = () => {
    setOpen(false);
    onComplete();
  };

  if (loading || !open) return null;

  // Extract key identity phrase - more dynamic extraction
  const getIdentityPhrase = () => {
    if (!identitySeed) return "";
    // Try to find "I am becoming" or similar patterns
    const patterns = [/I am becoming[^.]+/i, /I am someone who[^.]+/i, /someone who[^.]+/i];
    for (const pattern of patterns) {
      const match = identitySeed.match(pattern);
      if (match) return match[0];
    }
    // Fallback to first sentence
    return identitySeed.split('.')[0];
  };

  const identityPhrase = getIdentityPhrase();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0 bg-gradient-to-b from-card to-background shadow-xl">
        <div className="p-6 space-y-5">
          <DialogHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sunrise className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Morning</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-2 -mt-2 hover:bg-muted/50"
                onClick={handleSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight text-left pt-2">
              {dailyFocus}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Your morning grounding ritual
            </DialogDescription>
          </DialogHeader>

          {/* Identity - sleek inline display */}
          <div className="space-y-3">
            <p className="text-base text-foreground/80 leading-relaxed italic">
              "{identityPhrase}"
            </p>

            {/* Core values - subtle pills */}
            {coreValues && (
              <div className="flex flex-wrap gap-1.5">
                {coreValues.split(',').slice(0, 4).map((value, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-muted/50 text-muted-foreground"
                  >
                    {value.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recent insight spark */}
          {recentInsight && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground/70 leading-relaxed">
                {recentInsight}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground hover:text-foreground"
              onClick={handleSkip}
            >
              Not now
            </Button>
            <Button
              className="flex-1"
              onClick={handleDismiss}
            >
              Let's go
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
