import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brain, Target, FlaskConical, Compass, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WelcomeWizardProps {
  userId: string;
  onComplete: () => void;
}

const STEPS = [
  {
    icon: Brain,
    title: "Welcome to Weave",
    description: "Your personal knowledge companion",
    content: "Weave isn't just another note-taking app. It's designed to help you think better, learn faster, and actually use what you capture.",
  },
  {
    icon: Target,
    title: "The Problem We Solve",
    description: "Why Weave vs. Notion or Obsidian?",
    content: "Unlike passive tools that just store information, Weave actively helps you connect ideas, run experiments, and build skills through guided daily actions. It's not just about collecting—it's about becoming.",
  },
  {
    icon: FlaskConical,
    title: "Learn By Doing",
    description: "Test ideas in real life",
    content: "Create experiments to test new habits, skills, or strategies. Track what works, iterate on what doesn't, and build evidence-based growth.",
  },
  {
    icon: Compass,
    title: "Stay Aligned",
    description: "Navigate with purpose",
    content: "Get AI-powered guidance that connects your daily actions to your long-term identity. Never wonder if you're moving in the right direction.",
  },
];

export const WelcomeWizard = ({ userId, onComplete }: WelcomeWizardProps) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    checkIfFirstTime();
  }, [userId]);

  const checkIfFirstTime = async () => {
    // Check if user has ANY existing data in the system
    const [identityRes, tasksRes, topicsRes, experimentsRes] = await Promise.all([
      supabase.from("identity_seeds").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("daily_tasks").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("topics").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("experiments").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    ]);

    // If user has any data, they're not new - don't show wizard
    const hasAnyData = identityRes.data || tasksRes.data || topicsRes.data || experimentsRes.data;
    
    if (!hasAnyData) {
      setOpen(true);
    }
  };

  const handleNext = () => {
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center text-center space-y-6 py-4">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">{step.title}</h2>
            <p className="text-sm font-medium text-muted-foreground">{step.description}</p>
            <p className="text-sm leading-relaxed text-muted-foreground/80 px-4">
              {step.content}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-all ${
                  index === currentStep ? "bg-primary w-6" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between w-full gap-3">
            {currentStep > 0 ? (
              <Button variant="ghost" onClick={handleBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleSkip}>
                Skip
              </Button>
            )}
            <Button onClick={handleNext} className="gap-2">
              {isLastStep ? "Get Started" : "Next"}
              {!isLastStep && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
