import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Zap, RefreshCw, Gift, ArrowRight, ArrowLeft, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
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

type WeaveNode =
  | { type: 'narrative'; text: string }
  | { type: 'action'; action: BriefAction; index: number }
  | { type: 'gem'; gem: ForgottenGem };

const SWIPE_THRESHOLD = 50;

const Dashboard = () => {
  const { user } = useAuth();
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [actions, setActions] = useState<BriefAction[]>([]);
  const [forgottenGem, setForgottenGem] = useState<ForgottenGem | null>(null);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const hasLoaded = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 left, 1 right

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
      // Auto-advance to next node after completing
      if (activeIndex < weaveNodes.length - 1) {
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

  const committedActions = actions;

  // Build weave stream
  const weaveNodes: WeaveNode[] = [];
  if (brief?.what_shifted) {
    weaveNodes.push({ type: 'narrative', text: brief.what_shifted });
  }
  actions.forEach((action, i) => {
    weaveNodes.push({ type: 'action', action, index: i });
  });
  if (forgottenGem) {
    // Insert gem after 2nd action or at end
    const gemPos = Math.min(3, weaveNodes.length);
    weaveNodes.splice(gemPos, 0, { type: 'gem', gem: forgottenGem });
  }

  const navigate = (dir: number) => {
    const next = activeIndex + dir;
    if (next < 0 || next >= weaveNodes.length) return;
    setDirection(dir);
    setActiveIndex(next);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD && activeIndex < weaveNodes.length - 1) {
      navigate(1);
    } else if (info.offset.x > SWIPE_THRESHOLD && activeIndex > 0) {
      navigate(-1);
    }
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, weaveNodes.length]);

  const currentNode = weaveNodes[activeIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.92,
      rotateY: dir > 0 ? 8 : -8,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      rotateY: 0,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
      scale: 0.92,
      rotateY: dir > 0 ? -8 : 8,
    }),
  };

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
        ) : weaveNodes.length === 0 ? (
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

            {/* Date + progress */}
            <div className="text-center mb-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/35 mb-4">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>

              {/* Weave progress dots */}
              <div className="flex items-center justify-center gap-1.5">
                {weaveNodes.map((node, i) => (
                  <button
                    key={i}
                    onClick={() => { setDirection(i > activeIndex ? 1 : -1); setActiveIndex(i); }}
                    className="group relative"
                  >
                    <div className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === activeIndex
                        ? 'w-8 bg-primary/60'
                        : i < activeIndex
                          ? 'w-1.5 bg-primary/25'
                          : 'w-1.5 bg-muted-foreground/15'
                    }`} />
                    {/* Type hint on hover */}
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {node.type === 'narrative' ? 'brief' : node.type === 'gem' ? 'gem' : `action ${(node as any).index + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ===== THE WEAVE CARD — one at a time, swipeable ===== */}
            <div className="flex-1 flex items-center justify-center relative" style={{ perspective: '1200px' }}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={activeIndex}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.15}
                  onDragEnd={handleDragEnd}
                  className="w-full cursor-grab active:cursor-grabbing"
                >
                  {currentNode?.type === 'narrative' && (
                    <NarrativeCard text={currentNode.text} />
                  )}
                  {currentNode?.type === 'action' && (
                    <ActionCard
                      action={currentNode.action}
                      onComplete={handleCompleteAction}
                      onSkip={handleSkipAction}
                    />
                  )}
                  {currentNode?.type === 'gem' && (
                    <GemCard gem={currentNode.gem} />
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Nav arrows — sides */}
              {activeIndex > 0 && (
                <button
                  onClick={() => navigate(-1)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/20 hover:text-muted-foreground/50 hover:bg-muted/30 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {activeIndex < weaveNodes.length - 1 && (
                <button
                  onClick={() => navigate(1)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/20 hover:text-muted-foreground/50 hover:bg-muted/30 transition-all"
                >
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

/* ===== WEAVE CARD COMPONENTS ===== */

const NarrativeCard = ({ text }: { text: string }) => (
  <div className="rounded-2xl bg-card/90 backdrop-blur-sm border border-border/40 p-7 shadow-lg min-h-[200px] flex items-center">
    <p className="text-[15px] text-foreground/70 leading-[1.85] font-light">
      {text}
    </p>
  </div>
);

const ActionCard = ({
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
    <div className={`rounded-2xl border p-7 min-h-[200px] flex flex-col justify-between transition-all duration-300 ${
      isDone
        ? 'bg-primary/5 border-primary/15'
        : 'bg-card/90 backdrop-blur-sm border-border/40 shadow-lg'
    }`}>
      <div className="space-y-3 flex-1">
        <div className="flex items-center justify-between">
          {action.pillar && (
            <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
              {action.pillar}
            </span>
          )}
          {action.description && (
            <span className="text-[11px] text-muted-foreground/30">
              {action.description}
            </span>
          )}
        </div>

        <p className={`text-[17px] leading-relaxed ${
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
          <p className="text-[12px] text-primary/35 leading-relaxed">
            → {action.impact_description}
          </p>
        )}
      </div>

      <div className="pt-5">
        {!isDone ? (
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(action); }}
              className="flex-1 h-11 rounded-xl bg-primary/10 text-primary text-[13px] font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(action); }}
              className="h-11 px-5 rounded-xl text-[13px] text-muted-foreground/30 hover:text-muted-foreground/50 hover:bg-muted/30 transition-colors"
            >
              skip
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

const GemCard = ({ gem }: { gem: ForgottenGem }) => (
  <div className="rounded-2xl bg-amber-500/[0.04] border border-amber-500/15 p-7 min-h-[200px] flex flex-col justify-center">
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5 text-amber-500/50" />
        <span className="text-[11px] font-medium text-amber-500/50 uppercase tracking-wider">
          Forgotten gem · {gem.age_days}d ago
        </span>
      </div>
      <p className="text-[17px] text-foreground/75 font-medium leading-relaxed">
        {gem.title}
      </p>
      <p className="text-[13px] text-muted-foreground/45 leading-relaxed">
        {gem.content}
      </p>
      {gem.why_now && (
        <p className="text-[12px] text-amber-600/40 dark:text-amber-400/40 italic pt-1">
          {gem.why_now}
        </p>
      )}
    </div>
  </div>
);

export default Dashboard;
