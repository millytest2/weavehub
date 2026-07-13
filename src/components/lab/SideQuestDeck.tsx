import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, RefreshCw, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

type Category = "Bold" | "Solo" | "Social" | "Creative" | "Physical" | "Mind";
type Difficulty = "easy" | "medium" | "hard";

interface Quest {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  duration: string;
  proof: string;
  why: string;
}

const CATEGORIES: Category[] = ["Bold", "Solo", "Social", "Creative", "Physical", "Mind"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const difficultyDot: Record<Difficulty, string> = {
  easy: "bg-emerald-500/60",
  medium: "bg-amber-500/60",
  hard: "bg-rose-500/60",
};

interface Props {
  onQuestAccepted?: () => void;
}

export const SideQuestDeck = ({ onQuestAccepted }: Props) => {
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>("Bold");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);

  const drawQuest = async (cat: Category = category, diff: Difficulty = difficulty) => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("side-quest-generator", {
        body: { category: cat, difficulty: diff, exclude: seenTitles.slice(-10) },
      });
      if (error) throw error;
      if (data?.quest) {
        setQuest(data.quest);
        setSeenTitles((s) => [...s, data.quest.title].slice(-20));
      }
    } catch (err: any) {
      toast.error(err.message || "Couldn't draw a quest");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !quest) drawQuest("Bold", "easy");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  const handleCategory = (cat: Category) => {
    setCategory(cat);
    drawQuest(cat, difficulty);
  };

  const handleDifficulty = (diff: Difficulty) => {
    setDifficulty(diff);
    drawQuest(category, diff);
  };

  const handleAccept = async () => {
    if (!user || !quest || accepting) return;
    setAccepting(true);
    try {
      // Check for active experiment
      const { data: active } = await supabase
        .from("experiments")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .maybeSingle();

      if (active) {
        toast.error(`Pause or complete "${active.title}" first`, { duration: 4000 });
        setAccepting(false);
        return;
      }

      // Parse duration -> days
      const dur = quest.duration.toLowerCase();
      let durationDays = 1;
      if (dur.includes("week")) durationDays = 7;
      else if (dur.match(/(\d+)\s*day/)) durationDays = parseInt(dur.match(/(\d+)\s*day/)![1]);
      else if (dur.includes("hour") || dur.includes("min")) durationDays = 1;

      const { error } = await supabase.from("experiments").insert({
        user_id: user.id,
        title: quest.title,
        description: quest.description,
        hypothesis: quest.why,
        identity_shift_target: quest.why,
        steps: `${quest.description}\n\nProof of completion: ${quest.proof}`,
        duration: quest.duration,
        duration_days: durationDays,
        experiment_type: quest.category.toLowerCase(),
        status: "in_progress",
        current_day: 1,
        started_at: new Date().toISOString(),
        metrics_tracked: [],
      });

      if (error) throw error;
      toast.success("Quest accepted. It's a real experiment now.");
      onQuestAccepted?.();
      // Auto-draw next quest for browsing
      drawQuest();
    } catch (err: any) {
      toast.error(err.message || "Couldn't accept quest");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Compass className="h-4 w-4 text-primary/70" />
          </div>
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">Side Quest</p>
            <p className="text-sm font-medium text-foreground/80">Break the loop — pick a lane, accept the rep</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >

            <div className="px-5 pb-5 space-y-4">
              {/* Category chips */}
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleCategory(c)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-all ${
                      category === c
                        ? "bg-primary/15 text-primary border border-primary/20"
                        : "bg-muted/30 text-muted-foreground/60 hover:text-foreground border border-transparent"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Difficulty + refresh */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      onClick={() => handleDifficulty(d)}
                      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-all flex items-center gap-1.5 ${
                        difficulty === d
                          ? "text-foreground/80"
                          : "text-muted-foreground/40 hover:text-muted-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${difficultyDot[d]}`} />
                      {d}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => drawQuest()}
                  disabled={loading}
                  className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Drawing…" : "New quest"}
                </button>
              </div>

              {/* Quest card */}
              <AnimatePresence mode="wait">
                {quest && (
                  <motion.div
                    key={quest.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-medium leading-snug text-foreground">{quest.title}</p>
                      <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap pt-1">
                        {quest.duration}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{quest.description}</p>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex gap-2 text-[11px] text-muted-foreground/50">
                        <span className="text-muted-foreground/30 shrink-0">Proof:</span>
                        <span>{quest.proof}</span>
                      </div>
                      {quest.why && (
                        <div className="flex gap-2 text-[11px] text-primary/60 italic">
                          <span className="text-muted-foreground/30 not-italic shrink-0">Why:</span>
                          <span>{quest.why}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-2 border-t border-border/20">
                      <button
                        onClick={handleAccept}
                        disabled={accepting}
                        className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors font-medium"
                      >
                        {accepting ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {accepting ? "Accepting…" : "Make it real"}
                      </button>
                      <button
                        onClick={() => drawQuest()}
                        disabled={loading}
                        className="text-[12px] text-muted-foreground/40 hover:text-muted-foreground transition-colors flex items-center gap-1"
                      >
                        Skip
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!quest && !loading && (
                <div className="text-center py-8">
                  <Sparkles className="h-5 w-5 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground/40">Pick a category to draw a quest.</p>
                </div>
              )}
            </div>
        </motion.div>
      </div>
    </div>
  );

  );
};
