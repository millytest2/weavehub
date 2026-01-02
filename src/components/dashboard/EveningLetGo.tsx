import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Moon, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface EveningLetGoProps {
  onComplete: () => void;
}

export function EveningLetGo({ onComplete }: EveningLetGoProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [wentWell, setWentWell] = useState("");
  const [release, setRelease] = useState("");
  const [grateful, setGrateful] = useState("");

  useEffect(() => {
    checkIfShouldShow();
  }, [user]);

  const checkIfShouldShow = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const letGoKey = `weave_evening_letgo_${user.id}`;
    const lastLetGo = localStorage.getItem(letGoKey);

    const hour = new Date().getHours();
    // Show between 6pm and 11pm
    const isEvening = hour >= 18 && hour < 23;
    const seenToday = lastLetGo === today;

    if (!isEvening || seenToday) {
      setLoading(false);
      onComplete();
      return;
    }

    // Check if user has identity seed (only show to users who've set up)
    try {
      const { data: identity } = await supabase
        .from("identity_seeds")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (identity) {
        setOpen(true);
      } else {
        onComplete();
      }
    } catch (error) {
      console.error("Error checking identity:", error);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    // At least one field should have content
    if (!wentWell.trim() && !release.trim() && !grateful.trim()) {
      handleDismiss();
      return;
    }

    setSaving(true);
    try {
      const insights = [];
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });

      // Create an insight for each non-empty field
      if (wentWell.trim()) {
        insights.push({
          user_id: user.id,
          title: `What went well - ${today}`,
          content: wentWell.trim(),
          source: "evening_letgo_well"
        });
      }

      if (release.trim()) {
        insights.push({
          user_id: user.id,
          title: `Releasing - ${today}`,
          content: release.trim(),
          source: "evening_letgo_release"
        });
      }

      if (grateful.trim()) {
        insights.push({
          user_id: user.id,
          title: `Grateful for - ${today}`,
          content: grateful.trim(),
          source: "evening_letgo_grateful"
        });
      }

      if (insights.length > 0) {
        const { error } = await supabase.from("insights").insert(insights);
        if (error) throw error;
        toast.success("Reflection saved");
      }

      handleDismiss();
    } catch (error) {
      console.error("Error saving reflection:", error);
      toast.error("Couldn't save reflection");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const key = `weave_evening_letgo_${user.id}`;
      localStorage.setItem(key, today);
    }
    setOpen(false);
    onComplete();
  };

  const handleSkip = () => {
    setOpen(false);
    onComplete();
  };

  if (loading || !open) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-0 overflow-hidden border-0 bg-gradient-to-b from-card to-background shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 space-y-3">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Moon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Evening</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mr-2 -mt-2 hover:bg-muted/50"
                onClick={handleSkip}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <DialogTitle className="text-base font-bold tracking-tight text-left pt-1 leading-snug">
              Let it go
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground text-left">
              3 minutes. Close the day with clarity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {/* What went well */}
            <div className="space-y-1">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-500" />
                What went well today?
              </label>
              <Textarea
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="One thing, big or small..."
                className="min-h-[50px] text-sm resize-none bg-muted/30 border-muted"
              />
            </div>

            {/* What to release */}
            <div className="space-y-1">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Moon className="h-3 w-3 text-blue-400" />
                What are you releasing?
              </label>
              <Textarea
                value={release}
                onChange={(e) => setRelease(e.target.value)}
                placeholder="A thought, worry, or tension..."
                className="min-h-[50px] text-sm resize-none bg-muted/30 border-muted"
              />
            </div>

            {/* Gratitude */}
            <div className="space-y-1">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <span className="text-rose-400">♡</span>
                What are you grateful for?
              </label>
              <Textarea
                value={grateful}
                onChange={(e) => setGrateful(e.target.value)}
                placeholder="Person, moment, or thing..."
                className="min-h-[50px] text-sm resize-none bg-muted/30 border-muted"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1 text-xs text-muted-foreground hover:text-foreground h-9"
              onClick={handleSkip}
            >
              Not tonight
            </Button>
            <Button
              className="flex-1 text-xs h-9"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Release & rest"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
