import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UPathBridgeProps {
  userId: string;
}

const DISMISS_KEY = "upath_bridge_dismissed_at";
const RESURFACE_AFTER = 10; // resurface after 10 more actions since last dismiss

// Fires after enough signal has built up to make upath.ai genuinely useful.
// The message reflects what the data actually shows — not a generic upsell.
export const UPathBridge = ({ userId }: UPathBridgeProps) => {
  const [visible, setVisible] = useState(false);
  const [totalActions, setTotalActions] = useState(0);
  const [topPillars, setTopPillars] = useState<string[]>([]);

  useEffect(() => {
    check();
  }, [userId]);

  const check = async () => {
    const { data, error } = await supabase
      .from("action_history")
      .select("pillar, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });

    if (error || !data || data.length < 10) return;

    // Check dismiss gate
    const dismissedAt = localStorage.getItem(`${DISMISS_KEY}_${userId}`);
    if (dismissedAt) {
      const actionsAtDismiss = parseInt(dismissedAt.split(":")[1] || "0", 10);
      if (data.length < actionsAtDismiss + RESURFACE_AFTER) return;
    }

    // Tally pillar distribution
    const counts: Record<string, number> = {};
    for (const row of data) {
      if (row.pillar) counts[row.pillar] = (counts[row.pillar] || 0) + 1;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);

    setTotalActions(data.length);
    setTopPillars(sorted.slice(0, 2));
    setVisible(true);
  };

  const dismiss = () => {
    localStorage.setItem(`${DISMISS_KEY}_${userId}`, `${Date.now()}:${totalActions}`);
    setVisible(false);
  };

  if (!visible || topPillars.length === 0) return null;

  const pillarLine =
    topPillars.length === 2
      ? `${topPillars[0]} + ${topPillars[1]}`
      : topPillars[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/[0.02] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-[11px] font-medium text-primary/70 uppercase tracking-wider">
              {totalActions} actions in
            </p>
            <p className="text-sm font-semibold leading-snug">
              Your pattern keeps pointing at {pillarLine}.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Weave sees the thread. upath.ai shows you where it leads — map your
              content, your values, and your next chapter into one coherent path.
            </p>
            <a
              href="https://upath.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
            >
              See your path <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors shrink-0 mt-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
