import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const [syncResult, setSyncResult] = useState<any>(null);
  const [showSyncDetail, setShowSyncDetail] = useState(false);
  const [quickInsight, setQuickInsight] = useState("");

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
        supabase
          .from("experiments")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "in_progress")
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

  const handleSaveQuickInsight = async () => {
    if (!user || !quickInsight.trim()) return;
    
    try {
      const title = quickInsight.trim().substring(0, 60);
      const { error } = await supabase
        .from("insights")
        .insert({
          user_id: user.id,
          title,
          content: quickInsight.trim(),
          source: "quick_capture"
        });
      
      if (error) throw error;
      
      toast.success("Insight saved");
      setQuickInsight("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save insight");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
      {/* 3-Card Layout - Mobile First */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Today's One Thing */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg font-medium">Today's One Thing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayTask ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">{(todayTask as any).one_thing}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{(todayTask as any).why_matters}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No focus set yet</p>
            )}
            <Button
              size="default"
              onClick={handleGenerateDailyOne}
              disabled={isGenerating}
              className="w-full min-h-[44px]"
            >
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
          </CardContent>
        </Card>

        {/* Active Experiment */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg font-medium">Active Experiment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeExperiment ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">{(activeExperiment as any).title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{(activeExperiment as any).description}</p>
                <p className="text-xs text-muted-foreground mt-1">Duration: {(activeExperiment as any).duration || "Not set"}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active experiment. Pick one from Experiments or generate a new one.</p>
            )}
            <Button
              size="default"
              onClick={() => navigate("/experiments")}
              variant="outline"
              className="w-full min-h-[44px]"
            >
              {activeExperiment ? "View Experiment" : "Start Experiment"}
            </Button>
          </CardContent>
        </Card>

        {/* Direction Sync */}
        <Card className="rounded-[10px] border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg font-medium">Direction Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncResult ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">{syncResult.headline}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{syncResult.summary}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Get clarity on where you're heading</p>
            )}
            <div className="flex gap-2">
              <Button
                size="default"
                onClick={handleSyncLife}
                disabled={isSyncing}
                className="flex-1 min-h-[44px]"
              >
                {isSyncing ? "Syncing..." : "Sync"}
              </Button>
              {syncResult && (
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => setShowSyncDetail(true)}
                  className="flex-1 min-h-[44px]"
                >
                  View
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Insight Capture */}
      <Card className="rounded-[10px] border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-medium">Quick Insight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Drop a thought, pattern, or realization…"
            value={quickInsight}
            onChange={(e) => setQuickInsight(e.target.value)}
            className="min-h-[80px] resize-none"
          />
          <Button
            size="default"
            onClick={handleSaveQuickInsight}
            disabled={!quickInsight.trim()}
            className="w-full min-h-[44px]"
          >
            Save Insight
          </Button>
        </CardContent>
      </Card>

      {/* Simple Actions */}
      <div className="flex flex-wrap items-center gap-3 justify-center text-sm">
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate("/insights")}
          className="text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <Lightbulb className="mr-2 h-4 w-4" />
          Add Insight
        </Button>
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate("/experiments")}
          className="text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <FlaskConical className="mr-2 h-4 w-4" />
          Add Experiment
        </Button>
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate("/topics")}
          className="text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <Map className="mr-2 h-4 w-4" />
          Add Path
        </Button>
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate("/documents")}
          className="text-muted-foreground hover:text-foreground min-h-[44px]"
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
          {syncResult && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{syncResult.headline}</h3>
                <p className="text-sm leading-relaxed">{syncResult.summary}</p>
              </div>
              
              {syncResult.suggested_next_step && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Suggested Next Step</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {syncResult.suggested_next_step}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
