import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check, Zap, Sparkles } from "lucide-react";
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
    <div className="min-h-screen flex flex-col w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fade-in overflow-x-hidden">
      {user && (
        <>
          <MorningRitualPrompt onComplete={() => setMorningComplete(true)} />
          <EveningLetGo onComplete={() => setEveningComplete(true)} />
          <WelcomeWizard userId={user.id} onComplete={() => {}} />
          <DayCompleteRecommendations userId={user.id} isComplete={allDone} />
        </>
      )}

      {/* Responsive grid layout for desktop */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Today's Invitation Card - Primary focus, spans full on mobile, left on desktop */}
        <div className="invitation-card lg:row-span-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="text-sm sm:text-base font-medium text-muted-foreground">Today's Invitation</span>
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: dotsToShow }, (_, i) => i + 1).map((num) => {
                const isCompleted = tasksForToday.some(t => t.task_sequence === num && t.completed);
                const isCurrent = num === currentSequence && !allDone;
                return (
                  <div
                    key={num}
                    className={`progress-dot ${isCompleted ? 'complete' : isCurrent ? 'active' : 'pending'}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Content */}
          {isGenerating ? (
            <div className="py-8 sm:py-12 lg:py-16 flex flex-col items-center justify-center">
              <WeaveLoader size="lg" text="Preparing your invitation..." />
            </div>
          ) : showBonusOption ? (
            <div className="py-8 sm:py-10 lg:py-12 text-center space-y-4 sm:space-y-5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 mx-auto rounded-2xl bg-success/10 flex items-center justify-center">
                <Check className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-success" />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-display font-semibold">Complete</h3>
                <p className="text-sm sm:text-base text-muted-foreground">Three aligned actions. Well done.</p>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={handleGenerateTask}
                className="mt-2 sm:mt-3 rounded-xl h-11 sm:h-12 px-6"
              >
                <Zap className="h-4 w-4 mr-2" />
                I'm motivated — one more
              </Button>
            </div>
          ) : allDone ? (
            <div className="py-8 sm:py-12 lg:py-16 text-center space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 mx-auto rounded-2xl bg-success/10 flex items-center justify-center">
                <Check className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-success" />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-display font-semibold">Complete</h3>
                <p className="text-sm sm:text-base text-muted-foreground">You showed up. That matters.</p>
              </div>
            </div>
          ) : todayTask ? (
            <div className="space-y-4 sm:space-y-5 lg:space-y-6">
              {todayTask.pillar && (
                <span className="inline-block px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-primary/10 text-primary">
                  {todayTask.pillar}
                </span>
              )}
              <div className="space-y-2 sm:space-y-3">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-display font-semibold leading-snug">
                  {todayTask.one_thing}
                </h3>
                {todayTask.why_matters && (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {todayTask.why_matters}
                  </p>
                )}
                {todayTask.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground/70">{todayTask.description}</p>
                )}
              </div>
              <Button 
                onClick={handleCompleteTask} 
                className="w-full h-11 sm:h-12 lg:h-14 rounded-xl text-base sm:text-lg font-medium shadow-soft hover:shadow-elevated transition-all"
                size="lg"
              >
                Done <Check className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          ) : (
            <div className="py-8 sm:py-10 lg:py-14 text-center">
              <Button
                onClick={handleGenerateTask}
                size="lg"
                className="px-8 sm:px-10 h-11 sm:h-12 lg:h-14 rounded-xl text-base sm:text-lg font-medium shadow-soft hover:shadow-elevated transition-all"
              >
                Start My Day
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          )}
        </div>


        {/* Right column on desktop - stacked cards */}
        <div className="flex flex-col gap-4 sm:gap-6">
          {/* Active Experiment Card */}
          {activeExperiment && (
            <div className="invitation-card">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <span className="text-sm sm:text-base font-medium text-muted-foreground">Active Experiment</span>
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
                
                const daysLeft = Math.max(0, totalDays - dayNumber + 1);
                
                return (
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                    Day {dayNumber}/{totalDays}
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
              
              const getTimeOfDay = (hour: number) => {
                if (hour >= 5 && hour < 12) return 'Morning';
                if (hour >= 12 && hour < 17) return 'Afternoon';
                if (hour >= 17 && hour < 21) return 'Evening';
                return 'Night';
              };
              const timeOfDay = getTimeOfDay(currentHour);
              
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
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm text-muted-foreground/70 truncate max-w-[60%]">{activeExperiment.title}</p>
                    <span className="text-xs sm:text-sm text-muted-foreground">{timeOfDay}</span>
                  </div>
                  <p className="text-base sm:text-lg font-medium leading-relaxed">
                    {todayStep}
                  </p>
                  {activeExperiment.identity_shift_target && (
                    <p className="text-xs sm:text-sm text-primary/70 italic">
                      → {activeExperiment.identity_shift_target}
                    </p>
                  )}
                </div>
              );
            })()}
            </div>
          )}

          {/* Next Best Rep Button */}
          <button
            onClick={handleNextRep}
            disabled={isGettingRep}
            className="w-full invitation-card group text-left hover:border-primary/30"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors flex-shrink-0">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base">
                  {isGettingRep ? "Finding your next move..." : "Feeling off?"}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  One tap. One aligned action.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </button>
        </div>
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
