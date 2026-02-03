import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Target, TrendingUp, Zap, ArrowRight } from "lucide-react";

interface ActionHistoryItem {
  id: string;
  pillar: string;
  action_text: string;
  action_date: string;
}

interface CapabilityPatternsProps {
  actionHistory: ActionHistoryItem[];
  yearNote?: string;
}

// Map pillars to capability names
const PILLAR_TO_CAPABILITY: Record<string, string> = {
  Stability: "Acting despite uncertainty",
  Skill: "Building visible work",
  Content: "Sharing publicly",
  Health: "Physical consistency",
  Presence: "Nervous system regulation",
  Admin: "Clearing friction",
  Connection: "Reaching out",
  Learning: "Applied knowledge",
};

// Core capability patterns - what the user is ACTUALLY practicing
const CORE_CAPABILITIES = [
  { id: "courage", name: "Courage", pillars: ["Content", "Connection", "Skill"], verb: "acting despite discomfort" },
  { id: "consistency", name: "Consistency", pillars: ["Health", "Skill", "Learning"], verb: "showing up daily" },
  { id: "clarity", name: "Clarity", pillars: ["Presence", "Admin", "Learning"], verb: "cutting through noise" },
  { id: "momentum", name: "Momentum", pillars: ["Stability", "Skill", "Content"], verb: "building visible progress" },
];

export const CapabilityPatterns = ({ actionHistory, yearNote }: CapabilityPatternsProps) => {
  // Analyze patterns across pillars
  const patterns = useMemo(() => {
    if (!actionHistory.length) return null;

    // Group actions by pillar
    const pillarCounts: Record<string, number> = {};
    const pillarExamples: Record<string, string[]> = {};
    
    actionHistory.forEach(action => {
      const pillar = action.pillar || "Unknown";
      pillarCounts[pillar] = (pillarCounts[pillar] || 0) + 1;
      if (!pillarExamples[pillar]) pillarExamples[pillar] = [];
      if (pillarExamples[pillar].length < 2) {
        pillarExamples[pillar].push(action.action_text);
      }
    });

    // Find which core capability the user is practicing most
    const capabilityScores = CORE_CAPABILITIES.map(cap => {
      const score = cap.pillars.reduce((sum, pillar) => sum + (pillarCounts[pillar] || 0), 0);
      return { ...cap, score };
    }).sort((a, b) => b.score - a.score);

    const primaryCapability = capabilityScores[0];
    const secondaryCapability = capabilityScores[1];

    // Get unique contexts (pillars) where the primary capability was practiced
    const contextsUsed = primaryCapability.pillars.filter(p => pillarCounts[p] > 0);

    // Build pattern message
    const pillarDetails = contextsUsed.map(pillar => ({
      pillar,
      count: pillarCounts[pillar] || 0,
      capability: PILLAR_TO_CAPABILITY[pillar] || pillar.toLowerCase(),
      example: pillarExamples[pillar]?.[0] || "",
    }));

    return {
      primary: primaryCapability,
      secondary: secondaryCapability,
      totalActions: actionHistory.length,
      contextsUsed: pillarDetails,
      pillarCounts,
    };
  }, [actionHistory]);

  if (!patterns || !patterns.totalActions) {
    return (
      <Card className="p-4 rounded-2xl">
        <p className="text-sm text-muted-foreground text-center">
          Complete actions to see your capability patterns emerge
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary Capability */}
      <Card className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-primary font-medium mb-0.5">This week you practiced</p>
            <h3 className="font-display text-lg font-semibold">
              {patterns.primary.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              ({patterns.primary.verb})
            </p>
          </div>
        </div>
      </Card>

      {/* Contexts breakdown */}
      {patterns.contextsUsed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-1">
            In {patterns.contextsUsed.length} different contexts:
          </p>
          <div className="space-y-1.5">
            {patterns.contextsUsed.map((ctx, i) => (
              <motion.div
                key={ctx.pillar}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{ctx.pillar}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {ctx.example || ctx.capability}
                  </p>
                </div>
                <span className="text-sm text-primary font-medium shrink-0">
                  {ctx.count}×
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* What you're building */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">You're building</p>
            <p className="text-sm font-medium">
              The ability to {patterns.primary.verb} across {patterns.contextsUsed.length} life domains
            </p>
          </div>
        </div>
      </Card>

      {/* Misogi connection */}
      {yearNote && (
        <Card className="p-4 rounded-2xl border-dashed">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">This moves you toward 2026</p>
              <p className="text-sm">
                {patterns.primary.name} is the foundation for{" "}
                <span className="text-primary font-medium">
                  {yearNote.split(" ").slice(0, 8).join(" ")}...
                </span>
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
