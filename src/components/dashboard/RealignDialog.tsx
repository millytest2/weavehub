import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, Zap, Waves, Target, Compass, ArrowRight, Heart } from "lucide-react";

export interface RealignData {
  mode: "push" | "flow";
  headline: string;
  currentState: string;
  dreamReality: string;
  gap?: string;
  intensity?: string;
  todayMatters?: string;
  valuesInPlay?: string;
  oneMove: string;
}

interface RealignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RealignData | null;
  isLoading: boolean;
}

export const RealignDialog = ({
  open,
  onOpenChange,
  data,
  isLoading,
}: RealignDialogProps) => {
  const isPush = data?.mode === "push";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg mx-auto rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPush ? (
              <>
                <Zap className="h-5 w-5 text-orange-500" />
                Push Mode
              </>
            ) : (
              <>
                <Waves className="h-5 w-5 text-blue-500" />
                Flow Mode
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isLoading ? "Reading your context..." : data?.headline}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {isPush ? "Mapping the gap..." : "Finding your center..."}
            </p>
          </div>
        ) : data ? (
          <div className="space-y-5 py-2">
            {/* Current State */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Compass className="h-4 w-4" />
                Where You Are
              </div>
              <p className="text-sm leading-relaxed">{data.currentState}</p>
            </div>

            <Separator />

            {/* Dream Reality */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Target className="h-4 w-4" />
                Where You're Going
              </div>
              <p className="text-sm leading-relaxed">{data.dreamReality}</p>
            </div>

            <Separator />

            {/* Mode-specific content */}
            {isPush && data.gap && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                    <ArrowRight className="h-4 w-4" />
                    The Gap
                  </div>
                  <p className="text-sm leading-relaxed">{data.gap}</p>
                </div>
                <Separator />
              </>
            )}

            {isPush && data.intensity && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                  <Zap className="h-4 w-4" />
                  Intensity
                </div>
                <p className="text-sm leading-relaxed">{data.intensity}</p>
              </div>
            )}

            {!isPush && data.todayMatters && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                  <Waves className="h-4 w-4" />
                  Why Today Matters
                </div>
                <p className="text-sm leading-relaxed">{data.todayMatters}</p>
              </div>
            )}

            {!isPush && data.valuesInPlay && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                    <Heart className="h-4 w-4" />
                    Values in Play
                  </div>
                  <p className="text-sm leading-relaxed">{data.valuesInPlay}</p>
                </div>
              </>
            )}

            <Separator />

            {/* One Move */}
            <div className={`p-4 rounded-lg ${isPush ? "bg-orange-500/10 border border-orange-500/20" : "bg-blue-500/10 border border-blue-500/20"}`}>
              <p className="text-sm font-medium mb-1">One Move</p>
              <p className="text-sm leading-relaxed">{data.oneMove}</p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
