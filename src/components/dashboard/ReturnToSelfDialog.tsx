import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ReturnToSelfData {
  bodyFirst: string;
  yourWords: string;
  yourWordsSource: string;
  whatIsHappening: string;
  whoYouAre: string;
  oneMove: string;
  truthYouKnow: string;
  isSpiral: boolean;
  emotionalState: string | null;
  logId: string | null;
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
  const [bodyDone, setBodyDone] = useState(false);

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
      toast.success(didResonate ? "Noted." : "Got it.");
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsMarkingResonance(false);
    }
  };

  const handleClose = () => {
    setResonated(null);
    setBodyDone(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto rounded-xl p-5 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base font-medium text-center">
            {data?.isSpiral ? "Break the loop" : "Return"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-16 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">
              ...
            </div>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* 1. BODY FIRST - Always */}
            <button
              onClick={() => setBodyDone(!bodyDone)}
              className={`w-full p-4 rounded-xl text-left transition-all ${
                bodyDone 
                  ? 'bg-primary/10 border border-primary/30' 
                  : data.isSpiral 
                    ? 'bg-destructive/10 border border-destructive/30'
                    : 'bg-muted/50 border border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  bodyDone ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {bodyDone && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className={`text-sm font-medium ${bodyDone ? 'text-muted-foreground line-through' : ''}`}>
                  {data.bodyFirst}
                </span>
              </div>
            </button>

            {/* Only show rest after body is done */}
            {bodyDone && (
              <>
                {/* 2. WHAT'S HAPPENING - Direct naming */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">What's happening</p>
                  <p className="text-sm leading-relaxed">{data.whatIsHappening}</p>
                </div>

                {/* 3. YOUR WORDS - From their captures */}
                {data.yourWords && (
                  <div className="p-4 rounded-lg bg-muted/30 border-l-2 border-primary/50">
                    <p className="text-sm italic leading-relaxed">"{data.yourWords}"</p>
                    {data.yourWordsSource && (
                      <p className="text-xs text-muted-foreground mt-2">— {data.yourWordsSource}</p>
                    )}
                  </div>
                )}

                {/* 4. WHO YOU ARE - Their identity */}
                {data.whoYouAre && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Who you are</p>
                    <p className="text-sm leading-relaxed">{data.whoYouAre}</p>
                  </div>
                )}

                {/* 5. ONE MOVE */}
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-xs text-primary uppercase tracking-wider mb-1">One move</p>
                  <p className="text-sm font-medium">{data.oneMove}</p>
                </div>

                {/* 6. TRUTH YOU KNOW */}
                <div className="text-center pt-2 pb-1">
                  <p className="text-sm text-muted-foreground">{data.truthYouKnow}</p>
                </div>

                {/* Resonance */}
                {data.logId && resonated === null && (
                  <div className="flex items-center justify-center gap-3 pt-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">Helped?</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleResonance(true)}
                      disabled={isMarkingResonance}
                    >
                      Yes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => handleResonance(false)}
                      disabled={isMarkingResonance}
                    >
                      No
                    </Button>
                  </div>
                )}
                {resonated !== null && (
                  <div className="text-center pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">
                      {resonated ? "Noted." : "Got it."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
