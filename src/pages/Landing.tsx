import { useState } from "react";
import { ArrowRight, Sparkles, Check, User, Zap, Target, Brain, Layers, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const CORE_VALUES = [
  "Growth", "Presence", "Focus", "Creation", "Connection",
  "Depth", "Action", "Freedom", "Clarity", "Courage",
  "Discipline", "Play", "Authenticity", "Impact"
] as const;

const IDENTITY_STARTERS = [
  "ships weekly, not someday",
  "moves before screens",
  "builds in public",
  "chooses depth over distraction",
  "creates more than consumes",
];

const PROBLEMS = [
  { text: "You save 50 things a week. None of them change your behavior." },
  { text: "You ask ChatGPT the same question differently hoping for a better answer." },
  { text: "You know what to do. You just can't start." },
  { text: "Your todo list has 47 items. You did none of them." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Drop everything in", desc: "Voice notes, screenshots, articles, brain dumps. No organizing required.", icon: MessageCircle },
  { step: "02", title: "Weave connects it", desc: "The system finds patterns across your chaos and links them to your values.", icon: Layers },
  { step: "03", title: "One invitation per day", desc: "Not a task. An invitation grounded in what you already said matters to you.", icon: Zap },
];

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
  const [step, setStep] = useState<"hero" | "identity" | "values" | "preview">("hero");
  const [identitySeed, setIdentitySeed] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const toggleValue = (value: string) => {
    setSelectedValues(prev => {
      if (prev.includes(value)) return prev.filter(v => v !== value);
      if (prev.length >= 3) return [...prev.slice(1), value];
      return [...prev, value];
    });
  };

  const getPersonalizedInvitation = () => {
    if (selectedValues.includes("Action") || selectedValues.includes("Discipline")) return SAMPLE_INVITATIONS[0];
    if (selectedValues.includes("Focus") || selectedValues.includes("Depth") || selectedValues.includes("Clarity")) return SAMPLE_INVITATIONS[1];
    if (selectedValues.includes("Connection") || selectedValues.includes("Authenticity")) return SAMPLE_INVITATIONS[2];
    return SAMPLE_INVITATIONS[0];
  };

  const handleSignUp = () => {
    if (identitySeed || selectedValues.length > 0) {
      sessionStorage.setItem("pending_identity", JSON.stringify({ identitySeed, selectedValues }));
    }
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatePresence mode="wait">
        {step === "hero" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col"
          >
            {/* Nav */}
            <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shadow-soft">
                  <Brain className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-base font-semibold font-display">Weave</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                Sign in
              </Button>
            </nav>

            {/* Hero */}
            <section className="flex flex-col items-center justify-center px-6 pt-16 pb-12 text-center">
              <div className="max-w-2xl mx-auto space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <p className="text-sm font-medium text-primary mb-4 tracking-wide uppercase">Stop collecting. Start becoming.</p>
                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
                    You don't need more information.
                    <br />
                    <span className="text-muted-foreground">You need to use what you already have.</span>
                  </h1>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto"
                >
                  Weave turns your saved content, voice notes, and brain dumps into{" "}
                  <span className="text-foreground font-semibold">one clear, identity-aligned action per day</span>.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-col sm:flex-row gap-3 justify-center pt-2"
                >
                  <Button
                    size="lg"
                    className="px-8 h-14 text-lg font-semibold shadow-lg shadow-primary/20 group"
                    onClick={() => setStep("identity")}
                  >
                    Try it — 60 seconds
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="px-8 h-14 text-lg"
                    onClick={() => navigate("/auth")}
                  >
                    Sign in
                  </Button>
                </motion.div>

                <p className="text-xs text-muted-foreground">Free forever · No credit card</p>
              </div>
            </section>

            {/* Problem Section */}
            <section className="px-6 py-16 border-t border-border/30">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">Sound familiar?</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {PROBLEMS.map((p, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="p-5 rounded-2xl border border-border/40 bg-card/50"
                    >
                      <span className="text-2xl mb-2 block">{p.icon}</span>
                      <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>

            {/* How it works */}
            <section className="px-6 py-16 border-t border-border/30 bg-muted/20">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">How Weave works</h2>
                <p className="text-center text-muted-foreground mb-10">No setup. No organizing. Just drop things in.</p>
                <div className="space-y-6">
                  {HOW_IT_WORKS.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                      className="flex items-start gap-5 p-5 rounded-2xl border border-border/30 bg-card/60"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-primary font-medium mb-1">{item.step}</p>
                        <h3 className="font-semibold text-base mb-1">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>

            {/* Differentiator */}
            <section className="px-6 py-16 border-t border-border/30">
              <div className="max-w-2xl mx-auto text-center space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold">This isn't another AI tool.</h2>
                <div className="grid sm:grid-cols-2 gap-4 text-left">
                  <div className="p-5 rounded-2xl bg-destructive/5 border border-destructive/10">
                    <p className="font-semibold text-sm mb-2 text-destructive">ChatGPT / Notion / Notes apps</p>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li>• Generate more content to consume</li>
                      <li>• Require you to organize everything</li>
                      <li>• Give generic advice that doesn't stick</li>
                      <li>• Make you more dependent over time</li>
                    </ul>
                  </div>
                  <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="font-semibold text-sm mb-2 text-primary">Weave</p>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li>• Reflects YOUR wisdom back to you</li>
                      <li>• Organizes itself automatically</li>
                      <li>• One action grounded in your values</li>
                      <li>• Makes you more capable over time</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="px-6 py-20 border-t border-border/30 bg-muted/20">
              <div className="max-w-lg mx-auto text-center space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold">Ready to stop collecting and start becoming?</h2>
                <Button
                  size="lg"
                  className="px-10 h-14 text-lg font-semibold shadow-lg shadow-primary/20 group"
                  onClick={() => setStep("identity")}
                >
                  Start in 60 seconds
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </section>

            {/* Footer */}
            <footer className="px-6 py-8 border-t border-border/30 text-center">
              <p className="text-xs text-muted-foreground">
                Looking for career clarity? Try{" "}
                <a href="https://upath.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  UPath.ai
                </a>{" "}
                — built for career exploration and path finding.
              </p>
            </footer>
          </motion.div>
        )}

        {/* STEP 1: Identity */}
        {step === "identity" && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 min-h-screen flex flex-col items-center justify-center px-6 py-16"
          >
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
                <Button variant="ghost" onClick={() => setStep("hero")} className="flex-1">Back</Button>
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
            className="flex-1 min-h-screen flex flex-col items-center justify-center px-6 py-16"
          >
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

              <p className="text-sm text-center text-muted-foreground">{selectedValues.length}/3 selected</p>

              <div className="flex gap-3 pt-4">
                <Button variant="ghost" onClick={() => setStep("identity")} className="flex-1">Back</Button>
                <Button onClick={() => setStep("preview")} className="flex-1 gap-2" disabled={selectedValues.length === 0}>
                  See Your First Invitation
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* PREVIEW */}
        {step === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 min-h-screen flex flex-col items-center justify-center px-6 py-16"
          >
            <div className="max-w-lg mx-auto w-full space-y-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-lg" />
                <div className="relative p-6 rounded-2xl border-2 border-primary/30 bg-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-primary">Today's Invitation</span>
                  </div>
                  <p className="text-xl font-semibold mb-4">{getPersonalizedInvitation().action}</p>
                  <p className="text-muted-foreground text-sm mb-4">{getPersonalizedInvitation().insight}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">{getPersonalizedInvitation().source}</span>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-3">
                {identitySeed && (
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Your identity:</p>
                    <p className="font-medium">{identitySeed}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedValues.map(v => (
                    <span key={v} className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">{v}</span>
                  ))}
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center space-y-4 pt-4">
                <p className="text-muted-foreground">Save your identity and get daily invitations like this.</p>
                <Button size="lg" className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/20 group" onClick={handleSignUp}>
                  Create Free Account
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <p className="text-xs text-muted-foreground">Free forever • No credit card • Takes 30 seconds</p>
                <Button variant="ghost" size="sm" onClick={() => setStep("values")} className="text-muted-foreground">← Go back and edit</Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Landing;
