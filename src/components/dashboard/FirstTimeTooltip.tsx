import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FirstTimeTooltipProps {
  userId: string;
  isFirstTime: boolean;
}

const STEPS = [
  {
    icon: Sparkles,
    title: "Daily Invitations",
    description: "Get 3 personalized actions each day, aligned with who you're becoming.",
  },
  {
    icon: Target,
    title: "Track What Matters",
    description: "Complete invitations to build momentum. Every small action compounds.",
  },
  {
    icon: Zap,
    title: "Capture Ideas",
    description: "Use the + button to save thoughts, links, or insights anytime.",
  },
];

export const FirstTimeTooltip = ({ userId, isFirstTime }: FirstTimeTooltipProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isFirstTime) return;
    
    const hasSeenTutorial = localStorage.getItem(`weave_tutorial_${userId}`);
    if (!hasSeenTutorial) {
      // Delay showing to let the dashboard render first
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isFirstTime, userId]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(`weave_tutorial_${userId}`, "true");
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={handleDismiss}
          />
          
          {/* Tooltip Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm"
          >
            <div className="bg-card border border-border rounded-2xl shadow-elevated p-6 space-y-5">
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Step indicator dots */}
              <div className="flex justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentStep 
                        ? "w-6 bg-primary" 
                        : i < currentStep 
                          ? "w-1.5 bg-primary/50" 
                          : "w-1.5 bg-muted"
                    }`}
                  />
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="text-center space-y-4"
                >
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-display font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="flex-1 text-muted-foreground"
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="flex-1"
                >
                  {currentStep === STEPS.length - 1 ? "Get Started" : "Next"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
