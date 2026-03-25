import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Zap, RefreshCw, Gift, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { EveningClose } from "@/components/dashboard/EveningClose";

interface BriefAction {
  id?: string;
  one_thing: string;
  why_matters: string;
  pillar: string;
  description: string;
  impact_description?: string;
  action_type?: string;
  priority?: string;
  completed?: boolean;
  task_sequence?: number;
}

interface ForgottenGem {
  id: string;
  title: string;
  content: string;
  source: string;
  age_days: number;
  why_now: string | null;
}

interface MorningBrief {
  id: string;
  what_shifted: string;
  brief_date: string;
  forgotten_gem_context: string | null;
}

// All weavable items unified into one stream
type WeaveNode =
  | { type: 'narrative'; text: string }
  | { type: 'action'; action: BriefAction; index: number }
  | { type: 'gem'; gem: ForgottenGem };

const Dashboard = () => {
  const { user } = useAuth();
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [actions, setActions] = useState<BriefAction[]>([]);
  const [forgottenGem, setForgottenGem] = useState<ForgottenGem | null>(null);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const hasLoaded = useRef(false);

  const [isGettingRep, setIsGettingRep] = useState(false);
  const [nextRep, setNextRep] = useState<any>(null);
  const [showRepDialog, setShowRepDialog] = useState(false);

  const getTimePhase = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  };

  const isEvening = () => {
    const hour = new Date().getHours();
    return hour >= 18 && hour < 23;
  };

  const fetchBrief = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("morning-brief", {
        body: { timezone }
      });
      if (error) throw error;
      if (data) {
        setBrief(data.brief);
        setActions(data.actions || []);
        setForgottenGem(data.forgotten_gem || null);
        setUserName(data.user_name || '');
      }
    } catch (error: any) {
      console.error("Brief error:", error);
      toast.error("Couldn't load your brief");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || hasLoaded.current) return;
    hasLoaded.current = true;
    fetchBrief();
  }, [user, fetchBrief]);

  const handleCompleteAction = async (action: BriefAction) => {
    if (!user || !action.id) return;
    try {
      await supabase.from("daily_tasks").update({ completed: true }).eq("id", action.id);
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, completed: true } : a));
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id, hour_of_day: now.getHours(), day_of_week: now.getDay(),
        activity_type: 'complete', pillar: action.pillar
      });
      toast.success("Done!");
    } catch (error: any) {
      console.error("Complete error:", error);
      toast.error("Failed to complete");
    }
  };

  const handleSkipAction = async (action: BriefAction) => {
    if (!user || !action.id) return;
    try {
      await supabase.from("daily_tasks").delete().eq("id", action.id);
      setActions(prev => prev.filter(a => a.id !== action.id));
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id, hour_of_day: now.getHours(), day_of_week: now.getDay(),
        activity_type: 'skip', pillar: action.pillar
      });
    } catch (error: any) {
      console.error("Skip error:", error);
    }
  };

  const handleNextRep = async () => {
    setIsGettingRep(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("next-rep", { body: { timezone } });
      if (error) throw error;
      if (data) { setNextRep(data); setShowRepDialog(true); }
    } catch (error: any) {
      toast.error(error.message || "Failed to get rep");
    } finally {
      setIsGettingRep(false);
    }
  };

  const committedActions = actions;

  // Build the unified weave stream
  const weaveNodes: WeaveNode[] = [];
  if (brief?.what_shifted) {
    weaveNodes.push({ type: 'narrative', text: brief.what_shifted });
  }
  actions.forEach((action, i) => {
    weaveNodes.push({ type: 'action', action, index: i });
    // Interleave the gem after the 2nd action (or last if fewer)
    if (forgottenGem && i === Math.min(1, actions.length - 1)) {
      weaveNodes.push({ type: 'gem', gem: forgottenGem });
    }
  });
  // If no actions but gem exists
  if (actions.length === 0 && forgottenGem) {
    weaveNodes.push({ type: 'gem', gem: forgottenGem });
  }

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-8 animate-fade-in overflow-x-hidden w-full">
      {user && isEvening() && committedActions.length > 0 && (
        <EveningClose userId={user.id} committedActions={committedActions} briefId={brief?.id} />
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center py-20">
            <WeaveLoader size="lg" text={
              getTimePhase() === 'morning' ? "Weaving your morning..." :
              getTimePhase() === 'afternoon' ? "Weaving your afternoon..." :
              "Weaving today together..."
            } />
          </motion.div>
        ) : (
          <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">

            {/* Date anchor */}
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-8 text-center">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* ===== THE WEAVE — zigzag flowing nodes ===== */}
            <div className="relative">
              {/* SVG weave line connecting all nodes */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 0 }}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="weave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
                    <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="relative" style={{ zIndex: 1 }}>
                {weaveNodes.map((node, idx) => {
                  // Alternate: even = left-aligned, odd = right-aligned
                  const isRight = idx % 2 === 1;
                  const delay = 0.1 + idx * 0.1;

                  return (
                    <div key={idx} className="relative">
                      {/* Connecting curve between nodes */}
                      {idx > 0 && (
                        <svg
                          className="w-full pointer-events-none"
                          height="40"
                          viewBox="0 0 400 40"
                          preserveAspectRatio="none"
                          style={{ display: 'block', marginTop: '-4px', marginBottom: '-4px' }}
                        >
                          <path
                            d={isRight
                              ? "M 100 0 C 100 20, 300 20, 300 40"
                              : "M 300 0 C 300 20, 100 20, 100 40"
                            }
                            fill="none"
                            stroke="hsl(var(--primary))"
                            strokeOpacity="0.1"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                          />
                        </svg>
                      )}

                      {/* Node content */}
                      <motion.div
                        initial={{ opacity: 0, x: isRight ? 20 : -20, y: 10 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        transition={{ delay, type: "spring", stiffness: 200, damping: 25 }}
                        className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] ${isRight ? 'mr-2' : 'ml-2'}`}>
                          {node.type === 'narrative' && (
                            <NarrativeNode text={node.text} />
                          )}
                          {node.type === 'action' && (
                            <ActionNode
                              action={node.action}
                              onComplete={handleCompleteAction}
                              onSkip={handleSkipAction}
                            />
                          )}
                          {node.type === 'gem' && (
                            <GemNode gem={node.gem} />
                          )}
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===== BOTTOM — quiet utilities ===== */}
            <div className="mt-14 space-y-4 pb-8 flex flex-col items-center">
              <button onClick={handleNextRep} disabled={isGettingRep} className="group text-left">
                <div className="flex items-center gap-2.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
                  <span className="text-[13px] text-muted-foreground/35 group-hover:text-muted-foreground/60 transition-colors">
                    {isGettingRep ? "Finding your next move..." : "Stuck? Next rep"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/15 group-hover:text-primary/30 group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>

              <button
                onClick={() => {
                  hasLoaded.current = false;
                  if (brief?.id) {
                    supabase.from("daily_briefs").delete().eq("id", brief.id).then(() => {
                      supabase.from("daily_tasks").delete().eq("daily_brief_id", brief.id).then(() => fetchBrief());
                    });
                  } else { fetchBrief(); }
                }}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Regenerate
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Best Rep Dialog */}
      <Dialog open={showRepDialog} onOpenChange={setShowRepDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-display">
              <Zap className="h-4 w-4 text-primary" />
              {nextRep?.bucket || "Your Rep"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">Break the drift</DialogDescription>
          </DialogHeader>
          {nextRep && (
            <div className="space-y-5 pt-2">
              <p className="text-lg font-medium leading-relaxed">{nextRep.rep}</p>
              <p className="text-sm text-muted-foreground">{nextRep.why}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                <span>{nextRep.time}</span>
                <span className="px-2 py-1 rounded-lg bg-muted font-medium">{nextRep.bucket}</span>
              </div>
              <Button onClick={() => setShowRepDialog(false)} className="w-full h-12 rounded-2xl">Got it</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ===== WEAVE NODE COMPONENTS ===== */

const NarrativeNode = ({ text }: { text: string }) => (
  <div className="rounded-2xl bg-card/80 backdrop-blur-sm border border-border/40 p-5 shadow-sm">
    <p className="text-[14px] text-foreground/70 leading-[1.75] font-light">
      {text}
    </p>
  </div>
);

const ActionNode = ({
  action,
  onComplete,
  onSkip,
}: {
  action: BriefAction;
  onComplete: (a: BriefAction) => void;
  onSkip: (a: BriefAction) => void;
}) => {
  const isDone = action.completed;

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      isDone
        ? 'bg-primary/5 border-primary/10 opacity-60'
        : 'bg-card/80 backdrop-blur-sm border-border/40 shadow-sm hover:shadow-md hover:border-primary/20'
    }`}>
      <div className="space-y-2">
        {action.pillar && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
              {action.pillar}
            </span>
            {action.description && (
              <span className="text-[10px] text-muted-foreground/30">
                {action.description}
              </span>
            )}
          </div>
        )}

        <p className={`text-[15px] leading-relaxed ${
          isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 font-medium'
        }`}>
          {action.one_thing}
        </p>

        {!isDone && action.why_matters && (
          <p className="text-[13px] text-muted-foreground/50 leading-relaxed">
            {action.why_matters}
          </p>
        )}

        {!isDone && action.impact_description && (
          <p className="text-[12px] text-primary/40">
            → {action.impact_description}
          </p>
        )}

        {!isDone ? (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onComplete(action)}
              className="text-[12px] font-medium text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              done
            </button>
            <button
              onClick={() => onSkip(action)}
              className="text-[12px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
            >
              skip
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 pt-1">
            <Check className="h-3 w-3 text-primary/50" />
            <span className="text-[11px] text-primary/50">completed</span>
          </div>
        )}
      </div>
    </div>
  );
};

const GemNode = ({ gem }: { gem: ForgottenGem }) => (
  <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 p-5">
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Gift className="h-3 w-3 text-amber-500/50" />
        <span className="text-[10px] font-medium text-amber-500/50 uppercase tracking-wider">
          {gem.age_days} days ago
        </span>
      </div>
      <p className="text-[14px] text-foreground/75 font-medium leading-relaxed">
        {gem.title}
      </p>
      <p className="text-[13px] text-muted-foreground/45 leading-relaxed line-clamp-2">
        {gem.content}
      </p>
      {gem.why_now && (
        <p className="text-[12px] text-amber-600/40 dark:text-amber-400/40 italic">
          {gem.why_now}
        </p>
      )}
    </div>
  </div>
);

export default Dashboard;
