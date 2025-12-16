import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, Beaker, Pause, Play, CheckCircle2, Circle, Brain, Lightbulb } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { TopicClusterVisualization } from "./dashboard/TopicClusterVisualization";

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
  const [weeklyActions, setWeeklyActions] = useState<ActionHistoryItem[]>([]);
  const [activeExperiments, setActiveExperiments] = useState<ActiveExperiment[]>([]);
  const [insightClusters, setInsightClusters] = useState<InsightCluster[]>([]);
  const [identitySeed, setIdentitySeed] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showExperiments, setShowExperiments] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("progress");

  // Extract keywords from identity seed for alignment scoring
  const identityKeywords = useMemo(() => {
    if (!identitySeed) return [];
    return identitySeed
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 20);
  }, [identitySeed]);

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

  const toggleCluster = (theme: string) => {
    const newSet = new Set(expandedClusters);
    if (newSet.has(theme)) {
      newSet.delete(theme);
    } else {
      newSet.add(theme);
    }
    setExpandedClusters(newSet);
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

  const totalInsights = insightClusters.reduce((sum, c) => sum + c.insights.length, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col bg-background/95 backdrop-blur-xl">
        <SheetHeader className="p-5 pb-2">
          <SheetTitle className="text-left text-lg">You</SheetTitle>
          <SheetDescription className="sr-only">
            Your progress and captured wisdom
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mb-2 grid grid-cols-2">
            <TabsTrigger value="progress" className="text-xs">Progress</TabsTrigger>
            <TabsTrigger value="mind" className="text-xs">Your Mind</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="flex-1 overflow-y-auto px-5 pb-4 space-y-6 mt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Stats Summary */}
              <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-muted/30 border border-border/20">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-semibold text-foreground">{weeklyActions.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</p>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="flex-1 text-center">
                  <p className="text-2xl font-semibold text-foreground">{sortedDays.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Days</p>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="flex-1 text-center">
                  <p className="text-2xl font-semibold text-foreground">{activeExperiments.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</p>
                </div>
              </div>

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
              <>
                {/* Mind Stats */}
                <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-muted/30 border border-border/20 mb-4">
                  <div className="flex-1 text-center">
                    <p className="text-2xl font-semibold text-foreground">{totalInsights}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Insights</p>
                  </div>
                  <div className="w-px h-8 bg-border/30" />
                  <div className="flex-1 text-center">
                    <p className="text-2xl font-semibold text-foreground">{insightClusters.filter(c => c.theme !== "Uncategorized").length}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Topics</p>
                  </div>
                </div>

                {/* Topic Cluster Visualization */}
                {insightClusters.filter(c => c.theme !== "Uncategorized").length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                      Knowledge Map
                    </p>
                    <TopicClusterVisualization 
                      clusters={insightClusters} 
                      identityKeywords={identityKeywords}
                    />
                  </div>
                )}

                {/* Clustered Insights */}
                {insightClusters.length === 0 ? (
                  <div className="py-6 text-center">
                    <Brain className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Your mind is empty</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Capture what matters to you</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                      By Topic
                    </p>
                    {insightClusters.map((cluster) => {
                      const isExpanded = expandedClusters.has(cluster.theme);
                      return (
                        <Collapsible key={cluster.theme} open={isExpanded} onOpenChange={() => toggleCluster(cluster.theme)}>
                          <CollapsibleTrigger className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2">
                              {cluster.color ? (
                                <div 
                                  className="h-3 w-3 rounded-full" 
                                  style={{ backgroundColor: cluster.color }}
                                />
                              ) : (
                                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium text-foreground">{cluster.theme}</span>
                              {cluster.recentCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                  +{cluster.recentCount}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{cluster.insights.length}</span>
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-2 pl-9 pr-3 pb-2">
                              {cluster.insights.slice(0, 5).map((insight) => (
                                <div key={insight.id} className="py-1.5">
                                  <p className="text-sm font-medium text-foreground leading-snug">
                                    {insight.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                    {insight.content}
                                  </p>
                                </div>
                              ))}
                              {cluster.insights.length > 5 && (
                                <p className="text-xs text-muted-foreground/60 py-1">
                                  +{cluster.insights.length - 5} more
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <div className="p-4 border-t border-border/20 mt-auto">
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