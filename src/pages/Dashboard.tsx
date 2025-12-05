import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { WelcomeWizard } from "@/components/onboarding/WelcomeWizard";
import { DayCompleteRecommendations } from "@/components/dashboard/DayCompleteRecommendations";

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

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      // Fetch tasks
      const { data: tasksRes } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("task_sequence", { ascending: true });

      if (tasksRes && tasksRes.length > 0) {
        setTasksForToday(tasksRes);
        const incomplete = tasksRes.find(t => !t.completed);
        setCurrentSequence(incomplete?.task_sequence || tasksRes.length);
        setTodayTask(incomplete || tasksRes[tasksRes.length - 1]);
      } else {
        setTasksForToday([]);
        setTodayTask(null);
        setCurrentSequence(1);
      }
      
      // Fetch active experiment
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

    const taskChannel = supabase
      .channel("dashboard-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(taskChannel);
    };
  }, [user]);

  const handleGenerateDailyOne = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator");
      if (error) throw error;
      
      if (!data || !data.do_this_now) {
        toast.error("No action generated. Try again.");
        return;
      }
      
      const today = new Date().toISOString().split("T")[0];
      const nextSequence = tasksForToday.length + 1;
      
      if (nextSequence > 3) {
        toast.info("All 3 actions complete for today");
        return;
      }
      
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
      
      toast.success(`Action ${nextSequence} ready`);
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
      const today = new Date().toISOString().split("T")[0];
      
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

      if (currentSequence < 3) {
        toast.success("Done. Generating next...");
        await handleGenerateDailyOne();
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
      const { data, error } = await supabase.functions.invoke("next-rep");
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

  return (
    <div className="min-h-screen flex flex-col max-w-xl mx-auto px-4 py-6">
      {user && (
        <>
          <WelcomeWizard userId={user.id} onComplete={() => {}} />
          <DayCompleteRecommendations userId={user.id} isComplete={allDone} />
        </>
      )}
      <QuickCapture />

      <div className="flex-1 space-y-6">
        {/* Today's Action Card */}
        <Card className="border-0 shadow-sm bg-card/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Action</CardTitle>
            <ProgressDots current={currentSequence} />
          </CardHeader>
          <CardContent className="pt-0">
            {allDone ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">All 3 actions complete</p>
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
                  Done <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-6">
                <p className="text-sm text-muted-foreground text-center">
                  Ready to start?
                </p>
                <Button
                  onClick={handleGenerateDailyOne}
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? "Generating..." : "Start My Day"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Experiment Card */}
        {activeExperiment && (
          <Card className="border-0 shadow-sm bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Experiment</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const dayNumber = Math.ceil((Date.now() - new Date(activeExperiment.created_at).getTime()) / (1000 * 60 * 60 * 24));
                const steps = activeExperiment.steps?.split('\n').filter((s: string) => s.trim()) || [];
                const todayStep = steps[Math.min(dayNumber - 1, steps.length - 1)];
                const totalDays = steps.length || 7;
                
                return (
                  <div className="space-y-2">
                    <h3 className="font-semibold">{activeExperiment.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {todayStep || activeExperiment.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                      <span>{activeExperiment.duration || `${totalDays} days`}</span>
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                        Day {dayNumber} of {totalDays}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Next Best Rep - Drift Breaker */}
        <button
          onClick={handleNextRep}
          disabled={isGettingRep}
          className="w-full p-4 rounded-xl border border-dashed border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <Zap className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {isGettingRep ? "Finding your rep..." : "Drifting? Tap here."}
              </p>
              <p className="text-xs text-muted-foreground">Get one aligned action</p>
            </div>
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
            <DialogDescription>One aligned action to break the drift</DialogDescription>
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