import { useState } from "react";
import { ArrowRight, Sparkles, Check, User, Zap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

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

// Sample "Today's Invitation" to show after identity setup
const SAMPLE_INVITATIONS = [
  {
    action: "Take 10 minutes to outline ONE thing you've been putting off",
    insight: "Your saved content shows a pattern: you know what to do, you're just waiting for permission. This is it.",
    source: "Based on your value of Action"
  },
  {
    action: "Block 30 minutes today for deep work—no notifications, no tabs",
    insight: "Focus isn't found, it's created. Start with one protected block.",
    source: "Based on your value of Focus"
  },
  {
    action: "Send one message to someone you've been meaning to reach out to",
    insight: "Connection compounds. One message today could change everything.",
    source: "Based on your value of Connection"
  }
];

const Landing = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"intro" | "identity" | "values" | "preview">("intro");
  const [identitySeed, setIdentitySeed] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const toggleValue = (value: string) => {
    setSelectedValues(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), value];
      }
      return [...prev, value];
    });
  };

  const getPersonalizedInvitation = () => {
    // Pick invitation based on first selected value
    if (selectedValues.includes("Action") || selectedValues.includes("Discipline")) {
      return SAMPLE_INVITATIONS[0];
    }
    if (selectedValues.includes("Focus") || selectedValues.includes("Depth") || selectedValues.includes("Clarity")) {
      return SAMPLE_INVITATIONS[1];
    }
    if (selectedValues.includes("Connection") || selectedValues.includes("Authenticity")) {
      return SAMPLE_INVITATIONS[2];
    }
    return SAMPLE_INVITATIONS[0];
  };

  const handleSignUp = () => {
    // Store identity data temporarily for after signup
    if (identitySeed || selectedValues.length > 0) {
      sessionStorage.setItem("pending_identity", JSON.stringify({
        identitySeed,
        selectedValues
      }));
    }
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AnimatePresence mode="wait">
        {/* INTRO - Hook them */}
        {step === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-16"
          >
            <div className="max-w-lg mx-auto text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                You saved 10,000 things.
                <br />
                <span className="text-muted-foreground">Did any of them change your life?</span>
              </h1>
              
              <p className="text-lg text-muted-foreground">
                Weave turns your saved content into <span className="text-foreground font-semibold">one clear action per day</span>.
              </p>
              
              <p className="text-sm text-muted-foreground">
                But first—let's figure out who you're becoming.
              </p>

              <Button 
                size="lg" 
                className="px-10 h-14 text-lg font-semibold shadow-lg shadow-primary/20 group"
                onClick={() => setStep("identity")}
              >
                Let's Go — 60 seconds
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <p className="text-xs text-muted-foreground">
                No signup required yet. Try it first.
              </p>
            </div>
          </motion.div>
        )}

        {/* STEP 1: Identity */}
        {step === "identity" && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-16"
          >
            {/* Progress */}
            <div className="w-full max-w-md mb-8">
              <div className="flex gap-2">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">Step 1 of 2</p>
            </div>

            <div className="max-w-md mx-auto w-full space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Who are you becoming?</h2>
                <p className="text-muted-foreground">One sentence. This sharpens everything.</p>
              </div>

              <div className="space-y-4">
                <Textarea
                  value={identitySeed}
                  onChange={(e) => setIdentitySeed(e.target.value)}
                  placeholder="I'm becoming someone who..."
                  className="min-h-[100px] text-base resize-none"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                
                {/* Quick starters */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Quick start:</p>
                  <div className="flex flex-wrap gap-2">
                    {IDENTITY_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        onClick={() => setIdentitySeed(`I'm becoming someone who ${starter}`)}
                        className="text-sm px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="ghost" onClick={() => setStep("intro")} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => setStep("values")} className="flex-1 gap-2">
                  {identitySeed.trim() ? "Continue" : "Skip"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 2: Values */}
        {step === "values" && (
          <motion.div
            key="values"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-16"
          >
            {/* Progress */}
            <div className="w-full max-w-md mb-8">
              <div className="flex gap-2">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">Step 2 of 2</p>
            </div>

            <div className="max-w-md mx-auto w-full space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Pick 3 values</h2>
                <p className="text-muted-foreground">What guides your decisions?</p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {CORE_VALUES.map((value) => {
                  const isSelected = selectedValues.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => toggleValue(value)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground scale-105 shadow-md'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 inline mr-1.5" />}
                      {value}
                    </button>
                  );
                })}
              </div>

              <p className="text-sm text-center text-muted-foreground">
                {selectedValues.length}/3 selected
              </p>

              <div className="flex gap-3 pt-4">
                <Button variant="ghost" onClick={() => setStep("identity")} className="flex-1">
                  Back
                </Button>
                <Button 
                  onClick={() => setStep("preview")} 
                  className="flex-1 gap-2"
                  disabled={selectedValues.length === 0}
                >
                  See Your First Invitation
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* PREVIEW - Show personalized invitation then prompt signup */}
        {step === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-16"
          >
            <div className="max-w-lg mx-auto w-full space-y-8">
              {/* Today's Invitation Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-lg" />
                <div className="relative p-6 rounded-2xl border-2 border-primary/30 bg-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-primary">Today's Invitation</span>
                  </div>
                  
                  <p className="text-xl font-semibold mb-4">
                    {getPersonalizedInvitation().action}
                  </p>
                  
                  <p className="text-muted-foreground text-sm mb-4">
                    {getPersonalizedInvitation().insight}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {getPersonalizedInvitation().source}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Identity summary */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                {identitySeed && (
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Your identity:</p>
                    <p className="font-medium">{identitySeed}</p>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedValues.map(v => (
                    <span key={v} className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      {v}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-center space-y-4 pt-4"
              >
                <p className="text-muted-foreground">
                  Save your identity and get daily invitations like this.
                </p>
                
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/20 group"
                  onClick={handleSignUp}
                >
                  Create Free Account
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  Free forever • No credit card • Takes 30 seconds
                </p>

                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setStep("values")}
                  className="text-muted-foreground"
                >
                  ← Go back and edit
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Landing;
