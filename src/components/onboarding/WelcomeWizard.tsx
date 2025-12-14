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

// Reduced to 4 focused steps - prove value fast
const STEPS = [
  {
    icon: Brain,
    title: "Drowning in Options?",
    description: "You're not broken. You're overloaded.",
    content: "Too many ideas. Too much advice. Too many tabs open. You don't need more information. You need someone who knows you to say: 'Do this next.'",
    type: "hook" as const,
  },
  {
    icon: Target,
    title: "Who Are You Becoming?",
    description: "This is the filter that cuts through noise",
    content: "Not goals. Not tasks. The person you're actively stepping into. Every action Weave suggests will push you toward this identity.",
    type: "identity" as const,
    prompts: [
      "I am becoming someone who...",
      "I'm stepping into being...",
      "The version of me I'm building is...",
    ],
    placeholder: `Be specific. Not "successful" but "someone who ships one thing every week." Not "healthy" but "someone who moves their body before looking at a screen."`,
    examples: [
      "I am becoming someone who builds in public instead of planning in private. Someone who values done over perfect.",
      "I'm stepping into being a creator who publishes weekly, not a consumer who saves for later.",
      "The version of me I'm building is disciplined but not rigid. Action-biased but not reckless.",
    ],
  },
  {
    icon: Zap,
    title: "Your First Action",
    description: "This is what Weave does",
    content: "",
    type: "demo" as const,
  },
  {
    icon: Sparkles,
    title: "That's It. You're In.",
    description: "Three actions per day. One identity to build.",
    content: "Save content as you learn. Weave connects it to your identity and turns it into actions. No more planning without doing.",
    type: "final" as const,
  },
];

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [identitySeed, setIdentitySeed] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingAction, setGeneratingAction] = useState(false);
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

  const saveIdentitySeed = async () => {
    if (!identitySeed.trim()) return false;
    
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

  const generateDemoAction = async () => {
    setGeneratingAction(true);
    try {
      // Get user's timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: { timezone, isOnboarding: true },
      });

      if (error) throw error;
      
      if (data?.action) {
        setDemoAction({
          action: data.action,
          why: data.why_it_matters || data.identity_thread || "This builds the identity you just defined.",
          time: data.time_required || "15-30 min",
        });
      }
    } catch (error) {
      console.error("Failed to generate demo action:", error);
      // Fallback action based on their identity seed
      setDemoAction({
        action: "Write down one thing you've been avoiding and do the smallest possible version of it right now.",
        why: "You just defined who you're becoming. This is your first rep.",
        time: "10-15 min",
      });
    } finally {
      setGeneratingAction(false);
    }
  };

  const handleNext = async () => {
    const step = STEPS[currentStep];
    
    if (step.type === "identity" && identitySeed.trim()) {
      const success = await saveIdentitySeed();
      if (!success) return;
      
      // Move to demo step and generate action
      setCurrentStep(currentStep + 1);
      generateDemoAction();
      return;
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
      if (currentStep === 2) {
        setDemoAction(null);
      }
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

  // Stricter validation - must be meaningful
  const canProceed = () => {
    if (step.type === "identity") {
      const trimmed = identitySeed.trim();
      // At least 50 chars and contains "I" or "someone" to ensure it's identity-focused
      return trimmed.length >= 50 && (
        trimmed.toLowerCase().includes("i am") ||
        trimmed.toLowerCase().includes("i'm") ||
        trimmed.toLowerCase().includes("someone who") ||
        trimmed.toLowerCase().includes("person who") ||
        trimmed.toLowerCase().includes("becoming")
      );
    }
    if (step.type === "demo") {
      return demoAction !== null;
    }
    return true;
  };

  const getIdentityFeedback = () => {
    const trimmed = identitySeed.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length < 30) return { text: "Keep going. Be specific about who you're becoming.", color: "text-muted-foreground" };
    if (trimmed.length < 50) return { text: "Good start. Add more detail about behaviors and values.", color: "text-muted-foreground" };
    
    const hasIdentityLanguage = 
      trimmed.toLowerCase().includes("i am") ||
      trimmed.toLowerCase().includes("i'm") ||
      trimmed.toLowerCase().includes("someone who") ||
      trimmed.toLowerCase().includes("person who") ||
      trimmed.toLowerCase().includes("becoming");
    
    if (!hasIdentityLanguage) {
      return { text: "Start with 'I am becoming someone who...' to frame as identity.", color: "text-muted-foreground" };
    }
    
    return { text: "This is a strong identity seed.", color: "text-primary" };
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

          {/* Identity Input */}
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
                className="min-h-[120px] text-sm"
              />
              
              {/* Feedback */}
              {getIdentityFeedback() && (
                <p className={`text-xs flex items-center gap-1 ${getIdentityFeedback()?.color}`}>
                  {canProceed() && <Check className="h-3 w-3" />}
                  {getIdentityFeedback()?.text}
                </p>
              )}
              
              {/* Example toggle */}
              <button
                onClick={() => setShowExample(!showExample)}
                className="text-xs text-primary hover:underline"
              >
                {showExample ? "Hide examples" : "Need inspiration? See examples"}
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
            </div>
          )}

          {/* Demo Action */}
          {step.type === "demo" && (
            <div className="w-full space-y-4">
              {generatingAction ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Generating your first action based on your identity...
                  </p>
                </div>
              ) : demoAction ? (
                <div className="space-y-4 text-left">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="font-medium text-foreground">{demoAction.action}</p>
                    <p className="text-xs text-muted-foreground mt-2">{demoAction.time}</p>
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    "{demoAction.why}"
                  </p>
                  <p className="text-xs text-primary">
                    This was generated from your identity seed in seconds. Imagine this happening every day, informed by everything you save and learn.
                  </p>
                </div>
              ) : null}
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
              <Button variant="ghost" onClick={handleBack} className="gap-2" disabled={saving || generatingAction}>
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
              disabled={!canProceed() || saving || generatingAction}
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
