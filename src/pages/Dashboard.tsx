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
  description: string; // time estimate
  impact_description?: string;
  action_type?: string;
  priority?: string;
  credit_cost?: number;
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
  const [credits, setCredits] = useState({ total_credits: 3, credits_spent: 0, actions_committed: [] as string[] });
  const [forgottenGem, setForgottenGem] = useState<ForgottenGem | null>(null);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState<string | null>(null);
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
        setCredits(data.credits || { total_credits: 3, credits_spent: 0, actions_committed: [] });
        setForgottenGem(data.forgotten_gem || null);
        setUserName(data.user_name || '');
      }
    } catch (error: any) {
      console.error("Brief error:", error);
      toast.error("Couldn't load your morning brief");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || hasLoaded.current) return;
    hasLoaded.current = true;
    fetchBrief();
  }, [user, fetchBrief]);

  const handleCommitCredit = async (action: BriefAction) => {
    if (!user || !action.id) return;
    if (credits.credits_spent >= credits.total_credits) {
      toast.info("All credits spent for today");
      return;
    }

    setIsCommitting(action.id);
    try {
      const today = getLocalToday();

      // Update credits
      const newSpent = credits.credits_spent + 1;
      const newCommitted = [...(credits.actions_committed || []), action.id];

      await supabase
        .from("daily_credits")
        .upsert({
          user_id: user.id,
          credit_date: today,
          total_credits: 3,
          credits_spent: newSpent,
          actions_committed: newCommitted,
        }, { onConflict: 'user_id,credit_date' });

      setCredits(prev => ({
        ...prev,
        credits_spent: newSpent,
        actions_committed: newCommitted,
      }));

      toast.success("Committed!");
    } catch (error: any) {
      console.error("Commit error:", error);
      toast.error("Failed to commit");
    } finally {
      setIsCommitting(null);
    }
  };

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

      // Track activity pattern
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

  const committedActions = actions.filter(a => (credits.actions_committed || []).includes(a.id || ''));
  const highPriorityActions = actions.filter(a => a.priority === 'HIGH');
  const bonusActions = actions.filter(a => a.priority === 'NICE_TO_HAVE');
  const completedCount = actions.filter(a => a.completed).length;
  const creditsRemaining = credits.total_credits - credits.credits_spent;

  const getActionIcon = (type?: string) => {
    switch (type) {
      case 'goal_gap': return <Target className="h-4 w-4" />;
      case 'domain_balance': return <BarChart3 className="h-4 w-4" />;
      case 'capture_test': return <TrendingUp className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
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

      <div className="flex-1 space-y-5">
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
              className="space-y-5"
            >
              {/* ===== HEADER ===== */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-display font-semibold tracking-tight">
                    {getTimePhase() === 'morning' ? 'Morning Brief' :
                     getTimePhase() === 'afternoon' ? 'Today' :
                     getTimePhase() === 'evening' ? 'Tonight' : 'Now'}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    {brief && !isLoading && ' · Generated from your data'}
                  </p>
                </div>
                {/* Credits badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-lg font-semibold text-primary">{creditsRemaining}</span>
                  <span className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">credits</span>
                </div>
              </div>

              {/* ===== WHAT SHIFTED ===== */}
              {brief?.what_shifted && (
                <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-muted/20 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary/70" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">What shifted</h2>
                  </div>
                  <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                    {brief.what_shifted}
                  </div>
                </section>
              )}

              {/* ===== RECOMMENDED ACTIONS ===== */}
              {highPriorityActions.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary/70" />
                      Today's Actions
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {credits.credits_spent}/{credits.total_credits} spent
                    </span>
                  </div>

                  {highPriorityActions.map((action, idx) => {
                    const isCommitted = (credits.actions_committed || []).includes(action.id || '');
                    const isDone = action.completed;

                    return (
                      <motion.div
                        key={action.id || idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`rounded-2xl border overflow-hidden transition-all ${
                          isDone ? 'border-primary/30 bg-primary/5' :
                          isCommitted ? 'border-primary/40 bg-gradient-to-br from-card to-primary/5' :
                          'border-border/40 bg-card'
                        }`}
                      >
                        <div className="p-5 space-y-3">
                          {/* Top row: type badge + time + skip */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-primary/8 text-primary/80">
                                {getActionIcon(action.action_type)}
                                {getActionLabel(action.action_type)}
                              </span>
                              {action.pillar && (
                                <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-lg bg-muted/50">
                                  {action.pillar}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {action.description && (
                                <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {action.description}
                                </span>
                              )}
                              {!isDone && !isCommitted && (
                                <button
                                  onClick={() => handleSkipAction(action)}
                                  className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                                >
                                  skip
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Action text */}
                          <h3 className={`text-base font-display font-semibold leading-snug ${isDone ? 'line-through opacity-60' : ''}`}>
                            {action.one_thing}
                          </h3>

                          {/* Why */}
                          {action.why_matters && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <span className="font-medium text-foreground/70">Why:</span> {action.why_matters}
                            </p>
                          )}

                          {/* Impact */}
                          {action.impact_description && (
                            <p className="text-xs text-primary/60 italic">
                              ↗ {action.impact_description}
                            </p>
                          )}

                          {/* Action buttons */}
                          {!isDone && (
                            <div className="pt-1">
                              {isCommitted ? (
                                <Button
                                  onClick={() => handleCompleteAction(action)}
                                  className="w-full h-10 rounded-xl text-sm font-medium"
                                  size="sm"
                                >
                                  Done <Check className="ml-1.5 h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleCommitCredit(action)}
                                  variant="outline"
                                  className="w-full h-10 rounded-xl text-sm font-medium border-primary/30 text-primary hover:bg-primary/5"
                                  size="sm"
                                  disabled={creditsRemaining <= 0 || isCommitting === action.id}
                                >
                                  {isCommitting === action.id ? "..." : `Spend 1 Credit`}
                                </Button>
                              )}
                            </div>
                          )}

                          {isDone && (
                            <div className="flex items-center gap-1.5 text-xs text-primary/70">
                              <Check className="h-3.5 w-3.5" />
                              <span>Completed</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </section>
              )}

              {/* ===== BONUS ACTIONS ===== */}
              {bonusActions.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Nice to have
                  </h2>
                  {bonusActions.map((action, idx) => {
                    const isCommitted = (credits.actions_committed || []).includes(action.id || '');
                    const isDone = action.completed;

                    return (
                      <div
                        key={action.id || idx}
                        className={`rounded-xl border p-4 space-y-2 ${
                          isDone ? 'border-primary/20 bg-primary/5 opacity-60' :
                          'border-border/30 bg-muted/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${isDone ? 'line-through' : ''}`}>
                            {action.one_thing}
                          </p>
                          {action.description && (
                            <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {action.description}
                            </span>
                          )}
                        </div>
                        {!isDone && !isCommitted && creditsRemaining > 0 && (
                          <Button
                            onClick={() => handleCommitCredit(action)}
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground"
                            disabled={isCommitting === action.id}
                          >
                            Spend 1 Credit
                          </Button>
                        )}
                        {isCommitted && !isDone && (
                          <Button
                            onClick={() => handleCompleteAction(action)}
                            size="sm"
                            className="h-8 text-xs rounded-lg"
                          >
                            Done <Check className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {/* ===== FORGOTTEN GEM ===== */}
              {forgottenGem && (
                <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-500/70" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">
                      Forgotten Gem
                    </h2>
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                      {forgottenGem.age_days}d ago
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground/90">
                    "{forgottenGem.title}"
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {forgottenGem.content}
                  </p>
                  {forgottenGem.why_now && (
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/70 italic">
                      Why now: {forgottenGem.why_now}
                    </p>
                  )}
                </section>
              )}

              {/* ===== ACTIVE COMMITMENTS ===== */}
              {committedActions.length > 0 && (
                <section className="rounded-2xl border border-border/30 bg-muted/10 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Your Commitments
                    </h2>
                    <span className="text-xs text-primary font-medium">
                      {credits.credits_spent}/{credits.total_credits} spent
                    </span>
                  </div>
                  <div className="space-y-2">
                    {committedActions.map((action, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm">
                        {action.completed ? (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-primary/30 shrink-0" />
                        )}
                        <span className={action.completed ? 'line-through text-muted-foreground' : ''}>
                          {action.one_thing}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ===== NEED A RESET ===== */}
              <button
                onClick={handleNextRep}
                disabled={isGettingRep}
                className="w-full group text-left"
              >
                <div className="flex items-center gap-4 p-5 rounded-2xl border border-border/40 bg-gradient-to-r from-card/60 to-muted/20 hover:from-card hover:to-muted/30 hover:border-primary/20 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-colors shrink-0">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base">
                      {isGettingRep ? "Finding your next move..." : "Stuck? Next Rep"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      One tap. One aligned action.
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </button>

              {/* Regenerate brief */}
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={() => {
                    hasLoaded.current = false;
                    // Delete existing brief to force regeneration
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
                  className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate brief
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
