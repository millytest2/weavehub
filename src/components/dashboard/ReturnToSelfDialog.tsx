import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Compass, Heart, MapPin, Lightbulb, Sparkles, Check, BookOpen, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FromYourMind {
  type: 'insight' | 'document';
  id: string;
  title: string;
  content: string;
  matchedState: boolean;
}

interface ReturnToSelfData {
  identity: string;
  values: string;
  currentReality: string;
  fromYourMind?: FromYourMind | null;
  // Legacy support
  relevantInsight?: { title: string; content: string } | null;
  gentleRep: string;
  reminder: string;
  emotionalState?: string;
  logId?: string | null;
}

interface ReturnToSelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReturnToSelfData | null;
  isLoading: boolean;
}

export const ReturnToSelfDialog = ({ open, onOpenChange, data, isLoading }: ReturnToSelfDialogProps) => {
  const [resonated, setResonated] = useState<boolean | null>(null);
  const [isMarkingResonance, setIsMarkingResonance] = useState(false);

  const handleResonance = async (didResonate: boolean) => {
    if (!data?.logId) return;
    
    setIsMarkingResonance(true);
    try {
      const { error } = await supabase
        .from("grounding_log")
        .update({ resonated: didResonate })
        .eq("id", data.logId);
      
      if (error) throw error;
      setResonated(didResonate);
      toast.success(didResonate ? "Noted. This helped." : "Got it. We'll learn from this.");
    } catch (error) {
      console.error("Error marking resonance:", error);
    } finally {
      setIsMarkingResonance(false);
    }
  };

  // Handle both new format (fromYourMind) and legacy (relevantInsight)
  const mindContent = data?.fromYourMind || (data?.relevantInsight ? {
    type: 'insight' as const,
    id: '',
    title: data.relevantInsight.title,
    content: data.relevantInsight.content,
    matchedState: false
  } : null);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) setResonated(null);
      onOpenChange(newOpen);
    }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            Return to Self
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Ground yourself. Remember who you are.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="animate-pulse text-muted-foreground">
              Gathering your essence...
            </div>
          </div>
        ) : data ? (
          <div className="space-y-5 pt-2">
            {/* FROM YOUR MIND - Now featured prominently at the top */}
            {mindContent && (
              <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-xs text-primary uppercase tracking-wide font-medium">
                  {mindContent.type === 'insight' ? (
                    <Lightbulb className="h-3.5 w-3.5" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  From Your Mind
                  {mindContent.matchedState && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary normal-case">
                      matched to how you're feeling
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">{mindContent.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{mindContent.content}</p>
              </div>
            )}

            <Separator className="my-4" />

            {/* Identity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Compass className="h-3.5 w-3.5" />
                Who You Are Becoming
              </div>
              <p className="text-sm leading-relaxed">{data.identity}</p>
            </div>

            {/* Values */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Heart className="h-3.5 w-3.5" />
                Your Values
              </div>
              <p className="text-sm text-foreground/80">{data.values}</p>
            </div>

            {/* Current Reality */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <MapPin className="h-3.5 w-3.5" />
                Where You Are Now
              </div>
              <p className="text-sm text-foreground/80">{data.currentReality}</p>
            </div>

            <Separator className="my-4" />

            {/* Gentle Rep */}
            <div className="space-y-2 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 text-xs text-primary uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5" />
                One Gentle Rep
              </div>
              <p className="text-sm font-medium leading-relaxed">{data.gentleRep}</p>
            </div>

            {/* Reminder */}
            <div className="text-center pt-2">
              <p className="text-sm italic text-muted-foreground">{data.reminder}</p>
            </div>

            {/* Resonance Tracking */}
            {data.logId && resonated === null && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Did this help?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => handleResonance(true)}
                  disabled={isMarkingResonance}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Yes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-muted-foreground"
                  onClick={() => handleResonance(false)}
                  disabled={isMarkingResonance}
                >
                  Not really
                </Button>
              </div>
            )}
            {resonated !== null && (
              <div className="text-center pt-4 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  {resonated ? "✓ Noted. Glad it helped." : "Got it. We'll find what works for you."}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};