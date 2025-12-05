import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Zap, Target, FlaskConical, Compass, Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WelcomeWizardProps {
  userId: string;
  onComplete: () => void;
}

const STEPS = [
  {
    icon: Brain,
    title: "You're Drowning in Information",
    description: "Sound familiar?",
    content: "YouTube videos saved for later. Notes scattered everywhere. Apps promising to organize your life. Yet you still feel stuck, overwhelmed by options, and unsure what to actually do next.",
    type: "info" as const,
  },
  {
    icon: Zap,
    title: "One Action at a Time",
    description: "The Weave difference",
    content: "Weave doesn't give you more to manage. It takes everything you're learning, thinking, and becoming, then returns one clear action. No lists. No paralysis. Just the next right step.",
    type: "info" as const,
  },
  {
    icon: Target,
    title: "Who Are You Becoming?",
    description: "Define your identity shift",
    content: "This is the compass that guides everything. Not goals, not tasks, but the person you're actively becoming. Weave uses this to filter noise and surface what actually matters.",
    type: "identity" as const,
    prompts: [
      "I am becoming someone who...",
      "My future self would...",
      "The identity I'm stepping into is...",
    ],
    placeholder: `Example: "I am becoming someone who builds things instead of just consuming. Someone who takes action on ideas within 24 hours. Someone who values depth over breadth and consistency over intensity."`,
  },
  {
    icon: Compass,
    title: "Where Are You Now?",
    description: "Your current reality",
    content: "Be honest. What's blocking you? What constraints are you working within? This context helps Weave give you actions that actually fit your life.",
    type: "reality" as const,
    prompts: [
      "My biggest constraint right now is...",
      "I'm currently dealing with...",
      "The gap between where I am and where I want to be is...",
    ],
    placeholder: `Example: "I have a full-time job that drains my creative energy. I'm rebuilding financially after a setback. I have 2-3 hours in the morning before work where I can focus on what matters."`,
  },
  {
    icon: FlaskConical,
    title: "Test, Don't Plan",
    description: "Run experiments, not resolutions",
    content: "Weave helps you run 3-7 day experiments that prove your identity shift. Small bets. Real feedback. No more planning without doing.",
    type: "info" as const,
  },
  {
    icon: Sparkles,
    title: "Ready to Begin",
    description: "Your system is configured",
    content: "Weave will now surface your first action. Complete it, and the next one appears. Three actions per day maximum. Simple, focused, aligned with who you're becoming.",
    type: "final" as const,
  },
];

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [identitySeed, setIdentitySeed] = useState("");
  const [currentReality, setCurrentReality] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      checkIfFirstTime();
    }
  }, [userId]);

  const checkIfFirstTime = async () => {
    // Get fresh auth state from server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("No authenticated user - skipping wizard check");
      return;
    }

    // Always use fresh user ID from auth, not stale prop
    const currentUserId = user.id;

    const [identityRes, tasksRes, topicsRes, experimentsRes] = await Promise.all([
      supabase.from("identity_seeds").select("id").eq("user_id", currentUserId).maybeSingle(),
      supabase.from("daily_tasks").select("id").eq("user_id", currentUserId).limit(1).maybeSingle(),
      supabase.from("topics").select("id").eq("user_id", currentUserId).limit(1).maybeSingle(),
      supabase.from("experiments").select("id").eq("user_id", currentUserId).limit(1).maybeSingle(),
    ]);

    const hasAnyData = identityRes.data || tasksRes.data || topicsRes.data || experimentsRes.data;
    
    if (!hasAnyData) {
      setOpen(true);
    }
  };

  const saveIdentitySeed = async () => {
    if (!identitySeed.trim()) return true; // Skip if empty
    
    setSaving(true);
    try {
      const { error } = await supabase.from("identity_seeds").insert({
        user_id: userId,
        content: identitySeed.trim(),
      });
      
      if (error) throw error;
      return true;
    } catch (error: any) {
      toast.error("Failed to save identity seed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateCurrentReality = async () => {
    if (!currentReality.trim()) return true;
    
    setSaving(true);
    try {
      // Update the identity seed we just created with current reality context
      const { error } = await supabase
        .from("identity_seeds")
        .update({ 
          weekly_focus: currentReality.trim(),
          current_phase: "starting"
        })
        .eq("user_id", userId);
      
      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error("Failed to update current reality:", error);
      return true; // Don't block wizard
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const step = STEPS[currentStep];
    
    // Save identity seed when leaving step 3
    if (step.type === "identity" && identitySeed.trim()) {
      const success = await saveIdentitySeed();
      if (!success) return;
    }
    
    // Save current reality when leaving step 4
    if (step.type === "reality" && currentReality.trim()) {
      await updateCurrentReality();
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(`welcome_seen_${userId}`, "true");
    setOpen(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem(`welcome_seen_${userId}`, "true");
    setOpen(false);
    onComplete();
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === STEPS.length - 1;
  const isInteractiveStep = step.type === "identity" || step.type === "reality";

  const canProceed = () => {
    if (step.type === "identity") return identitySeed.trim().length > 20;
    if (step.type === "reality") return true; // Optional
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-lg">
        <div className="flex flex-col items-center text-center space-y-6 py-4">
          {/* Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-7 w-7 text-primary" />
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">{step.title}</h2>
            <p className="text-sm font-medium text-primary">{step.description}</p>
            <p className="text-sm leading-relaxed text-muted-foreground px-2">
              {step.content}
            </p>
          </div>

          {/* Interactive input for identity/reality steps */}
          {step.type === "identity" && (
            <div className="w-full space-y-3 text-left">
              <div className="flex flex-wrap gap-2">
                {step.prompts?.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setIdentitySeed(prompt + " ")}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Textarea
                value={identitySeed}
                onChange={(e) => setIdentitySeed(e.target.value)}
                placeholder={step.placeholder}
                className="min-h-[120px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {identitySeed.length < 20 
                  ? `Write at least ${20 - identitySeed.length} more characters` 
                  : <span className="text-primary flex items-center gap-1"><Check className="h-3 w-3" /> Looking good</span>
                }
              </p>
            </div>
          )}

          {step.type === "reality" && (
            <div className="w-full space-y-3 text-left">
              <div className="flex flex-wrap gap-2">
                {step.prompts?.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentReality(prompt + " ")}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Textarea
                value={currentReality}
                onChange={(e) => setCurrentReality(e.target.value)}
                placeholder={step.placeholder}
                className="min-h-[120px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Optional but helps Weave understand your constraints
              </p>
            </div>
          )}

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep 
                    ? "bg-primary w-6" 
                    : index < currentStep 
                      ? "bg-primary/50 w-2" 
                      : "bg-muted w-2"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between w-full gap-3">
            {currentStep > 0 ? (
              <Button variant="ghost" onClick={handleBack} className="gap-2" disabled={saving}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleSkip}>
                Skip
              </Button>
            )}
            <Button 
              onClick={handleNext} 
              className="gap-2" 
              disabled={!canProceed() || saving}
            >
              {saving ? "Saving..." : isLastStep ? "Start Using Weave" : "Continue"}
              {!isLastStep && !saving && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
