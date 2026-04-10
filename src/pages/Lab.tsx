import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Plus, TrendingUp, Zap,
  Check, Network, PenLine, RefreshCw, Sparkles
} from "lucide-react";
import { WeeklyIntentions } from "@/components/lab/WeeklyIntentions";
import { MonthlyPlanView } from "@/components/lab/MonthlyPlanView";
import { WeeklyRhythmView } from "@/components/lab/WeeklyRhythmView";
import { JourneyFlow } from "@/components/lab/JourneyFlow";
import { FreeWriteSpace } from "@/components/lab/FreeWriteSpace";

type LabTab = "write" | "weekly" | "experiments" | "patterns";

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

const Lab = ({ embedded }: { embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<LabTab>("write");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  // Experiment dialogs
  const [showNewExperiment, setShowNewExperiment] = useState(false);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [newExperiment, setNewExperiment] = useState({ title: "", hypothesis: "", duration_days: 14, experiment_type: "personal", metrics: "" });
  const [dailyLog, setDailyLog] = useState({ observations: "", energy_level: 7, metrics: {} as Record<string, string> });
  const [isGeneratingExperiment, setIsGeneratingExperiment] = useState(false);

  // Pattern state
  const [patternConnections, setPatternConnections] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchExperiments();
  }, [user]);

  const fetchExperiments = async () => {
    if (!user) return;
    const { data } = await supabase.from("experiments").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setExperiments(data as any);
    setLoading(false);
  };

  const handleCreateExperiment = async () => {
    if (!user || !newExperiment.title.trim()) return;
    const metrics = newExperiment.metrics.split(",").map(m => m.trim()).filter(Boolean);
    const { error } = await supabase.from("experiments").insert({
      user_id: user.id, title: newExperiment.title, hypothesis: newExperiment.hypothesis || null,
      duration_days: newExperiment.duration_days, experiment_type: newExperiment.experiment_type,
      metrics_tracked: metrics, status: "in_progress", current_day: 1, started_at: new Date().toISOString()
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Experiment started!");
    setShowNewExperiment(false);
    setNewExperiment({ title: "", hypothesis: "", duration_days: 14, experiment_type: "personal", metrics: "" });
    fetchExperiments();
  };

  const handleWeaveGenerate = async () => {
    if (!user) return;
    setIsGeneratingExperiment(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("experiment-generator", {
        body: { timezone }
      });
      // Edge function returns 4xx as data (not thrown), check for active experiment block
      if (data?.error && data?.active_experiment) {
        toast.error(`Pause or complete "${data.active_experiment.title}" first`, { duration: 4000 });
        setIsGeneratingExperiment(false);
        return;
      }
      if (error) throw error;
      if (data) {
        // Edge function returns { experiments: [...], sprint: {...} }
        const exp = data.experiments?.[0] || data;
        setNewExperiment({
          title: exp.title || "",
          hypothesis: exp.identity_shift_target || exp.description || "",
          duration_days: parseInt(String(exp.duration || "7").replace(/\D/g, '') || "7") || 7,
          experiment_type: exp.pillar?.toLowerCase() || "personal",
          metrics: ""
        });
        toast.success("Experiment woven from your patterns");
      }
    } catch (error: any) {
      const msg = error?.message || "Couldn't generate experiment";
      if (msg.includes("active experiment") || msg.includes("Complete or pause")) {
        toast.error("You have an active experiment — complete or pause it first", { duration: 4000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setIsGeneratingExperiment(false);
    }
  };

  const handleLogDay = async () => {
    if (!user || !selectedExperiment) return;
    const currentDay = selectedExperiment.current_day || 1;
    await supabase.from("experiment_logs").insert({
      user_id: user.id, experiment_id: selectedExperiment.id, day_number: currentDay,
      observations: dailyLog.observations || null, energy_level: dailyLog.energy_level, metrics_data: dailyLog.metrics
    });
    const newDay = currentDay + 1;
    const isComplete = newDay > selectedExperiment.duration_days;
    await supabase.from("experiments").update({
      current_day: newDay, status: isComplete ? "completed" : "in_progress",
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq("id", selectedExperiment.id);
    toast.success(isComplete ? "Experiment completed!" : `Day ${currentDay} logged!`);
    setShowDailyLog(false);
    setDailyLog({ observations: "", energy_level: 7, metrics: {} });
    fetchExperiments();
  };

  const handleAnalyzePatterns = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
      const [insightsRes, obsRes, expRes] = await Promise.all([
        supabase.from("insights").select("*, topics(id, name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("observations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("experiments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      const allContent = {
        insights: (insightsRes.data || []).slice(0, 100).map((i: any) => ({ title: i.title, content: i.content?.slice(0, 300), source: i.source, topic: i.topics?.name })),
        observations: (obsRes.data || []).slice(0, 30).map((o: any) => ({ type: o.observation_type, content: o.content?.slice(0, 200), source: o.source })),
        experiments: (expRes.data || []).slice(0, 15).map((e: any) => ({ title: e.title, hypothesis: e.hypothesis, type: e.experiment_type }))
      };
      const { data, error } = await supabase.functions.invoke("synthesizer", { body: { mode: "pattern_analyzer", content: allContent } });
      if (error) throw error;
      if (data.connections) {
        setPatternConnections(data.connections);
        toast.success(`Found ${data.connections.length} connections`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const activeExperiments = experiments.filter(e => e.status === "in_progress");
  const pausedExperiments = experiments.filter(e => e.status === "paused");
  const completedExperiments = experiments.filter(e => e.status === "completed");

  const tabs = [
    { id: "write" as LabTab, label: "Write", icon: PenLine },
    { id: "weekly" as LabTab, label: "Weekly", icon: TrendingUp },
    { id: "experiments" as LabTab, label: "Experiments", icon: FlaskConical },
    { id: "patterns" as LabTab, label: "Patterns", icon: Network },
  ];

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : MainLayout;

  return (
    <Wrapper>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Tab navigation — underline style matching Mind */}
        <div className="flex items-center border-b border-border/30">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="lab-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {/* WRITE */}
            {activeTab === "write" && <FreeWriteSpace />}

            {/* WEEKLY */}
            {activeTab === "weekly" && (
              <div className="space-y-8">
                <WeeklyIntentions />
                <WeeklyRhythmView onCheckin={() => {}} />
                <MonthlyPlanView />
                <JourneyFlow />
              </div>
            )}

            {/* EXPERIMENTS */}
            {activeTab === "experiments" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground/50">Track what you're testing</p>
                  <button
                    onClick={() => setShowNewExperiment(true)}
                    className="text-sm text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                </div>

                {activeExperiments.length > 0 && (
                  <div className="space-y-3">
                    {activeExperiments.map((exp) => {
                      const progress = Math.round((exp.current_day / exp.duration_days) * 100);
                      return (
                        <div key={exp.id} className="rounded-xl border border-primary/15 bg-primary/[0.03] p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/35">{exp.experiment_type}</span>
                              <p className="text-base font-medium mt-0.5">{exp.title}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-semibold text-primary/70">Day {exp.current_day}</p>
                              <p className="text-[11px] text-muted-foreground/30">of {exp.duration_days}</p>
                            </div>
                          </div>
                          {exp.hypothesis && (
                            <p className="text-[13px] text-muted-foreground/40 italic leading-relaxed">"{exp.hypothesis}"</p>
                          )}
                          <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                            <div className="h-full bg-primary/30 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => { setSelectedExperiment(exp); setShowDailyLog(true); }}
                              className="text-[13px] text-primary/50 hover:text-primary transition-colors"
                            >
                              Log day {exp.current_day} →
                            </button>
                            <button
                              onClick={async () => {
                                await supabase.from("experiments").update({ status: "paused" }).eq("id", exp.id);
                                setExperiments(prev => prev.map(e => e.id === exp.id ? { ...e, status: "paused" } : e));
                                toast.success("Experiment paused");
                              }}
                              className="text-[13px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                            >
                              Pause
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pausedExperiments.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground/25">Paused</p>
                    {pausedExperiments.map((exp) => (
                      <div key={exp.id} className="rounded-xl border border-border/20 p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground/60">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground/30">Day {exp.current_day} of {exp.duration_days}</p>
                        </div>
                        <button
                          onClick={async () => {
                            await supabase.from("experiments").update({ status: "in_progress" }).eq("id", exp.id);
                            setExperiments(prev => prev.map(e => e.id === exp.id ? { ...e, status: "in_progress" } : e));
                            toast.success("Experiment resumed");
                          }}
                          className="text-[12px] text-primary/40 hover:text-primary transition-colors"
                        >
                          Resume
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {completedExperiments.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground/25">Completed</p>
                    {completedExperiments.map((exp) => (
                      <div key={exp.id} className="rounded-xl border border-border/20 p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground/60">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground/30">{exp.duration_days} days</p>
                        </div>
                        <Check className="h-4 w-4 text-primary/30" />
                      </div>
                    ))}
                  </div>
                )}

                {experiments.length === 0 && !loading && (
                  <div className="text-center py-16 space-y-3">
                    <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/15" />
                    <p className="text-sm text-muted-foreground/30">No experiments yet</p>
                    <button onClick={() => setShowNewExperiment(true)} className="text-sm text-primary/50 hover:text-primary transition-colors">
                      Start one →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PATTERNS */}
            {activeTab === "patterns" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground/50">Cross-domain connections</p>
                  <button
                    onClick={handleAnalyzePatterns}
                    disabled={isAnalyzing}
                    className="text-sm text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    {isAnalyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </button>
                </div>

                {patternConnections.length > 0 ? (
                  <div className="space-y-3">
                    {patternConnections.map((connection, i) => (
                      <div key={i} className="rounded-xl border border-border/20 p-5 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {connection.domains?.map((domain: string, j: number) => (
                            <span key={j} className="text-[10px] uppercase tracking-widest text-muted-foreground/35">
                              {domain}{j < connection.domains.length - 1 ? ' ·' : ''}
                            </span>
                          ))}
                        </div>
                        <p className="text-base font-medium text-foreground/80">{connection.title}</p>
                        <p className="text-[13px] text-muted-foreground/40 leading-relaxed">{connection.insight}</p>
                      </div>
                    ))}
                  </div>
                ) : !isAnalyzing ? (
                  <div className="text-center py-16 space-y-3">
                    <Network className="h-8 w-8 mx-auto text-muted-foreground/15" />
                    <p className="text-sm text-muted-foreground/30">No patterns analyzed yet</p>
                    <p className="text-[12px] text-muted-foreground/20 max-w-xs mx-auto">
                      Find unexpected connections across your insights, experiments, and observations
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* NEW EXPERIMENT DIALOG */}
        <Dialog open={showNewExperiment} onOpenChange={setShowNewExperiment}>
          <DialogContent className="rounded-2xl border-border/30">
            <DialogHeader>
              <DialogTitle className="text-lg font-display">New Experiment</DialogTitle>
              <DialogDescription>What do you want to test?</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Weave Generate button */}
              <button
                onClick={handleWeaveGenerate}
                disabled={isGeneratingExperiment}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-primary/20 text-sm text-primary/60 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                {isGeneratingExperiment ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Weaving from your patterns...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Weave Generate — let the system suggest</>
                )}
              </button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border/30" />
                <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">or manual</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>

              <div><Label className="text-xs text-muted-foreground/50">Title</Label><Input placeholder="e.g., 4-hour deep work blocks" value={newExperiment.title} onChange={(e) => setNewExperiment(p => ({ ...p, title: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground/50">Hypothesis</Label><Textarea placeholder="What do you expect?" value={newExperiment.hypothesis} onChange={(e) => setNewExperiment(p => ({ ...p, hypothesis: e.target.value }))} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground/50">Days</Label><Input type="number" value={newExperiment.duration_days} onChange={(e) => setNewExperiment(p => ({ ...p, duration_days: parseInt(e.target.value) || 7 }))} /></div>
                <div><Label className="text-xs text-muted-foreground/50">Type</Label><select className="w-full h-10 rounded-lg border border-border/30 bg-background px-3 text-sm" value={newExperiment.experiment_type} onChange={(e) => setNewExperiment(p => ({ ...p, experiment_type: e.target.value }))}><option value="personal">Personal</option><option value="upath">UPath</option><option value="integration">Integration</option></select></div>
              </div>
              <div><Label className="text-xs text-muted-foreground/50">Metrics (comma-separated)</Label><Input placeholder="Energy, Output, Focus" value={newExperiment.metrics} onChange={(e) => setNewExperiment(p => ({ ...p, metrics: e.target.value }))} /></div>
              <Button className="w-full h-11 rounded-xl" onClick={handleCreateExperiment}>Start Experiment</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DAILY LOG DIALOG */}
        <Dialog open={showDailyLog} onOpenChange={setShowDailyLog}>
          <DialogContent className="rounded-2xl border-border/30">
            <DialogHeader>
              <DialogTitle className="text-lg font-display">Day {selectedExperiment?.current_day}</DialogTitle>
              <DialogDescription>{selectedExperiment?.title}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label className="text-xs text-muted-foreground/50">Observations</Label><Textarea placeholder="What did you notice?" value={dailyLog.observations} onChange={(e) => setDailyLog(p => ({ ...p, observations: e.target.value }))} rows={3} /></div>
              <div>
                <Label className="text-xs text-muted-foreground/50">Energy: {dailyLog.energy_level}/10</Label>
                <input type="range" min="1" max="10" value={dailyLog.energy_level} onChange={(e) => setDailyLog(p => ({ ...p, energy_level: parseInt(e.target.value) }))} className="w-full mt-1" />
              </div>
              {selectedExperiment?.metrics_tracked && (selectedExperiment.metrics_tracked as string[]).length > 0 && (
                <div className="space-y-2">
                  {(selectedExperiment.metrics_tracked as string[]).map((metric, i) => (
                    <div key={i}><Label className="text-xs text-muted-foreground/50">{metric}</Label><Input placeholder={`Value`} value={dailyLog.metrics[metric] || ""} onChange={(e) => setDailyLog(p => ({ ...p, metrics: { ...p.metrics, [metric]: e.target.value } }))} /></div>
                  ))}
                </div>
              )}
              <Button className="w-full h-11 rounded-xl" onClick={handleLogDay}>Log Day {selectedExperiment?.current_day}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Wrapper>
  );
};

export default Lab;
