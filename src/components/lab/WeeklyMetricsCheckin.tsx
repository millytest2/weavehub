import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Briefcase, 
  Activity, 
  FileText, 
  Heart, 
  Brain, 
  Gamepad2,
  Check,
  Target,
  TrendingUp,
  Sparkles,
  Copy,
  Loader2
} from "lucide-react";

interface UserGoal {
  id: string;
  domain: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  unit: string;
  target_date: string | null;
}

interface MetricLog {
  id: string;
  goal_id: string;
  value: number;
  notes: string | null;
  logged_at: string;
  week_number: number;
  year: number;
}

interface WeeklyMetricsCheckinProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekNumber: number;
  year: number;
  weekStart: string;
  onComplete: () => void;
}

const DOMAIN_CONFIG = {
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-500' },
  body: { label: 'Body', icon: Activity, color: 'text-green-500' },
  content: { label: 'Content', icon: FileText, color: 'text-purple-500' },
  relationship: { label: 'Relationship', icon: Heart, color: 'text-pink-500' },
  mind: { label: 'Mind', icon: Brain, color: 'text-orange-500' },
  play: { label: 'Play', icon: Gamepad2, color: 'text-cyan-500' },
} as const;

export function WeeklyMetricsCheckin({ 
  open, 
  onOpenChange, 
  weekNumber, 
  year, 
  weekStart,
  onComplete 
}: WeeklyMetricsCheckinProps) {
  const { user } = useAuth();
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [metricNotes, setMetricNotes] = useState<Record<string, string>>({});
  const [previousLogs, setPreviousLogs] = useState<Record<string, MetricLog>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGoalSetup, setShowGoalSetup] = useState(false);
  const [extractingGoals, setExtractingGoals] = useState(false);
  const [pendingGoals, setPendingGoals] = useState<Partial<UserGoal>[]>([]);

  useEffect(() => {
    if (open && user) {
      fetchGoalsAndLogs();
    }
  }, [open, user]);

  const fetchGoalsAndLogs = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      // Fetch existing goals
      const { data: goalsData, error: goalsError } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id);

      if (goalsError) throw goalsError;

      if (!goalsData || goalsData.length === 0) {
        // No goals exist, need to extract from identity
        await extractGoalsFromIdentity();
        setLoading(false);
        return;
      }

      setGoals(goalsData);

      // Fetch most recent log for each goal
      const { data: logsData, error: logsError } = await supabase
        .from("metric_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("logged_at", { ascending: false });

      if (logsError) throw logsError;

      // Get most recent log per goal
      const latestLogs: Record<string, MetricLog> = {};
      logsData?.forEach(log => {
        if (!latestLogs[log.goal_id]) {
          latestLogs[log.goal_id] = log;
        }
      });
      setPreviousLogs(latestLogs);

      // Pre-fill with current values
      const values: Record<string, string> = {};
      goalsData.forEach(goal => {
        values[goal.id] = goal.current_value?.toString() || "0";
      });
      setMetricValues(values);

    } catch (error) {
      console.error("Error fetching goals:", error);
      toast.error("Failed to load goals");
    } finally {
      setLoading(false);
    }
  };

  const extractGoalsFromIdentity = async () => {
    if (!user) return;
    setExtractingGoals(true);

    try {
      // Fetch identity seed
      const { data: identitySeed, error } = await supabase
        .from("identity_seeds")
        .select("year_note, core_values, content, weekly_focus")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!identitySeed?.year_note) {
        toast.error("Please set your 2026 Direction in the Identity page first");
        onOpenChange(false);
        return;
      }

      // Call AI to extract goals
      const { data, error: aiError } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "extract_goals",
          identity: {
            year_note: identitySeed.year_note,
            core_values: identitySeed.core_values,
            content: identitySeed.content,
            weekly_focus: identitySeed.weekly_focus
          }
        }
      });

      if (aiError) throw aiError;

      if (data?.goals && Array.isArray(data.goals)) {
        setPendingGoals(data.goals);
        setShowGoalSetup(true);
      } else {
        toast.error("Could not extract goals. Please try again.");
      }

    } catch (error) {
      console.error("Error extracting goals:", error);
      toast.error("Failed to extract goals from identity");
    } finally {
      setExtractingGoals(false);
    }
  };

  const saveExtractedGoals = async () => {
    if (!user || pendingGoals.length === 0) return;
    setSaving(true);

    try {
      const goalsToInsert = pendingGoals.map(goal => ({
        user_id: user.id,
        domain: goal.domain,
        goal_name: goal.goal_name,
        target_value: goal.target_value || 0,
        current_value: 0,
        unit: goal.unit || "",
        target_date: goal.target_date || null
      }));

      const { data, error } = await supabase
        .from("user_goals")
        .insert(goalsToInsert)
        .select();

      if (error) throw error;

      setGoals(data);
      setShowGoalSetup(false);
      setPendingGoals([]);

      // Pre-fill with zeros
      const values: Record<string, string> = {};
      data.forEach(goal => {
        values[goal.id] = "0";
      });
      setMetricValues(values);

      toast.success("Goals saved! Now log your first metrics.");

    } catch (error) {
      console.error("Error saving goals:", error);
      toast.error("Failed to save goals");
    } finally {
      setSaving(false);
    }
  };

  const handleLogMetrics = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // Create metric logs for each goal
      const logsToInsert = goals.map(goal => ({
        user_id: user.id,
        goal_id: goal.id,
        value: parseFloat(metricValues[goal.id] || "0"),
        notes: metricNotes[goal.id] || null,
        week_number: weekNumber,
        year: year
      }));

      const { error: logsError } = await supabase
        .from("metric_logs")
        .insert(logsToInsert);

      if (logsError) throw logsError;

      // Update current_value on each goal
      for (const goal of goals) {
        const newValue = parseFloat(metricValues[goal.id] || "0");
        await supabase
          .from("user_goals")
          .update({ current_value: newValue })
          .eq("id", goal.id);
      }

      toast.success("Week logged!");
      onComplete();
      onOpenChange(false);

    } catch (error) {
      console.error("Error logging metrics:", error);
      toast.error("Failed to log metrics");
    } finally {
      setSaving(false);
    }
  };

  const calculateProgress = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(Math.round((current / target) * 100), 100);
  };

  const calculateChange = (goalId: string, currentValue: number) => {
    const prevLog = previousLogs[goalId];
    if (!prevLog) return null;
    return currentValue - prevLog.value;
  };

  if (loading || extractingGoals) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">
              {extractingGoals ? "Extracting goals from your identity..." : "Loading..."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Goal setup flow
  if (showGoalSetup) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Confirm Your Goals
            </DialogTitle>
            <DialogDescription>
              We extracted these from your 2026 Direction. Adjust if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pendingGoals.map((goal, index) => {
              const config = DOMAIN_CONFIG[goal.domain as keyof typeof DOMAIN_CONFIG];
              const Icon = config?.icon || Target;
              
              return (
                <Card key={index} className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`h-4 w-4 ${config?.color || 'text-muted-foreground'}`} />
                    <Badge variant="outline" className="capitalize">{goal.domain}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Label className="text-xs text-muted-foreground">Goal Name</Label>
                      <Input
                        value={goal.goal_name || ""}
                        onChange={(e) => {
                          const updated = [...pendingGoals];
                          updated[index] = { ...updated[index], goal_name: e.target.value };
                          setPendingGoals(updated);
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Target</Label>
                      <Input
                        type="number"
                        value={goal.target_value || ""}
                        onChange={(e) => {
                          const updated = [...pendingGoals];
                          updated[index] = { ...updated[index], target_value: parseFloat(e.target.value) || 0 };
                          setPendingGoals(updated);
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Unit</Label>
                      <Input
                        value={goal.unit || ""}
                        onChange={(e) => {
                          const updated = [...pendingGoals];
                          updated[index] = { ...updated[index], unit: e.target.value };
                          setPendingGoals(updated);
                        }}
                        placeholder="lbs, $, followers..."
                        className="text-sm"
                      />
                    </div>
                  </div>
                </Card>
              );
            })}

            <Button className="w-full" onClick={saveExtractedGoals} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirm Goals
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main metric logging flow
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Week {weekNumber} Check-in
          </DialogTitle>
          <DialogDescription>
            Log your actual numbers for this week
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {goals.map((goal) => {
            const config = DOMAIN_CONFIG[goal.domain as keyof typeof DOMAIN_CONFIG];
            const Icon = config?.icon || Target;
            const currentValue = parseFloat(metricValues[goal.id] || "0");
            const progress = calculateProgress(currentValue, goal.target_value);
            const change = calculateChange(goal.id, currentValue);
            
            return (
              <Card key={goal.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config?.color || 'text-muted-foreground'}`} />
                    <span className="font-medium">{goal.goal_name}</span>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    Target: {goal.target_value.toLocaleString()} {goal.unit}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={metricValues[goal.id] || ""}
                        onChange={(e) => setMetricValues(prev => ({ 
                          ...prev, 
                          [goal.id]: e.target.value 
                        }))}
                        className="text-lg font-medium"
                        placeholder="0"
                      />
                      <span className="text-muted-foreground text-sm whitespace-nowrap">
                        {goal.unit}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right min-w-[80px]">
                    <div className="text-lg font-bold text-primary">{progress}%</div>
                    {change !== null && (
                      <div className={`text-xs ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {change >= 0 ? '+' : ''}{change.toLocaleString()} {goal.unit}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Optional notes */}
                <div className="mt-3">
                  <Input
                    placeholder="Notes (optional)"
                    value={metricNotes[goal.id] || ""}
                    onChange={(e) => setMetricNotes(prev => ({ 
                      ...prev, 
                      [goal.id]: e.target.value 
                    }))}
                    className="text-sm"
                  />
                </div>
              </Card>
            );
          })}

          <Button className="w-full" onClick={handleLogMetrics} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Log Week {weekNumber}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
