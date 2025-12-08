import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut, CheckCircle2 } from "lucide-react";

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="text-left">This Week</SheetTitle>
          <SheetDescription className="text-left text-sm">
            {weeklyActions.length} action{weeklyActions.length !== 1 ? 's' : ''} completed
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : weeklyActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions completed yet this week.</p>
          ) : (
            <div className="space-y-2">
              {weeklyActions.slice(0, 15).map((action) => (
                <div key={action.id} className="flex items-start gap-2 py-2 border-b border-border/20 last:border-0">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{action.action_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDate(action.action_date)}{action.pillar ? ` · ${action.pillar}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
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