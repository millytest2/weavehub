import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  RefreshCw,
  Sparkles,
  Link2,
  ArrowRight,
  Lightbulb,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SynthesisResult {
  synthesis: string;
  coreThemes: string[];
  emergingDirection: string;
  hiddenConnections: string[];
  whatYourMindIsSaying: string;
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

      if (data?.synthesis) {
        setResult(data);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.error("Couldn't weave — try again");
      }
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
        <WeaveLoader size="lg" text="Weaving your entire mind together..." />
      </div>
    );
  }

  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Voice of your mind */}
        <Card className="p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-start gap-3 mb-3">
            <Quote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-base font-display font-semibold italic leading-relaxed">
              {result.whatYourMindIsSaying}
            </p>
          </div>
          <p className="text-xs text-primary/70 pl-8">— Your mind, speaking as one voice</p>
        </Card>

        {/* Full synthesis */}
        <Card className="p-4 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">The Full Picture</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {result.synthesis}
          </p>
        </Card>

        {/* Core themes */}
        {result.coreThemes.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Core Themes Running Through Everything</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.coreThemes.map((theme, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  {theme}
                </motion.span>
              ))}
            </div>
          </Card>
        )}

        {/* Hidden connections */}
        {result.hiddenConnections.length > 0 && (
          <Card className="p-4 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Hidden Connections</span>
            </div>
            <div className="space-y-2">
              {result.hiddenConnections.map((conn, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.12 }}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm">{conn}</p>
                </motion.div>
              ))}
            </div>
          </Card>
        )}

        {/* Direction */}
        <Card className="p-4 rounded-2xl bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Where everything is pointing</span>
          </div>
          <p className="text-sm font-medium">{result.emergingDirection}</p>
        </Card>

        {/* Stats + re-weave */}
        <div className="flex items-center justify-between pt-1">
          {result.stats && (
            <p className="text-xs text-muted-foreground">
              Woven from {result.stats.insightsCount} insights, {result.stats.documentsCount} docs, {result.stats.experimentsCount} experiments
            </p>
          )}
          <button
            onClick={handleSynthesize}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3 inline mr-1" />
            Re-weave
          </button>
        </div>
      </motion.div>
    );
  }

  // Initial state — big CTA
  return (
    <Card className="p-6 rounded-2xl text-center space-y-4">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
        <Brain className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold mb-1">
          Synthesize My Mind
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Weave together every insight, document, experiment, and action you've ever captured.
          See what your mind is really saying when you look at all of it as one.
        </p>
      </div>
      <Button
        onClick={handleSynthesize}
        disabled={insightCount === 0}
        className="w-full"
        size="lg"
      >
        <Brain className="h-4 w-4 mr-2" />
        Weave Everything Together
      </Button>
      {insightCount === 0 && (
        <p className="text-xs text-muted-foreground">
          Capture some insights first — paste content on the Dashboard
        </p>
      )}
    </Card>
  );
};
