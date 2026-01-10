import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sunrise, X, Lightbulb, Heart } from "lucide-react";

interface MorningRitualPromptProps {
  onComplete: () => void;
}

// Dynamic morning prompts based on context (no experiments)
function generateDynamicPrompt(context: {
  identity?: string;
  values?: string;
  weeklyFocus?: string;
  streak?: number;
  dayOfWeek: number;
}): { prompt: string; subtext?: string } {
  const { identity, values, weeklyFocus, streak, dayOfWeek } = context;
  
  // Monday = fresh start energy
  if (dayOfWeek === 1) {
    if (weeklyFocus) {
      return { 
        prompt: `This week: ${weeklyFocus}. What's your first move?`,
        subtext: "Monday sets the tone."
      };
    }
    return { prompt: "New week. What would the person you're becoming tackle first?" };
  }
  
  // Friday = reflection + push energy
  if (dayOfWeek === 5) {
    return { 
      prompt: "What would make you proud by end of day?",
      subtext: "Finish the week strong."
    };
  }
  
  // Weekend = different energy - simpler prompt, don't use weeklyFocus (could be long)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (values) {
      const valueList = values.split(',').map(v => v.trim());
      const randomValue = valueList[Math.floor(Math.random() * valueList.length)];
      return { prompt: `Weekend: How does "${randomValue}" show up today?` };
    }
    return { prompt: "What would feel like a win today?" };
  }
  
  // Weekly focus = orient around it
  if (weeklyFocus) {
    return { 
      prompt: `"${weeklyFocus}" — What action proves it today?`,
      subtext: "Your focus shapes your reality."
    };
  }
  
  // Values-based prompt
  if (values) {
    const valueList = values.split(',').map(v => v.trim());
    const randomValue = valueList[Math.floor(Math.random() * valueList.length)];
    return { 
      prompt: `${randomValue} in action. What does that look like today?`,
      subtext: "Values aren't ideas. They're actions."
    };
  }
  
  // Identity-based fallback
  if (identity) {
    const patterns = [/becoming[^.]+/i, /someone who[^.]+/i, /I am[^.]+/i];
    for (const pattern of patterns) {
      const match = identity.match(pattern);
      if (match) {
        return { 
          prompt: `You're ${match[0].toLowerCase()}. What's one proof point today?`,
          subtext: "Identity is built through reps."
        };
      }
    }
  }
  
  // Streak-based motivation
  if (streak && streak > 2) {
    return { 
      prompt: `${streak} days of momentum. Keep the thread going.`,
      subtext: "What's today's action?"
    };
  }
  
  // Generic but still good fallbacks
  const fallbacks = [
    { prompt: "What would the person you're becoming do first today?" },
    { prompt: "One small action today that proves you're changing." },
    { prompt: "Today's edge: where will you stretch just a little?" },
    { prompt: "What would feel like a win by tonight?" },
  ];
  
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

export function MorningRitualPrompt({ onComplete }: MorningRitualPromptProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [identitySeed, setIdentitySeed] = useState<string | null>(null);
  const [coreValues, setCoreValues] = useState<string | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<string | null>(null);
  const [dynamicPrompt, setDynamicPrompt] = useState<{ prompt: string; subtext?: string }>({ prompt: "" });
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
      // Get identity and insights only (no experiments)
      const [identityRes, insightRes] = await Promise.all([
        supabase
          .from("identity_seeds")
          .select("content, core_values, weekly_focus, year_note")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("insights")
          .select("content, title")
          .eq("user_id", user.id)
          .order("relevance_score", { ascending: false })
          .limit(10)
      ]);

      if (identityRes.data?.content) {
        setIdentitySeed(identityRes.data.content);
        setCoreValues(identityRes.data.core_values);
        setWeeklyFocus(identityRes.data.weekly_focus);
        
        // Generate dynamic prompt based on identity context (no experiments)
        const dayOfWeek = new Date().getDay();
        const prompt = generateDynamicPrompt({
          identity: identityRes.data.content,
          values: identityRes.data.core_values,
          weeklyFocus: identityRes.data.weekly_focus,
          dayOfWeek,
        });
        setDynamicPrompt(prompt);
        
        // Pick a random recent insight if available
        if (insightRes.data && insightRes.data.length > 0) {
          const randomInsight = insightRes.data[Math.floor(Math.random() * insightRes.data.length)];
          const content = randomInsight.title || randomInsight.content;
          const firstSentence = content.split('.')[0];
          setRecentInsight(firstSentence.length > 120 ? firstSentence.substring(0, 117) + "..." : firstSentence);
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
    const patterns = [/I am becoming[^.]+/i, /I am someone who[^.]+/i, /someone who[^.]+/i];
    for (const pattern of patterns) {
      const match = identitySeed.match(pattern);
      if (match) return match[0];
    }
    return identitySeed.split('.')[0];
  };

  const identityPhrase = getIdentityPhrase();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-xs p-0 overflow-hidden border-0 bg-card shadow-lg">
        <div className="p-3 space-y-2">
          {/* Header - minimal */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sunrise className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Morning</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-1"
              onClick={handleSkip}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm font-semibold leading-tight text-left">
              {dynamicPrompt.prompt}
            </DialogTitle>
            <DialogDescription className="sr-only">Morning focus</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-[11px] h-7"
              onClick={handleSkip}
            >
              Skip
            </Button>
            <Button
              size="sm"
              className="flex-1 text-[11px] h-7"
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
