import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { WelcomeWizard } from "@/components/onboarding/WelcomeWizard";
import { DayCompleteRecommendations } from "@/components/dashboard/DayCompleteRecommendations";
import { MorningRitualPrompt } from "@/components/dashboard/MorningRitualPrompt";
import { EveningLetGo } from "@/components/dashboard/EveningLetGo";
import { DecisionMirror } from "@/components/dashboard/DecisionMirror";
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
  

  const getLocalToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Check if task was generated in a different time period (stale context)
  const isTaskStale = (task: any) => {
    if (!task?.created_at) return false;
    const taskCreated = new Date(task.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - taskCreated.getTime()) / (1000 * 60 * 60);
    
    // Consider stale if created more than 6 hours ago and time period changed
    // (e.g., task from 11pm showing at 10am)
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
    
    // Stale if different time period AND more than 4 hours old AND not completed
    return taskTimeOfDay !== currentTimeOfDay && hoursSinceCreation > 4 && !task.completed;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const today = getLocalToday();
      
      const { data: tasksRes } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("task_sequence", { ascending: true });

      if (tasksRes && tasksRes.length > 0) {
        // Check if the incomplete task is stale (from a different time period)
        const incomplete = tasksRes.find(t => !t.completed);
        
        if (incomplete && isTaskStale(incomplete)) {
          // Delete stale task and regenerate with current time context
          await supabase
            .from("daily_tasks")
            .delete()
            .eq("id", incomplete.id);
          
          const remainingTasks = tasksRes.filter(t => t.id !== incomplete.id);
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
      
    };

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
  }, [user, tasksForToday]);

  const handleGenerateTask = async () => {
    if (!user) return;
    
    const today = getLocalToday();
    const { data: existingTasks } = await supabase
      .from("daily_tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_date", today);
    
    if (existingTasks && existingTasks.length >= 3) {
      toast.info("All 3 invitations done for today");
      return;
    }
    
    setIsGenerating(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: { timezone }
      });
      if (error) throw error;
      
      if (data) {
        const nextSequence = (existingTasks?.length || 0) + 1;
        
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

        if (insertError) throw insertError;

        const newTask = {
          task_sequence: nextSequence,
          priority_for_today: data.priority_for_today,
          one_thing: data.do_this_now,
          why_matters: data.why_it_matters,
          description: data.time_required,
          pillar: data.priority_for_today,
          completed: false,
        };
        
        setTasksForToday([...tasksForToday, newTask]);
        setTodayTask(newTask as any);
        setCurrentSequence(nextSequence);
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
      
      // Track completion for time-of-day learning
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'complete',
        pillar: todayTask?.priority_for_today
      });

      if (currentSequence < 3) {
        toast.success("Done. Generating next...");
        setTodayTask(null);
        // Auto-generate next
        setTimeout(() => handleGenerateTask(), 500);
      } else {
        toast.success("All 3 done. Great work.");
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
  const allDone = completedCount >= 3;

  const ProgressDots = ({ current }: { current: number }) => (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((num) => {
        const isCompleted = tasksForToday.some(t => t.task_sequence === num && t.completed);
        const isCurrent = num === current && !allDone;
        return (
          <div
            key={num}
            className={`w-2 h-2 rounded-full transition-all ${
              isCompleted
                ? 'bg-primary'
                : isCurrent
                  ? 'bg-primary/40'
                  : 'bg-muted-foreground/20'
            }`}
          />
        );
      })}
    </div>
  );

  const [morningComplete, setMorningComplete] = useState(false);
  const [eveningComplete, setEveningComplete] = useState(false);

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-6">
      {user && (
        <>
          <MorningRitualPrompt onComplete={() => setMorningComplete(true)} />
          <EveningLetGo onComplete={() => setEveningComplete(true)} />
          <WelcomeWizard userId={user.id} onComplete={() => {}} />
          <DayCompleteRecommendations userId={user.id} isComplete={allDone} />
        </>
      )}

      <div className="flex-1 space-y-6">
        {/* Today's Invitation Card */}
        <Card className="border-0 shadow-sm bg-card/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Invitation</CardTitle>
            <ProgressDots current={currentSequence} />
          </CardHeader>
          <CardContent className="pt-0">
            {isGenerating ? (
              <div className="py-10 flex flex-col items-center justify-center">
                <WeaveLoader size="lg" text="Preparing your invitation..." />
              </div>
            ) : allDone ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">All 3 done</p>
                  <p className="text-sm text-muted-foreground">Great work today.</p>
                </div>
              </div>
            ) : todayTask ? (
              <div className="space-y-4">
                {todayTask.pillar && (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                    {todayTask.pillar}
                  </span>
                )}
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold leading-snug">
                    {todayTask.one_thing}
                  </h3>
                  {todayTask.why_matters && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {todayTask.why_matters}
                    </p>
                  )}
                  {todayTask.description && (
                    <p className="text-xs text-muted-foreground/70">{todayTask.description}</p>
                  )}
                </div>
                <Button onClick={handleCompleteTask} className="w-full" size="lg">
                  Done <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Button
                  onClick={handleGenerateTask}
                  size="lg"
                  className="px-8"
                >
                  Start My Day
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Micro-Experiment Card */}
        {activeExperiment && (
          <Card className="border-0 shadow-sm bg-card/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today's Experiment</CardTitle>
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
                  <span className="text-xs text-muted-foreground">
                    Day {dayNumber}/{totalDays} · {daysLeft === 0 ? 'Last day' : `${daysLeft}d left`}
                  </span>
                );
              })()}
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const createdDate = new Date(activeExperiment.created_at);
                const now = new Date();
                const startDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const currentHour = now.getHours();
                
                // Determine time of day
                const getTimeOfDay = (hour: number) => {
                  if (hour >= 5 && hour < 12) return { label: 'Morning', icon: '🌅' };
                  if (hour >= 12 && hour < 17) return { label: 'Afternoon', icon: '☀️' };
                  if (hour >= 17 && hour < 21) return { label: 'Evening', icon: '🌆' };
                  return { label: 'Night', icon: '🌙' };
                };
                const timeOfDay = getTimeOfDay(currentHour);
                
                const steps = activeExperiment.steps?.split('\n').filter((s: string) => s.trim()) || [];
                
                // Smart step selection: if multiple steps per day, use time of day
                let todayStep = '';
                const stepsPerDay = Math.ceil(steps.length / 7); // estimate
                
                if (steps.length <= 7) {
                  // One step per day
                  todayStep = steps[Math.min(dayNumber - 1, steps.length - 1)] || activeExperiment.description;
                } else {
                  // Multiple steps - use time slots
                  const baseIndex = (dayNumber - 1) * stepsPerDay;
                  const timeSlot = currentHour < 12 ? 0 : currentHour < 18 ? 1 : 2;
                  const stepIndex = Math.min(baseIndex + Math.min(timeSlot, stepsPerDay - 1), steps.length - 1);
                  todayStep = steps[stepIndex] || activeExperiment.description;
                }
                
                // Format time display
                const formatTime = (date: Date) => {
                  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                };
                
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/70">{activeExperiment.title}</p>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {timeOfDay.icon} {timeOfDay.label} · {formatTime(now)}
                      </span>
                    </div>
                    <p className="text-base font-medium leading-relaxed">
                      {todayStep}
                    </p>
                    {activeExperiment.identity_shift_target && (
                      <p className="text-xs text-primary/70 italic">
                        → {activeExperiment.identity_shift_target}
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Next Best Rep */}
        <button
          onClick={handleNextRep}
          disabled={isGettingRep}
          className="w-full p-5 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 hover:from-primary/15 hover:to-primary/10 transition-all text-left group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 group-hover:bg-primary/30 flex items-center justify-center transition-colors">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base">
                {isGettingRep ? "Finding your next move..." : "Feeling off?"}
              </p>
              <p className="text-sm text-muted-foreground">
                One tap. One aligned action.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      </div>

      {/* Next Best Rep Dialog */}
      <Dialog open={showRepDialog} onOpenChange={setShowRepDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              {nextRep?.bucket || "Your Rep"}
            </DialogTitle>
            <DialogDescription>Break the drift</DialogDescription>
          </DialogHeader>
          {nextRep && (
            <div className="space-y-4">
              <p className="text-lg font-medium leading-relaxed">{nextRep.rep}</p>
              <p className="text-sm text-muted-foreground">{nextRep.why}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <span>{nextRep.time}</span>
                <span className="px-2 py-1 rounded bg-muted">{nextRep.bucket}</span>
              </div>
              <Button onClick={() => setShowRepDialog(false)} className="w-full">
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
