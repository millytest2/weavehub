import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, Beaker, Pause, Play, CheckCircle2, Circle } from "lucide-react";
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
  const [showExperiments, setShowExperiments] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

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