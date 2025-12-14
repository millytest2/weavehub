import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, ChevronRight, Beaker, Target, Pause, Play, CheckCircle2, Circle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";

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

interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { user, signOut } = useAuth();
  const [weeklyActions, setWeeklyActions] = useState<ActionHistoryItem[]>([]);
  const [activeExperiments, setActiveExperiments] = useState<ActiveExperiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());
  const [showExperiments, setShowExperiments] = useState(true);

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
      const [actionsResult, experimentsResult] = await Promise.all([
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
          .limit(10)
      ]);

      if (actionsResult.error) throw actionsResult.error;
      if (experimentsResult.error) throw experimentsResult.error;
      
      setWeeklyActions(actionsResult.data || []);
      setActiveExperiments(experimentsResult.data || []);
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    onOpenChange(false);
  };

  const togglePillar = (pillar: string) => {
    const newSet = new Set(expandedPillars);
    if (newSet.has(pillar)) {
      newSet.delete(pillar);
    } else {
      newSet.add(pillar);
    }
    setExpandedPillars(newSet);
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
      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col bg-background/95 backdrop-blur-xl">
        <SheetHeader className="p-5 pb-4">
          <SheetTitle className="text-left text-lg">Your Week</SheetTitle>
          <SheetDescription className="sr-only">
            Weekly progress and active projects
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-6">
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
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actions</p>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="flex-1 text-center">
                  <p className="text-2xl font-semibold text-foreground">{sortedDays.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Days</p>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="flex-1 text-center">
                  <p className="text-2xl font-semibold text-foreground">{activeExperiments.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projects</p>
                </div>
              </div>

              {/* Active Projects */}
              {activeExperiments.length > 0 && (
                <div>
                  <Collapsible open={showExperiments} onOpenChange={setShowExperiments}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full mb-2 group">
                      <Beaker className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Projects</span>
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
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${exp.status === "paused" ? "text-muted-foreground" : "text-foreground"}`}>
                                {exp.title}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExperimentStatus(exp.id, exp.status);
                              }}
                              className={`p-1.5 rounded-md transition-colors ${
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

              {/* Weekly Actions by Day */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This Week</span>
                </div>
                
                {weeklyActions.length === 0 ? (
                  <div className="py-6 text-center">
                    <Circle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No actions completed yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Your proof starts with one action</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedDays.map((date) => {
                      const actions = actionsByDay[date];
                      const isToday = date === new Date().toISOString().split('T')[0];
                      const displayDate = isToday ? "Today" : format(new Date(date), "EEE, MMM d");
                      
                      return (
                        <div key={date} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                              {displayDate}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">{actions.length} done</span>
                          </div>
                          <div className="space-y-1 pl-1">
                            {actions.map((action) => (
                              <div 
                                key={action.id} 
                                className="flex items-start gap-2 py-1.5"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-foreground/90 leading-snug">
                                    {action.action_text}
                                  </p>
                                  {action.pillar && (
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                      {action.pillar}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

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