import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowRight, Check } from "lucide-react";
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

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1); // 1: identity, 2: values, 3: done
  const [identitySeed, setIdentitySeed] = useState("");
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
      // Save identity seed with core values
      const { error } = await supabase.from("identity_seeds").insert({
        user_id: userId,
        content: identitySeed.trim() || "Someone who takes action daily.",
        core_values: selectedValues.join(", ") || null,
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
    if (step === 1) return true; // Identity is optional
    if (step === 2) return selectedValues.length > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">Welcome to Weave</DialogTitle>
        <DialogDescription className="sr-only">Set up your identity</DialogDescription>
        
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div 
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Identity */}
            {step === 1 && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-bold">Who are you becoming?</h2>
                  <p className="text-sm text-muted-foreground">One sentence. This sharpens everything.</p>
                </div>

                <div className="space-y-3">
                  <Textarea
                    value={identitySeed}
                    onChange={(e) => setIdentitySeed(e.target.value)}
                    placeholder="I'm becoming someone who..."
                    className="min-h-[80px] text-base resize-none"
                    style={{ fontSize: '16px' }}
                  />
                  
                  {/* Quick starters */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Quick start:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {IDENTITY_STARTERS.map((starter) => (
                        <button
                          key={starter}
                          onClick={() => setIdentitySeed(`I'm becoming someone who ${starter}`)}
                          className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
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
                  <h2 className="text-xl font-bold">Pick 3 values</h2>
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
                className="space-y-4 text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">You're in</h2>
                  <p className="text-sm text-muted-foreground">
                    Paste anything. Weave turns it into your next move.
                  </p>
                </div>

                {identitySeed && (
                  <div className="p-3 rounded-lg bg-muted/50 text-left">
                    <p className="text-xs text-muted-foreground mb-1">Your identity:</p>
                    <p className="text-sm font-medium">{identitySeed}</p>
                  </div>
                )}

                {selectedValues.length > 0 && (
                  <div className="flex gap-2 justify-center">
                    {selectedValues.map(v => (
                      <span key={v} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
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
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
                Skip
              </Button>
            )}
            
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} className="gap-2" disabled={!canProceed()}>
                {step === 1 && !identitySeed.trim() ? "Skip" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={saving} className="gap-2">
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
