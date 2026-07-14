import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, CalendarRange, Sparkles, Brain, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { addDays, format, getWeek, getYear, startOfWeek } from "date-fns";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PILLAR_COLORS: Record<string, string> = {
  Money: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  UPath: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Sales: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Content: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Body: "bg-green-500/15 text-green-600 dark:text-green-400",
  Charisma: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Relationship: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Friendship: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Mind: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Admin: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

interface Intention {
  id: string;
  text: string;
  pillar: string | null;
  day_of_week: number | null;
  completed: boolean;
}

/**
 * IdealWeekPlanner
 *
 * Purpose: reverse-engineer an "ideal Mon–Sun week" into atomic, day-anchored
 * intentions that flow into the Dashboard's morning brief, the Navigator,
 * the Decision Mirror, and the Experiments generator.
 *
 * Also surfaces a transparent "Sharpening, not dulling" panel so the user can
 * see exactly HOW the system is protecting critical thinking rather than
 * replacing it.
 */
export function IdealWeekPlanner() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [expanded, setExpanded] = useState(true);

  const weekNumber = getWeek(new Date(), { weekStartsOn: 1 });
  const year = getYear(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon..6=Sun

  useEffect(() => {
    if (user) fetchWeek();
  }, [user, weekNumber]);

  const fetchWeek = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("weekly_intentions")
      .select("id, text, pillar, day_of_week, completed")
      .eq("user_id", user.id)
      .eq("week_number", weekNumber)
      .eq("year", year)
      .order("sort_order", { ascending: true });
    setIntentions((data as any) || []);
  };

  const reverseEngineer = async () => {
    if (!user || !text.trim() || parsing) return;
    setParsing(true);
    try {
      // Nudge the parser toward an "ideal week" interpretation: strong day-of-week bias.
      const framed = `IDEAL WEEK PLAN (Monday through Sunday). Reverse-engineer into atomic, day-anchored commitments. Preserve targets and floors.\n\n${text.trim()}`;
      const { data, error } = await supabase.functions.invoke("parse-weekly-plan", {
        body: { text: framed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed: Array<{ text: string; pillar: string | null; day_of_week: number | null }> =
        data?.intentions || [];
      if (!parsed.length) {
        toast.error("Couldn't parse that — try adding day labels (Monday, Tuesday...)");
        return;
      }
      const inserts = parsed.map((p, i) => ({
        user_id: user.id,
        text: p.text,
        week_number: weekNumber,
        year,
        sort_order: intentions.length + i,
        pillar: p.pillar,
        day_of_week: p.day_of_week,
      }));
      const { error: insErr } = await supabase.from("weekly_intentions").insert(inserts as any);
      if (insErr) throw insErr;
      toast.success(`Wove ${inserts.length} commitments across the week`);
      setText("");
      fetchWeek();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to reverse-engineer");
    } finally {
      setParsing(false);
    }
  };

  const byDay = useMemo(() => {
    const map: Record<string, Intention[]> = { any: [] };
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const it of intentions) {
      if (it.day_of_week === null || it.day_of_week === undefined) map.any.push(it);
      else map[it.day_of_week].push(it);
    }
    return map;
  }, [intentions]);

  const pillarCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of intentions) if (i.pillar) c[i.pillar] = (c[i.pillar] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [intentions]);

  const hasWeek = intentions.length > 0;

  return (
    <Card className="p-5 rounded-2xl space-y-4 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarRange className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Your Ideal Week</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Paste the week you actually want. I'll reverse-engineer it into daily anchors that
              feed the Dashboard, Navigator, and Mirror.
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? "Hide" : "Open"}
        </button>
      </div>

      {expanded && (
        <>
          {/* Paste input */}
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Describe your ideal Mon–Sun week. Include day labels and targets.\n\nExample:\nMonday — 6am gym (push). 3h UPath positioning. 5-10 job apps. Evening: read 30m, no phone after 10.\nTuesday — Sales sprint: 10 outreach DMs. Lunch walk. Girlfriend dinner.\nWednesday — Deep work UPath (build). Content: 1 post. Cook at home.\n... continue through Sunday`}
              className="min-h-[160px] text-xs"
            />
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-muted-foreground/70 italic">
                Grounded in your identity, values, and skill-stack pillars.
              </p>
              <Button
                size="sm"
                onClick={reverseEngineer}
                disabled={!text.trim() || parsing}
                className="h-8 text-xs gap-1.5"
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Weaving...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3 w-3" /> Reverse-engineer
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Day grid Mon-Sun */}
          {hasWeek && (
            <div className="grid grid-cols-7 gap-1.5 pt-2">
              {DAY_LABELS.map((label, idx) => {
                const dayDate = addDays(weekStart, idx);
                const isToday = idx === todayIdx;
                const items = byDay[idx] || [];
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-2 min-h-[110px] ${
                      isToday
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {format(dayDate, "d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 5).map((it) => (
                        <div
                          key={it.id}
                          className={`text-[10px] leading-tight ${it.completed ? "line-through text-muted-foreground/50" : "text-foreground/80"}`}
                        >
                          {it.pillar && (
                            <span className={`inline-block text-[8px] px-1 rounded mr-1 ${PILLAR_COLORS[it.pillar] || "bg-muted"}`}>
                              {it.pillar}
                            </span>
                          )}
                          {it.text.length > 40 ? it.text.slice(0, 40) + "…" : it.text}
                        </div>
                      ))}
                      {items.length > 5 && (
                        <div className="text-[9px] text-muted-foreground/60">+{items.length - 5} more</div>
                      )}
                      {items.length === 0 && (
                        <div className="text-[9px] text-muted-foreground/40 italic">open</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pillar spread */}
          {pillarCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground/70 mr-1">Balance:</span>
              {pillarCounts.map(([p, count]) => (
                <Badge
                  key={p}
                  variant="secondary"
                  className={`text-[10px] h-4 px-1.5 ${PILLAR_COLORS[p] || "bg-muted text-muted-foreground"}`}
                >
                  {p} · {count}
                </Badge>
              ))}
            </div>
          )}

          {/* How this weaves */}
          {hasWeek && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold">How this week weaves everything</span>
              </div>
              <ul className="text-[10.5px] text-muted-foreground space-y-1 leading-relaxed">
                <li className="flex gap-1.5"><ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span><b className="text-foreground/80">Dashboard morning brief</b> pulls today's day-of-week commitments as the first source of truth — before any AI suggestion.</span></li>
                <li className="flex gap-1.5"><ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span><b className="text-foreground/80">Navigator & Next-Rep</b> use this week's pillar mix to detect neglected domains and rebalance you back toward the shape you drew.</span></li>
                <li className="flex gap-1.5"><ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span><b className="text-foreground/80">Decision Mirror</b> checks proposed actions against these anchors — anything that pulls you off-week gets flagged.</span></li>
                <li className="flex gap-1.5"><ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span><b className="text-foreground/80">Experiments & Side Quests</b> generate inside the gaps — the parts of your ideal week that keep slipping.</span></li>
              </ul>
            </div>
          )}

          {/* Sharpening, not dulling — critical thinking transparency */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold">Sharpening, not dulling</span>
              <ShieldCheck className="h-3 w-3 text-primary/60 ml-auto" />
            </div>
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              Weave is designed to be the opposite of Instagram, ChatGPT, or Obsidian:
            </p>
            <ul className="text-[10.5px] text-muted-foreground space-y-1 leading-relaxed">
              <li className="flex gap-1.5"><span className="text-primary/60">·</span><span><b className="text-foreground/80">You draw the week.</b> The AI never invents your ideal life — it only breaks down what YOU decide.</span></li>
              <li className="flex gap-1.5"><span className="text-primary/60">·</span><span><b className="text-foreground/80">Show the work.</b> Every dashboard action cites the specific commitment, capture, or gap it came from.</span></li>
              <li className="flex gap-1.5"><span className="text-primary/60">·</span><span><b className="text-foreground/80">Foundational questions.</b> The Critical Thinking Guard forces you to interrogate outputs, not accept them.</span></li>
              <li className="flex gap-1.5"><span className="text-primary/60">·</span><span><b className="text-foreground/80">Friction over scroll.</b> No infinite feed. Every screen ends. When your reps are done, the app gets out of the way.</span></li>
              <li className="flex gap-1.5"><span className="text-primary/60">·</span><span><b className="text-foreground/80">Named uncertainty.</b> Agents mark what they don't know instead of hallucinating confidence.</span></li>
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
