import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Clock, Zap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface PendingAction {
  id: string;
  source_title: string;
  action_text: string;
  action_context: string | null;
  expires_at: string | null;
  created_at: string;
}

export const ApplyThisCard = () => {
  const { user } = useAuth();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [learningDebt, setLearningDebt] = useState({ saved: 0, applied: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch oldest pending action (FIFO queue)
      const { data: actions } = await supabase
        .from("pending_actions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (actions && actions.length > 0) {
        setPendingAction(actions[0] as PendingAction);
      } else {
        setPendingAction(null);
      }
      
      // Fetch learning debt stats
      const { data: identity } = await supabase
        .from("identity_seeds")
        .select("content_saved_count, content_applied_count")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (identity) {
        setLearningDebt({
          saved: (identity as any).content_saved_count || 0,
          applied: (identity as any).content_applied_count || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching apply this data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!pendingAction || !user) return;
    setIsCompleting(true);
    
    try {
      // Mark action as completed
      await supabase
        .from("pending_actions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", pendingAction.id);
      
      // Increment content_applied_count
      await supabase
        .from("identity_seeds")
        .update({ content_applied_count: learningDebt.applied + 1 })
        .eq("user_id", user.id);
      
      toast.success("Applied! Knowledge → Action");
      
      // Refresh data
      await fetchData();
    } catch (error) {
      console.error("Error completing action:", error);
      toast.error("Failed to complete");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    if (!pendingAction || !user) return;
    
    try {
      await supabase
        .from("pending_actions")
        .update({ status: "skipped" })
        .eq("id", pendingAction.id);
      
      await fetchData();
      toast.info("Skipped. Next action loaded.");
    } catch (error) {
      console.error("Error skipping action:", error);
    }
  };

  const getTimeRemaining = () => {
    if (!pendingAction?.expires_at) return null;
    const expires = new Date(pendingAction.expires_at);
    const now = new Date();
    const hoursLeft = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / (1000 * 60 * 60)));
    return hoursLeft;
  };

  const debtRatio = learningDebt.saved > 0 
    ? Math.round((learningDebt.applied / learningDebt.saved) * 100) 
    : 100;

  if (isLoading) return null;
  if (!pendingAction && learningDebt.saved === 0) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardContent className="p-4 space-y-4">
        {/* Header with Learning Debt */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Apply This</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            <span>{debtRatio}% applied</span>
            <div 
              className={`w-2 h-2 rounded-full ${
                debtRatio >= 70 ? 'bg-success' : 
                debtRatio >= 40 ? 'bg-warning' : 
                'bg-destructive'
              }`} 
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {pendingAction ? (
            <motion.div
              key={pendingAction.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* Source reference */}
              <p className="text-xs text-muted-foreground truncate">
                From: {pendingAction.source_title}
              </p>
              
              {/* Action */}
              <p className="text-sm font-medium leading-relaxed">
                {pendingAction.action_text}
              </p>
              
              {/* Context */}
              {pendingAction.action_context && (
                <p className="text-xs text-muted-foreground">
                  {pendingAction.action_context}
                </p>
              )}
              
              {/* Time remaining */}
              {getTimeRemaining() !== null && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{getTimeRemaining()}h left</span>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  size="sm"
                  className="flex-1 rounded-xl"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Done
                </Button>
                <Button
                  onClick={handleSkip}
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-4"
            >
              <div className="w-10 h-10 mx-auto rounded-xl bg-success/10 flex items-center justify-center mb-2">
                <Check className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">No pending actions</p>
              <p className="text-xs text-muted-foreground mt-1">
                Save content to queue actions
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};
