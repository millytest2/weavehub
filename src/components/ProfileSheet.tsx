import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ActionHistoryItem {
  id: string;
  action_text: string;
  pillar: string | null;
  action_date: string;
  completed_at: string;
}

interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { user, signOut } = useAuth();
  const [weeklyActions, setWeeklyActions] = useState<ActionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && user) {
      fetchWeeklyActions();
    }
  }, [open, user]);

  const fetchWeeklyActions = async () => {
    if (!user) return;
    setLoading(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const { data, error } = await supabase
        .from("action_history")
        .select("id, action_text, pillar, action_date, completed_at")
        .eq("user_id", user.id)
        .gte("action_date", sevenDaysAgo.toISOString().split("T")[0])
        .order("action_date", { ascending: false });

      if (error) throw error;
      setWeeklyActions(data || []);
    } catch (error) {
      console.error("Error fetching weekly actions:", error);
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
          <SheetTitle className="text-left">This Week</SheetTitle>
          <SheetDescription className="text-left text-sm">
            {weeklyActions.length} action{weeklyActions.length !== 1 ? 's' : ''} across {pillarCount} area{pillarCount !== 1 ? 's' : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : weeklyActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions completed yet this week.</p>
          ) : (
            <div className="space-y-2">
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