import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { getWeek, getYear, startOfMonth, endOfMonth, format, subMonths } from "date-fns";

interface ActionSummary {
  total: number;
  byPillar: Record<string, number>;
}

interface WeekData {
  weekNumber: number;
  year: number;
  actions: ActionSummary;
  hasData: boolean;
}

interface MonthData {
  month: string;
  year: number;
  weeks: WeekData[];
  totalActions: number;
  topPillars: string[];
}

const PILLARS = ["business", "body", "content", "relationship", "mind", "play"];
const PILLAR_LABELS: Record<string, string> = {
  business: "Business",
  body: "Body", 
  content: "Content",
  relationship: "Relationship",
  mind: "Mind",
  play: "Play"
};

export function JourneyFlow() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [identitySeed, setIdentitySeed] = useState<any>(null);
  const [monthData, setMonthData] = useState<MonthData[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<"flow" | "month">("flow");

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch identity seed and last 3 months of action history
      const threeMonthsAgo = subMonths(new Date(), 3);
      
      const [identityResult, actionsResult] = await Promise.all([
        supabase
          .from("identity_seeds")
          .select("content, year_note, core_values, weekly_focus")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("action_history")
          .select("action_date, pillar, action_text")
          .eq("user_id", user.id)
          .gte("action_date", threeMonthsAgo.toISOString().split('T')[0])
          .order("action_date", { ascending: false })
      ]);

      if (identityResult.data) {
        setIdentitySeed(identityResult.data);
      }

      // Process actions into months and weeks
      const actions = actionsResult.data || [];
      const months = processActionsIntoMonths(actions);
      setMonthData(months);

      // Auto-expand current month
      const now = new Date();
      const currentMonthKey = `${format(now, 'MMMM')}-${getYear(now)}`;
      setExpandedMonth(currentMonthKey);

    } catch (error) {
      console.error("Error fetching journey data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processActionsIntoMonths = (actions: any[]): MonthData[] => {
    const monthsMap = new Map<string, MonthData>();
    const now = new Date();

    // Initialize last 3 months
    for (let i = 0; i < 3; i++) {
      const monthDate = subMonths(now, i);
      const monthKey = `${format(monthDate, 'MMMM')}-${getYear(monthDate)}`;
      monthsMap.set(monthKey, {
        month: format(monthDate, 'MMMM'),
        year: getYear(monthDate),
        weeks: [],
        totalActions: 0,
        topPillars: []
      });
    }

    // Group actions by week
    const weeklyActions = new Map<string, ActionSummary>();
    const monthlyPillarCounts = new Map<string, Record<string, number>>();

    for (const action of actions) {
      const actionDate = new Date(action.action_date);
      const weekNum = getWeek(actionDate);
      const year = getYear(actionDate);
      const monthKey = `${format(actionDate, 'MMMM')}-${year}`;
      const weekKey = `${year}-${weekNum}`;

      // Weekly aggregation
      if (!weeklyActions.has(weekKey)) {
        weeklyActions.set(weekKey, { total: 0, byPillar: {} });
      }
      const weekData = weeklyActions.get(weekKey)!;
      weekData.total++;
      if (action.pillar) {
        weekData.byPillar[action.pillar] = (weekData.byPillar[action.pillar] || 0) + 1;
      }

      // Monthly aggregation
      if (!monthlyPillarCounts.has(monthKey)) {
        monthlyPillarCounts.set(monthKey, {});
      }
      const monthPillars = monthlyPillarCounts.get(monthKey)!;
      if (action.pillar) {
        monthPillars[action.pillar] = (monthPillars[action.pillar] || 0) + 1;
      }
    }

    // Populate month data with weeks
    for (const [monthKey, monthData] of monthsMap) {
      const monthPillars = monthlyPillarCounts.get(monthKey) || {};
      const topPillars = Object.entries(monthPillars)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([pillar]) => pillar);

      monthData.topPillars = topPillars;
      monthData.totalActions = Object.values(monthPillars).reduce((sum, count) => sum + count, 0);

      // Get weeks for this month
      const monthStart = new Date(`${monthData.month} 1, ${monthData.year}`);
      const monthEnd = endOfMonth(monthStart);
      const startWeek = getWeek(monthStart);
      const endWeek = getWeek(monthEnd);

      for (let w = startWeek; w <= endWeek; w++) {
        const weekKey = `${monthData.year}-${w}`;
        const weekActions = weeklyActions.get(weekKey) || { total: 0, byPillar: {} };
        monthData.weeks.push({
          weekNumber: w,
          year: monthData.year,
          actions: weekActions,
          hasData: weekActions.total > 0
        });
      }
    }

    return Array.from(monthsMap.values());
  };

  // Extract 2026 goals/mission from identity
  const missionSummary = useMemo(() => {
    if (!identitySeed?.year_note) return null;
    const note = identitySeed.year_note;
    // Extract first sentence or first 100 chars
    const firstSentence = note.split('.')[0];
    return firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
  }, [identitySeed]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month Breakdown */}
      <div className="space-y-3">
        {monthData.map((month) => {
          const monthKey = `${month.month}-${month.year}`;
          const isExpanded = expandedMonth === monthKey;
          const isCurrentMonth = month.month === format(new Date(), 'MMMM') && month.year === getYear(new Date());

          return (
            <Card 
              key={monthKey} 
              className={isCurrentMonth ? "border-primary/30" : ""}
            >
              <CardHeader 
                className="p-4 cursor-pointer"
                onClick={() => setExpandedMonth(isExpanded ? null : monthKey)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-medium">
                      {month.month} {month.year}
                    </CardTitle>
                    {isCurrentMonth && (
                      <Badge variant="secondary" className="text-[10px]">Current</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {month.totalActions} actions
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {/* Top pillars preview */}
                {month.topPillars.length > 0 && !isExpanded && (
                  <div className="flex gap-1.5 mt-2">
                    {month.topPillars.map((pillar) => (
                      <Badge key={pillar} variant="outline" className="text-[10px]">
                        {PILLAR_LABELS[pillar] || pillar}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="space-y-3">
                    {month.weeks.map((week) => (
                      <div 
                        key={`${week.year}-${week.weekNumber}`}
                        className={`p-3 rounded-lg border ${
                          week.hasData ? 'bg-muted/20 border-border/50' : 'bg-muted/10 border-border/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium">Week {week.weekNumber}</span>
                          <span className="text-xs text-muted-foreground">
                            {week.actions.total} actions
                          </span>
                        </div>
                        
                        {week.hasData && Object.keys(week.actions.byPillar).length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {Object.entries(week.actions.byPillar).map(([pillar, count]) => (
                              <div 
                                key={pillar}
                                className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-background"
                              >
                                <span className="text-muted-foreground truncate">
                                  {PILLAR_LABELS[pillar] || pillar}
                                </span>
                                <span className="font-medium ml-1">{count}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {!week.hasData && (
                          <p className="text-[10px] text-muted-foreground">No actions logged</p>
                        )}
                      </div>
                    ))}

                    {/* Month summary - how it connects to 2026 */}
                    {month.topPillars.length > 0 && (
                      <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {month.month} focus:
                          </span>{" "}
                          {month.topPillars.map(p => PILLAR_LABELS[p] || p).join(", ")}
                          {missionSummary && (
                            <span className="block mt-1 text-primary/80">
                              → toward: {missionSummary}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
