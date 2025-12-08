import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { LogOut, CheckCircle2, Calendar } from "lucide-react";

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
  const [pillarStats, setPillarStats] = useState<Record<string, number>>({});

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

      // Calculate pillar distribution
      const stats: Record<string, number> = {};
      (data || []).forEach((action) => {
        if (action.pillar) {
          stats[action.pillar] = (stats[action.pillar] || 0) + 1;
        }
      });
      setPillarStats(stats);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const uniquePillars = Object.keys(pillarStats).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="text-left">Weekly Digest</SheetTitle>
          <SheetDescription className="text-left text-sm">
            Your progress over the last 7 days
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Actions</span>
              </div>
              <p className="text-2xl font-bold mt-1">{weeklyActions.length}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Pillars</span>
              </div>
              <p className="text-2xl font-bold mt-1">{uniquePillars}</p>
            </Card>
          </div>

          {/* Pillar Distribution */}
          {Object.keys(pillarStats).length > 0 && (
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Pillar Distribution</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(pillarStats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pillar, count]) => (
                    <span
                      key={pillar}
                      className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary"
                    >
                      {pillar}: {count}
                    </span>
                  ))}
              </div>
            </Card>
          )}

          {/* Recent Actions */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Recent Actions</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : weeklyActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions completed this week yet.</p>
            ) : (
              <div className="space-y-2">
                {weeklyActions.slice(0, 10).map((action) => (
                  <Card key={action.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug line-clamp-2">{action.action_text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {action.pillar && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {action.pillar}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(action.action_date)}
                          </span>
                        </div>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sign Out */}
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