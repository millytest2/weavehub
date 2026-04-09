import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { WeaveLoader } from "@/components/ui/weave-loader";

interface CurrentChapterProps {
  activeExperiment: any;
  user: any;
  onExperimentChanged: () => void;
  getTimePhase: () => string;
}

export const CurrentChapter = ({ activeExperiment, user, onExperimentChanged, getTimePhase }: CurrentChapterProps) => {
  const [generating, setGenerating] = useState(false);

  // Auto-complete check: if experiment duration has passed
  const checkAutoComplete = async (exp: any) => {
    if (!exp || exp.status !== "in_progress") return;
    
    const createdDate = new Date(exp.created_at);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const durationStr = exp.duration?.toLowerCase() || '';
    let totalDays = 7;
    if (durationStr.includes('48h') || durationStr.includes('2 day')) totalDays = 2;
    else if (durationStr.includes('24h') || durationStr.includes('1 day')) totalDays = 1;
    else if (durationStr.includes('3 day')) totalDays = 3;
    else if (durationStr.includes('5 day')) totalDays = 5;
    else if (durationStr.includes('week')) totalDays = 7;
    else if (durationStr.includes('2 week')) totalDays = 14;
    else if (durationStr.includes('10')) totalDays = 10;

    if (daysPassed >= totalDays) {
      await supabase.from("experiments").update({ 
        status: "completed",
        completed_at: new Date().toISOString()
      }).eq("id", exp.id);
      toast.success("Chapter complete. What you tested is now part of you.");
      onExperimentChanged();
      return true;
    }
    return false;
  };

  // Check auto-complete on render
  if (activeExperiment) {
    checkAutoComplete(activeExperiment);
  }

  const handleGenerate = async () => {
    if (!user || generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("experiment-generator", {
        body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      if (data?.error && data?.active_experiment) {
        toast.error(`Pause or complete "${data.active_experiment.title}" first`, { duration: 4000 });
        return;
      }
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      const insertedId = data.inserted_ids?.[0] || data.experiments?.[0]?.id;
      if (insertedId) {
        await supabase.from("experiments").update({ status: "in_progress" }).eq("id", insertedId);
        toast.success("New chapter started");
        onExperimentChanged();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <section className="px-1 py-4 flex justify-center">
        <WeaveLoader size="md" text="Designing your next chapter..." />
      </section>
    );
  }

  if (!activeExperiment) {
    return (
      <section className="px-1">
        <button
          onClick={handleGenerate}
          className="w-full text-left group"
        >
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-border/40 hover:border-primary/30 transition-all">
            <div className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Sparkles className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Start a new chapter
              </p>
              <p className="text-xs text-muted-foreground/60">
                An experiment designed from your content
              </p>
            </div>
          </div>
        </button>
      </section>
    );
  }

  // Active experiment — passive display
  const createdDate = new Date(activeExperiment.created_at);
  const now = new Date();
  const startDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const steps = activeExperiment.steps?.split('\n').filter((s: string) => s.trim()) || [];
  let todayFocus = '';
  if (steps.length > 0) {
    todayFocus = steps[Math.min(dayNumber - 1, steps.length - 1)] || '';
  }

  return (
    <section className="px-1">
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest pl-1">
          Current chapter · day {dayNumber}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You're testing: <span className="text-foreground font-medium">{activeExperiment.identity_shift_target || activeExperiment.title}</span>
        </p>
        {todayFocus && getTimePhase() !== 'evening' && getTimePhase() !== 'night' && (
          <p className="text-xs text-muted-foreground/60 leading-relaxed">
            {todayFocus}
          </p>
        )}
      </div>
    </section>
  );
};
