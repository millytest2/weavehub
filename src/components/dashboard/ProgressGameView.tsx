import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ProgressGameViewProps {
  completedToday: number;
  totalToday: number;
  weeklyStats: {
    pillar: string;
    count: number;
    color: string;
  }[];
  streak: number;
  experimentsActive: number;
  pathsActive: number;
  insightsThisWeek: number;
}

const PILLAR_COLORS: Record<string, string> = {
  Stability: "hsl(var(--chart-1))",
  Skill: "hsl(var(--chart-2))",
  Content: "hsl(var(--chart-3))",
  Health: "hsl(var(--chart-4))",
  Presence: "hsl(var(--chart-5))",
  Admin: "hsl(220 10% 60%)",
  Connection: "hsl(280 60% 65%)",
  Learning: "hsl(45 90% 55%)",
};

export const ProgressGameView = ({
  completedToday,
  totalToday,
  weeklyStats,
  streak,
  experimentsActive,
  pathsActive,
  insightsThisWeek,
}: ProgressGameViewProps) => {
  const todayProgress = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;
  
  // Calculate XP (simple formula: actions + experiments + paths + insights)
  const weeklyXP = useMemo(() => {
    const actionXP = weeklyStats.reduce((sum, s) => sum + s.count * 10, 0);
    const experimentXP = experimentsActive * 25;
    const pathXP = pathsActive * 50;
    const insightXP = insightsThisWeek * 5;
    return actionXP + experimentXP + pathXP + insightXP;
  }, [weeklyStats, experimentsActive, pathsActive, insightsThisWeek]);

  const pieData = weeklyStats.filter(s => s.count > 0).map(s => ({
    name: s.pillar,
    value: s.count,
    color: PILLAR_COLORS[s.pillar] || "hsl(var(--muted))",
  }));

  // Level calculation (every 100 XP = 1 level)
  const level = Math.floor(weeklyXP / 100) + 1;
  const xpInLevel = weeklyXP % 100;

  return (
    <Card className="border-0 shadow-sm bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          <span>This Week</span>
          <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            Level {level}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* XP Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{weeklyXP} XP this week</span>
            <span>{xpInLevel}/100 to next level</span>
          </div>
          <Progress value={xpInLevel} className="h-2" />
        </div>

        {/* Pillar Distribution Pie Chart */}
        {pieData.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="w-24 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded px-2 py-1 text-xs shadow-sm">
                            {data.name}: {data.value} actions
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {pieData.slice(0, 6).map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
          <div className="text-center">
            <div className="text-lg font-semibold">{streak}</div>
            <div className="text-[10px] text-muted-foreground">Day streak</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{experimentsActive}</div>
            <div className="text-[10px] text-muted-foreground">Experiments</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{insightsThisWeek}</div>
            <div className="text-[10px] text-muted-foreground">Insights</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
