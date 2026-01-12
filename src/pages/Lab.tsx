import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { 
  FlaskConical, 
  Plus, 
  Calendar, 
  TrendingUp, 
  Zap, 
  Clock, 
  Target,
  BarChart3,
  MessageSquare,
  Quote,
  Lightbulb,
  Users,
  Sparkles,
  Copy,
  Check
} from "lucide-react";

interface Experiment {
  id: string;
  title: string;
  description: string | null;
  hypothesis: string | null;
  status: string;
  experiment_type: string;
  duration_days: number;
  metrics_tracked: string[];
  current_day: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ExperimentLog {
  id: string;
  experiment_id: string;
  day_number: number;
  metrics_data: Record<string, any>;
  observations: string | null;
  energy_level: number | null;
  created_at: string;
}

interface Observation {
  id: string;
  observation_type: string;
  content: string;
  source: string | null;
  your_data: string | null;
  post_drafted: boolean;
  posted_at: string | null;
  platform: string | null;
  generated_post: string | null;
  experiment_id: string | null;
  created_at: string;
}

const Lab = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [loading, setLoading] = useState(true);
  
  // Experiments state
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentLogs, setExperimentLogs] = useState<ExperimentLog[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  
  // Dialogs
  const [showNewExperiment, setShowNewExperiment] = useState(false);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [showNewObservation, setShowNewObservation] = useState(false);
  const [showPostGenerator, setShowPostGenerator] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  
  // Form state
  const [newExperiment, setNewExperiment] = useState({
    title: "",
    hypothesis: "",
    duration_days: 14,
    experiment_type: "personal",
    metrics: ""
  });
  const [dailyLog, setDailyLog] = useState({
    observations: "",
    energy_level: 7,
    metrics: {} as Record<string, string>
  });
  const [newObservation, setNewObservation] = useState({
    type: "quote",
    content: "",
    source: "",
    your_data: ""
  });
  const [generatedPost, setGeneratedPost] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    if (!adminLoading && !isAdmin) {
      navigate("/");
      return;
    }
  }, [user, authLoading, isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      const [expResult, logsResult, obsResult] = await Promise.all([
        supabase
          .from("experiments")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("experiment_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("observations")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      ]);

      if (expResult.data) setExperiments(expResult.data as any);
      if (logsResult.data) setExperimentLogs(logsResult.data as any);
      if (obsResult.data) setObservations(obsResult.data as any);
    } catch (error) {
      console.error("Error fetching lab data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExperiment = async () => {
    if (!user || !newExperiment.title.trim()) return;
    
    try {
      const metrics = newExperiment.metrics.split(",").map(m => m.trim()).filter(Boolean);
      
      const { error } = await supabase.from("experiments").insert({
        user_id: user.id,
        title: newExperiment.title,
        hypothesis: newExperiment.hypothesis || null,
        duration_days: newExperiment.duration_days,
        experiment_type: newExperiment.experiment_type,
        metrics_tracked: metrics,
        status: "in_progress",
        current_day: 1,
        started_at: new Date().toISOString()
      });

      if (error) throw error;
      
      toast.success("Experiment started!");
      setShowNewExperiment(false);
      setNewExperiment({ title: "", hypothesis: "", duration_days: 14, experiment_type: "personal", metrics: "" });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleLogDay = async () => {
    if (!user || !selectedExperiment) return;
    
    try {
      const currentDay = selectedExperiment.current_day || 1;
      
      await supabase.from("experiment_logs").insert({
        user_id: user.id,
        experiment_id: selectedExperiment.id,
        day_number: currentDay,
        observations: dailyLog.observations || null,
        energy_level: dailyLog.energy_level,
        metrics_data: dailyLog.metrics
      });

      // Update experiment current day
      const newDay = currentDay + 1;
      const isComplete = newDay > selectedExperiment.duration_days;
      
      await supabase.from("experiments").update({
        current_day: newDay,
        status: isComplete ? "completed" : "in_progress",
        completed_at: isComplete ? new Date().toISOString() : null
      }).eq("id", selectedExperiment.id);

      toast.success(isComplete ? "Experiment completed!" : `Day ${currentDay} logged!`);
      setShowDailyLog(false);
      setDailyLog({ observations: "", energy_level: 7, metrics: {} });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreateObservation = async () => {
    if (!user || !newObservation.content.trim()) return;
    
    try {
      const { error } = await supabase.from("observations").insert({
        user_id: user.id,
        observation_type: newObservation.type,
        content: newObservation.content,
        source: newObservation.source || null,
        your_data: newObservation.your_data || null
      });

      if (error) throw error;
      
      toast.success("Observation captured!");
      setShowNewObservation(false);
      setNewObservation({ type: "quote", content: "", source: "", your_data: "" });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleGeneratePost = async () => {
    if (!selectedObservation) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "post_generator",
          observation: {
            type: selectedObservation.observation_type,
            content: selectedObservation.content,
            source: selectedObservation.source,
            your_data: selectedObservation.your_data
          }
        }
      });

      if (error) throw error;
      
      setGeneratedPost(data.post || "Could not generate post");
      
      // Save to observation
      await supabase.from("observations").update({
        generated_post: data.post,
        post_drafted: true
      }).eq("id", selectedObservation.id);
      
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to generate post");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPost = () => {
    navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const activeExperiments = experiments.filter(e => e.status === "in_progress");
  const completedExperiments = experiments.filter(e => e.status === "completed");

  if (authLoading || adminLoading) {
    return (
      <MainLayout>
        <div className="p-4 sm:p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold">Lab</h1>
          </div>
          <Badge variant="outline" className="text-xs">Private</Badge>
        </div>

        <Tabs defaultValue="experiments" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="experiments" className="gap-2">
              <FlaskConical className="h-4 w-4" />
              Experiments
            </TabsTrigger>
            <TabsTrigger value="observations" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Observations
            </TabsTrigger>
          </TabsList>

          {/* EXPERIMENTS TAB */}
          <TabsContent value="experiments" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Track experiments with daily logs and metrics</p>
              <Button size="sm" onClick={() => setShowNewExperiment(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Experiment
              </Button>
            </div>

            {/* Active Experiments */}
            {activeExperiments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Active ({activeExperiments.length})
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {activeExperiments.map((exp) => {
                    const progress = Math.round((exp.current_day / exp.duration_days) * 100);
                    const logsForExp = experimentLogs.filter(l => l.experiment_id === exp.id);
                    
                    return (
                      <Card key={exp.id} className="border-primary/30 bg-primary/5">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <Badge variant="outline" className="mb-2 text-xs">
                                {exp.experiment_type}
                              </Badge>
                              <CardTitle className="text-lg">{exp.title}</CardTitle>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-primary">
                                Day {exp.current_day}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                of {exp.duration_days}
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {exp.hypothesis && (
                            <p className="text-sm text-muted-foreground italic">
                              "{exp.hypothesis}"
                            </p>
                          )}
                          
                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all" 
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {progress}% complete • {logsForExp.length} logs recorded
                            </p>
                          </div>

                          {/* Metrics tracked */}
                          {exp.metrics_tracked && exp.metrics_tracked.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(exp.metrics_tracked as string[]).map((m, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <Button 
                            className="w-full" 
                            onClick={() => {
                              setSelectedExperiment(exp);
                              setShowDailyLog(true);
                            }}
                          >
                            <Calendar className="h-4 w-4 mr-2" />
                            Log Day {exp.current_day}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed Experiments */}
            {completedExperiments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Completed ({completedExperiments.length})
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {completedExperiments.map((exp) => {
                    const logsForExp = experimentLogs.filter(l => l.experiment_id === exp.id);
                    const avgEnergy = logsForExp.length > 0 
                      ? (logsForExp.reduce((sum, l) => sum + (l.energy_level || 0), 0) / logsForExp.length).toFixed(1)
                      : "N/A";
                    
                    return (
                      <Card key={exp.id}>
                        <CardHeader className="pb-2">
                          <Badge variant="outline" className="w-fit mb-2 text-xs bg-green-500/10 text-green-500">
                            Completed
                          </Badge>
                          <CardTitle className="text-base">{exp.title}</CardTitle>
                          <CardDescription>
                            {exp.duration_days} days • {logsForExp.length} logs
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Avg Energy</p>
                              <p className="font-medium">{avgEnergy}/10</p>
                            </div>
                            {exp.completed_at && (
                              <div>
                                <p className="text-muted-foreground">Completed</p>
                                <p className="font-medium">{format(new Date(exp.completed_at), "MMM d")}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {experiments.length === 0 && !loading && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No experiments yet</p>
                  <Button onClick={() => setShowNewExperiment(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Start Your First Experiment
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* OBSERVATIONS TAB */}
          <TabsContent value="observations" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Capture moments for content</p>
              <Button size="sm" onClick={() => setShowNewObservation(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Observation
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {observations.map((obs) => (
                <Card 
                  key={obs.id} 
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setSelectedObservation(obs);
                    setGeneratedPost(obs.generated_post || "");
                    setShowPostGenerator(true);
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      {obs.observation_type === "quote" && <Quote className="h-4 w-4 text-blue-500" />}
                      {obs.observation_type === "decision" && <Target className="h-4 w-4 text-orange-500" />}
                      {obs.observation_type === "presence" && <Users className="h-4 w-4 text-purple-500" />}
                      {obs.observation_type === "insight" && <Lightbulb className="h-4 w-4 text-yellow-500" />}
                      <Badge variant="outline" className="text-xs capitalize">
                        {obs.observation_type}
                      </Badge>
                      {obs.post_drafted && (
                        <Badge variant="secondary" className="text-xs">
                          Drafted
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm line-clamp-3">{obs.content}</p>
                    {obs.source && (
                      <p className="text-xs text-muted-foreground mt-2">— {obs.source}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {observations.length === 0 && !loading && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No observations yet</p>
                  <Button onClick={() => setShowNewObservation(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Capture Your First Observation
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* NEW EXPERIMENT DIALOG */}
        <Dialog open={showNewExperiment} onOpenChange={setShowNewExperiment}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Experiment</DialogTitle>
              <DialogDescription>
                What do you want to test?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input 
                  placeholder="e.g., 4-hour deep work vs 12-hour days"
                  value={newExperiment.title}
                  onChange={(e) => setNewExperiment(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Hypothesis</Label>
                <Textarea 
                  placeholder="What do you expect to happen?"
                  value={newExperiment.hypothesis}
                  onChange={(e) => setNewExperiment(p => ({ ...p, hypothesis: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duration (days)</Label>
                  <Input 
                    type="number"
                    value={newExperiment.duration_days}
                    onChange={(e) => setNewExperiment(p => ({ ...p, duration_days: parseInt(e.target.value) || 7 }))}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={newExperiment.experiment_type}
                    onChange={(e) => setNewExperiment(p => ({ ...p, experiment_type: e.target.value }))}
                  >
                    <option value="personal">Personal</option>
                    <option value="upath">UPath</option>
                    <option value="integration">Integration</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Metrics to track (comma-separated)</Label>
                <Input 
                  placeholder="e.g., Features shipped, Energy level, Hours worked"
                  value={newExperiment.metrics}
                  onChange={(e) => setNewExperiment(p => ({ ...p, metrics: e.target.value }))}
                />
              </div>
              <Button className="w-full" onClick={handleCreateExperiment}>
                <FlaskConical className="h-4 w-4 mr-2" />
                Start Experiment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DAILY LOG DIALOG */}
        <Dialog open={showDailyLog} onOpenChange={setShowDailyLog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Day {selectedExperiment?.current_day} Log
              </DialogTitle>
              <DialogDescription>
                {selectedExperiment?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Observations</Label>
                <Textarea 
                  placeholder="What did you notice today?"
                  value={dailyLog.observations}
                  onChange={(e) => setDailyLog(p => ({ ...p, observations: e.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <Label>Energy Level (1-10): {dailyLog.energy_level}</Label>
                <input 
                  type="range"
                  min="1"
                  max="10"
                  value={dailyLog.energy_level}
                  onChange={(e) => setDailyLog(p => ({ ...p, energy_level: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              {/* Dynamic metric inputs */}
              {selectedExperiment?.metrics_tracked && (selectedExperiment.metrics_tracked as string[]).length > 0 && (
                <div className="space-y-3">
                  <Label>Metrics</Label>
                  {(selectedExperiment.metrics_tracked as string[]).map((metric, i) => (
                    <div key={i}>
                      <Label className="text-xs text-muted-foreground">{metric}</Label>
                      <Input 
                        placeholder={`Value for ${metric}`}
                        value={dailyLog.metrics[metric] || ""}
                        onChange={(e) => setDailyLog(p => ({
                          ...p,
                          metrics: { ...p.metrics, [metric]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={handleLogDay}>
                <Check className="h-4 w-4 mr-2" />
                Log Day {selectedExperiment?.current_day}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NEW OBSERVATION DIALOG */}
        <Dialog open={showNewObservation} onOpenChange={setShowNewObservation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Observation</DialogTitle>
              <DialogDescription>
                Capture a moment for content
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {[
                    { id: "quote", icon: Quote, label: "Quote" },
                    { id: "decision", icon: Target, label: "Decision" },
                    { id: "presence", icon: Users, label: "Presence" },
                    { id: "insight", icon: Lightbulb, label: "Insight" },
                  ].map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      onClick={() => setNewObservation(p => ({ ...p, type: id }))}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                        newObservation.type === id 
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Content</Label>
                <Textarea 
                  placeholder="What did you observe?"
                  value={newObservation.content}
                  onChange={(e) => setNewObservation(p => ({ ...p, content: e.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <Label>Source (optional)</Label>
                <Input 
                  placeholder="e.g., Hormozi podcast, meeting with X"
                  value={newObservation.source}
                  onChange={(e) => setNewObservation(p => ({ ...p, source: e.target.value }))}
                />
              </div>
              <div>
                <Label>Your data / how you applied it (optional)</Label>
                <Textarea 
                  placeholder="How did you test this? What were your results?"
                  value={newObservation.your_data}
                  onChange={(e) => setNewObservation(p => ({ ...p, your_data: e.target.value }))}
                  rows={2}
                />
              </div>
              <Button className="w-full" onClick={handleCreateObservation}>
                <Plus className="h-4 w-4 mr-2" />
                Save Observation
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* POST GENERATOR DIALOG */}
        <Dialog open={showPostGenerator} onOpenChange={setShowPostGenerator}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Post Generator</DialogTitle>
              <DialogDescription>
                Turn this observation into content
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Original observation */}
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="capitalize text-xs">
                      {selectedObservation?.observation_type}
                    </Badge>
                    {selectedObservation?.source && (
                      <span className="text-xs text-muted-foreground">
                        — {selectedObservation.source}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{selectedObservation?.content}</p>
                  {selectedObservation?.your_data && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      Your data: {selectedObservation.your_data}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Generate button */}
              {!generatedPost && (
                <Button 
                  className="w-full" 
                  onClick={handleGeneratePost}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Post
                    </>
                  )}
                </Button>
              )}

              {/* Generated post */}
              {generatedPost && (
                <div className="space-y-3">
                  <Label>Generated Post</Label>
                  <Textarea 
                    value={generatedPost}
                    onChange={(e) => setGeneratedPost(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleCopyPost} variant="outline" className="flex-1">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={handleGeneratePost} 
                      variant="outline"
                      disabled={isGenerating}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Lab;