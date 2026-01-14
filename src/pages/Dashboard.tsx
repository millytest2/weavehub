import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { WelcomeWizard } from "@/components/onboarding/WelcomeWizard";
import { DayCompleteRecommendations } from "@/components/dashboard/DayCompleteRecommendations";
import { MorningRitualPrompt } from "@/components/dashboard/MorningRitualPrompt";
import { EveningLetGo } from "@/components/dashboard/EveningLetGo";
import { WeaveLoader } from "@/components/ui/weave-loader";

const Dashboard = () => {
  const { user } = useAuth();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSequence, setCurrentSequence] = useState(1);
  const [tasksForToday, setTasksForToday] = useState<any[]>([]);
  
  // Next Best Rep state
  const [isGettingRep, setIsGettingRep] = useState(false);
  const [nextRep, setNextRep] = useState<any>(null);
  const [showRepDialog, setShowRepDialog] = useState(false);
  
  // Active experiment state
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  
  const [morningComplete, setMorningComplete] = useState(false);
  const [eveningComplete, setEveningComplete] = useState(false);

  const getLocalToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const isTaskStale = (task: any) => {
    if (!task?.created_at) return false;
    const taskCreated = new Date(task.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - taskCreated.getTime()) / (1000 * 60 * 60);
    
    const taskHour = taskCreated.getHours();
    const currentHour = now.getHours();
    
    const getTimeOfDay = (hour: number) => {
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      if (hour >= 17 && hour < 21) return 'evening';
      return 'night';
    };
    
    const taskTimeOfDay = getTimeOfDay(taskHour);
    const currentTimeOfDay = getTimeOfDay(currentHour);
    
    return taskTimeOfDay !== currentTimeOfDay && hoursSinceCreation > 4 && !task.completed;
  };

  const fetchData = useCallback(async () => {
    if (!user) return;

    const today = getLocalToday();

    const { data: tasksRes } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("task_date", today)
      .order("task_sequence", { ascending: true });

    if (tasksRes && tasksRes.length > 0) {
      const incomplete = tasksRes.find((t) => !t.completed);

      if (incomplete && isTaskStale(incomplete)) {
        await supabase.from("daily_tasks").delete().eq("id", incomplete.id);

        const remainingTasks = tasksRes.filter((t) => t.id !== incomplete.id);
        setTasksForToday(remainingTasks);
        setTodayTask(null);
        setCurrentSequence(remainingTasks.length + 1);
        return;
      }

      setTasksForToday(tasksRes);
      setCurrentSequence(incomplete?.task_sequence || tasksRes.length);
      setTodayTask(incomplete || tasksRes[tasksRes.length - 1]);
    } else {
      setTasksForToday([]);
      setTodayTask(null);
      setCurrentSequence(1);
    }

    const { data: expRes } = await supabase
      .from("experiments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveExperiment(expRes);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchData();

    const midnightCheck = setInterval(() => {
      const today = getLocalToday();
      if (tasksForToday.length > 0 && tasksForToday[0]?.task_date !== today) {
        setTasksForToday([]);
        setTodayTask(null);
        setCurrentSequence(1);
      }
    }, 60000);

    const taskChannel = supabase
      .channel("dashboard-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      clearInterval(midnightCheck);
      supabase.removeChannel(taskChannel);
    };
  }, [user, fetchData, tasksForToday]);

  const handleGenerateTask = async () => {
    if (!user || isGenerating) return;
    
    setIsGenerating(true);
    const today = getLocalToday();
    
    try {
      // Re-fetch to get accurate count and avoid race conditions
      const { data: existingTasks } = await supabase
        .from("daily_tasks")
        .select("id, task_sequence")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("task_sequence", { ascending: false });
      
      if (existingTasks && existingTasks.length >= 4) {
        toast.info("All invitations done for today");
        return;
      }
      
      // Calculate next sequence from max existing + 1
      const maxSeq = existingTasks?.[0]?.task_sequence || 0;
      const nextSequence = maxSeq + 1;
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: { timezone }
      });
      if (error) throw error;
      
      if (data) {
        const { error: insertError } = await supabase
          .from("daily_tasks")
          .insert({
            user_id: user.id,
            task_date: today,
            task_sequence: nextSequence,
            title: data.priority_for_today || "Action",
            one_thing: data.do_this_now,
            why_matters: data.why_it_matters,
            description: data.time_required,
            pillar: data.priority_for_today,
            completed: false,
          });

        if (insertError) {
          // Duplicate insert (double click / multiple tabs) - just refresh state
          if (insertError.code === "23505") {
            await fetchData();
            return;
          }
          throw insertError;
        }

        await fetchData();
      }
    } catch (error: any) {
      console.error("Generate error:", error);
      toast.error(error.message || "Failed to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!todayTask || !user) return;
    
    try {
      const today = getLocalToday();
      
      const { error: updateError } = await supabase
        .from("daily_tasks")
        .update({ completed: true })
        .eq("user_id", user.id)
        .eq("task_date", today)
        .eq("task_sequence", currentSequence);

      if (updateError) throw updateError;

      const updatedTasks = tasksForToday.map(t => 
        t.task_sequence === currentSequence ? { ...t, completed: true } : t
      );
      setTasksForToday(updatedTasks);
      
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'complete',
        pillar: todayTask?.priority_for_today
      });

      const completedNow = updatedTasks.filter(t => t.completed).length;
      
      if (completedNow < 3) {
        toast.success("Done. Generating next...");
        setTodayTask(null);
        setCurrentSequence(completedNow + 1);
        await handleGenerateTask();
      } else if (currentSequence === 4) {
        toast.success("Bonus complete.");
        setTodayTask(null);
      } else {
        toast.success("All 3 done.");
        setTodayTask(null);
      }
    } catch (error: any) {
      console.error("Complete error:", error);
      toast.error(error.message || "Failed to complete");
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

  const completedCount = tasksForToday.filter(t => t.completed).length;
  const threeComplete = completedCount >= 3;
  const allDone = completedCount >= 4 || (threeComplete && !tasksForToday.some(t => t.task_sequence === 4));
  const showBonusOption = threeComplete && completedCount === 3 && !tasksForToday.some(t => t.task_sequence === 4);

  // Memoized dot count to prevent flickering
  const dotsToShow = tasksForToday.some(t => t.task_sequence === 4) ? 4 : 3;

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-10 md:py-16 animate-fade-in">
      {user && (
        <>
          <MorningRitualPrompt onComplete={() => setMorningComplete(true)} />
          <EveningLetGo onComplete={() => setEveningComplete(true)} />
          <WelcomeWizard userId={user.id} onComplete={() => {}} />
          <DayCompleteRecommendations userId={user.id} isComplete={allDone} />
        </>
      )}

      <div className="flex-1 space-y-8">
        {/* Time-aware greeting */}
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
          </p>
        </div>

        {/* Today's Invitation - Hero Card */}
        <div className="invitation-card breathing">
          {/* Minimal header */}
          <div className="mb-8">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {allDone ? 'Complete' : `Invitation ${currentSequence} of ${dotsToShow}`}
            </span>
          </div>

          {/* Content */}
          {isGenerating ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <WeaveLoader size="lg" text="Weaving your invitation..." />
            </div>
          ) : showBonusOption ? (
            <div className="py-12 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-success/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-semibold">Three threads woven</h3>
                <p className="text-muted-foreground">You showed up. That matters.</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateTask}
                className="mt-4 text-muted-foreground hover:text-foreground"
              >
                <Zap className="h-4 w-4 mr-2" />
                I want one more
              </Button>
            </div>
          ) : allDone ? (
            <div className="py-16 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-success/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-semibold">Day complete</h3>
                <p className="text-muted-foreground">Rest. Tomorrow brings new threads.</p>
              </div>
            </div>
          ) : todayTask ? (
            <div className="space-y-6">
              {todayTask.pillar && (
                <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/8 text-primary border border-primary/10">
                  {todayTask.pillar}
                </span>
              )}
              <div className="space-y-4">
                <h3 className="text-2xl md:text-3xl font-display font-semibold leading-snug">
                  {todayTask.one_thing}
                </h3>
                {todayTask.why_matters && (
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {todayTask.why_matters}
                  </p>
                )}
                {todayTask.description && (
                  <p className="text-sm text-muted-foreground/60">{todayTask.description}</p>
                )}
              </div>
              <Button 
                onClick={handleCompleteTask} 
                className="w-full h-14 rounded-xl text-base font-medium shadow-soft hover:shadow-elevated transition-all mt-4"
                size="lg"
              >
                Done <Check className="ml-2 h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="py-16 text-center space-y-4">
              <p className="text-muted-foreground mb-6">Ready to begin?</p>
              <Button
                onClick={handleGenerateTask}
                size="lg"
                className="px-12 h-14 rounded-xl text-base font-medium shadow-soft hover:shadow-elevated transition-all"
              >
                Start Today
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Active Experiment - Subtle ribbon */}
        {activeExperiment && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Experiment</span>
              {(() => {
                const createdDate = new Date(activeExperiment.created_at);
                const now = new Date();
                const startDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                const durationStr = activeExperiment.duration?.toLowerCase() || '';
                let totalDays = 7;
                if (durationStr.includes('48h') || durationStr.includes('2 day')) totalDays = 2;
                else if (durationStr.includes('24h') || durationStr.includes('1 day')) totalDays = 1;
                else if (durationStr.includes('3 day')) totalDays = 3;
                else if (durationStr.includes('5 day')) totalDays = 5;
                else if (durationStr.includes('week')) totalDays = 7;
                else if (durationStr.includes('2 week')) totalDays = 14;
                
                return (
                  <span className="text-xs text-muted-foreground">
                    Day {dayNumber} of {totalDays}
                  </span>
                );
              })()}
            </div>
            {(() => {
              const createdDate = new Date(activeExperiment.created_at);
              const now = new Date();
              const startDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              const currentHour = now.getHours();
              
              const steps = activeExperiment.steps?.split('\n').filter((s: string) => s.trim()) || [];
              
              let todayStep = '';
              const stepsPerDay = Math.ceil(steps.length / 7);
              
              if (steps.length <= 7) {
                todayStep = steps[Math.min(dayNumber - 1, steps.length - 1)] || activeExperiment.description;
              } else {
                const baseIndex = (dayNumber - 1) * stepsPerDay;
                const timeSlot = currentHour < 12 ? 0 : currentHour < 18 ? 1 : 2;
                const stepIndex = Math.min(baseIndex + Math.min(timeSlot, stepsPerDay - 1), steps.length - 1);
                todayStep = steps[stepIndex] || activeExperiment.description;
              }
              
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground/70 truncate">{activeExperiment.title}</p>
                  <p className="text-sm font-medium leading-relaxed">{todayStep}</p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Next Best Rep - Minimal prompt */}
        <button
          onClick={handleNextRep}
          disabled={isGettingRep}
          className="w-full text-left py-4 px-5 rounded-xl border border-border/30 hover:border-border/50 hover:bg-card/50 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/8 group-hover:bg-primary/12 flex items-center justify-center transition-colors">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {isGettingRep ? "Finding your next move..." : "Feeling off?"}
              </p>
              <p className="text-xs text-muted-foreground">
                One tap. One aligned action.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </div>
        </button>
      </div>

      {/* Next Best Rep Dialog */}
      <Dialog open={showRepDialog} onOpenChange={setShowRepDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
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
                <span className="px-2 py-1 rounded-md bg-muted font-medium">{nextRep.bucket}</span>
              </div>
              <Button onClick={() => setShowRepDialog(false)} className="w-full h-11 rounded-xl">
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
