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
  const completedCount = actions.filter(a => a.completed).length;

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto px-5 py-8 animate-fade-in overflow-x-hidden w-full">
      {user && isEvening() && committedActions.length > 0 && (
        <EveningClose userId={user.id} committedActions={committedActions} briefId={brief?.id} />
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center py-20">
            <WeaveLoader size="lg" text={
              getTimePhase() === 'morning' ? "Preparing your morning brief..." :
              getTimePhase() === 'afternoon' ? "Loading your brief..." :
              "Pulling today together..."
            } />
          </motion.div>
        ) : (
          <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">

            {/* Date — small, quiet anchor */}
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-10">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* ===== THE WEAVE — one continuous narrative ===== */}
            <div className="space-y-0">

              {/* What Shifted — opens the narrative */}
              {brief?.what_shifted && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="pb-10"
                >
                  <p className="text-[15px] text-foreground/70 leading-[1.8] font-light">
                    {brief.what_shifted}
                  </p>
                </motion.div>
              )}

              {/* Actions — woven as a continuous thread */}
              {actions.length > 0 && (
                <div className="relative">
                  {/* The thread line connecting actions */}
                  <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />

                  <div className="space-y-0">
                    {actions.map((action, idx) => {
                      const isDone = action.completed;

                      return (
                        <motion.div
                          key={action.id || idx}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: isDone ? 0.5 : 1, x: 0 }}
                          transition={{ delay: 0.15 + idx * 0.08 }}
                          className="relative pl-9 py-4 group"
                        >
                          {/* Thread node */}
                          <div className={`absolute left-0 top-[22px] w-[23px] h-[23px] rounded-full flex items-center justify-center transition-all duration-300 ${
                            isDone
                              ? 'bg-primary/15 text-primary'
                              : 'bg-background border border-border/60 text-muted-foreground/40 group-hover:border-primary/30 group-hover:text-primary/60'
                          }`}>
                            {isDone ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            )}
                          </div>

                          {/* Action content */}
                          <div className="space-y-1">
                            {action.pillar && (
                              <span className="text-[10px] font-medium text-muted-foreground/30 uppercase tracking-wider">
                                {action.pillar}
                                {action.description && <span className="ml-2 normal-case tracking-normal">· {action.description}</span>}
                              </span>
                            )}

                            <p className={`text-[15px] leading-relaxed ${
                              isDone
                                ? 'line-through text-muted-foreground/40'
                                : 'text-foreground/90'
                            }`}>
                              {action.one_thing}
                            </p>

                            {!isDone && action.why_matters && (
                              <p className="text-[13px] text-muted-foreground/45 leading-relaxed">
                                {action.why_matters}
                              </p>
                            )}

                            {!isDone && action.impact_description && (
                              <p className="text-[12px] text-primary/35 leading-relaxed">
                                → {action.impact_description}
                              </p>
                            )}

                            {!isDone && (
                              <div className="flex items-center gap-3 pt-0.5">
                                <button
                                  onClick={() => handleCompleteAction(action)}
                                  className="text-[12px] font-medium text-primary/60 hover:text-primary transition-colors"
                                >
                                  done
                                </button>
                                <button
                                  onClick={() => handleSkipAction(action)}
                                  className="text-[12px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
                                >
                                  skip
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Completion whisper */}
                  {completedCount > 0 && completedCount === actions.length && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="pl-9 pt-2 text-[12px] text-primary/40 italic"
                    >
                      All done for today.
                    </motion.p>
                  )}
                </div>
              )}

              {/* Forgotten Gem — woven into the thread naturally */}
              {forgottenGem && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="pt-10 pb-6"
                >
                  <div className="pl-4 border-l-2 border-amber-500/15 space-y-1.5">
                    <p className="text-[11px] text-amber-500/40 font-medium flex items-center gap-1.5">
                      <Gift className="h-3 w-3" />
                      {forgottenGem.age_days} days ago
                    </p>
                    <p className="text-[14px] text-foreground/70 leading-relaxed">
                      {forgottenGem.title}
                    </p>
                    <p className="text-[13px] text-muted-foreground/40 leading-relaxed line-clamp-2">
                      {forgottenGem.content}
                    </p>
                    {forgottenGem.why_now && (
                      <p className="text-[12px] text-amber-600/35 dark:text-amber-400/35 italic pt-0.5">
                        {forgottenGem.why_now}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* ===== BOTTOM — quiet utilities ===== */}
            <div className="mt-12 space-y-4 pb-8">
              <button onClick={handleNextRep} disabled={isGettingRep} className="w-full group text-left">
                <div className="flex items-center gap-3">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
                  <span className="text-[13px] text-muted-foreground/35 group-hover:text-muted-foreground/60 transition-colors">
                    {isGettingRep ? "Finding your next move..." : "Stuck? Next rep"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/15 group-hover:text-primary/30 group-hover:translate-x-0.5 transition-all ml-auto" />
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
                className="flex items-center gap-2 text-[11px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
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

export default Dashboard;
