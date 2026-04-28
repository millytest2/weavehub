import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const REPS = [
  { key: "sales_rep", label: "Sales", hint: "50 calls / 10 follow-ups" },
  { key: "upath_rep", label: "UPath", hint: "1 customer touch / offer iter" },
  { key: "content_rep", label: "Content", hint: "1 post or short video" },
  { key: "fitness_rep", label: "Fitness", hint: "Lift or 130g+ protein" },
  { key: "charisma_rep", label: "Charisma", hint: "1 intentional convo" },
  { key: "relationship_rep", label: "Relationship", hint: "Appreciation / plan / check-in" },
  { key: "ai_leverage_rep", label: "AI Leverage", hint: "Build or improve a workflow" },
  { key: "money_rep", label: "Money", hint: "Pipeline / income review" },
] as const;

type RepKey = typeof REPS[number]["key"];

const todayLocal = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

export const DailyScoreboard = () => {
  const { user } = useAuth();
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  const load = async () => {
    if (!user) return;
    const today = todayLocal();
    const { data } = await supabase
      .from("daily_scoreboard")
      .select("*")
      .eq("user_id", user.id)
      .eq("scoreboard_date", today)
      .maybeSingle();
    setRow(data || REPS.reduce((a, r) => ({ ...a, [r.key]: false }), { scoreboard_date: today }));

    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const { data: recent } = await supabase
      .from("daily_scoreboard")
      .select("*")
      .eq("user_id", user.id)
      .gte("scoreboard_date", sevenAgo.toISOString().split("T")[0])
      .order("scoreboard_date", { ascending: false });
    let s = 0;
    for (const r of recent || []) {
      const reps = REPS.filter(k => r[k.key]).length;
      if (reps >= 5) s++; else break;
    }
    setStreak(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const toggle = async (key: RepKey) => {
    if (!user || !row) return;
    const next = { ...row, [key]: !row[key] };
    setRow(next);
    await supabase.from("daily_scoreboard").upsert({
      user_id: user.id,
      scoreboard_date: todayLocal(),
      ...REPS.reduce((a, r) => ({ ...a, [r.key]: next[r.key] || false }), {}),
    }, { onConflict: "user_id,scoreboard_date" });
  };

  if (loading || !row) return null;
  const done = REPS.filter(r => row[r.key]).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-3xl border border-border/40 bg-card/40 backdrop-blur-sm p-5"
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium tracking-wide text-foreground/80">Today's Reps</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Receipts first. Drama second.</p>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl text-foreground">{done}<span className="text-muted-foreground/60 text-base">/8</span></div>
          {streak > 0 && <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{streak}d streak</div>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {REPS.map(r => {
          const on = row[r.key];
          return (
            <button
              key={r.key}
              onClick={() => toggle(r.key as RepKey)}
              className={`group relative aspect-square rounded-2xl border transition-all flex flex-col items-center justify-center p-2 ${
                on
                  ? "border-foreground/30 bg-foreground/5"
                  : "border-border/30 bg-background/40 hover:border-foreground/20"
              }`}
              title={r.hint}
            >
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center mb-1.5 transition-colors ${
                on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40"
              }`}>
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
              </div>
              <span className={`text-[10px] tracking-wide ${on ? "text-foreground" : "text-muted-foreground"}`}>
                {r.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
