import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>("");

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [taskRes, experimentRes] = await Promise.all([
        supabase
          .from("daily_tasks")
          .select("*")
          .eq("user_id", user.id)
          .eq("task_date", new Date().toISOString().split("T")[0])
          .single(),
        (supabase as any)
          .from("experiments")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (taskRes.data) setTodayTask(taskRes.data);
      if (experimentRes.data) setActiveExperiment(experimentRes.data);
    };

    fetchData();
  }, [user]);

  const handleGenerateDailyOne = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator");
      if (error) throw error;
      if (data) {
        setTodayTask({ one_thing: data.one_thing, why_matters: data.why_matters } as any);
        toast.success("Generated your daily focus");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSyncLife = async () => {
    setIsSyncing(true);
    setSyncResult("");
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer");
      if (error) throw error;
      if (data?.suggestion) {
        setSyncResult(data.suggestion);
        toast.success("Life synced");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sync");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Card 1 — Today's One Thing */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Today's One Thing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayTask ? (
              <div className="space-y-2">
                <p className="font-medium">{(todayTask as any).one_thing}</p>
                <p className="text-sm text-muted-foreground">{(todayTask as any).why_matters}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No focus set yet</p>
            )}
            <Button
              size="sm"
              onClick={handleGenerateDailyOne}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
          </CardContent>
        </Card>

        {/* Card 2 — Active Experiment */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Active Experiment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeExperiment ? (
              <div className="space-y-2">
                <p className="font-medium">{(activeExperiment as any).title}</p>
                <p className="text-sm text-muted-foreground">{(activeExperiment as any).identity_shift_target}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No experiment yet</p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/experiments")}
              className="w-full"
            >
              Refine Experiment
            </Button>
          </CardContent>
        </Card>

        {/* Card 3 — Direction Sync */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Direction Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncResult ? (
              <p className="text-sm">{syncResult}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sync your direction</p>
            )}
            <Button
              size="sm"
              onClick={handleSyncLife}
              disabled={isSyncing}
              className="w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {isSyncing ? "Syncing..." : "Sync My Life"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
