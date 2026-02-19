import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Target, 
  ChevronRight, 
  Sparkles, 
  Check, 
  Clock,
  Lightbulb,
  RefreshCw,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Milestone {
  id?: string;
  month_number: number;
  year: number;
  title: string;
  description?: string;
  capability_focus?: string;
  status: string;
  insights_connected?: number;
}

interface ThreadViewProps {
  userId: string;
  yearNote?: string;
  weeklyFocus?: string;
  insightCount: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const ThreadView = ({ userId, yearNote, weeklyFocus, insightCount }: ThreadViewProps) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    loadMilestones();
  }, [userId]);

  const loadMilestones = async () => {
    setIsLoading(true);
    try {
      // Try loading cached milestones first
      const { data } = await supabase
        .from("thread_milestones")
        .select("*")
        .eq("user_id", userId)
        .eq("year", 2026)
        .order("month_number", { ascending: true });

      if (data && data.length >= 10) {
        setMilestones(data);
        // Auto-expand current month
        setExpandedMonth(currentMonth);
      } else if (yearNote) {
        // Generate milestones
        await generateMilestones();
      }
    } catch (err) {
      console.error("Load milestones error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMilestones = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("weave-synthesis", {
        body: { action: "generate_milestones" }
      });

      if (error) throw error;
      if (data?.milestones) {
        setMilestones(data.milestones);
        setExpandedMonth(currentMonth);
        if (!data.cached) {
          toast.success("Your Thread has been woven");
        }
      }
    } catch (err) {
      console.error("Generate milestones error:", err);
      toast.error("Couldn't generate milestones");
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateMilestones = async () => {
    // Delete existing and regenerate
    await supabase
      .from("thread_milestones")
      .delete()
      .eq("user_id", userId)
      .eq("year", 2026);
    
    setMilestones([]);
    await generateMilestones();
  };

  if (!yearNote) {
    return (
      <Card className="p-6 rounded-2xl text-center space-y-3">
        <Target className="h-10 w-10 text-muted-foreground mx-auto" />
        <h3 className="font-display text-lg font-semibold">Set Your 2026 Direction</h3>
        <p className="text-sm text-muted-foreground">
          Define your Misogi in Identity Seed to generate The Thread — your reverse-engineered roadmap from 2026 to today.
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/identity"}>
          Set Direction
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </Card>
    );
  }

  if (isLoading || isGenerating) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <p className="text-xs text-muted-foreground text-center animate-pulse">
          {isGenerating ? "Weaving your 2026 roadmap..." : "Loading The Thread..."}
        </p>
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <Card className="p-6 rounded-2xl text-center space-y-3">
        <Sparkles className="h-10 w-10 text-primary mx-auto" />
        <h3 className="font-display text-lg font-semibold">Generate The Thread</h3>
        <p className="text-sm text-muted-foreground">
          Reverse-engineer your 2026 Misogi into monthly milestones.
        </p>
        <Button onClick={generateMilestones} disabled={isGenerating}>
          {isGenerating ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Weaving...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> Build The Thread</>
          )}
        </Button>
      </Card>
    );
  }

  const currentMilestone = milestones.find(m => m.month_number === currentMonth);
  const completedCount = milestones.filter(m => m.status === "completed").length;

  return (
    <div className="space-y-4">
      {/* 2026 Vision Header */}
      <Card className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary font-medium mb-0.5">2026 Misogi</p>
            <p className="text-sm font-medium line-clamp-2">{yearNote}</p>
          </div>
        </div>
        {weeklyFocus && (
          <div className="mt-3 pt-3 border-t border-primary/10">
            <p className="text-xs text-muted-foreground">
              <span className="text-primary font-medium">This week:</span> {weeklyFocus}
            </p>
          </div>
        )}
      </Card>

      {/* Progress bar */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / 12) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {completedCount}/12
        </span>
      </div>

      {/* This Month's Focus (highlighted) */}
      {currentMilestone && (
        <Card className="p-4 rounded-2xl border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">{currentMonth}</span>
            </div>
            <span className="text-xs font-medium text-primary">This Month</span>
          </div>
          <h3 className="font-display text-base font-semibold mb-1">{currentMilestone.title}</h3>
          {currentMilestone.description && (
            <p className="text-sm text-muted-foreground mb-2">{currentMilestone.description}</p>
          )}
          {currentMilestone.capability_focus && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Lightbulb className="h-3 w-3" />
              <span>Building: {currentMilestone.capability_focus}</span>
            </div>
          )}
        </Card>
      )}

      {/* Monthly Timeline */}
      <div className="space-y-1">
        {milestones.map((milestone) => {
          const isExpanded = expandedMonth === milestone.month_number;
          const isCurrent = milestone.month_number === currentMonth;
          const isCompleted = milestone.status === "completed";
          const isPast = milestone.month_number < currentMonth;

          if (isCurrent) return null; // Already shown above

          return (
            <motion.button
              key={milestone.month_number}
              onClick={() => setExpandedMonth(isExpanded ? null : milestone.month_number)}
              className={`w-full text-left rounded-xl p-3 transition-all ${
                isExpanded
                  ? "bg-card border border-border shadow-sm"
                  : "hover:bg-muted/50"
              }`}
              layout
            >
              <div className="flex items-center gap-3">
                {/* Status indicator */}
                <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                    : isPast
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="text-xs font-medium">{milestone.month_number}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isPast ? "text-muted-foreground" : "text-muted-foreground"}`}>
                      {MONTH_NAMES[milestone.month_number - 1]}
                    </span>
                  </div>
                  <p className={`text-sm font-medium line-clamp-1 ${
                    isPast ? "text-muted-foreground" : ""
                  }`}>
                    {milestone.title}
                  </p>
                </div>

                <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`} />
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-3 border-t border-border/50 space-y-2">
                      {milestone.description && (
                        <p className="text-sm text-muted-foreground">{milestone.description}</p>
                      )}
                      {milestone.capability_focus && (
                        <div className="flex items-center gap-1.5 text-xs text-primary">
                          <Lightbulb className="h-3 w-3" />
                          <span>{milestone.capability_focus}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {/* Regenerate */}
      <div className="pt-2 text-center">
        <button
          onClick={regenerateMilestones}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Recalibrate Thread
        </button>
      </div>
    </div>
  );
};
