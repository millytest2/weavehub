import { ArrowRight, Zap, Compass, CheckCircle, Play, Sparkles, Brain, Target, Clock, TrendingUp, FileText, Video, Headphones, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section - More Urgent */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        {/* Floating badges for credibility */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-3 text-xs">
          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
            Free forever
          </span>
          <span className="px-3 py-1 bg-muted text-muted-foreground rounded-full">
            2 min setup
          </span>
        </div>
        
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
          <p className="text-primary font-medium text-sm sm:text-base tracking-wide uppercase">
            For people drowning in saved content
          </p>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            You saved 10,000 things.
            <br />
            <span className="text-muted-foreground">Did any of them change your life?</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto">
            Weave turns your saved videos, articles, and notes into 
            <span className="text-foreground font-semibold"> one clear action per day</span>.
          </p>
          
          <div className="flex flex-col items-center gap-4 pt-4">
            <Button 
              size="lg" 
              className="px-10 h-14 text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all group"
              onClick={() => navigate("/auth")}
            >
              Start Free — Takes 2 Minutes
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <p className="text-sm text-muted-foreground">
              No credit card • No spam • Unsubscribe anytime
            </p>
          </div>
        </div>
        
        {/* Quick value props */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span>Works with YouTube, articles, notes</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span>AI-powered insights</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span>Daily action suggestions</span>
          </div>
        </div>
      </section>

      {/* Quick Demo / Preview Section */}
      <section className="py-16 px-6 border-t border-border/40 bg-card">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              See it in action
            </h2>
            <p className="text-muted-foreground">From scattered saves to focused action in seconds</p>
          </div>
          
          {/* Visual workflow */}
          <div className="relative">
            <div className="grid md:grid-cols-3 gap-4 md:gap-2">
              <div className="p-6 rounded-2xl border border-border bg-background text-center relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">
                  BEFORE
                </div>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-center gap-2 text-muted-foreground">
                    <FileText className="h-6 w-6" />
                    <Video className="h-6 w-6" />
                    <Headphones className="h-6 w-6" />
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted-foreground">47 saved YouTube videos</p>
                  <p className="text-sm text-muted-foreground">23 bookmarked articles</p>
                  <p className="text-sm text-muted-foreground">12 "read later" notes</p>
                  <p className="text-sm font-medium text-destructive">Zero action taken</p>
                </div>
              </div>
              
              <div className="flex items-center justify-center">
                <div className="hidden md:flex items-center gap-2 text-primary">
                  <div className="w-12 h-0.5 bg-primary/30" />
                  <Sparkles className="h-6 w-6" />
                  <div className="w-12 h-0.5 bg-primary/30" />
                </div>
                <div className="md:hidden py-4">
                  <Sparkles className="h-6 w-6 text-primary mx-auto" />
                </div>
              </div>
              
              <div className="p-6 rounded-2xl border-2 border-primary bg-primary/5 text-center relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">
                  AFTER
                </div>
                <div className="space-y-3 mt-2">
                  <CheckCircle className="h-10 w-10 text-primary mx-auto" />
                  <p className="font-semibold text-foreground">Today's Action:</p>
                  <p className="text-sm text-muted-foreground italic">
                    "Spend 15 mins applying the 'atomic habits' technique from James Clear to your morning routine"
                  </p>
                  <p className="text-xs text-primary font-medium">Based on 3 videos you saved about habits</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Point - More Direct */}
      <section className="py-16 px-6 border-t border-border/40 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold">
            ChatGPT made the problem worse
          </h2>
          <div className="space-y-4 text-left max-w-lg mx-auto">
            <p className="text-muted-foreground flex items-start gap-3">
              <span className="text-destructive">❌</span>
              Ask ChatGPT what to do. Get 10 options. Save the answer. Ask again tomorrow. <span className="text-destructive font-medium">Never act.</span>
            </p>
            <p className="text-muted-foreground flex items-start gap-3">
              <span className="text-destructive">❌</span>
              Become dependent on external AI. Your own judgment <span className="text-destructive font-medium">atrophies</span>.
            </p>
            <p className="text-muted-foreground flex items-start gap-3">
              <span className="text-destructive">❌</span>
              Generic advice from the internet. Not <span className="text-destructive font-medium">YOU</span>.
            </p>
          </div>
          <div className="pt-6 p-6 bg-primary/5 rounded-2xl border border-primary/20">
            <p className="text-lg font-semibold text-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Weave is different
            </p>
            <p className="text-muted-foreground mt-2">
              It reflects YOUR wisdom back to you. From YOUR saved content. Building YOUR judgment.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works - Visual */}
      <section className="py-16 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            3 steps. 2 minutes. Life-changing clarity.
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            No complex setup. No learning curve.
          </p>
          
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Play className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2 text-lg">1. Paste anything</h3>
              <p className="text-sm text-muted-foreground">
                YouTube videos, articles, tweets, voice notes. Just paste the URL or text.
              </p>
              <p className="text-xs text-primary mt-2 font-medium">Takes 5 seconds</p>
            </div>
            
            <div className="text-center group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Brain className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2 text-lg">2. AI finds patterns</h3>
              <p className="text-sm text-muted-foreground">
                Weave connects your content. Finds themes across physics, business, life.
              </p>
              <p className="text-xs text-primary mt-2 font-medium">Automatic</p>
            </div>
            
            <div className="text-center group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Target className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2 text-lg">3. Get ONE action</h3>
              <p className="text-sm text-muted-foreground">
                Not 10 options. ONE thing based on what YOU saved. Do it today.
              </p>
              <p className="text-xs text-primary mt-2 font-medium">Daily clarity</p>
            </div>
          </div>
          
          <div className="text-center mt-10">
            <Button 
              size="lg"
              variant="outline" 
              className="px-8 h-12 font-semibold border-primary/30 hover:bg-primary/5"
              onClick={() => navigate("/auth")}
            >
              Try It Free Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Features - Emotional */}
      <section className="py-16 px-6 border-t border-border/40 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            When you feel stuck, bored, or lost
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            One tap brings you back to yourself
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Next Best Rep</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Caught doomscrolling? Tap once. Get one small action that matches who you want to become. 
                Break the loop in 5 minutes.
              </p>
              <p className="text-xs text-primary font-medium">→ Perfect for afternoon slumps</p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Compass className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Return to Self</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Anxious or overthinking? See your values, one insight from your notes, 
                and one grounding action. Always available.
              </p>
              <p className="text-xs text-primary font-medium">→ Like a compass in your pocket</p>
            </div>
            
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Morning & Evening Rituals</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Start with intention, end with reflection. Two moments that compound over months.
              </p>
              <p className="text-xs text-primary font-medium">→ Takes 2 minutes each</p>
            </div>
            
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Learning Paths</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Turn a topic cluster into a structured sprint. Short, focused sections you'll actually finish.
              </p>
              <p className="text-xs text-primary font-medium">→ From consumption to mastery</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Differentiator */}
      <section className="py-16 px-6 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">
            Built different
          </h2>
          
          <div className="space-y-4 text-left max-w-md mx-auto">
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No goals.</span> Actions come from your identity, not arbitrary targets.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No streaks.</span> Miss a day. Come back. No guilt. No shame.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No generic advice.</span> Every suggestion cites YOUR saved content.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">Gets smarter.</span> The more you save, the better it knows you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Urgency */}
      <section className="py-20 px-6 border-t border-border/40 bg-gradient-to-b from-primary/10 to-primary/5">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Stop saving. Start becoming.
          </h2>
          <p className="text-lg text-muted-foreground">
            Every day you wait, more content gets saved and ignored.
            <br />
            <span className="text-foreground font-medium">Break the cycle in 2 minutes.</span>
          </p>
          <div className="pt-4 space-y-4">
            <Button 
              size="lg" 
              className="px-12 h-14 text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all group"
              onClick={() => navigate("/auth")}
            >
              Start Free Now
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-primary" /> Free forever
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-primary" /> No credit card
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-primary" /> Cancel anytime
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Weave</span>
          </div>
          <p>Turn saved content into action.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
