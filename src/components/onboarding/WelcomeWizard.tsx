import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowRight, Check, Target, Layers, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface WelcomeWizardProps {
  userId: string;
  onComplete: () => void;
}

// Core values users can pick from
const CORE_VALUES = [
  "Growth", "Presence", "Focus", "Creation", "Connection",
  "Depth", "Action", "Freedom", "Clarity", "Courage",
  "Discipline", "Play", "Authenticity", "Impact"
] as const;

// Quick identity starters
const IDENTITY_STARTERS = [
  "ships weekly, not someday",
  "moves before screens",
  "builds in public",
  "chooses depth over distraction",
  "creates more than consumes",
];

// Benefit highlights for the value prop
const VALUE_PROPS = [
  { icon: Target, title: "One clear action", desc: "No more paralysis" },
  { icon: Layers, title: "Everything weaves", desc: "Your insights connect" },
  { icon: Zap, title: "2-minute reset", desc: "Break any drift" },
];

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0: value prop, 1: direction, 2: values, 3: done
  const [dreamReality, setDreamReality] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      checkIfFirstTime();
    }
  }, [userId]);

  const checkIfFirstTime = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!identityData) {
      setOpen(true);
    }
  };

  const toggleValue = (value: string) => {
    setSelectedValues(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), value]; // Replace oldest
      }
      return [...prev, value];
    });
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Save identity seed with core values and year note
      const identityContent = dreamReality.trim() 
        ? `Someone moving toward: ${dreamReality.trim()}`
        : "Someone who takes action daily.";
      
      const { error } = await supabase.from("identity_seeds").insert({
        user_id: userId,
        content: identityContent,
        core_values: selectedValues.join(", ") || null,
        year_note: dreamReality.trim() || null, // Store the 2026 vision
      });
      
      if (error) throw error;
      
      localStorage.setItem(`welcome_seen_${userId}`, "true");
      setOpen(false);
      onComplete();
      toast.success("Welcome to Weave");
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(`welcome_seen_${userId}`, "true");
    setOpen(false);
    onComplete();
  };

  const canProceed = () => {
    if (step === 0) return true; // Value prop - always can proceed
    if (step === 1) return true; // Direction is optional
    if (step === 2) return selectedValues.length > 0;
    return true;
  };

  const totalSteps = 4;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/50 rounded-3xl">
        <DialogTitle className="sr-only">Welcome to Weave</DialogTitle>
        <DialogDescription className="sr-only">Set up your direction</DialogDescription>
        
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div 
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Step 0: Value Prop - Why Weave */}
            {step === 0 && (
              <motion.div
                key="value-prop"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-semibold">Weave turns chaos into clarity</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Paste anything. Weave understands where you're going and gives you one aligned action at a time.
                  </p>
                </div>

                <div className="grid gap-3">
                  {VALUE_PROPS.map((prop, i) => (
                    <div 
                      key={i}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border/30"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <prop.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{prop.title}</p>
                        <p className="text-xs text-muted-foreground">{prop.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 1: Direction / 2026 Vision */}
            {step === 1 && (
              <motion.div
                key="direction"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-display font-semibold">Where are you headed?</h2>
                  <p className="text-sm text-muted-foreground">
                    One sentence about your direction. Weave aligns everything to this.
                  </p>
                </div>

                <div className="space-y-3">
                  <Textarea
                    value={dreamReality}
                    onChange={(e) => setDreamReality(e.target.value)}
                    placeholder="By end of 2026, I want to..."
                    className="min-h-[100px] text-base resize-none rounded-2xl border-2"
                    style={{ fontSize: '16px' }}
                  />
                  
                  {/* Quick starters */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Examples:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {IDENTITY_STARTERS.map((starter) => (
                        <button
                          key={starter}
                          onClick={() => setDreamReality(`Be someone who ${starter}`)}
                          className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Values */}
            {step === 2 && (
              <motion.div
                key="values"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-display font-semibold">Pick 3 values</h2>
                  <p className="text-sm text-muted-foreground">What guides your decisions?</p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  {CORE_VALUES.map((value) => {
                    const isSelected = selectedValues.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() => toggleValue(value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground scale-105'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                        {value}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  {selectedValues.length}/3 selected
                </p>
              </motion.div>
            )}

            {/* Step 3: Done */}
            {step === 3 && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-5 text-center py-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-xl font-display font-semibold">You're in</h2>
                  <p className="text-sm text-muted-foreground">
                    Paste anything. Weave turns it into your next move.
                  </p>
                </div>

                {dreamReality && (
                  <div className="p-4 rounded-2xl bg-muted/50 text-left space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your direction</p>
                    <p className="text-sm font-medium">{dreamReality}</p>
                  </div>
                )}

                {selectedValues.length > 0 && (
                  <div className="flex gap-2 justify-center flex-wrap">
                    {selectedValues.map(v => (
                      <span key={v} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium">
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving} className="rounded-xl">
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground rounded-xl">
                Skip
              </Button>
            )}
            
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} className="gap-2 rounded-xl" disabled={!canProceed()}>
                {step === 0 ? "Let's go" : step === 1 && !dreamReality.trim() ? "Skip" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={saving} className="gap-2 rounded-xl">
                {saving ? "Saving..." : "Start Weaving"}
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
