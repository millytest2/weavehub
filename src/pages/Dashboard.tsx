import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Check, FlaskConical, Compass } from "lucide-react";
import { toast } from "sonner";
import { QuickCapture } from "@/components/dashboard/QuickCapture";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [showSyncDetail, setShowSyncDetail] = useState(false);
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
          toast.info("All 3 actions complete for today");
          return;
        }
        
        const { error: insertError } = await supabase
          .from("daily_tasks")
          .insert({
            user_id: user!.id,
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

  const completedCount = tasksForToday.filter(t => t.completed).length;
  const allDone = completedCount >= 3;

  const ProgressDots = ({ current }: { current: number }) => (
    <div className="flex items-center gap-1">
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
                  : 'bg-muted'
            }`}
          />
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto px-4 py-8">
      <QuickCapture />

      <div className="flex-1 space-y-4">
        {/* Card 1: Today's Action */}
        <Card className="border-border/30">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Today's Action</CardTitle>
            <ProgressDots current={currentSequence} />
          </CardHeader>
          <CardContent>
            {allDone ? (
              <div className="py-8 text-center space-y-2">
                <Check className="h-8 w-8 mx-auto text-primary" />
                <p className="text-sm font-medium">All 3 actions complete</p>
                <p className="text-xs text-muted-foreground">Great work today.</p>
              </div>
            ) : todayTask ? (
              <div className="space-y-4">
                {todayTask.pillar && (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                    {todayTask.pillar}
                  </span>
                )}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold leading-snug">
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
                <Button onClick={handleCompleteTask} className="w-full">
                  Done <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground text-center">
                  Ready to start?
                </p>
                <Button
                  onClick={handleGenerateDailyOne}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? "Generating..." : "Start My Day"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Active Experiment */}
        <Card className="border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Active Experiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeExperiment ? (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">{activeExperiment.title}</h3>
                  {activeExperiment.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {activeExperiment.description}
                    </p>
                  )}
                </div>
                {activeExperiment.identity_shift_target && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Becoming:</p>
                    <p className="text-sm font-medium">{activeExperiment.identity_shift_target}</p>
                  </div>
                )}
                <Button
                  onClick={() => navigate("/experiments")}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                >
                  View Details
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No active experiment</p>
                <Button
                  onClick={() => navigate("/experiments")}
                  variant="outline"
                  size="sm"
                >
                  Start One
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Direction Sync */}
        <Card className="border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Compass className="h-4 w-4" />
              Direction Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleSyncLife}
              disabled={isSyncing}
              variant="outline"
              className="w-full"
            >
              {isSyncing ? "Analyzing..." : "Check Direction"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Direction Sync Dialog */}
      <Dialog open={showSyncDetail} onOpenChange={setShowSyncDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Direction Check</DialogTitle>
          </DialogHeader>
          {syncResult && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{syncResult.headline}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{syncResult.summary}</p>
              </div>
              {syncResult.suggested_next_step && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Next Step</h4>
                  <p className="text-sm text-muted-foreground">
                    {syncResult.suggested_next_step}
                  </p>
                </div>
              )}
              <Button onClick={() => setShowSyncDetail(false)} className="w-full">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
