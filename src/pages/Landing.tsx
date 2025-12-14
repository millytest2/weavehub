import { ArrowRight, Brain, Compass, Zap, Layers, Target, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 py-20 overflow-hidden">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Compass className="h-4 w-4" />
            Personal Operating System
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            Stop asking AI what to do.
            <br />
            <span className="text-primary">Start acting on what you already know.</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            You've saved 10,000 videos, bookmarked 5,000 articles, asked ChatGPT 1,000 questions.
            <br className="hidden sm:block" />
            <span className="text-foreground font-medium">Still don't know what to do today.</span>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              size="lg" 
              className="px-8 h-12 text-base"
              onClick={() => navigate("/auth")}
            >
              Start Using Weave
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="lg"
              className="text-muted-foreground"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See how it works
            </Button>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            The loop you're stuck in
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* ChatGPT Model */}
            <div className="p-6 rounded-2xl border border-border bg-muted/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Brain className="h-4 w-4" />
                </div>
                <span className="font-medium">The ChatGPT Loop</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <p className="text-muted-foreground">You: "I'm stuck on my business. What should I do?"</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <p className="text-muted-foreground">AI: "Here are 10 strategies for growing a business..."</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <p className="text-muted-foreground italic">*saves answer, never acts, asks again tomorrow*</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 space-y-1">
                <p className="text-xs text-muted-foreground">Result:</p>
                <p className="text-sm">Outsource thinking → Get generic advice → Become dependent → Get <span className="text-destructive font-medium">worse</span> at deciding</p>
              </div>
            </div>

            {/* Weave Model */}
            <div className="p-6 rounded-2xl border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 text-primary mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Compass className="h-4 w-4" />
                </div>
                <span className="font-medium">The Weave Way</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-lg bg-background/50 border border-primary/20">
                  <p className="text-muted-foreground">*saves 5 videos about cold emailing over 2 weeks*</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-primary/20">
                  <p className="text-foreground">"You saved Alex Hormozi's cold email framework. <span className="text-primary font-medium">48h experiment:</span> Send 10 cold emails using his 3-part structure."</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-primary/20">
                  <p className="text-muted-foreground">Deadline: Sunday 8pm.</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-primary/20 space-y-1">
                <p className="text-xs text-primary/70">Result:</p>
                <p className="text-sm">Your patterns reflected → Your content cited → One action → Build capability → Get <span className="text-primary font-medium">better</span> at deciding</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 border-t border-border/40 bg-muted/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              How Weave processes 100,000+ pieces of your information
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              This is what ChatGPT can't do. It has no persistent memory of what you've saved.
            </p>
          </div>

          <div className="grid gap-8">
            {/* Step 1 */}
            <div className="flex gap-6 items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Ingestion (Automatic)</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Paste any YouTube video, article, tweet, or Instagram post. Weave extracts the content, 
                  generates a semantic embedding (384 dimensions), and stores it with your identity context.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-6 items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Semantic Weaving (Cross-Domain)</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                  Vector search finds connections across everything you've saved. Not by tags or folders—by meaning.
                </p>
                <div className="p-4 rounded-lg bg-background border border-border/50 text-sm">
                  <p className="text-muted-foreground mb-2">Example: "momentum" appears in:</p>
                  <ul className="space-y-1 text-foreground">
                    <li>• Physics video you saved last month</li>
                    <li>• Business podcast from 6 months ago</li>
                    <li>• Workout article from yesterday</li>
                  </ul>
                  <p className="text-primary mt-3 font-medium">"Apply momentum principle from physics to your UPath marketing."</p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-6 items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Retrieval (Time-Aware)</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  When generating today's action, Weave considers recency, frequency of access, 
                  active projects, and your current energy level. Result: <span className="text-foreground font-medium">ONE action</span> from 
                  100,000 items that's relevant, based on what you've been circling, and appropriate for right now.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grounding */}
      <section className="py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Getting back to reality
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              When you're doomscrolling, anxious, overthinking, or numb—Weave brings you back.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Next Best Rep</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                One tap when you're drifting. Get a single identity-aligned action that breaks the loop.
                5-minute walk. 10 pushups. Close all tabs, write one sentence about tomorrow.
              </p>
              <p className="text-xs text-primary/70">
                Physical action interrupts mental loop. Concrete. Fast. No decision fatigue.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Compass className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Return to Self</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                When you're anxious, lonely, lost, disconnected. Shows your identity, your values, 
                one relevant insight from YOUR notes, and one micro-action aligned with who you're becoming.
              </p>
              <p className="text-xs text-primary/70">
                Pulls you out of external validation seeking. Grounds in YOUR values. Always available.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Identity First */}
      <section className="py-20 px-6 border-t border-border/40 bg-muted/20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Identity-first. Not goal-first.
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Goals are future-focused. You're still the OLD you trying to do NEW things.
            <br />
            Weave starts with who you're becoming. Actions reinforce that identity.
          </p>
          
          <div className="p-6 rounded-2xl border border-primary/30 bg-primary/5 text-left max-w-xl mx-auto">
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Not this:</p>
                <p className="text-foreground">"I want to make $100K"</p>
              </div>
              <div className="border-t border-primary/20 pt-4">
                <p className="text-primary mb-1">This:</p>
                <p className="text-foreground font-medium">"I am someone who ships raw content daily"</p>
              </div>
              <div className="border-t border-primary/20 pt-4">
                <p className="text-muted-foreground mb-1">Today's Invitation:</p>
                <p className="text-foreground">"Publish one rough Twitter thread about UPath. No editing. 15 minutes."</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Anti-MBA */}
      <section className="py-20 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            The Anti-MBA approach
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6 text-left mb-8">
            <div className="p-5 rounded-xl border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Traditional</p>
              <p className="text-sm text-muted-foreground">
                Study for 2 years → Learn frameworks → Case studies → Theories → 
                <span className="text-foreground"> THEN maybe apply it</span>
              </p>
            </div>
            <div className="p-5 rounded-xl border border-primary/30 bg-primary/5">
              <p className="text-xs text-primary uppercase tracking-wide mb-2">Weave</p>
              <p className="text-sm text-foreground">
                Save content as you consume → System surfaces ONE action → 
                <span className="text-primary font-medium"> Do it in 24-48 hours</span>
              </p>
            </div>
          </div>
          
          <p className="text-lg text-muted-foreground">
            You don't need to "learn everything first."
            <br />
            <span className="text-foreground font-medium">You need to apply what you already saved.</span>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border/40 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Replace ChatGPT with something that knows you
          </h2>
          <p className="text-muted-foreground">
            Weave reflects YOUR wisdom back to you. 
            Surfaces actions from YOUR saved content. 
            Builds YOUR capability over time.
          </p>
          <Button 
            size="lg" 
            className="px-10 h-12 text-base"
            onClick={() => navigate("/auth")}
          >
            Start Using Weave
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground pt-4">
            Free to start. No credit card required.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Weave</span>
          </div>
          <p>A personal operating system for clarity and action.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
