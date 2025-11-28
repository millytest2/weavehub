import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Check, Compass } from "lucide-react";
import { toast } from "sonner";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { ContextMirror } from "@/components/dashboard/ContextMirror";
import { ExperimentConnection } from "@/components/dashboard/ExperimentConnection";

const Dashboard = () => {
  const { user } = useAuth();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [showSyncDetail, setShowSyncDetail] = useState(false);
  const [savingSyncResult, setSavingSyncResult] = useState(false);
  const [currentSequence, setCurrentSequence] = useState(1);
  const [tasksForToday, setTasksForToday] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const [tasksRes, experimentRes] = await Promise.all([
        supabase
          .from("daily_tasks")
          .select("*")
          .eq("user_id", user.id)
          .eq("task_date", today)
          .order("task_sequence", { ascending: true }),
        supabase
          .from("experiments")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["in_progress", "planning"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (tasksRes.data && tasksRes.data.length > 0) {
        setTasksForToday(tasksRes.data);
        const incomplete = tasksRes.data.find(t => !t.completed);
        setCurrentSequence(incomplete?.task_sequence || tasksRes.data.length);
        setTodayTask(incomplete || tasksRes.data[tasksRes.data.length - 1]);
      } else {
        setTasksForToday([]);
        setTodayTask(null);
        setCurrentSequence(1);
      }
      
      if (experimentRes.data) setActiveExperiment(experimentRes.data);
    };

    fetchData();

    const experimentChannel = supabase
      .channel("dashboard-experiments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "experiments", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    const taskChannel = supabase
      .channel("dashboard-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(experimentChannel);
      supabase.removeChannel(taskChannel);
    };
  }, [user]);

  const handleGenerateDailyOne = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator");
      if (error) throw error;
      
      if (data) {
        const today = new Date().toISOString().split("T")[0];
        const nextSequence = tasksForToday.length + 1;
        
        if (nextSequence > 3) {
          toast.info("All 3 tasks complete for today");
          return;
        }
        
        const { error: insertError } = await supabase
          .from("daily_tasks")
          .insert({
            user_id: user!.id,
            task_date: today,
            task_sequence: nextSequence,
            title: data.priority_for_today || "Daily Action",
            one_thing: data.do_this_now,
            why_matters: data.why_it_matters,
            description: data.time_required || data.what_to_do_after,
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
        toast.success(`Done. Generating action ${currentSequence + 1}...`);
        await handleGenerateDailyOne();
      } else {
        toast.success("All 3 done. Great work today.");
        setTodayTask(null);
      }
    } catch (error: any) {
      console.error("Complete error:", error);
      toast.error(error.message || "Failed to complete");
    }
  };

  const handleSyncLife = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer");
      if (error) throw error;
      if (data) {
        setSyncResult(data);
        setShowSyncDetail(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSyncResult = async () => {
    if (!user || !syncResult) return;

    setSavingSyncResult(true);
    try {
      const title = syncResult.headline || "Direction Sync";
      const content = `${syncResult.summary}\n\nNext Step: ${syncResult.suggested_next_step || "Not specified"}`;

      const { error } = await supabase.from("insights").insert({
        user_id: user.id,
        title,
        content,
        source: "direction_sync",
      });

      if (error) throw error;
      toast.success("Saved as insight");
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSavingSyncResult(false);
    }
  };

  const completedCount = tasksForToday.filter(t => t.completed).length;
  const allDone = completedCount >= 3;

  // Progress indicator component
  const ProgressDots = ({ current }: { current: number }) => (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((num) => {
        const isCompleted = tasksForToday.some(t => t.task_sequence === num && t.completed);
        const isCurrent = num === current && !allDone;
        return (
          <div
            key={num}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
              isCompleted
                ? 'bg-primary text-primary-foreground'
                : isCurrent
                  ? 'bg-primary/20 text-primary border border-primary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {isCompleted ? <Check className="h-3 w-3" /> : num}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Quick Capture FAB */}
      <QuickCapture />

      {/* Main Content */}
      <div className="flex-1 space-y-4 sm:space-y-6">
        {/* Context Mirror - What the AI sees */}
        <ContextMirror />

        {/* Today's Action Card */}
        <Card className="border-border/30">
          <CardHeader className="pb-3 sm:pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold">Today's Focus</CardTitle>
            <ProgressDots current={currentSequence} />
          </CardHeader>
          <CardContent>
            {allDone ? (
              <div className="py-6 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">All 3 actions complete</p>
                <p className="text-xs text-muted-foreground">Great work today. Rest or reflect.</p>
              </div>
            ) : todayTask ? (
              <div className="space-y-4">
                {todayTask.pillar && (
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {todayTask.pillar}
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold leading-snug">
                    {todayTask.one_thing}
                  </h3>
                  {todayTask.why_matters && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {todayTask.why_matters}
                    </p>
                  )}
                  {todayTask.description && (
                    <p className="text-xs text-muted-foreground">{todayTask.description}</p>
                  )}
                </div>
                <Button onClick={handleCompleteTask} className="w-full" size="lg">
                  Done <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground text-center">
                  Ready to start? I'll pick your first action based on your context.
                </p>
                <Button
                  onClick={handleGenerateDailyOne}
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? "Analyzing..." : "Start My Day"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Experiment Connection */}
        <ExperimentConnection experiment={activeExperiment} currentTask={todayTask} />

        {/* Direction Sync */}
        <Card className="border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Compass className="h-4 w-4" />
              Direction Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleSyncLife}
              disabled={isSyncing}
              variant="outline"
              className="w-full"
            >
              {isSyncing ? "Analyzing..." : "See the Big Picture"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Direction Sync Detail Dialog */}
      <Dialog open={showSyncDetail} onOpenChange={setShowSyncDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your Direction</DialogTitle>
          </DialogHeader>
          {syncResult && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{syncResult.headline}</h3>
                <p className="text-sm leading-relaxed">{syncResult.summary}</p>
              </div>
              {syncResult.suggested_next_step && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <h4 className="text-sm font-medium mb-2">Suggested Next Step</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {syncResult.suggested_next_step}
                  </p>
                </div>
              )}
              <div className="border-t pt-4 flex gap-2">
                <Button onClick={handleSaveSyncResult} disabled={savingSyncResult} className="flex-1">
                  {savingSyncResult ? "Saving..." : "Save as Insight"}
                </Button>
                <Button onClick={() => setShowSyncDetail(false)} variant="outline" className="flex-1">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
