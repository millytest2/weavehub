import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sunrise, X, Sparkles } from "lucide-react";

interface MorningRitualPromptProps {
  onComplete: () => void;
}

interface RitualContent {
  greeting: string;
  anchor: string;
  fuel: string;
}

// Generate grounding ritual based on identity context
async function generateMorningRitual(context: {
  identity?: string;
  values?: string;
  weeklyFocus?: string;
  yearNote?: string;
  dayOfWeek: number;
  hour: number;
}): Promise<RitualContent> {
  const { identity, values, weeklyFocus, yearNote, dayOfWeek, hour } = context;
  
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[dayOfWeek];
  
  // Parse values into array
  const valueList = values?.split(',').map(v => v.trim()).filter(Boolean) || [];
  const primaryValue = valueList[0] || "growth";
  const randomValue = valueList.length > 0 
    ? valueList[Math.floor(Math.random() * valueList.length)] 
    : "alignment";
  
  // Extract identity essence
  const getIdentityEssence = (text?: string): string => {
    if (!text) return "who you're becoming";
    const patterns = [
      /I am becoming ([^.]+)/i,
      /I am someone who ([^.]+)/i,
      /someone who ([^.]+)/i,
      /becoming ([^.]+)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].toLowerCase().trim();
    }
    // Just get first meaningful phrase
    const firstPart = text.split('.')[0];
    return firstPart.length > 80 ? firstPart.substring(0, 80) + "..." : firstPart;
  };
  
  const identityEssence = getIdentityEssence(identity);
  
  // Contextual greetings based on day
  const greetings: Record<number, string[]> = {
    0: [`Sunday morning.`, `A day to reset.`, `Rest and realign.`],
    1: [`Fresh week ahead.`, `Monday. New beginning.`, `The week starts now.`],
    2: [`Tuesday. Build momentum.`, `Keep the thread going.`, `Day 2. Stay aligned.`],
    3: [`Midweek check-in.`, `Wednesday. Halfway there.`, `Stay grounded.`],
    4: [`Thursday. Push forward.`, `Almost there.`, `Finish strong.`],
    5: [`Friday energy.`, `End the week proud.`, `One more day of reps.`],
    6: [`Saturday.`, `Breathe and move.`, `Weekend mode.`],
  };
  
  const greeting = greetings[dayOfWeek][Math.floor(Math.random() * greetings[dayOfWeek].length)];
  
  // Anchor: ground in identity/values
  const anchors = [
    `You are ${identityEssence}. That's who shows up today.`,
    `"${randomValue}" isn't just a word—it's how you move through today.`,
    `Remember: identity is built through action, not intention.`,
    `Today isn't about being perfect. It's about being aligned.`,
    `The person you're becoming takes action even when it's hard.`,
    `${primaryValue} guides your choices. Trust it.`,
    `Your values aren't ideas. They're actions you choose today.`,
    `What would ${identityEssence} do right now?`,
  ];
  
  // Weight anchors based on what context we have
  let anchor: string;
  if (identity && values) {
    anchor = anchors[Math.floor(Math.random() * anchors.length)];
  } else if (values) {
    anchor = `"${randomValue}" guides today. Move from that place.`;
  } else if (identity) {
    anchor = `You're becoming ${identityEssence}. One action at a time.`;
  } else {
    anchor = "Today is one step toward who you're becoming.";
  }
  
  // Fuel: energy for the day ahead
  const weekdayFuels = [
    "Start with one thing. The rest will follow.",
    "You don't need to do everything. Just the next right thing.",
    "Action builds clarity. Start moving.",
    "The work you do today compounds.",
    "Show up. That's the whole game.",
    "Small reps, stacked daily. That's how you change.",
  ];
  
  const weekendFuels = [
    "Rest is productive. Let yourself recharge.",
    "Today, choose what restores you.",
    "The week ahead needs you recharged.",
    "Breathe. Move. Connect. That's enough.",
  ];
  
  const fuels = (dayOfWeek === 0 || dayOfWeek === 6) ? weekendFuels : weekdayFuels;
  const fuel = fuels[Math.floor(Math.random() * fuels.length)];
  
  return { greeting, anchor, fuel };
}

export function MorningRitualPrompt({ onComplete }: MorningRitualPromptProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ritual, setRitual] = useState<RitualContent | null>(null);
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

    const now = new Date();
    const hour = now.getHours();
    const isMorning = hour >= 5 && hour < 11;
    const seenToday = lastRitual === today;

    if (!isMorning || seenToday) {
      setLoading(false);
      onComplete();
      return;
    }

    try {
      const { data: identityData } = await supabase
        .from("identity_seeds")
        .select("content, core_values, weekly_focus, year_note")
        .eq("user_id", user.id)
        .maybeSingle();

      if (identityData?.content || identityData?.core_values) {
        const ritualContent = await generateMorningRitual({
          identity: identityData.content,
          values: identityData.core_values,
          weeklyFocus: identityData.weekly_focus,
          yearNote: identityData.year_note,
          dayOfWeek: now.getDay(),
          hour,
        });
        
        setRitual(ritualContent);
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

  if (loading || !open || !ritual) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-0 overflow-hidden border-0 bg-card shadow-elevated rounded-2xl">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sunrise className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Morning Ritual
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSkip}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-lg font-display font-semibold leading-snug">
              {ritual.greeting}
            </DialogTitle>
            <DialogDescription className="sr-only">Morning grounding ritual</DialogDescription>
          </DialogHeader>
          
          {/* Anchor - the grounding message */}
          <div className="py-3 px-4 rounded-xl bg-muted/50 border border-border/50">
            <p className="text-sm leading-relaxed text-foreground">
              {ritual.anchor}
            </p>
          </div>
          
          {/* Fuel - energy for the day */}
          <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            {ritual.fuel}
          </p>

          <div className="flex gap-3 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-10 text-sm"
              onClick={handleSkip}
            >
              Skip
            </Button>
            <Button
              size="sm"
              className="flex-1 h-10 text-sm"
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
