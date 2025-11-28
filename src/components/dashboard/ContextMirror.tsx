import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Target, Compass, Activity } from "lucide-react";

interface ContextData {
  currentPhase: string | null;
  identitySeed: string | null;
  weeklyFocus: string | null;
  recentPillars: string[];
  insightCount: number;
  experimentCount: number;
  completedToday: number;
}

const PILLAR_COLORS: Record<string, string> = {
  "Mind": "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  "Body": "bg-green-500/20 text-green-600 dark:text-green-400",
  "Wealth": "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  "Relationships": "bg-pink-500/20 text-pink-600 dark:text-pink-400",
  "Joy": "bg-purple-500/20 text-purple-600 dark:text-purple-400",
};

export const ContextMirror = () => {
  const { user } = useAuth();
  const [context, setContext] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchContext = async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const today = new Date().toISOString().split("T")[0];

      const [identityRes, tasksRes, insightsRes, experimentsRes] = await Promise.all([
        supabase
          .from("identity_seeds")
          .select("content, current_phase, weekly_focus")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("daily_tasks")
          .select("pillar, completed, task_date")
          .eq("user_id", user.id)
          .gte("task_date", sevenDaysAgo.toISOString().split("T")[0])
          .order("task_date", { ascending: false }),
        supabase
          .from("insights")
          .select("id")
          .eq("user_id", user.id),
        supabase
          .from("experiments")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["in_progress", "completed"]),
      ]);

      const tasks = tasksRes.data || [];
      const recentPillars = tasks
        .filter(t => t.pillar)
        .slice(0, 7)
        .map(t => t.pillar as string);

      const completedToday = tasks.filter(
        t => t.task_date === today && t.completed
      ).length;

      setContext({
        currentPhase: identityRes.data?.current_phase || null,
        identitySeed: identityRes.data?.content || null,
        weeklyFocus: identityRes.data?.weekly_focus || null,
        recentPillars,
        insightCount: insightsRes.data?.length || 0,
        experimentCount: experimentsRes.data?.length || 0,
        completedToday,
      });
      setLoading(false);
    };

    fetchContext();
  }, [user]);

  if (loading) {
    return (
      <Card className="border-border/30">
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!context) return null;

  // Calculate pillar distribution
  const pillarCounts: Record<string, number> = {};
  context.recentPillars.forEach(p => {
    pillarCounts[p] = (pillarCounts[p] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(pillarCounts), 1);

  return (
    <Card className="border-border/30 bg-gradient-to-br from-card to-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Brain className="h-4 w-4" />
          What I See
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Phase */}
        {context.currentPhase && (
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Phase:</span>
            <span className="text-sm font-medium capitalize">{context.currentPhase}</span>
          </div>
        )}

        {/* Weekly Focus */}
        {context.weeklyFocus && (
          <div className="flex items-start gap-2">
            <Compass className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-foreground block">Focus:</span>
              <span className="text-sm">{context.weeklyFocus}</span>
            </div>
          </div>
        )}

        {/* Identity Snippet */}
        {context.identitySeed && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground italic line-clamp-2">
              "{context.identitySeed.slice(0, 100)}..."
            </p>
          </div>
        )}

        {/* Pillar Distribution */}
        {Object.keys(pillarCounts).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">7-day focus</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(pillarCounts).map(([pillar, count]) => (
                <div
                  key={pillar}
                  className={`px-2 py-1 rounded-full text-xs font-medium ${PILLAR_COLORS[pillar] || "bg-muted text-muted-foreground"}`}
                >
                  {pillar} ({count})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
          <div className="text-center">
            <p className="text-lg font-semibold text-primary">{context.completedToday}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{context.insightCount}</p>
            <p className="text-xs text-muted-foreground">Insights</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{context.experimentCount}</p>
            <p className="text-xs text-muted-foreground">Experiments</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
