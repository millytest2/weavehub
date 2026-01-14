import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, Beaker, Pause, Play, CheckCircle2, Circle, Moon, Sun } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ProgressGameView } from "./dashboard/ProgressGameView";
import { WeaveView } from "./profile/WeaveView";
import { useTheme } from "next-themes";

interface ActionHistoryItem {
  id: string;
  action_text: string;
  pillar: string | null;
  action_date: string;
  completed_at: string;
}

interface ActiveExperiment {
  id: string;
  title: string;
  status: string;
  identity_shift_target: string | null;
}

interface InsightWithTopic {
  id: string;
  title: string;
  content: string;
  source: string | null;
  topic_id: string | null;
  created_at: string;
  topics: { id: string; name: string; color: string | null } | null;
}

interface InsightCluster {
  theme: string;
  color: string | null;
  insights: InsightWithTopic[];
  recentCount: number;
}

interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [weeklyActions, setWeeklyActions] = useState<ActionHistoryItem[]>([]);
  const [activeExperiments, setActiveExperiments] = useState<ActiveExperiment[]>([]);
  const [insightClusters, setInsightClusters] = useState<InsightCluster[]>([]);
  const [identitySeed, setIdentitySeed] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showExperiments, setShowExperiments] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("progress");
  
  // Gamification stats
  const [weeklyStats, setWeeklyStats] = useState<{ pillar: string; count: number; color: string }[]>([]);
  const [streak, setStreak] = useState(0);
  const [insightsThisWeek, setInsightsThisWeek] = useState(0);
  const [pathsActive, setPathsActive] = useState(0);

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
  }, [open, user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const [actionsResult, experimentsResult, insightsResult, identityResult] = await Promise.all([
        supabase
          .from("action_history")
          .select("id, action_text, pillar, action_date, completed_at")
          .eq("user_id", user.id)
          .gte("action_date", sevenDaysAgo.toISOString().split("T")[0])
          .order("completed_at", { ascending: false }),
        supabase
          .from("experiments")
          .select("id, title, status, identity_shift_target")
          .eq("user_id", user.id)
          .in("status", ["in_progress", "planning", "paused"])
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("insights")
          .select("id, title, content, source, topic_id, created_at, topics(id, name, color)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("identity_seeds")
          .select("content")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      if (actionsResult.error) throw actionsResult.error;
      if (experimentsResult.error) throw experimentsResult.error;
      if (insightsResult.error) throw insightsResult.error;
      
      setWeeklyActions(actionsResult.data || []);
      setActiveExperiments(experimentsResult.data || []);
      setIdentitySeed(identityResult.data?.content || "");
      
      // Cluster insights by topic
      const clusters = clusterInsightsByTopic(insightsResult.data as InsightWithTopic[] || []);
      setInsightClusters(clusters);
      
      // Calculate gamification stats
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      // Pillar distribution
      const pillarCounts: Record<string, number> = {};
      (actionsResult.data || []).forEach(a => {
        if (a.pillar) {
          pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
        }
      });
      setWeeklyStats(Object.entries(pillarCounts).map(([pillar, count]) => ({
        pillar,
        count,
        color: ""
      })));
      
      // Insights this week
      const recentInsights = (insightsResult.data || []).filter(i => 
        new Date(i.created_at) >= weekStart
      );
      setInsightsThisWeek(recentInsights.length);
      
      // Active paths
      const { count: pathCount } = await supabase
        .from("learning_paths")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active");
      setPathsActive(pathCount || 0);
      
      // Calculate streak
      const uniqueDates = [...new Set((actionsResult.data || []).map(d => d.action_date))].sort().reverse();
      let currentStreak = 0;
      const today = new Date().toISOString().split('T')[0];
      const checkDate = new Date();
      
      for (const dateStr of uniqueDates) {
        const expectedDate = checkDate.toISOString().split('T')[0];
        if (dateStr === expectedDate || dateStr === today) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      setStreak(currentStreak);
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const clusterInsightsByTopic = (insights: InsightWithTopic[]): InsightCluster[] => {
    const clusters: Record<string, { color: string | null; insights: InsightWithTopic[] }> = {};
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    for (const insight of insights) {
      const theme = insight.topics?.name || "Uncategorized";
      const color = insight.topics?.color || null;
      
      if (!clusters[theme]) {
        clusters[theme] = { color, insights: [] };
      }
      clusters[theme].insights.push(insight);
    }
    
    return Object.entries(clusters)
      .map(([theme, data]) => {
        const recentCount = data.insights.filter(i => new Date(i.created_at) > sevenDaysAgo).length;
        return { theme, color: data.color, insights: data.insights, recentCount };
      })
      .sort((a, b) => {
        if (a.theme === "Uncategorized") return 1;
        if (b.theme === "Uncategorized") return -1;
        // Sort by recent activity first, then total
        if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
        return b.insights.length - a.insights.length;
      });
  };


  const handleSignOut = () => {
    signOut();
    onOpenChange(false);
  };

  const toggleExperimentStatus = async (expId: string, currentStatus: string) => {
    const newStatus = currentStatus === "paused" ? "in_progress" : "paused";
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ status: newStatus })
        .eq("id", expId);
      
      if (error) throw error;
      
      setActiveExperiments(prev => 
        prev.map(exp => exp.id === expId ? { ...exp, status: newStatus } : exp)
      );
      toast.success(newStatus === "paused" ? "Project paused" : "Project resumed");
    } catch (error) {
      console.error("Error toggling experiment status:", error);
      toast.error("Failed to update project status");
    }
  };

  const toggleDay = (date: string) => {
    const newSet = new Set(expandedDays);
    if (newSet.has(date)) {
      newSet.delete(date);
    } else {
      newSet.add(date);
    }
    setExpandedDays(newSet);
  };

  // Group actions by day
  const actionsByDay = weeklyActions.reduce((acc, action) => {
    const date = action.action_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(action);
    return acc;
  }, {} as Record<string, ActionHistoryItem[]>);

  const sortedDays = Object.keys(actionsByDay).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[320px] sm:w-[400px] md:w-[450px] p-0 flex flex-col bg-background/95 backdrop-blur-xl">
        <SheetHeader className="p-5 pb-2">
          <SheetTitle className="text-left text-lg">You</SheetTitle>
          <SheetDescription className="sr-only">
            Your progress and captured wisdom
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mb-3 grid grid-cols-2">
            <TabsTrigger value="progress" className="text-xs sm:text-sm">Progress</TabsTrigger>
            <TabsTrigger value="mind" className="text-xs sm:text-sm">Your Mind</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="flex-1 overflow-y-auto px-5 pb-4 space-y-6 mt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Gamification View */}
              <ProgressGameView
                completedToday={weeklyActions.filter(a => a.action_date === new Date().toISOString().split('T')[0]).length}
                totalToday={3}
                weeklyStats={weeklyStats}
                streak={streak}
                experimentsActive={activeExperiments.length}
                pathsActive={pathsActive}
                insightsThisWeek={insightsThisWeek}
              />

              {/* Active Projects */}
              {activeExperiments.length > 0 && (
                <div>
                  <Collapsible open={showExperiments} onOpenChange={setShowExperiments}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full mb-2 group">
                      <Beaker className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Builds</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${showExperiments ? '' : '-rotate-90'}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-1.5 mt-2">
                        {activeExperiments.map((exp) => (
                          <div 
                            key={exp.id} 
                            className={`py-2.5 px-3 rounded-lg flex items-center justify-between gap-2 ${
                              exp.status === "paused" ? "bg-muted/20" : "bg-primary/5 border border-primary/10"
                            }`}
                          >
                            <p className={`text-sm font-medium truncate flex-1 ${exp.status === "paused" ? "text-muted-foreground" : "text-foreground"}`}>
                              {exp.title}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExperimentStatus(exp.id, exp.status);
                              }}
                              className={`p-1.5 rounded-md transition-colors shrink-0 ${
                                exp.status === "paused" 
                                  ? "text-muted-foreground hover:text-primary hover:bg-primary/10" 
                                  : "text-primary hover:bg-primary/10"
                              }`}
                            >
                              {exp.status === "paused" ? (
                                <Play className="h-3.5 w-3.5" />
                              ) : (
                                <Pause className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Weekly Actions by Day - Collapsible */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This Week</span>
                </div>
                
                {weeklyActions.length === 0 ? (
                  <div className="py-6 text-center">
                    <Circle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No actions completed yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sortedDays.map((date) => {
                      const actions = actionsByDay[date];
                      const isToday = date === new Date().toISOString().split('T')[0];
                      const displayDate = isToday ? "Today" : format(new Date(date), "EEE, MMM d");
                      const isExpanded = expandedDays.has(date);
                      
                      return (
                        <Collapsible key={date} open={isExpanded} onOpenChange={() => toggleDay(date)}>
                          <CollapsibleTrigger className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className={`h-4 w-4 ${isToday ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-medium ${isToday ? 'text-primary' : 'text-foreground'}`}>
                                {displayDate}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{actions.length}</span>
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-1 pl-9 pr-3 pb-2">
                              {actions.map((action) => (
                                <div key={action.id} className="py-1.5">
                                  <p className="text-sm text-muted-foreground leading-snug">
                                    {action.action_text}
                                  </p>
                                  {action.pillar && (
                                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                                      {action.pillar}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          </TabsContent>

          <TabsContent value="mind" className="flex-1 overflow-y-auto px-5 pb-4 mt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <WeaveView
                insights={insightClusters.flatMap(c => c.insights.map(i => ({
                  id: i.id,
                  title: i.title,
                  content: i.content,
                  topic_id: i.topic_id,
                  created_at: i.created_at,
                  topics: i.topics ? { name: i.topics.name, color: i.topics.color } : null
                })))}
                actions={weeklyActions.map(a => ({
                  id: a.id,
                  action_text: a.action_text,
                  pillar: a.pillar,
                  action_date: a.action_date
                }))}
                experiments={activeExperiments.map(e => ({
                  id: e.id,
                  title: e.title,
                  status: e.status,
                  identity_shift_target: e.identity_shift_target
                }))}
                identitySeed={identitySeed}
              />
            )}
          </TabsContent>
        </Tabs>

        <div className="p-4 border-t border-border/20 mt-auto space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground h-9"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="text-sm">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground h-9"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Sign Out</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}