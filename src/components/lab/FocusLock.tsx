import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Target, Flame, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DomainConsistency {
  domain: string;
  daysActive: number;
  totalDays: number;
  streak: number;
}

export const FocusLock = ({ experimentCount }: { experimentCount: number }) => {
  const { user } = useAuth();
  const [misogi, setMisogi] = useState<string | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainConsistency[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  // Show focus lock when 3+ experiments total or 2+ active/paused
  const shouldShow = experimentCount >= 3;

  useEffect(() => {
    if (!user || !shouldShow) return;
    loadFocusData();
  }, [user, shouldShow]);

  const loadFocusData = async () => {
    if (!user) return;
    try {
      const [identityRes, actionRes] = await Promise.all([
        supabase.from("identity_seeds")
          .select("year_note, weekly_focus, life_domains, core_values")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("action_history")
          .select("pillar, action_date")
          .eq("user_id", user.id)
          .gte("action_date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
          .order("action_date", { ascending: false }),
      ]);

      if (identityRes.data) {
        setMisogi(identityRes.data.year_note || null);
        setWeeklyFocus(identityRes.data.weekly_focus || null);

        // Parse life domains and calculate consistency
        const lifeDomains = identityRes.data.life_domains;
        const domainList = lifeDomains
          ? lifeDomains.split(",").map((d: string) => d.trim()).filter(Boolean)
          : ["Growth", "Health", "Connection", "Creation", "Stability"];

        const actions = actionRes.data || [];
        const last14Days = 14;
        const cutoff = new Date(Date.now() - last14Days * 86400000).toISOString().split("T")[0];

        const domainStats: DomainConsistency[] = domainList.map((domain: string) => {
          const domainActions = actions.filter(
            (a: any) => a.pillar?.toLowerCase() === domain.toLowerCase() && a.action_date >= cutoff
          );
          const uniqueDays = new Set(domainActions.map((a: any) => a.action_date));

          // Calculate streak (consecutive days ending today or yesterday)
          let streak = 0;
          const today = new Date();
          for (let i = 0; i < last14Days; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - i);
            const dateStr = checkDate.toISOString().split("T")[0];
            if (uniqueDays.has(dateStr)) {
              streak++;
            } else if (i > 0) {
              break;
            }
          }

          return {
            domain,
            daysActive: uniqueDays.size,
            totalDays: last14Days,
            streak,
          };
        });

        setDomains(domainStats);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!shouldShow || loading || !misogi) return null;

  const overallConsistency = domains.length > 0
    ? Math.round(domains.reduce((sum, d) => sum + (d.daysActive / d.totalDays), 0) / domains.length * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Target className="h-4 w-4 text-amber-500/70" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-500/50 mb-1">Focus Lock</p>
            <p className="text-sm font-medium text-foreground/80">
              You have {experimentCount} experiments. Is your attention on the ONE thing?
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Misogi / 2026 Vision - distilled one-liner, full text in expand */}
      <div className="pl-11">
        <p className="text-xs text-muted-foreground/40 mb-1">Your 2026 Vision</p>
        <p className="text-[15px] text-foreground/90 font-medium leading-relaxed line-clamp-2">
          {distill(misogi)}
        </p>
        {weeklyFocus && (
          <p className="text-[12px] text-primary/50 mt-1.5 line-clamp-1">
            This week: {distill(weeklyFocus)}
          </p>
        )}
      </div>

      {/* Expanded: Domain consistency */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-11 space-y-4 pt-2">
              {/* Overall consistency */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${overallConsistency}%`,
                      backgroundColor: overallConsistency > 60
                        ? "hsl(var(--primary))"
                        : overallConsistency > 30
                          ? "hsl(40 90% 55%)"
                          : "hsl(0 70% 55%)",
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground/50 tabular-nums">{overallConsistency}%</span>
              </div>

              {/* Per-domain bars */}
              <div className="space-y-2.5">
                {domains.map((d) => {
                  const pct = Math.round((d.daysActive / d.totalDays) * 100);
                  return (
                    <div key={d.domain} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground/50">{d.domain}</span>
                        <div className="flex items-center gap-2">
                          {d.streak > 0 && (
                            <span className="text-[10px] text-amber-500/50 flex items-center gap-0.5">
                              <Flame className="h-2.5 w-2.5" /> {d.streak}d
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                            {d.daysActive}/{d.totalDays}
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground/25 leading-relaxed">
                Last 14 days across your life domains. Consistency &gt; intensity.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
