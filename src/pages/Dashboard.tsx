import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, FlaskConical, Map, FileText, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [showSyncDetail, setShowSyncDetail] = useState(false);
  const [savingSyncResult, setSavingSyncResult] = useState(false);
  const [phase, setPhase] = useState<"baseline" | "empire">("baseline");
  const [baselineMetrics, setBaselineMetrics] = useState<any>(null);
  const [currentSequence, setCurrentSequence] = useState(1);
  const [tasksForToday, setTasksForToday] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const [tasksRes, experimentRes, identityRes] = await Promise.all([
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
        supabase
          .from("identity_seeds")
          .select("current_phase, target_monthly_income, current_monthly_income, job_apps_this_week, job_apps_goal, days_to_move, weekly_focus")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (tasksRes.data && tasksRes.data.length > 0) {
        setTasksForToday(tasksRes.data);
        // Find current sequence (first incomplete task)
        const incomplete = tasksRes.data.find(t => !t.completed);
        setCurrentSequence(incomplete?.task_sequence || 1);
        setTodayTask(incomplete || tasksRes.data[tasksRes.data.length - 1]);
      } else {
        setTasksForToday([]);
        setTodayTask(null);
        setCurrentSequence(1);
      }
      
      if (experimentRes.data) setActiveExperiment(experimentRes.data);
      if (identityRes.data) {
        setPhase((identityRes.data.current_phase || "baseline") as "baseline" | "empire");
        setBaselineMetrics(identityRes.data);
      }
    };

    fetchData();

    // Set up real-time subscription for experiments
    const experimentChannel = supabase
      .channel("dashboard-experiments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "experiments",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch experiments when any change occurs
          fetchData();
        },
      )
      .subscribe();

    // Set up real-time subscription for daily tasks
    const taskChannel = supabase
      .channel("dashboard-tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_tasks",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch tasks when any change occurs
          fetchData();
        },
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
        
        // Determine next sequence number
        const nextSequence = tasksForToday.length + 1;
        
        // Only generate up to 3 tasks per day
        if (nextSequence > 3) {
          toast.info("You've completed all 3 tasks for today! Take a break.");
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
          description: data.what_to_do_after,
          completed: false,
        };
        
        setTasksForToday([...tasksForToday, newTask]);
        setTodayTask(newTask as any);
        setCurrentSequence(nextSequence);
        
        toast.success(`Task ${nextSequence} of 3 generated`);
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
      
      // Mark current task as completed
      const { error: updateError } = await supabase
        .from("daily_tasks")
        .update({ completed: true })
        .eq("user_id", user.id)
        .eq("task_date", today)
        .eq("task_sequence", currentSequence);

      if (updateError) throw updateError;

      // Update local state
      const updatedTasks = tasksForToday.map(t => 
        t.task_sequence === currentSequence ? { ...t, completed: true } : t
      );
      setTasksForToday(updatedTasks);

      if (currentSequence < 3) {
        toast.success(`Task ${currentSequence} complete! Generating task ${currentSequence + 1}...`);
        await handleGenerateDailyOne();
      } else {
        toast.success("All 3 tasks complete! Great work today!");
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
        toast.success("Life synced");
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

      toast.success("Direction sync saved as insight");
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSavingSyncResult(false);
    }
  };

  const incomeProgress = baselineMetrics 
    ? Math.min(100, (baselineMetrics.current_monthly_income / baselineMetrics.target_monthly_income) * 100)
    : 0;
  
  const jobAppProgress = baselineMetrics
    ? Math.min(100, (baselineMetrics.job_apps_this_week / baselineMetrics.job_apps_goal) * 100)
    : 0;

  const completedToday = tasksForToday.filter(t => t.completed).length;

  return (
    <div className="min-h-screen flex flex-col max-w-4xl mx-auto px-4 py-8">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">Today's Progress</span>
          <span className="text-sm font-medium">{completedToday}/3</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(completedToday / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Today's Action */}
        <Card className="border-border/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Next Action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayTask ? (
              <>
                <div className="space-y-2">
                  {(todayTask as any).pillar && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {(todayTask as any).pillar}
                    </div>
                  )}
                  <h3 className="text-xl font-semibold leading-tight">{(todayTask as any).one_thing}</h3>
                  {(todayTask as any).description && (
                    <p className="text-sm text-muted-foreground">⏱️ {(todayTask as any).description}</p>
                  )}
                </div>
                <Button
                  size="lg"
                  onClick={handleCompleteTask}
                  disabled={todayTask.completed}
                  className="w-full"
                >
                  {todayTask.completed ? "Completed" : "Complete"} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Ready to start your day?</p>
                <Button
                  size="lg"
                  onClick={handleGenerateDailyOne}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? "Generating..." : "Generate Next Action"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Experiment - Compact */}
        <Card className="border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Active Experiment</CardTitle>
          </CardHeader>
          <CardContent>
            {activeExperiment ? (
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{(activeExperiment as any).title}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{(activeExperiment as any).description}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate("/experiments")}
                  variant="outline"
                  className="w-full"
                >
                  View Details
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No active experiment</p>
                <Button
                  size="sm"
                  onClick={() => navigate("/experiments")}
                  variant="outline"
                  className="w-full"
                >
                  Start Experiment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Direction Sync - Compact */}
        <Card className="border-border/30">
          <CardContent className="pt-6">
            <Button
              size="lg"
              onClick={handleSyncLife}
              disabled={isSyncing}
              variant="outline"
              className="w-full"
            >
              {isSyncing ? "Syncing..." : "🔀 Direction Sync"}
            </Button>
            {syncResult && (
              <button
                onClick={() => setShowSyncDetail(true)}
                className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                {syncResult.headline}
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Capture Bar */}
      <div className="mt-8 pt-6 border-t border-border/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button
            variant="outline"
            size="default"
            onClick={() => navigate("/insights")}
            className="h-14 flex-col gap-1"
          >
            <Lightbulb className="h-5 w-5" />
            <span className="text-xs">Insight</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => navigate("/documents")}
            className="h-14 flex-col gap-1"
          >
            <FileText className="h-5 w-5" />
            <span className="text-xs">Document</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => navigate("/experiments")}
            className="h-14 flex-col gap-1"
          >
            <FlaskConical className="h-5 w-5" />
            <span className="text-xs">Experiment</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => navigate("/topics")}
            className="h-14 flex-col gap-1"
          >
            <Map className="h-5 w-5" />
            <span className="text-xs">Path</span>
          </Button>
        </div>
      </div>

      {/* Direction Sync Detail Dialog */}
      <Dialog open={showSyncDetail} onOpenChange={setShowSyncDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Direction Sync</DialogTitle>
          </DialogHeader>
          {syncResult && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{syncResult.headline}</h3>
                <p className="text-sm leading-relaxed">{syncResult.summary}</p>
              </div>

              {syncResult.suggested_next_step && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Suggested Next Step</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{syncResult.suggested_next_step}</p>
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
