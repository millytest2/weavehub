import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, RefreshCw, Quote, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Consistency {
  pattern: string;
  evidence: string;
  quotes?: string[];
}
interface TopicPulse { topic: string; weight: string; }
interface SmallMoment { quote: string; source?: string; why: string; }
interface Tension { pullA: string; pullB: string; note: string; }

interface SynthesisResult {
  whatYourMindIsSaying: string;
  synthesis: string;
  consistencies?: Consistency[];
  topicPulse?: TopicPulse[];
  smallMoments?: SmallMoment[];
  tensions?: Tension[];
  hiddenConnections?: string[];
  nextThread?: string;
  coreThemes?: string[];
  emergingDirection?: string;
  stats?: {
    insightsCount: number;
    documentsCount: number;
    experimentsCount: number;
    actionsCount: number;
    observationsCount: number;
  };
}

interface MindSynthesisProps {
  insightCount: number;
}

export const MindSynthesis = ({ insightCount }: MindSynthesisProps) => {
  const [isWeaving, setIsWeaving] = useState(false);
  const [result, setResult] = useState<SynthesisResult | null>(null);

  const handleSynthesize = async () => {
    setIsWeaving(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("weave-synthesis", {
        body: { action: "full_synthesis" },
      });
      if (error) throw error;
      if (data?.synthesis || data?.whatYourMindIsSaying) setResult(data);
      else if (data?.error) toast.error(data.error);
      else toast.error("Couldn't weave — try again");
    } catch (err) {
      console.error("Synthesis error:", err);
      toast.error("Failed to synthesize");
    } finally {
      setIsWeaving(false);
    }
  };

  if (isWeaving) {
    return (
      <div className="flex items-center justify-center py-16">
        <WeaveLoader size="lg" text="Reading everything you've captured..." />
      </div>
    );
  }

  if (result) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Voice */}
        <Card className="p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-start gap-3">
            <Quote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-base font-display font-semibold italic leading-relaxed">
              {result.whatYourMindIsSaying}
            </p>
          </div>
        </Card>

        {/* Synthesis paragraphs */}
        {result.synthesis && (
          <Card className="p-4 rounded-2xl">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">The weave</p>
            <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
              {result.synthesis}
            </p>
          </Card>
        )}

        {/* Consistencies — repeating threads with evidence */}
        {result.consistencies && result.consistencies.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-3">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50">Consistencies</p>
            <div className="space-y-3">
              {result.consistencies.map((c, i) => (
                <div key={i} className="pb-3 border-b border-border/20 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">{c.pattern}</p>
                  <p className="text-[12px] text-muted-foreground/70 mt-0.5">{c.evidence}</p>
                  {c.quotes && c.quotes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {c.quotes.map((q, j) => (
                        <p key={j} className="text-[12px] italic text-foreground/60 border-l-2 border-primary/25 pl-2">
                          "{q}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Topic pulse */}
        {result.topicPulse && result.topicPulse.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-2">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50">Topic pulse</p>
            <div className="space-y-1.5">
              {result.topicPulse.map((t, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground/85">{t.topic}</span>
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">{t.weight}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Small moments */}
        {result.smallMoments && result.smallMoments.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-3">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50">Small moments</p>
            <div className="space-y-3">
              {result.smallMoments.map((m, i) => (
                <div key={i}>
                  <p className="text-sm italic text-foreground/85 border-l-2 border-primary/30 pl-3 leading-snug">
                    "{m.quote}"
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1 pl-3">
                    {m.source ? `${m.source} · ` : ""}{m.why}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tensions */}
        {result.tensions && result.tensions.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-3">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50">Tensions</p>
            <div className="space-y-2.5">
              {result.tensions.map((t, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center gap-2 text-foreground/85">
                    <span>{t.pullA}</span>
                    <span className="text-muted-foreground/40">↔</span>
                    <span>{t.pullB}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground/70 mt-0.5">{t.note}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Hidden connections */}
        {result.hiddenConnections && result.hiddenConnections.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-2">
            <p className="text-[13px] uppercase tracking-[0.15em] text-muted-foreground/50">Hidden connections</p>
            <div className="space-y-1.5">
              {result.hiddenConnections.map((h, i) => (
                <p key={i} className="text-sm text-foreground/85">— {h}</p>
              ))}
            </div>
          </Card>
        )}

        {/* Next thread */}
        {result.nextThread && (
          <Card className="p-4 rounded-2xl bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
            <div className="flex items-center gap-2 mb-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              <p className="text-[13px] uppercase tracking-[0.15em] text-primary/80">Next thread</p>
            </div>
            <p className="text-sm font-medium text-foreground">{result.nextThread}</p>
          </Card>
        )}

        {/* Core themes chips */}
        {result.coreThemes && result.coreThemes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.coreThemes.map((t, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Stats + re-weave */}
        <div className="flex items-center justify-between pt-1">
          {result.stats && (
            <p className="text-[11px] text-muted-foreground/50">
              Woven from {result.stats.insightsCount} insights · {result.stats.actionsCount} actions · {result.stats.observationsCount} observations
            </p>
          )}
          <button
            onClick={handleSynthesize}
            className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Re-weave
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <Card className="p-6 rounded-2xl text-center space-y-4">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
        <Brain className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold mb-1">Weave the thread</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Read every insight, action, observation, and small moment — surface the consistencies,
          topic pulse, tensions, and where the thread is pulling next.
        </p>
      </div>
      <Button onClick={handleSynthesize} disabled={insightCount === 0} className="w-full" size="lg">
        <Brain className="h-4 w-4 mr-2" />
        Weave everything
      </Button>
      {insightCount === 0 && (
        <p className="text-xs text-muted-foreground">Capture something first — Now → Capture</p>
      )}
    </Card>
  );
};
