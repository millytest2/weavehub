import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, ChevronRight, Beaker, Target, Pause, Play } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

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
          .order("action_date", { ascending: false }),
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

  // Group actions by pillar
  const pillarGroups = weeklyActions.reduce((acc, action) => {
    const pillar = action.pillar || "Other";
    if (!acc[pillar]) acc[pillar] = [];
    acc[pillar].push(action);
    return acc;
  }, {} as Record<string, ActionHistoryItem[]>);

  const pillarCount = Object.keys(pillarGroups).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="text-left">Your Week</SheetTitle>
          <SheetDescription className="text-left text-sm">
            Track your identity in motion
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              {/* Active Projects Section */}
              {activeExperiments.length > 0 && (
                <div>
                  <Collapsible open={showExperiments} onOpenChange={setShowExperiments}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full mb-2">
                      <Beaker className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Active Projects</span>
                      <span className="text-xs text-muted-foreground">({activeExperiments.length})</span>
                      {showExperiments ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 pl-6">
                        {activeExperiments.map((exp) => (
                          <div key={exp.id} className="py-1.5 flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${exp.status === "paused" ? "text-muted-foreground" : "text-foreground/90"}`}>
                                {exp.title}
                              </p>
                              {exp.identity_shift_target && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Target className="h-3 w-3" />
                                  {exp.identity_shift_target.substring(0, 50)}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExperimentStatus(exp.id, exp.status);
                              }}
                              className={`p-1.5 rounded-md transition-colors ${
                                exp.status === "paused" 
                                  ? "text-muted-foreground hover:text-primary hover:bg-primary/10" 
                                  : "text-primary hover:text-muted-foreground hover:bg-muted"
                              }`}
                              title={exp.status === "paused" ? "Resume project" : "Pause project"}
                            >
                              {exp.status === "paused" ? (
                                <Play className="h-4 w-4" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Weekly Actions Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">Weekly Progress</span>
                  <span className="text-xs text-muted-foreground">
                    ({weeklyActions.length} action{weeklyActions.length !== 1 ? 's' : ''})
                  </span>
                </div>
                
                {weeklyActions.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-1">
                    No actions completed yet. Your identity is built through consistent daily action.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3 pl-1">
                      Each pillar below represents an area where you're actively becoming who you want to be.
                    </p>
                    <div className="space-y-1">
                      {Object.entries(pillarGroups).map(([pillar, actions]) => (
                        <Collapsible 
                          key={pillar} 
                          open={expandedPillars.has(pillar)}
                          onOpenChange={() => togglePillar(pillar)}
                        >
                          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{pillar}</span>
                              <span className="text-xs text-muted-foreground">({actions.length})</span>
                            </div>
                            {expandedPillars.has(pillar) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="pl-3 py-1 space-y-1">
                              {actions.slice(0, 3).map((action) => (
                                <p key={action.id} className="text-xs text-muted-foreground leading-snug py-1">
                                  {action.action_text}
                                </p>
                              ))}
                              {actions.length > 3 && (
                                <p className="text-xs text-muted-foreground/60">+{actions.length - 3} more</p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Why This Matters */}
              {weeklyActions.length > 0 && pillarCount > 1 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/20">
                  <p className="text-xs text-muted-foreground">
                    You're building across {pillarCount} life areas. Balance creates sustainable momentum.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-border/30 mt-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
