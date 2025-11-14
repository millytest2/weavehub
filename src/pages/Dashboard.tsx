import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Lightbulb, FlaskConical, Map, FileText } from "lucide-react";
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
  const [showSyncDetail, setShowSyncDetail] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [taskRes, experimentRes] = await Promise.all([
        supabase
          .from("daily_tasks")
          .select("*")
          .eq("user_id", user.id)
          .eq("task_date", new Date().toISOString().split("T")[0])
          .maybeSingle(),
        (supabase as any)
          .from("experiments")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 3-Card Layout */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Today's One Thing */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">Today's One Thing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayTask ? (
              <div className="space-y-2">
                <p className="font-medium">{(todayTask as any).one_thing}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{(todayTask as any).why_matters}</p>
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

        {/* Active Experiment */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">Active Experiment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeExperiment ? (
              <div className="space-y-2">
                <p className="font-medium">{(activeExperiment as any).title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{(activeExperiment as any).identity_shift_target}</p>
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

        {/* Direction Sync */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">Direction Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncResult ? (
              <div 
                className="cursor-pointer" 
                onClick={() => setShowSyncDetail(true)}
              >
                <p className="text-sm leading-relaxed line-clamp-3 hover:text-primary transition-colors">
                  {syncResult}
                </p>
                <p className="text-xs text-muted-foreground mt-2">Click to read full</p>
              </div>
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

      {/* Simple Actions */}
      <div className="flex flex-wrap items-center gap-4 justify-center text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/insights")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Lightbulb className="mr-2 h-4 w-4" />
          Add Insight
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/experiments")}
          className="text-muted-foreground hover:text-foreground"
        >
          <FlaskConical className="mr-2 h-4 w-4" />
          Add Experiment
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/topics")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Map className="mr-2 h-4 w-4" />
          Add Path
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/documents")}
          className="text-muted-foreground hover:text-foreground"
        >
          <FileText className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Direction Sync Detail Dialog */}
      <Dialog open={showSyncDetail} onOpenChange={setShowSyncDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Direction Sync</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {syncResult}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
