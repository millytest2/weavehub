import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Zap, Target, ArrowRight, ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WelcomeWizardProps {
  userId: string;
  onComplete: () => void;
}

// Value-first flow: show immediate action BEFORE asking for identity
const STEPS = [
  {
    icon: Brain,
    title: "You're Not Broken",
    description: "You're overloaded.",
    content: "Too many ideas. Too much advice. Too many open tabs. You don't need more information. You need clarity on what to do next.",
    type: "hook" as const,
  },
  {
    icon: Zap,
    title: "Here's Your First Move",
    description: "No setup required. Just one action.",
    content: "",
    type: "demo" as const,
  },
  {
    icon: Target,
    title: "Want Better Recommendations?",
    description: "Tell Weave who you're becoming",
    content: "The more Weave knows about where you're headed, the sharper the actions become. This is optional but powerful.",
    type: "identity" as const,
    prompts: [
      "I am becoming someone who...",
      "I'm working toward being...",
      "The person I'm building is...",
    ],
    placeholder: `Be specific. Not "successful" but "someone who ships weekly." Not "healthy" but "someone who moves before screens."`,
    examples: [
      "I am becoming someone who builds in public instead of planning in private.",
      "I'm working toward being a creator who publishes weekly, not a consumer who saves for later.",
      "The person I'm building is disciplined but not rigid. Action-biased but not reckless.",
    ],
  },
  {
    icon: Sparkles,
    title: "You're In",
    description: "One action at a time. That's it.",
    content: "When you're bored, lost, or overthinking - come back here. Weave will always have your next move ready.",
    type: "final" as const,
  },
];

// Universal starter actions that work for anyone
const UNIVERSAL_ACTIONS = [
  {
    action: "Write down the one thing you've been avoiding. Then do the smallest possible version of it right now.",
    why: "Avoidance creates mental weight. The smallest step breaks the loop.",
    time: "10-15 min",
  },
  {
    action: "Stand up, take 10 deep breaths, then write down what's actually on your mind without filtering.",
    why: "Clarity comes from getting thoughts out of your head and onto paper.",
    time: "5-10 min",
  },
  {
    action: "Message one person you've been meaning to reach out to. Keep it simple: 'Hey, thinking of you.'",
    why: "Connection breaks isolation. Small gestures compound.",
    time: "2-5 min",
  },
  {
    action: "Close all tabs. Open one blank document. Write the single most important thing you need to do today.",
    why: "Overwhelm comes from too many options. Focus on one.",
    time: "5-10 min",
  },
  {
    action: "Go outside for 5 minutes. No phone. Just notice what you see, hear, and feel.",
    why: "Presence resets the nervous system. Fresh air changes perspective.",
    time: "5-10 min",
  },
];

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [identitySeed, setIdentitySeed] = useState("");
  const [saving, setSaving] = useState(false);
  const [demoAction, setDemoAction] = useState<{ action: string; why: string; time: string } | null>(null);
  const [showExample, setShowExample] = useState(false);

  useEffect(() => {
    if (userId) {
      checkIfFirstTime();
    }
  }, [userId]);

  const checkIfFirstTime = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

  // Show immediate value with universal action
  const showDemoAction = () => {
    const randomAction = UNIVERSAL_ACTIONS[Math.floor(Math.random() * UNIVERSAL_ACTIONS.length)];
    setDemoAction(randomAction);
  };

  const saveIdentitySeed = async () => {
    if (!identitySeed.trim()) return true; // Allow skipping
    
    setSaving(true);
    try {
      const { error } = await supabase.from("identity_seeds").insert({
        user_id: userId,
        content: identitySeed.trim(),
      });
      
      if (error) throw error;
      return true;
    } catch (error: any) {
      toast.error("Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const step = STEPS[currentStep];
    
    // Moving to demo step - show action immediately
    if (step.type === "hook") {
      setCurrentStep(currentStep + 1);
      showDemoAction();
      return;
    }
    
    if (step.type === "identity" && identitySeed.trim()) {
      const success = await saveIdentitySeed();
      if (!success) return;
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

  const canProceed = () => {
    if (step.type === "demo") {
      return demoAction !== null;
    }
    // Identity is optional - can always proceed
    return true;
  };

  const getIdentityFeedback = () => {
    const trimmed = identitySeed.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length < 20) return { text: "Keep going...", color: "text-muted-foreground" };
    if (trimmed.length < 40) return { text: "Good start. Add more detail.", color: "text-muted-foreground" };
    return { text: "This will sharpen your recommendations.", color: "text-primary" };
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="sr-only">{step.title}</DialogTitle>
        <DialogDescription className="sr-only">{step.description}</DialogDescription>
        
        <div className="flex flex-col items-center text-center space-y-6 py-4">
          {/* Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-7 w-7 text-primary" />
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">{step.title}</h2>
            <p className="text-sm font-medium text-primary">{step.description}</p>
            {step.content && (
              <p className="text-sm leading-relaxed text-muted-foreground px-2">
                {step.content}
              </p>
            )}
          </div>

          {/* Demo Action - Show value FIRST */}
          {step.type === "demo" && demoAction && (
            <div className="w-full space-y-4 text-left">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="font-medium text-foreground leading-relaxed">{demoAction.action}</p>
                <p className="text-xs text-muted-foreground mt-2">{demoAction.time}</p>
              </div>
              <p className="text-sm text-muted-foreground italic">
                "{demoAction.why}"
              </p>
              <p className="text-xs text-primary">
                This is what Weave does. One clear action when you need it.
              </p>
            </div>
          )}

          {/* Identity Input - AFTER showing value */}
          {step.type === "identity" && (
            <div className="w-full space-y-4 text-left">
              {/* Quick prompts */}
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
                className="min-h-[100px] text-sm"
              />
              
              {/* Feedback */}
              {getIdentityFeedback() && (
                <p className={`text-xs flex items-center gap-1 ${getIdentityFeedback()?.color}`}>
                  {identitySeed.length >= 40 && <Check className="h-3 w-3" />}
                  {getIdentityFeedback()?.text}
                </p>
              )}
              
              {/* Example toggle */}
              <button
                onClick={() => setShowExample(!showExample)}
                className="text-xs text-primary hover:underline"
              >
                {showExample ? "Hide examples" : "See examples"}
              </button>
              
              {showExample && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  {step.examples?.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setIdentitySeed(ex)}
                      className="block w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors p-2 rounded hover:bg-background"
                    >
                      "{ex}"
                    </button>
                  ))}
                </div>
              )}
              
              <p className="text-xs text-muted-foreground text-center">
                You can skip this and add it later.
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
              {saving ? "Saving..." : isLastStep ? "Start" : step.type === "identity" && !identitySeed.trim() ? "Skip for Now" : "Continue"}
              {!isLastStep && !saving && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
