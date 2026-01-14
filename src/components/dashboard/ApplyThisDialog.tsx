import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Check, X, Clock, Zap } from "lucide-react";
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

interface ApplyThisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ApplyThisDialog = ({ open, onOpenChange }: ApplyThisDialogProps) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
  }, [open, user]);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const { data: actions } = await supabase
        .from("pending_actions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      
      setPendingActions((actions || []) as PendingAction[]);
      setCurrentIndex(0);
    } catch (error) {
      console.error("Error fetching pending actions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const currentAction = pendingActions[currentIndex];

  const handleComplete = async () => {
    if (!currentAction || !user) return;
    setIsCompleting(true);
    
    try {
      await supabase
        .from("pending_actions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", currentAction.id);
      
      // Increment content_applied_count
      const { data: identity } = await supabase
        .from("identity_seeds")
        .select("content_applied_count")
        .eq("user_id", user.id)
        .maybeSingle();
      
      await supabase
        .from("identity_seeds")
        .update({ content_applied_count: ((identity as any)?.content_applied_count || 0) + 1 })
        .eq("user_id", user.id);
      
      toast.success("Applied! Knowledge → Action");
      
      // Move to next or close
      if (currentIndex < pendingActions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setPendingActions(prev => prev.filter(a => a.id !== currentAction.id));
      } else {
        setPendingActions(prev => prev.filter(a => a.id !== currentAction.id));
        if (pendingActions.length <= 1) {
          onOpenChange(false);
        }
      }
    } catch (error) {
      console.error("Error completing action:", error);
      toast.error("Failed to complete");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    if (!currentAction || !user) return;
    
    try {
      await supabase
        .from("pending_actions")
        .update({ status: "skipped" })
        .eq("id", currentAction.id);
      
      if (currentIndex < pendingActions.length - 1) {
        setPendingActions(prev => prev.filter(a => a.id !== currentAction.id));
      } else {
        setPendingActions(prev => prev.filter(a => a.id !== currentAction.id));
        if (pendingActions.length <= 1) {
          onOpenChange(false);
          toast.info("All caught up!");
        }
      }
    } catch (error) {
      console.error("Error skipping action:", error);
    }
  };

  const getTimeRemaining = () => {
    if (!currentAction?.expires_at) return null;
    const expires = new Date(currentAction.expires_at);
    const now = new Date();
    const hoursLeft = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / (1000 * 60 * 60)));
    return hoursLeft;
  };

  const content = (
    <div className="py-2 sm:py-3">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {currentAction ? (
            <motion.div
              key={currentAction.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Source reference */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground truncate max-w-[60%] sm:max-w-[70%]">
                  From: {currentAction.source_title}
                </p>
                {getTimeRemaining() !== null && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{getTimeRemaining()}h left</span>
                  </div>
                )}
              </div>
              
              {/* Action */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm sm:text-base font-medium leading-relaxed">
                  {currentAction.action_text}
                </p>
              </div>
              
              {/* Context */}
              {currentAction.action_context && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {currentAction.action_context}
                </p>
              )}
              
              {/* Progress indicator */}
              {pendingActions.length > 1 && (
                <div className="flex items-center justify-center gap-1.5">
                  {pendingActions.map((_, i) => (
                    <div 
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === currentIndex ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="flex-1 h-10 sm:h-9 rounded-lg text-sm"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  Done
                </Button>
                <Button
                  onClick={handleSkip}
                  variant="outline"
                  className="h-10 sm:h-9 rounded-lg px-3"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-6"
            >
              <div className="w-10 h-10 mx-auto rounded-lg bg-success/10 flex items-center justify-center mb-2">
                <Check className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Save content to queue new actions
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );

  const header = (
    <>
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <span>Apply This</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {pendingActions.length > 0 
          ? `${pendingActions.length} action${pendingActions.length > 1 ? 's' : ''} queued from your saved content`
          : "No pending actions"
        }
      </p>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-8">
          <DrawerHeader className="text-left px-0">
            <DrawerTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Apply This
            </DrawerTitle>
            <DrawerDescription>
              {pendingActions.length > 0 
                ? `${pendingActions.length} action${pendingActions.length > 1 ? 's' : ''} queued from your saved content`
                : "No pending actions"
              }
            </DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4 rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Apply This
          </DialogTitle>
          <DialogDescription>
            {pendingActions.length > 0 
              ? `${pendingActions.length} action${pendingActions.length > 1 ? 's' : ''} queued from your saved content`
              : "No pending actions"
            }
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
