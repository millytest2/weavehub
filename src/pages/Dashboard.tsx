import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Zap, RefreshCw, Clock, Sparkles, ArrowRight, Gift, Target, TrendingUp, BarChart3 } from "lucide-react";
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

  // Next Best Rep
  const [isGettingRep, setIsGettingRep] = useState(false);
  const [nextRep, setNextRep] = useState<any>(null);
  const [showRepDialog, setShowRepDialog] = useState(false);

  const getLocalToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

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
      await supabase
        .from("daily_tasks")
        .update({ completed: true })
        .eq("id", action.id);

      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, completed: true } : a
      ));

      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'complete',
        pillar: action.pillar
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
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'skip',
        pillar: action.pillar
      });
    } catch (error: any) {
      console.error("Skip error:", error);
    }
  };

  const handleNextRep = async () => {
    setIsGettingRep(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("next-rep", {
        body: { timezone }
      });
      if (error) throw error;
      if (data) {
        setNextRep(data);
        setShowRepDialog(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to get rep");
    } finally {
      setIsGettingRep(false);
    }
  };

  const completedCount = actions.filter(a => a.completed).length;
  const totalActions = actions.length;
  const committedActions = actions; // all actions are "committed" now — no credit gate

  const getActionIcon = (type?: string) => {
    switch (type) {
      case 'goal_gap': return <Target className="h-3.5 w-3.5" />;
      case 'domain_balance': return <BarChart3 className="h-3.5 w-3.5" />;
      case 'capture_test': return <TrendingUp className="h-3.5 w-3.5" />;
      default: return <Sparkles className="h-3.5 w-3.5" />;
    }
  };

  const getActionLabel = (type?: string) => {
    switch (type) {
      case 'goal_gap': return 'Goal gap';
      case 'domain_balance': return 'Balance';
      case 'capture_test': return 'Apply learning';
      case 'bonus': return 'Bonus';
      default: return 'Action';
    }
  };

  const greeting = () => {
    const phase = getTimePhase();
    const name = userName ? `, ${userName.split(' ')[0]}` : '';
    if (phase === 'morning') return `Good morning${name}`;
    if (phase === 'afternoon') return `Good afternoon${name}`;
    if (phase === 'evening') return `Good evening${name}`;
    return `Hey${name}`;
  };

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto px-4 py-6 animate-fade-in overflow-x-hidden w-full">
      {/* Evening Close */}
      {user && isEvening() && committedActions.length > 0 && (
        <EveningClose
          userId={user.id}
          committedActions={committedActions}
          briefId={brief?.id}
        />
      )}

      <div className="flex-1 space-y-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-20"
            >
              <WeaveLoader size="lg" text={
                getTimePhase() === 'morning' ? "Preparing your morning brief..." :
                getTimePhase() === 'afternoon' ? "Loading your brief..." :
                "Pulling today together..."
              } />
            </motion.div>
          ) : (
            <motion.div
              key="brief"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* ===== HEADER ===== */}
              <div>
                <h1 className="text-3xl font-display font-semibold tracking-tight">
                  {greeting()}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* ===== WHAT SHIFTED ===== */}
              {brief?.what_shifted && (
                <section className="space-y-2">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    What shifted
                  </h2>
                  <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                    {brief.what_shifted}
                  </div>
                </section>
              )}

              {/* ===== DIVIDER ===== */}
              {brief?.what_shifted && actions.length > 0 && (
                <div className="h-px bg-border/40" />
              )}

              {/* ===== TODAY'S ACTIONS ===== */}
              {actions.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                      Today's actions
                    </h2>
                    {completedCount > 0 && (
                      <span className="text-xs text-primary/70 font-medium">
                        {completedCount}/{totalActions} done
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {actions.map((action, idx) => {
                      const isDone = action.completed;

                      return (
                        <motion.div
                          key={action.id || idx}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.08 }}
                          className={`group rounded-2xl border transition-all ${
                            isDone
                              ? 'border-primary/20 bg-primary/[0.03]'
                              : 'border-border/40 bg-card hover:border-border/60'
                          }`}
                        >
                          <div className="p-4 space-y-2.5">
                            {/* Type + time row */}
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                                {getActionIcon(action.action_type)}
                                {getActionLabel(action.action_type)}
                                {action.pillar && (
                                  <>
                                    <span className="text-border">·</span>
                                    {action.pillar}
                                  </>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                {action.description && (
                                  <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    {action.description}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action text */}
                            <p className={`text-[15px] font-medium leading-snug ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {action.one_thing}
                            </p>

                            {/* Why */}
                            {action.why_matters && !isDone && (
                              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                                {action.why_matters}
                              </p>
                            )}

                            {/* Impact */}
                            {action.impact_description && !isDone && (
                              <p className="text-xs text-primary/50 leading-relaxed">
                                → {action.impact_description}
                              </p>
                            )}

                            {/* Actions row */}
                            {!isDone && (
                              <div className="flex items-center gap-2 pt-1">
                                <Button
                                  onClick={() => handleCompleteAction(action)}
                                  size="sm"
                                  className="h-8 rounded-xl text-xs font-medium px-4"
                                >
                                  <Check className="mr-1.5 h-3 w-3" />
                                  Done
                                </Button>
                                <button
                                  onClick={() => handleSkipAction(action)}
                                  className="text-[11px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors px-2 py-1"
                                >
                                  skip
                                </button>
                              </div>
                            )}

                            {isDone && (
                              <div className="flex items-center gap-1.5 text-xs text-primary/60">
                                <Check className="h-3 w-3" />
                                Completed
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ===== FORGOTTEN GEM ===== */}
              {forgottenGem && (
                <>
                  <div className="h-px bg-border/40" />
                  <section className="space-y-2">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                      <Gift className="h-3 w-3 text-amber-500/60" />
                      Forgotten gem
                      <span className="text-muted-foreground/30 ml-auto font-normal normal-case tracking-normal">
                        {forgottenGem.age_days}d ago
                      </span>
                    </h2>
                    <div className="rounded-2xl border border-border/30 bg-card p-4 space-y-2">
                      <p className="text-sm font-medium text-foreground/90">
                        {forgottenGem.title}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {forgottenGem.content}
                      </p>
                      {forgottenGem.why_now && (
                        <p className="text-xs text-amber-600/60 dark:text-amber-400/60 italic">
                          {forgottenGem.why_now}
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}

              {/* ===== DIVIDER ===== */}
              <div className="h-px bg-border/40" />

              {/* ===== STUCK? ===== */}
              <button
                onClick={handleNextRep}
                disabled={isGettingRep}
                className="w-full group text-left"
              >
                <div className="flex items-center gap-4 py-3 hover:opacity-80 transition-opacity">
                  <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {isGettingRep ? "Finding your next move..." : "Stuck? Next Rep"}
                    </p>
                    <p className="text-xs text-muted-foreground/50">
                      One aligned action, right now
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </button>

              {/* Regenerate */}
              <div className="flex justify-center pt-2 pb-6">
                <button
                  onClick={() => {
                    hasLoaded.current = false;
                    if (brief?.id) {
                      supabase.from("daily_briefs").delete().eq("id", brief.id).then(() => {
                        supabase.from("daily_tasks").delete().eq("daily_brief_id", brief.id).then(() => {
                          fetchBrief();
                        });
                      });
                    } else {
                      fetchBrief();
                    }
                  }}
                  className="text-[11px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              <Button onClick={() => setShowRepDialog(false)} className="w-full h-12 rounded-2xl">
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
