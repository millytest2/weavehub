import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
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
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });

      // Build combined content
      const parts = [];
      if (wentWell.trim()) parts.push(`What went well: ${wentWell.trim()}`);
      if (release.trim()) parts.push(`Releasing: ${release.trim()}`);
      if (grateful.trim()) parts.push(`Grateful for: ${grateful.trim()}`);

      if (parts.length > 0) {
        const { error } = await supabase.from("insights").insert({
          user_id: user.id,
          title: `Evening Reflection - ${today}`,
          content: parts.join("\n\n"),
          source: "evening_reflection"
        });
        if (error) throw error;
        toast.success("Saved");
      }

      handleDismiss();
    } catch (error) {
      console.error("Error saving reflection:", error);
      toast.error("Couldn't save");
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-0 overflow-hidden border border-border/50 bg-gradient-to-b from-card via-card to-muted/30 shadow-elevated rounded-3xl max-h-[90vh] overflow-y-auto">
        {/* Subtle top accent - evening color */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-400/40 via-indigo-500 to-indigo-400/40" />
        
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              Evening
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={handleSkip}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-2xl font-display font-semibold tracking-tight">
              Close the day
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              3 minutes to release and rest.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* What went well */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                What went well today?
              </label>
              <Textarea
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="One thing, big or small..."
                className="min-h-[60px] text-sm resize-none bg-muted/30 border-border/50 rounded-xl focus-visible:ring-1"
              />
            </div>

            {/* What to release */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                What are you releasing?
              </label>
              <Textarea
                value={release}
                onChange={(e) => setRelease(e.target.value)}
                placeholder="A thought, worry, or tension..."
                className="min-h-[60px] text-sm resize-none bg-muted/30 border-border/50 rounded-xl focus-visible:ring-1"
              />
            </div>

            {/* Gratitude */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                What are you grateful for?
              </label>
              <Textarea
                value={grateful}
                onChange={(e) => setGrateful(e.target.value)}
                placeholder="Person, moment, or thing..."
                className="min-h-[60px] text-sm resize-none bg-muted/30 border-border/50 rounded-xl focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1 text-sm text-muted-foreground rounded-2xl h-12"
              onClick={handleSkip}
            >
              Not tonight
            </Button>
            <Button
              size="lg"
              className="flex-1 text-sm rounded-2xl h-12 font-medium"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Release"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
