import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Check, X, ArrowRight, Lightbulb, Quote } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface PendingAction {
  id: string;
  source_title: string;
  source_type: string;
  action_text: string;
  action_context: string | null;
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
  const [identityContext, setIdentityContext] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
  }, [open, user]);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const [actionsResult, identityResult] = await Promise.all([
        supabase
          .from("pending_actions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("identity_seeds")
          .select("content, weekly_focus")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);
      
      setPendingActions((actionsResult.data || []) as PendingAction[]);
      setCurrentIndex(0);

      // Extract a short identity phrase for context
      if (identityResult.data?.content) {
        const content = identityResult.data.content;
        const match = content.match(/I am (?:becoming )?(?:someone who )?([^.]+)/i);
        if (match) {
          setIdentityContext(match[1].trim().toLowerCase());
        }
      }
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

  const handleNotNow = async () => {
    if (!currentAction || !user) return;
    
    try {
      // Just skip for now, don't mark as skipped permanently
      if (currentIndex < pendingActions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        onOpenChange(false);
        if (pendingActions.length > 1) {
          toast.info(`${pendingActions.length - 1} still waiting when you're ready`);
        }
      }
    } catch (error) {
      console.error("Error skipping action:", error);
    }
  };

  const handleDismiss = async () => {
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
        }
      }
    } catch (error) {
      console.error("Error dismissing action:", error);
    }
  };

  const getSourceIcon = (sourceType?: string) => {
    // Simple fallback
    return <Lightbulb className="h-3.5 w-3.5" />;
  };

  const content = (
    <div className="py-2 sm:py-3 overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
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
              className="space-y-4 overflow-hidden"
            >
              {/* Source reference - softer */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Quote className="h-3 w-3" />
                <span className="truncate">From "{currentAction.source_title}"</span>
              </div>
              
              {/* The action itself - prominent */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-base font-medium leading-relaxed break-words">
                  {currentAction.action_text}
                </p>
              </div>
              
              {/* Context - why this matters */}
              {currentAction.action_context && (
                <p className="text-sm text-muted-foreground leading-relaxed break-words px-1">
                  {currentAction.action_context}
                </p>
              )}

              {/* Identity connection - subtle */}
              {identityContext && (
                <p className="text-xs text-muted-foreground/70 italic px-1">
                  This connects to {identityContext}
                </p>
              )}
              
              {/* Progress indicator */}
              {pendingActions.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {pendingActions.map((_, i) => (
                    <div 
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === currentIndex ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
              
              {/* Actions - cleaner */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="w-full h-11 rounded-xl text-sm"
                >
                  <Check className="h-4 w-4 mr-2" />
                  I did this
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={handleNotNow}
                    variant="ghost"
                    className="flex-1 h-9 rounded-lg text-sm text-muted-foreground"
                  >
                    Not now
                  </Button>
                  <Button
                    onClick={handleDismiss}
                    variant="ghost"
                    className="h-9 rounded-lg px-3 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground mt-1">
                New actions appear as you save content
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-8 overflow-hidden max-w-full">
          <div className="w-full overflow-hidden">
            <DrawerHeader className="text-left px-0">
              <DrawerTitle className="text-lg">
                Apply what you learned
              </DrawerTitle>
              <DrawerDescription className="break-words">
                {pendingActions.length > 0 
                  ? `${pendingActions.length} action${pendingActions.length > 1 ? 's' : ''} from your captures`
                  : "Nothing pending"
                }
              </DrawerDescription>
            </DrawerHeader>
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Apply what you learned
          </DialogTitle>
          <DialogDescription>
            {pendingActions.length > 0 
              ? `${pendingActions.length} action${pendingActions.length > 1 ? 's' : ''} from your captures`
              : "Nothing pending"
            }
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
