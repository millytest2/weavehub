import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronDown,
  ChevronUp,
  Target,
  Mountain,
  Calendar
} from "lucide-react";
import { getWeek, getYear, endOfMonth, format, subMonths } from "date-fns";

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
  topPillars: { name: string; count: number }[];
}

const PILLAR_LABELS: Record<string, string> = {
  business: "Business",
  body: "Body", 
  content: "Content",
  relationship: "Relationship",
  mind: "Mind",
  play: "Play"
};

const PILLAR_COLORS: Record<string, string> = {
  business: "bg-blue-500",
  body: "bg-green-500",
  content: "bg-purple-500",
  relationship: "bg-pink-500",
  mind: "bg-orange-500",
  play: "bg-cyan-500",
};

export function JourneyFlow() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthData, setMonthData] = useState<MonthData[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Record<number, string>>({});

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const threeMonthsAgo = subMonths(new Date(), 3);
      
      const [actionsResult, milestonesResult] = await Promise.all([
        supabase
          .from("action_history")
          .select("action_date, pillar, action_text")
          .eq("user_id", user.id)
          .gte("action_date", threeMonthsAgo.toISOString().split('T')[0])
          .order("action_date", { ascending: false }),
        supabase
          .from("thread_milestones")
          .select("month_number, title")
          .eq("user_id", user.id)
          .eq("year", 2026)
      ]);

      // Build milestone map
      const mMap: Record<number, string> = {};
      (milestonesResult.data || []).forEach((m: any) => {
        mMap[m.month_number] = m.title;
      });
      setMilestones(mMap);

      const actions = actionsResult.data || [];
      setMonthData(processActionsIntoMonths(actions));

    } catch (error) {
      console.error("Error fetching journey data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processActionsIntoMonths = (actions: any[]): MonthData[] => {
    const monthsMap = new Map<string, MonthData>();
    const now = new Date();

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

    const weeklyActions = new Map<string, ActionSummary>();
    const monthlyPillarCounts = new Map<string, Record<string, number>>();

    for (const action of actions) {
      const actionDate = new Date(action.action_date);
      const weekNum = getWeek(actionDate);
      const year = getYear(actionDate);
      const monthKey = `${format(actionDate, 'MMMM')}-${year}`;
      const weekKey = `${year}-${weekNum}`;

      if (!weeklyActions.has(weekKey)) {
        weeklyActions.set(weekKey, { total: 0, byPillar: {} });
      }
      const weekData = weeklyActions.get(weekKey)!;
      weekData.total++;
      if (action.pillar) {
        weekData.byPillar[action.pillar] = (weekData.byPillar[action.pillar] || 0) + 1;
      }

      if (!monthlyPillarCounts.has(monthKey)) {
        monthlyPillarCounts.set(monthKey, {});
      }
      const monthPillars = monthlyPillarCounts.get(monthKey)!;
      if (action.pillar) {
        monthPillars[action.pillar] = (monthPillars[action.pillar] || 0) + 1;
      }
    }

    for (const [monthKey, monthData] of monthsMap) {
      const monthPillars = monthlyPillarCounts.get(monthKey) || {};
      monthData.topPillars = Object.entries(monthPillars)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([pillar, count]) => ({ name: pillar, count }));

      monthData.totalActions = Object.values(monthPillars).reduce((sum, count) => sum + count, 0);

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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {monthData.map((month) => {
        const monthKey = `${month.month}-${month.year}`;
        const isExpanded = expandedMonth === monthKey;
        const isCurrentMonth = month.month === format(new Date(), 'MMMM') && month.year === getYear(new Date());
        const monthNumber = new Date(`${month.month} 1, ${month.year}`).getMonth() + 1;
        const milestone = milestones[monthNumber];
        const activeWeeks = month.weeks.filter(w => w.hasData);
        const maxPillarCount = month.topPillars.length > 0 ? month.topPillars[0].count : 1;

        return (
          <Card 
            key={monthKey} 
            className={`overflow-hidden ${isCurrentMonth ? "border-primary/30" : ""}`}
          >
            {/* Month Header - always visible, compact */}
            <button
              className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedMonth(isExpanded ? null : monthKey)}
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                isCurrentMonth ? "bg-primary/15" : "bg-muted"
              }`}>
                <Calendar className={`h-4 w-4 ${isCurrentMonth ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{month.month} {month.year}</span>
                  {isCurrentMonth && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Now</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {month.totalActions} actions
                  </span>
                  {month.totalActions > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {activeWeeks.length}/{month.weeks.length} active weeks
                    </span>
                  )}
                </div>
              </div>

              {/* Mini pillar bar (collapsed view) */}
              {!isExpanded && month.topPillars.length > 0 && (
                <div className="flex gap-0.5 shrink-0">
                  {month.topPillars.map(({ name }) => (
                    <div
                      key={name}
                      className={`w-2 h-6 rounded-sm ${PILLAR_COLORS[name] || "bg-muted"}`}
                      style={{ opacity: 0.6 }}
                      title={PILLAR_LABELS[name] || name}
                    />
                  ))}
                </div>
              )}

              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                {/* Thread milestone for this month */}
                {milestone && (
                  <div className="flex items-center gap-2 pt-3 text-xs text-muted-foreground">
                    <Target className="h-3 w-3 text-primary shrink-0" />
                    <span className="line-clamp-1">
                      <span className="font-medium text-foreground">Thread:</span> {milestone}
                    </span>
                  </div>
                )}

                {/* Pillar distribution bar chart */}
                {month.topPillars.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {month.topPillars.map(({ name, count }) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-20 truncate">
                          {PILLAR_LABELS[name] || name}
                        </span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PILLAR_COLORS[name] || "bg-muted-foreground"}`}
                            style={{ width: `${Math.round((count / maxPillarCount) * 100)}%`, opacity: 0.7 }}
                          />
                        </div>
                        <span className="text-[11px] font-medium w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active weeks only - skip empty */}
                {activeWeeks.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                      Active Weeks
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeWeeks.map((week) => (
                        <div 
                          key={`${week.year}-${week.weekNumber}`}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-xs"
                        >
                          <span className="text-muted-foreground">W{week.weekNumber}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                              {Object.entries(week.actions.byPillar).slice(0, 3).map(([pillar]) => (
                                <div
                                  key={pillar}
                                  className={`w-1.5 h-1.5 rounded-full ${PILLAR_COLORS[pillar] || "bg-muted-foreground"}`}
                                />
                              ))}
                            </div>
                            <span className="font-medium">{week.actions.total}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {month.totalActions === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No actions logged this month
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
