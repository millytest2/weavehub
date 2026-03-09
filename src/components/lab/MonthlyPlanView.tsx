import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Check, 
  Circle, 
  X, 
  Calendar,
  Target,
  MapPin,
  Mic,
  MicOff,
  ChevronDown,
  ChevronUp,
  Flame
} from "lucide-react";
import { toast } from "sonner";
import { format, getWeek, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, isWithinInterval, isSameMonth } from "date-fns";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

interface MonthlyPlan {
  id: string;
  text: string;
  event_date: string | null;
  plan_type: string;
  completed: boolean;
  sort_order: number;
}

interface WeekSummary {
  weekNumber: number;
  actionCount: number;
  topPillars: { name: string; count: number }[];
  intentions: { text: string; completed: boolean }[];
  events: MonthlyPlan[];
}

const PLAN_TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  goal: { icon: Target, label: "Goal", color: "text-primary" },
  event: { icon: MapPin, label: "Event", color: "text-blue-500" },
  milestone: { icon: Flame, label: "Milestone", color: "text-orange-500" },
};

const PILLAR_COLORS: Record<string, string> = {
  business: "bg-blue-500",
  body: "bg-green-500",
  content: "bg-purple-500",
  relationship: "bg-pink-500",
  mind: "bg-orange-500",
  play: "bg-cyan-500",
};

