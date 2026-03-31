import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Zap, RefreshCw, Gift, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { EveningClose } from "@/components/dashboard/EveningClose";

interface WeaveSource {
  label: string;
  type: 'capture' | 'pattern' | 'goal' | 'journal' | 'gem' | 'experiment' | 'gap';
  detail: string;
}

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
  cited_sources?: WeaveSource[];
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

const SWIPE_THRESHOLD = 50;

// Source type styling
const sourceStyles: Record<string, { color: string; bg: string; icon: string }> = {
  capture: { color: 'text-blue-500/70', bg: 'bg-blue-500/8 border-blue-500/15', icon: '◆' },
  pattern: { color: 'text-violet-500/70', bg: 'bg-violet-500/8 border-violet-500/15', icon: '◎' },
  goal: { color: 'text-emerald-500/70', bg: 'bg-emerald-500/8 border-emerald-500/15', icon: '▲' },
  journal: { color: 'text-amber-500/70', bg: 'bg-amber-500/8 border-amber-500/15', icon: '●' },
  gem: { color: 'text-amber-500/70', bg: 'bg-amber-500/8 border-amber-500/15', icon: '✦' },
  experiment: { color: 'text-rose-500/70', bg: 'bg-rose-500/8 border-rose-500/15', icon: '◇' },
  gap: { color: 'text-orange-500/70', bg: 'bg-orange-500/8 border-orange-500/15', icon: '○' },
};

