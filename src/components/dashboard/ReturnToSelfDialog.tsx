import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Compass, Heart, MapPin, Lightbulb, Sparkles } from "lucide-react";

interface ReturnToSelfData {
  identity: string;
  values: string;
  currentReality: string;
  relevantInsight: { title: string; content: string } | null;
  gentleRep: string;
  reminder: string;
  emotionalState?: string;
}

interface ReturnToSelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReturnToSelfData | null;
  isLoading: boolean;
}

export const ReturnToSelfDialog = ({ open, onOpenChange, data, isLoading }: ReturnToSelfDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

            {/* Relevant Insight */}
            {data.relevantInsight && (
              <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                  <Lightbulb className="h-3.5 w-3.5" />
                  From Your Vault
                </div>
                <p className="text-xs font-medium text-foreground/90">{data.relevantInsight.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{data.relevantInsight.content}</p>
              </div>
            )}

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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};