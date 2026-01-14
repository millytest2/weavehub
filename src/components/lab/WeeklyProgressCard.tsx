import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Briefcase, 
  Activity, 
  FileText, 
  Heart, 
  Brain, 
  Gamepad2,
  TrendingUp,
  Download,
  Check
} from "lucide-react";

interface UserGoal {
  id: string;
  domain: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  unit: string;
}

interface MetricLog {
  goal_id: string;
  value: number;
  week_number: number;
  year: number;
}

interface WeeklyProgressCardProps {
  weekNumber: number;
  year: number;
  onExport: () => void;
}

const DOMAIN_CONFIG = {
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  body: { label: 'Body', icon: Activity, color: 'text-green-500', bgColor: 'bg-green-500' },
  content: { label: 'Content', icon: FileText, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  relationship: { label: 'Relationship', icon: Heart, color: 'text-pink-500', bgColor: 'bg-pink-500' },
  mind: { label: 'Mind', icon: Brain, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  play: { label: 'Play', icon: Gamepad2, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
} as const;

const DOMAIN_ORDER = ['business', 'body', 'content', 'relationship', 'mind', 'play'];

export function WeeklyProgressCard({ weekNumber, year, onExport }: WeeklyProgressCardProps) {
  const { user } = useAuth();
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [logs, setLogs] = useState<MetricLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, weekNumber, year]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [goalsResult, logsResult] = await Promise.all([
        supabase
          .from("user_goals")
          .select("*")
          .eq("user_id", user.id),
        supabase
          .from("metric_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("week_number", weekNumber)
          .eq("year", year)
      ]);

      if (goalsResult.data) setGoals(goalsResult.data);
      if (logsResult.data) setLogs(logsResult.data);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || goals.length === 0) {
    return null;
  }

  // Create logs lookup
  const logsByGoal = new Map(logs.map(l => [l.goal_id, l]));

  // Sort goals by domain
  const sortedGoals = [...goals].sort((a, b) => 
    DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain)
  );

  // Calculate overall stats
  const progressingDomains = sortedGoals.filter(goal => {
    const log = logsByGoal.get(goal.id);
    return log && log.value > 0;
  }).length;

  const hasLogsThisWeek = logs.length > 0;

  return (
    <Card className={hasLogsThisWeek ? "border-green-500/30 bg-green-500/5" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasLogsThisWeek && <Check className="h-5 w-5 text-green-500" />}
            <CardTitle className="text-lg">
              Week {weekNumber}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {progressingDomains}/{sortedGoals.length} domains tracked
            </Badge>
          </div>
          {hasLogsThisWeek && (
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sortedGoals.map((goal) => {
            const config = DOMAIN_CONFIG[goal.domain as keyof typeof DOMAIN_CONFIG];
            const Icon = config?.icon || TrendingUp;
            const log = logsByGoal.get(goal.id);
            const currentValue = log?.value ?? goal.current_value ?? 0;
            const progress = goal.target_value > 0 
              ? Math.round((currentValue / goal.target_value) * 100) 
              : 0;
            
            return (
              <div key={goal.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Icon className={`h-4 w-4 ${config?.color || 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{goal.goal_name}</div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm">{currentValue.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">/ {goal.target_value.toLocaleString()}</span>
                  </div>
                </div>
                <div className={`text-xs font-medium ${progress >= 50 ? 'text-green-500' : progress >= 25 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                  {progress}%
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