const Dashboard = () => {
  const { user } = useAuth();
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [actions, setActions] = useState<BriefAction[]>([]);
  const [forgottenGem, setForgottenGem] = useState<ForgottenGem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoaded = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);

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
        // Parse cited_sources from JSON if needed
        const parsedActions = (data.actions || []).map((a: any) => ({
          ...a,
          cited_sources: typeof a.cited_sources === 'string' ? JSON.parse(a.cited_sources) : a.cited_sources,
        }));
        setActions(parsedActions);
        setForgottenGem(data.forgotten_gem || null);
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
      // Auto-advance
      if (activeIndex < totalNodes - 1) {
        setTimeout(() => navigate(1), 600);
      }
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

  // Build nodes: actions + gem interleaved
  const nodes: Array<{ type: 'action'; action: BriefAction } | { type: 'gem'; gem: ForgottenGem }> = [];
  actions.forEach((action) => {
    nodes.push({ type: 'action', action });
  });
  if (forgottenGem) {
    const gemPos = Math.min(2, nodes.length);
    nodes.splice(gemPos, 0, { type: 'gem', gem: forgottenGem });
  }

  const totalNodes = nodes.length;
  const currentNode = nodes[activeIndex];

  const navigate = (dir: number) => {
    const next = activeIndex + dir;
    if (next < 0 || next >= totalNodes) return;
    setDirection(dir);
    setActiveIndex(next);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD && activeIndex < totalNodes - 1) navigate(1);
    else if (info.offset.x > SWIPE_THRESHOLD && activeIndex > 0) navigate(-1);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, totalNodes]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 280 : -280, opacity: 0, scale: 0.95 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -280 : 280, opacity: 0, scale: 0.95 }),
  };

  const committedActions = actions;

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-6 animate-fade-in overflow-hidden w-full">
      {user && isEvening() && committedActions.length > 0 && (
        <EveningClose userId={user.id} committedActions={committedActions} briefId={brief?.id} />
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center">
            <WeaveLoader size="lg" text={
              getTimePhase() === 'morning' ? "Weaving your morning..." :
              getTimePhase() === 'afternoon' ? "Weaving your afternoon..." :
              "Weaving today together..."
            } />
          </motion.div>
        ) : totalNodes === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-muted-foreground/50 text-sm">Nothing woven yet today.</p>
              <button
                onClick={() => { hasLoaded.current = false; fetchBrief(); }}
                className="text-sm text-primary/60 hover:text-primary transition-colors"
              >
                Generate brief
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="weave" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">

            {/* What shifted — compact context bar */}
            {brief?.what_shifted && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="mb-5"
              >
                <p className="text-[11px] text-muted-foreground/40 leading-relaxed text-center px-4">
                  {brief.what_shifted.replace(/^[•\-\s]+/gm, '').split('\n').filter(Boolean).slice(0, 2).join(' · ')}
                </p>
              </motion.div>
            )}

            {/* Progress — which node you're on */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {nodes.map((node, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > activeIndex ? 1 : -1); setActiveIndex(i); }}
                  className="relative"
                >
                  <div className={`rounded-full transition-all duration-500 ${
                    i === activeIndex
                      ? 'w-7 h-2 bg-primary/50'
                      : i < activeIndex
                        ? 'w-2 h-2 bg-primary/20'
                        : 'w-2 h-2 bg-muted-foreground/10'
                  }`} />
                </button>
              ))}
            </div>

            {/* ===== THE CARD ===== */}
            <div className="flex-1 flex items-center justify-center relative">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={activeIndex}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.12}
                  onDragEnd={handleDragEnd}
                  className="w-full cursor-grab active:cursor-grabbing"
                >
                  {currentNode?.type === 'action' && (
                    <WeaveActionCard
                      action={currentNode.action}
                      onComplete={handleCompleteAction}
                      onSkip={handleSkipAction}
                    />
                  )}
                  {currentNode?.type === 'gem' && (
                    <WeaveGemCard gem={currentNode.gem} context={brief?.forgotten_gem_context} />
                  )}
                </motion.div>
              </AnimatePresence>

              {activeIndex > 0 && (
                <button onClick={() => navigate(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/20 hover:text-muted-foreground/50 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {activeIndex < totalNodes - 1 && (
                <button onClick={() => navigate(1)} className="absolute right-0 top-1/2 -translate-y-1/2 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/20 hover:text-muted-foreground/50 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Bottom utilities */}
            <div className="mt-6 flex items-center justify-between pb-4">
              <button onClick={handleNextRep} disabled={isGettingRep} className="group flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
                <span className="text-[12px] text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                  {isGettingRep ? "Finding..." : "Next rep"}
                </span>
              </button>

              <button
                onClick={() => {
                  hasLoaded.current = false;
                  setActiveIndex(0);
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

/* ===== WEAVE ACTION CARD — shows the action + visual source threads ===== */

const WeaveActionCard = ({
  action,
  onComplete,
  onSkip,
}: {
  action: BriefAction;
  onComplete: (a: BriefAction) => void;
  onSkip: (a: BriefAction) => void;
}) => {
  const isDone = action.completed;
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const sources: WeaveSource[] = action.cited_sources || [];

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
      isDone
        ? 'bg-primary/5 border-primary/15'
        : 'bg-card/95 backdrop-blur-sm border-border/40 shadow-lg'
    }`}>
      {/* The action */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-3">
          {action.pillar && (
            <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
              {action.pillar}
            </span>
          )}
          {action.description && (
            <span className="text-[11px] text-muted-foreground/30">{action.description}</span>
          )}
        </div>

        <p className={`text-[17px] leading-relaxed ${
          isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 font-medium'
        }`}>
          {action.one_thing}
        </p>
      </div>

      {/* Weave threads — the WHY, shown visually */}
      {!isDone && sources.length > 0 && (
        <div className="px-6 pb-4">
          {/* Visual connection line */}
          <div className="relative pl-4 border-l border-dashed border-primary/10 space-y-2">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/25 mb-2 -ml-4 pl-4">
              woven from
            </p>
            {sources.map((source, i) => {
              const style = sourceStyles[source.type] || sourceStyles.capture;
              const isExpanded = expandedSource === i;
              return (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  onClick={() => setExpandedSource(isExpanded ? null : i)}
                  className="block w-full text-left"
                >
                  {/* The thread node */}
                  <div className="relative">
                    {/* Connector dot on the dashed line */}
                    <div className={`absolute -left-[21px] top-2.5 w-[9px] h-[9px] rounded-full border ${style.bg}`} />
                    
                    <div className={`rounded-lg border px-3 py-2 transition-all ${style.bg} ${
                      isExpanded ? 'ring-1 ring-primary/10' : ''
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${style.color}`}>{style.icon}</span>
                        <span className={`text-[12px] font-medium ${style.color}`}>
                          {source.label}
                        </span>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="text-[11px] text-muted-foreground/50 mt-1.5 leading-relaxed overflow-hidden"
                          >
                            {source.detail}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Impact line */}
      {!isDone && action.impact_description && (
        <div className="px-6 pb-4">
          <p className="text-[11px] text-primary/35 leading-relaxed">
            → {action.impact_description}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 pb-5">
        {!isDone ? (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(action); }}
              className="flex-1 h-10 rounded-xl bg-primary/10 text-primary text-[13px] font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(action); }}
              className="h-10 px-5 rounded-xl text-[13px] text-muted-foreground/30 hover:text-muted-foreground/50 hover:bg-muted/30 transition-colors"
            >
              pass
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 justify-center text-primary/50">
            <Check className="h-4 w-4" />
            <span className="text-[13px] font-medium">Completed</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ===== GEM CARD ===== */

const WeaveGemCard = ({ gem, context }: { gem: ForgottenGem; context?: string | null }) => (
  <div className="rounded-2xl bg-amber-500/[0.04] border border-amber-500/15 p-6">
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5 text-amber-500/50" />
        <span className="text-[11px] font-medium text-amber-500/50 uppercase tracking-wider">
          {gem.age_days}d ago
        </span>
      </div>
      <p className="text-[17px] text-foreground/75 font-medium leading-relaxed">
        {gem.title}
      </p>
      <p className="text-[13px] text-muted-foreground/45 leading-relaxed">
        {gem.content}
      </p>
      {context && (
        <div className="pt-2 mt-2 border-t border-amber-500/10">
          <p className="text-[11px] text-amber-600/40 dark:text-amber-400/40 leading-relaxed">
            {context}
          </p>
        </div>
      )}
    </div>
  </div>
);

export default Dashboard;
