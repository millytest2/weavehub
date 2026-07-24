import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

type Category = "Play" | "Wander" | "Connect" | "Create" | "Body" | "Depth";
type Difficulty = "easy" | "medium" | "hard";
type Vibe = "Fun" | "Meaningful" | "Wild" | "Cozy";

interface Quest {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  vibe: Vibe;
  duration: string;
  proof: string;
  why: string;
  value_hook?: string;
}

const TOPICS: { label: string; cat: Category; vibe: Vibe }[] = [
  { label: "Aligned", cat: "Depth", vibe: "Meaningful" },
  { label: "Playful", cat: "Play", vibe: "Fun" },
  { label: "Bold", cat: "Wander", vibe: "Wild" },
  { label: "Connect", cat: "Connect", vibe: "Cozy" },
  { label: "Build", cat: "Create", vibe: "Meaningful" },
  { label: "Body", cat: "Body", vibe: "Meaningful" },
];

export const ExperimentsSimple = () => {
  const { user } = useAuth();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [active, setActive] = useState<{ id: string; title: string; current_day: number; duration_days: number } | null>(null);

  const loadActive = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("experiments")
      .select("id, title, current_day, duration_days")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .maybeSingle();
    setActive(data as any);
  };

  const draw = async (t = topic) => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("side-quest-generator", {
        body: { category: t.cat, difficulty: "easy", vibe: t.vibe, exclude: seen.slice(-10) },
      });
      if (error) throw error;
      if (data?.quest) {
        setQuest(data.quest);
        setSeen((s) => [...s, data.quest.title].slice(-20));
      }
    } catch (err: any) {
      toast.error(err.message || "Couldn't draw an experiment");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadActive();
    draw(TOPICS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pickTopic = (t: typeof TOPICS[number]) => {
    setTopic(t);
    draw(t);
  };

  const accept = async () => {
    if (!user || !quest || accepting) return;
    if (active) {
      toast.error(`Finish or pause "${active.title}" first`, { duration: 4000 });
      return;
    }
    setAccepting(true);
    try {
      const dur = quest.duration.toLowerCase();
      let durationDays = 1;
      if (dur.includes("week")) durationDays = 7;
      else if (dur.match(/(\d+)\s*day/)) durationDays = parseInt(dur.match(/(\d+)\s*day/)![1]);

      const { error } = await supabase.from("experiments").insert({
        user_id: user.id,
        title: quest.title,
        description: quest.description,
        hypothesis: quest.why,
        identity_shift_target: quest.value_hook || quest.why,
        steps: `${quest.description}\n\nProof: ${quest.proof}`,
        duration: quest.duration,
        duration_days: durationDays,
        experiment_type: quest.category.toLowerCase(),
        status: "in_progress",
        current_day: 1,
        started_at: new Date().toISOString(),
        metrics_tracked: [],
      });
      if (error) throw error;
      toast.success("Locked in. It's real now.");
      loadActive();
      draw();
    } catch (err: any) {
      toast.error(err.message || "Couldn't accept");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-display font-semibold">Experiments</h1>
        <p className="text-sm text-muted-foreground/50">
          One aligned experiment at a time. Not it? Pick a different vibe.
        </p>
      </div>

      {active && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-1">In flight</p>
          <p className="text-sm font-medium">{active.title}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Day {active.current_day} of {active.duration_days}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TOPICS.map((t) => {
          const isActive = t.label === topic.label;
          return (
            <button
              key={t.label}
              onClick={() => pickTopic(t)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                isActive
                  ? "bg-primary/15 border-primary/40 text-foreground"
                  : "bg-transparent border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-border"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {loading && !quest ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-16 text-muted-foreground/60 text-sm gap-2"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Drawing one for you…
          </motion.div>
        ) : quest ? (
          <motion.div
            key={quest.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border/30 bg-card/95 backdrop-blur-sm p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/50">
              <span>{quest.category}</span>
              <span>·</span>
              <span>{quest.vibe}</span>
              <span>·</span>
              <span>{quest.duration}</span>
            </div>

            <h2 className="font-display text-xl leading-snug">{quest.title}</h2>

            <p className="text-sm text-foreground/75 leading-relaxed">{quest.description}</p>

            {quest.value_hook && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-0.5">Why this, for you</p>
                <p className="text-[12.5px] text-foreground/80 leading-snug">{quest.value_hook}</p>
              </div>
            )}

            {quest.proof && (
              <p className="text-[11.5px] text-muted-foreground/60">
                <span className="uppercase tracking-widest text-[9px] mr-1.5">Proof</span>
                {quest.proof}
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={accept}
                disabled={accepting || !!active}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                {active ? "One in flight" : "Lock it in"}
              </button>
              <button
                onClick={() => draw()}
                disabled={loading}
                className="h-10 px-4 rounded-xl border border-border/40 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Another
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            onClick={() => draw()}
            className="w-full rounded-2xl border border-dashed border-border/40 py-10 text-sm text-muted-foreground/70 hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" /> Draw one
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
