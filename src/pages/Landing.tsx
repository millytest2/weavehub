import { ArrowRight, Zap, Compass, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        
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
              className="px-10 h-14 text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              onClick={() => navigate("/auth")}
            >
              Try Weave Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-sm text-muted-foreground">
              No credit card. No BS. Just clarity.
            </p>
          </div>
        </div>
      </section>

      {/* Pain Point */}
      <section className="py-16 px-6 border-t border-border/40 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold">
            The problem with ChatGPT
          </h2>
          <div className="space-y-4 text-left max-w-lg mx-auto">
            <p className="text-muted-foreground">
              You ask it what to do. It gives you 10 options. You save the answer. 
              Tomorrow you ask again. <span className="text-destructive font-medium">You never act.</span>
            </p>
            <p className="text-muted-foreground">
              Worse: you become dependent on external AI for decisions. 
              Your own judgment <span className="text-destructive font-medium">gets weaker</span>.
            </p>
          </div>
          <div className="pt-4">
            <p className="text-lg font-semibold text-foreground">
              Weave is the opposite.
            </p>
            <p className="text-muted-foreground">
              It reflects YOUR wisdom back to you. From YOUR saved content.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works - Simple */}
      <section className="py-16 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            How it works
          </h2>
          
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold mb-2">Paste anything</h3>
              <p className="text-sm text-muted-foreground">
                YouTube videos, articles, tweets, notes. Just paste the URL.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-semibold mb-2">Weave connects it</h3>
              <p className="text-sm text-muted-foreground">
                Finds patterns across everything you saved. Physics → Business → Life.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-semibold mb-2">Get one action</h3>
              <p className="text-sm text-muted-foreground">
                Not 10 options. ONE thing. Based on what YOU saved. Do it today.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 border-t border-border/40 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            When you feel stuck, bored, or lost
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            One tap brings you back
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Next Best Rep</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Doomscrolling? Tap once. Get one small action that matches who you want to become. 
                Break the loop in 5 minutes.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <Compass className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Return to Self</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Anxious or overthinking? See your values, one insight from your notes, 
                and one grounding action. Always available.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Differentiator */}
      <section className="py-16 px-6 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">
            Not another productivity app
          </h2>
          
          <div className="space-y-4 text-left max-w-md mx-auto">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No goals.</span> Actions come from your identity, not arbitrary targets.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No streaks.</span> Miss a day. Come back. No guilt.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">No generic advice.</span> Every suggestion cites YOUR saved content.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">Gets better over time.</span> More you save, smarter it gets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 border-t border-border/40 bg-gradient-to-b from-primary/10 to-primary/5">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Stop saving. Start doing.
          </h2>
          <p className="text-lg text-muted-foreground">
            Your saved content is useless unless you act on it.
            <br />
            <span className="text-foreground font-medium">Weave makes action inevitable.</span>
          </p>
          <div className="pt-4">
            <Button 
              size="lg" 
              className="px-12 h-14 text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              onClick={() => navigate("/auth")}
            >
              Try Weave Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              Free forever. Unlimited saves. No credit card.
            </p>
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
