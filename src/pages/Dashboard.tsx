import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Zap, RefreshCw, Gift, ChevronRight, ChevronLeft, Plus, X, Send, Mic, MicOff, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { EveningClose } from "@/components/dashboard/EveningClose";
import { Confetti, useConfetti } from "@/components/ui/confetti";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

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

const sourceStyles: Record<string, { color: string; bg: string; icon: string }> = {
  capture: { color: 'text-blue-500/70', bg: 'bg-blue-500/8 border-blue-500/15', icon: '◆' },
  pattern: { color: 'text-violet-500/70', bg: 'bg-violet-500/8 border-violet-500/15', icon: '◎' },
  goal: { color: 'text-emerald-500/70', bg: 'bg-emerald-500/8 border-emerald-500/15', icon: '▲' },
  journal: { color: 'text-amber-500/70', bg: 'bg-amber-500/8 border-amber-500/15', icon: '●' },
  gem: { color: 'text-amber-500/70', bg: 'bg-amber-500/8 border-amber-500/15', icon: '✦' },
  experiment: { color: 'text-rose-500/70', bg: 'bg-rose-500/8 border-rose-500/15', icon: '◇' },
  gap: { color: 'text-orange-500/70', bg: 'bg-orange-500/8 border-orange-500/15', icon: '○' },
};

// Auto-detect pillar from text
const detectPillar = (text: string): string => {
  const lower = text.toLowerCase();
  if (/push.?up|squat|meal|eat|gym|run|walk|exercise|health|sleep|water|lift|weight|chest|arm|leg|protein|grocer|workout/i.test(lower)) return 'Health';
  if (/apply|job|interview|resume|career|linkedin|follow.?up|handshake|trader|gig|hire|sales|client|invoice|contract|dilata|uptat|upath/i.test(lower)) return 'Stability';
  if (/post|content|write|blog|twitter|brand|tiktok|instagram|x\.com|comment|respond.*comment/i.test(lower)) return 'Content';
  if (/learn|read|book|course|study|script|episode|figure out|opportunity|finder|experiment/i.test(lower)) return 'Skill';
  if (/clean|organize|laundry|dishes|errands|admin|sheets|sweep|url|update.*for.*dad|update.*site/i.test(lower)) return 'Admin';
  if (/meditat|journal|reflect|present|breath|ground|chess|fun|play|movie|film/i.test(lower)) return 'Presence';
  if (/friend|family|call|meet|connect|relationship|lunch|dinner|mom|dad|hang|arley|augie/i.test(lower)) return 'Connection';
  return 'Admin';
};

const getLocalToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

  // Big Move state
  const [isGettingBigMove, setIsGettingBigMove] = useState(false);
  const [bigMove, setBigMove] = useState<any>(null);
  const [showBigMoveDialog, setShowBigMoveDialog] = useState(false);

  // Propulsion state
  const [streak, setStreak] = useState(0);
  const [todayCompleted, setTodayCompleted] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [isAddingTasks, setIsAddingTasks] = useState(false);

  // Voice capture for quick add
  const { isRecording: qaRecording, isTranscribing: qaTranscribing, toggleRecording: qaToggleRecording } = useVoiceCapture({
    onTranscript: (text) => {
      setQuickAddText(prev => prev ? `${prev}\n${text}` : text);
      toast.success("Voice captured");
    },
  });

  const { showConfetti, celebrate, handleComplete: handleConfettiComplete } = useConfetti();

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

  const fetchPropulsionData = useCallback(async () => {
    if (!user) return;
    try {
      const today = getLocalToday();
      
      // Get today's tasks for progress
      const { data: todayTasks } = await supabase
        .from("daily_tasks")
        .select("completed")
        .eq("user_id", user.id)
        .eq("task_date", today);

      if (todayTasks) {
        setTodayTotal(todayTasks.length);
        setTodayCompleted(todayTasks.filter(t => t.completed).length);
      }

      // Calculate streak from action_history
      const { data: recentDays } = await supabase
        .from("action_history")
        .select("action_date")
        .eq("user_id", user.id)
        .order("action_date", { ascending: false })
        .limit(60);

      if (recentDays) {
        const uniqueDates = [...new Set(recentDays.map(d => d.action_date))].sort().reverse();
        let s = 0;
        const todayDate = new Date();
        for (let i = 0; i < uniqueDates.length; i++) {
          const expected = new Date(todayDate);
          expected.setDate(expected.getDate() - i);
          const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
          if (uniqueDates[i] === expectedStr) {
            s++;
          } else if (i === 0 && uniqueDates[0] !== expectedStr) {
            // Today hasn't been completed yet, check from yesterday
            expected.setDate(expected.getDate() - 1);
            const yesterdayStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
            if (uniqueDates[0] === yesterdayStr) {
              s++;
            } else break;
          } else break;
        }
        setStreak(s);
      }
    } catch (e) {
      console.error("Propulsion fetch error:", e);
    }
  }, [user]);

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
    fetchPropulsionData();
  }, [user, fetchBrief, fetchPropulsionData]);

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
      
      // Update propulsion
      setTodayCompleted(prev => prev + 1);
      
      // Check if all done → celebrate
      const newCompleted = todayCompleted + 1;
      if (newCompleted >= todayTotal && todayTotal > 0) {
        celebrate();
        toast.success("All done! 🎯");
      } else {
        toast.success("Done!");
      }
      
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
      setTodayTotal(prev => Math.max(0, prev - 1));
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

  const handleBigMove = async () => {
    setIsGettingBigMove(true);
    try {
      const { data, error } = await supabase.functions.invoke("big-move", { body: {} });
      if (error) throw error;
      if (data) { setBigMove(data); setShowBigMoveDialog(true); }
    } catch (error: any) {
      toast.error(error.message || "Failed to find your big move");
    } finally {
      setIsGettingBigMove(false);
    }
  };

  // Quick add: parse multi-line or numbered input into tasks
  const handleQuickAdd = async () => {
    if (!user || !quickAddText.trim()) return;
    setIsAddingTasks(true);
    try {
      const today = getLocalToday();
      // Split by newlines, numbered items, or semicolons
      const lines = quickAddText
        .split(/\n|(?:\d+[\.\)]\s*)/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const newTasks: BriefAction[] = [];
      const currentSeq = actions.length;

      for (let i = 0; i < lines.length; i++) {
        const pillar = detectPillar(lines[i]);
        const { data, error } = await supabase.from("daily_tasks").insert({
          user_id: user.id,
          title: lines[i],
          one_thing: lines[i],
          task_date: today,
          completed: false,
          pillar,
          task_sequence: currentSeq + i + 1,
          priority: 'HIGH',
        } as any).select().single();

        if (!error && data) {
          newTasks.push({
            id: data.id,
            one_thing: lines[i],
            why_matters: '',
            pillar,
            description: '',
            completed: false,
            task_sequence: currentSeq + i + 1,
          });
        }
      }

      if (newTasks.length > 0) {
        // Prepend user tasks so they appear first in the deck
        setActions(prev => [...newTasks, ...prev]);
        setTodayTotal(prev => prev + newTasks.length);
        setActiveIndex(0); // Jump to first new task
        toast.success(`Added ${newTasks.length} task${newTasks.length > 1 ? 's' : ''}`);
        setQuickAddText("");
        setShowQuickAdd(false);
      }
    } catch (error: any) {
      toast.error("Failed to add tasks");
      console.error(error);
    } finally {
      setIsAddingTasks(false);
    }
  };

  // Build nodes — user-added tasks first, then AI-generated
  const sortedActions = [...actions].sort((a, b) => {
    const aIsUser = !a.action_type;
    const bIsUser = !b.action_type;
    if (aIsUser && !bIsUser) return -1;
    if (!aIsUser && bIsUser) return 1;
    return (a.task_sequence || 0) - (b.task_sequence || 0);
  });
  const nodes: Array<{ type: 'action'; action: BriefAction } | { type: 'gem'; gem: ForgottenGem }> = [];
  sortedActions.forEach((action) => {
    nodes.push({ type: 'action', action });
  });
  if (forgottenGem) {
    // Place gem after user tasks but before AI tasks
    const firstAiIndex = sortedActions.findIndex(a => !!a.action_type);
    const gemPos = firstAiIndex >= 0 ? firstAiIndex : nodes.length;
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
  const todayProgress = todayTotal > 0 ? (todayCompleted / todayTotal) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-6 animate-fade-in overflow-hidden w-full">
      <Confetti show={showConfetti} onComplete={handleConfettiComplete} />
      
      {user && isEvening() && committedActions.length > 0 && (
        <EveningClose userId={user.id} committedActions={committedActions} briefId={brief?.id} />
      )}

      {/* ===== PROPULSION STRIP ===== */}
      {!isLoading && todayTotal > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <div className="flex items-center gap-3">
            {/* Streak */}
            {streak > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground/40 tabular-nums">{streak}d</span>
            )}

            {/* Progress bar */}
            <div className="flex-1 relative">
              <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary/40"
                  initial={{ width: 0 }}
                  animate={{ width: `${todayProgress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Count */}
            <span className="text-[11px] text-muted-foreground/30 tabular-nums">
              {todayCompleted}/{todayTotal}
            </span>

            {/* Quick add button */}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/25 hover:text-primary/50 hover:bg-primary/5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ===== QUICK ADD PANEL ===== */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="rounded-xl border border-border/30 bg-card/80 backdrop-blur-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] text-muted-foreground/50">
                  Add tasks — one per line or numbered
                </span>
                <button
                  onClick={() => setShowQuickAdd(false)}
                  className="text-muted-foreground/25 hover:text-muted-foreground/50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative">
                <textarea
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  placeholder={`1. Complete project report\n2. Go for a 30min walk\n3. Read 20 pages`}
                  className="w-full bg-transparent text-sm text-foreground/80 placeholder:text-muted-foreground/20 resize-none outline-none min-h-[100px] leading-relaxed pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={qaToggleRecording}
                  disabled={qaTranscribing}
                  className={`absolute right-0 bottom-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    qaRecording
                      ? 'bg-destructive text-destructive-foreground animate-pulse'
                      : qaTranscribing
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                  aria-label={qaRecording ? "Stop recording" : "Voice add tasks"}
                  title={qaRecording ? "Stop recording" : "Speak your tasks"}
                >
                  {qaTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : qaRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              </div>
              {qaRecording && (
                <p className="text-[10px] text-destructive animate-pulse mt-1">Recording... tap mic to stop</p>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-muted-foreground/25">
                  {quickAddText.split(/\n|(?:\d+[\.\)]\s*)/).filter(l => l.trim()).length} task(s) detected
                </span>
                <button
                  onClick={handleQuickAdd}
                  disabled={isAddingTasks || !quickAddText.trim() || qaRecording || qaTranscribing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-30"
                >
                  <Send className="h-3 w-3" />
                  {isAddingTasks ? "Adding..." : "Add to today"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <div className="text-center space-y-4">
              <p className="text-muted-foreground/50 text-sm">Nothing woven yet today.</p>
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => { hasLoaded.current = false; fetchBrief(); }}
                  className="text-sm text-primary/60 hover:text-primary transition-colors"
                >
                  Generate brief
                </button>
                <button
                  onClick={() => setShowQuickAdd(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add your own tasks
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="weave" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {nodes.map((node, i) => {
                const isDone = node.type === 'action' && node.action.completed;
                return (
                  <button
                    key={i}
                    onClick={() => { setDirection(i > activeIndex ? 1 : -1); setActiveIndex(i); }}
                    className="relative"
                  >
                    <div className={`rounded-full transition-all duration-500 ${
                      i === activeIndex
                        ? 'w-7 h-2 bg-primary/50'
                        : isDone
                          ? 'w-2 h-2 bg-primary/35'
                          : i < activeIndex
                            ? 'w-2 h-2 bg-primary/20'
                            : 'w-2 h-2 bg-muted-foreground/10'
                    }`} />
                    {isDone && i !== activeIndex && (
                      <Check className="absolute -top-1 -right-1 h-2 w-2 text-primary/50" />
                    )}
                  </button>
                );
              })}
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
            <div className="mt-6 flex items-center justify-between pb-4 gap-3">
              <div className="flex items-center gap-4">
                <button onClick={handleNextRep} disabled={isGettingRep} className="group flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
                  <span className="text-[12px] text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                    {isGettingRep ? "Finding..." : "Next rep"}
                  </span>
                </button>

                <button onClick={handleBigMove} disabled={isGettingBigMove} className="group flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-primary/40 group-hover:text-primary transition-colors" />
                  <span className="text-[12px] text-primary/50 group-hover:text-primary font-medium transition-colors">
                    {isGettingBigMove ? "Aligning..." : "Big Move"}
                  </span>
                </button>
              </div>

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

      {/* Big Move Dialog — the ONE thing toward Misogi/2026 */}
      <Dialog open={showBigMoveDialog} onOpenChange={setShowBigMoveDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-primary/30 bg-gradient-to-br from-card via-card to-primary/5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-display">
              <Target className="h-4 w-4 text-primary" />
              Big Move
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              The ONE thing toward your 2026
            </DialogDescription>
          </DialogHeader>
          {bigMove && (
            <div className="space-y-4 pt-2">
              <p className="text-base font-display font-semibold leading-snug text-primary">
                {bigMove.headline}
              </p>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-[10px] uppercase tracking-wider text-primary/60 mb-1">The move</p>
                <p className="text-sm leading-relaxed">{bigMove.the_move}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Why this</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{bigMove.why_this}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vision link</p>
                <p className="text-sm italic text-foreground/80">{bigMove.vision_link}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
                <span>{bigMove.time}</span>
                <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary font-medium">Consistency</span>
              </div>
              <p className="text-xs text-muted-foreground italic">{bigMove.consistency}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowBigMoveDialog(false)}
                  className="flex-1 h-11 rounded-2xl"
                >
                  Later
                </Button>
                <Button
                  onClick={async () => {
                    if (!user || !bigMove?.the_move) { setShowBigMoveDialog(false); return; }
                    setShowBigMoveDialog(false);
                    setQuickAddText(prev => prev ? `${prev}\n${bigMove.the_move}` : bigMove.the_move);
                    setShowQuickAdd(true);
                    toast.success("Added to today's tasks — review and tap Add");
                  }}
                  className="flex-1 h-11 rounded-2xl"
                >
                  I'll do this
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ===== WEAVE ACTION CARD ===== */

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
  const [showSources, setShowSources] = useState(false);
  const sources: WeaveSource[] = action.cited_sources || [];

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${
      isDone
        ? 'bg-primary/5 border-primary/15'
        : 'bg-card/95 backdrop-blur-sm border-border/30'
    }`}>
      <div className="p-7">
        {/* Pillar label */}
        {action.pillar && (
          <span className="text-[10px] font-medium text-muted-foreground/35 uppercase tracking-widest">
            {action.pillar}
          </span>
        )}

        {/* The action text */}
        <p className={`mt-3 text-lg leading-relaxed ${
          isDone ? 'line-through text-muted-foreground/30' : 'text-foreground/85 font-medium'
        }`}>
          {action.one_thing}
        </p>

        {/* Impact */}
        {!isDone && action.impact_description && (
          <p className="mt-3 text-[12px] text-muted-foreground/30 leading-relaxed">
            {action.impact_description}
          </p>
        )}

        {/* Source threads */}
        {!isDone && sources.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-2 group"
            >
              <div className="flex items-center -space-x-1">
                {sources.map((s, i) => {
                  const style = sourceStyles[s.type] || sourceStyles.capture;
                  return (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 border-card flex items-center justify-center text-[7px] ${style.bg} ${style.color}`}
                    >
                      {style.icon}
                    </div>
                  );
                })}
              </div>
              <span className="text-[11px] text-muted-foreground/25 group-hover:text-muted-foreground/45 transition-colors">
                {showSources ? 'hide' : `${sources.length} threads`}
              </span>
            </button>

            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-1.5">
                    {sources.map((source, i) => {
                      const style = sourceStyles[source.type] || sourceStyles.capture;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`rounded-lg px-3 py-2 ${style.bg}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] ${style.color}`}>{style.icon}</span>
                            <span className={`text-[11px] font-medium ${style.color}`}>{source.label}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/35 mt-0.5 leading-relaxed">
                            {source.detail}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-7 pb-6">
        {!isDone ? (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(action); }}
              className="flex-1 h-11 rounded-xl bg-primary/8 text-primary text-[13px] font-medium hover:bg-primary/15 transition-colors flex items-center justify-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(action); }}
              className="h-11 px-5 rounded-xl text-[13px] text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors"
            >
              pass
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 justify-center text-primary/40">
            <Check className="h-4 w-4" />
            <span className="text-[13px]">Done</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ===== GEM CARD ===== */

const WeaveGemCard = ({ gem, context }: { gem: ForgottenGem; context?: string | null }) => (
  <div className="rounded-2xl border border-amber-500/10 p-7">
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5 text-amber-500/40" />
        <span className="text-[10px] font-medium text-amber-500/40 uppercase tracking-widest">
          {gem.age_days}d ago
        </span>
      </div>
      <p className="text-lg text-foreground/70 font-medium leading-relaxed">
        {gem.title}
      </p>
      <p className="text-[13px] text-muted-foreground/35 leading-relaxed">
        {gem.content}
      </p>
      {context && (
        <p className="text-[11px] text-amber-500/25 leading-relaxed pt-2 border-t border-amber-500/8">
          {context}
        </p>
      )}
    </div>
  </div>
);

export default Dashboard;
