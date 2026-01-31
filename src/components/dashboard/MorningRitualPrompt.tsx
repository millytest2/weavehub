import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

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
    `Identity is built through action, not intention.`,
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-0 overflow-hidden border border-border/50 bg-gradient-to-b from-card via-card to-muted/20 shadow-elevated rounded-3xl">
        {/* Subtle top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        
        <div className="p-6 space-y-5">
          {/* Header - minimal */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              Morning
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={handleSkip}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-2xl font-display font-semibold leading-tight tracking-tight">
              {ritual.greeting}
            </DialogTitle>
            <DialogDescription className="sr-only">Morning grounding ritual</DialogDescription>
          </DialogHeader>
          
          {/* Anchor - the grounding message */}
          <div className="py-4 px-5 rounded-2xl bg-muted/40 border border-border/30">
            <p className="text-base leading-relaxed text-foreground font-medium">
              {ritual.anchor}
            </p>
          </div>
          
          {/* Fuel - subtle */}
          <p className="text-sm text-muted-foreground leading-relaxed pl-1">
            {ritual.fuel}
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1 h-12 text-sm rounded-2xl text-muted-foreground"
              onClick={handleSkip}
            >
              Later
            </Button>
            <Button
              size="lg"
              className="flex-1 h-12 text-sm rounded-2xl font-medium"
              onClick={handleDismiss}
            >
              Begin
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