export function MonthlyPlanView() {
  const { user } = useAuth();
  const now = new Date();
  const monthNumber = now.getMonth() + 1;
  const year = now.getFullYear();

  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [weeklyIntentions, setWeeklyIntentions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<string>("goal");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<{ title: string; capability_focus: string | null } | null>(null);

  const { isRecording, toggleRecording, isSupported } = useVoiceCaptureWebSpeech({
    maxDuration: 30,
    onTranscript: (text) => setNewText(text),
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const mStart = format(startOfMonth(now), "yyyy-MM-dd");
    const mEnd = format(endOfMonth(now), "yyyy-MM-dd");

    try {
      const [plansRes, actionsRes, intentionsRes, milestoneRes] = await Promise.all([
        supabase
          .from("monthly_plans")
          .select("*")
          .eq("user_id", user.id)
          .eq("month_number", monthNumber)
          .eq("year", year)
          .order("event_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("action_history")
          .select("action_date, pillar, action_text")
          .eq("user_id", user.id)
          .gte("action_date", mStart)
          .lte("action_date", mEnd),
        supabase
          .from("weekly_intentions")
          .select("text, completed, week_number")
          .eq("user_id", user.id)
          .eq("year", year),
        supabase
          .from("thread_milestones")
          .select("title, capability_focus")
          .eq("user_id", user.id)
          .eq("year", 2026)
          .eq("month_number", monthNumber)
          .maybeSingle(),
      ]);

      setPlans(plansRes.data || []);
      setActions(actionsRes.data || []);
      setWeeklyIntentions(intentionsRes.data || []);
      setMilestone(milestoneRes.data);
    } catch (err) {
      console.error("Error fetching monthly data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Build week summaries
  const weekSummaries = useMemo<WeekSummary[]>(() => {
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    const weeks = eachWeekOfInterval({ start: mStart, end: mEnd }, { weekStartsOn: 1 });

    return weeks.map(weekStart => {
      const wStart = startOfWeek(weekStart, { weekStartsOn: 1 });
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const wNum = getWeek(weekStart, { weekStartsOn: 1 });

      // Actions in this week
      const weekActions = actions.filter(a => {
        const d = new Date(a.action_date);
        return isWithinInterval(d, { start: wStart, end: wEnd });
      });

      // Pillar distribution
      const pillarCounts: Record<string, number> = {};
      weekActions.forEach(a => {
        if (a.pillar) pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      });
      const topPillars = Object.entries(pillarCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([name, count]) => ({ name, count }));

      // Intentions for this week
      const weekIntentions = weeklyIntentions
        .filter(i => i.week_number === wNum)
        .map(i => ({ text: i.text, completed: i.completed }));

      // Events in this week
      const weekEvents = plans.filter(p => {
        if (!p.event_date) return false;
        const d = new Date(p.event_date);
        return isWithinInterval(d, { start: wStart, end: wEnd });
      });

      return {
        weekNumber: wNum,
        actionCount: weekActions.length,
        topPillars,
        intentions: weekIntentions,
        events: weekEvents,
      };
    });
  }, [actions, plans, weeklyIntentions]);

  const addPlan = async () => {
    if (!user || !newText.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("monthly_plans").insert({
        user_id: user.id,
        text: newText.trim(),
        month_number: monthNumber,
        year,
        plan_type: newType,
        event_date: newDate || null,
        sort_order: plans.length,
      });
      if (error) throw error;
      setNewText("");
      setNewDate("");
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      console.error("Error adding plan:", err);
      toast.error("Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    try {
      await supabase.from("monthly_plans").update({ completed: !completed }).eq("id", id);
      setPlans(prev => prev.map(p => p.id === id ? { ...p, completed: !completed } : p));
    } catch (err) {
      console.error("Error toggling:", err);
    }
  };

  const removePlan = async (id: string) => {
    try {
      await supabase.from("monthly_plans").delete().eq("id", id);
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Error removing:", err);
    }
  };

  const totalActions = actions.length;
  const completedPlans = plans.filter(p => p.completed).length;
  const currentWeekNum = getWeek(now, { weekStartsOn: 1 });

  return (
    <Card className="p-4 rounded-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{format(now, "MMMM yyyy")}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{totalActions} actions</span>
          {plans.length > 0 && (
            <span className="text-xs text-muted-foreground">· {completedPlans}/{plans.length} goals</span>
          )}
        </div>
      </div>

      {/* Thread milestone context */}
      {milestone && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/10">
          <Target className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] text-primary font-medium uppercase tracking-wide">Thread</span>
            <p className="text-xs line-clamp-1">{milestone.title}</p>
          </div>
        </div>
      )}

      {/* Monthly plans list */}
      {plans.length > 0 && (
        <div className="space-y-1">
          {plans.map(plan => {
            const config = PLAN_TYPE_CONFIG[plan.plan_type] || PLAN_TYPE_CONFIG.goal;
            const Icon = config.icon;
            return (
              <div
                key={plan.id}
                className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <button onClick={() => toggleComplete(plan.id, plan.completed)} className="shrink-0">
                  {plan.completed ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <Icon className={`h-3.5 w-3.5 ${config.color} shrink-0`} />
                <span className={`text-sm flex-1 ${plan.completed ? "line-through text-muted-foreground" : ""}`}>
                  {plan.text}
                </span>
                {plan.event_date && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                    {format(new Date(plan.event_date), "MMM d")}
                  </Badge>
                )}
                <button
                  onClick={() => removePlan(plan.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new plan */}
      {showAddForm ? (
        <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex gap-1.5">
            {Object.entries(PLAN_TYPE_CONFIG).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setNewType(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                    newType === type ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {config.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder={newType === "event" ? "Going to New York" : "Get a job"}
              className="text-sm h-9"
              onKeyDown={e => e.key === "Enter" && addPlan()}
            />
            {isSupported && (
              <Button
                size="sm"
                variant={isRecording ? "destructive" : "outline"}
                className="h-9 w-9 p-0 shrink-0"
                onClick={toggleRecording}
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
          {(newType === "event" || newType === "milestone") && (
            <Input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="text-sm h-9"
            />
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-8" onClick={addPlan} disabled={!newText.trim() || adding}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2 rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Add goal, event, or milestone
        </button>
      )}

      {/* Weekly breakdown */}
      <div className="space-y-1 pt-1">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1">
          Weekly Breakdown
        </span>
        {weekSummaries.map(week => {
          const isCurrent = week.weekNumber === currentWeekNum;
          const isExpanded = expandedWeek === week.weekNumber;

          return (
            <button
              key={week.weekNumber}
              onClick={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
              className={`w-full text-left p-2.5 rounded-xl transition-colors ${
                isExpanded ? "bg-muted/50" : "hover:bg-muted/30"
              } ${isCurrent ? "ring-1 ring-primary/20" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                  W{week.weekNumber}
                </span>
                {isCurrent && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">Now</Badge>}
                <div className="flex-1 flex items-center gap-1">
                  {week.topPillars.map(({ name }) => (
                    <div key={name} className={`w-1.5 h-1.5 rounded-full ${PILLAR_COLORS[name] || "bg-muted-foreground"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{week.actionCount} actions</span>
                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </div>

              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5" onClick={e => e.stopPropagation()}>
                  {/* Intentions for this week */}
                  {week.intentions.length > 0 && (
                    <div className="space-y-0.5">
                      {week.intentions.map((int, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          {int.completed ? (
                            <Check className="h-3 w-3 text-green-500 shrink-0" />
                          ) : (
                            <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span className={int.completed ? "line-through text-muted-foreground" : ""}>
                            {int.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Events this week */}
                  {week.events.length > 0 && (
                    <div className="space-y-0.5">
                      {week.events.map(ev => (
                        <div key={ev.id} className="flex items-center gap-1.5 text-xs text-blue-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{ev.text}</span>
                          {ev.event_date && (
                            <span className="text-muted-foreground">{format(new Date(ev.event_date), "MMM d")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {week.intentions.length === 0 && week.events.length === 0 && week.actionCount === 0 && (
                    <p className="text-[11px] text-muted-foreground">No activity yet</p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
