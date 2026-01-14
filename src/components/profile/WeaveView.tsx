import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link2, Sparkles, TrendingUp, Repeat, Brain, Target, Lightbulb, Beaker } from "lucide-react";

interface WeaveNode {
  id: string;
  type: "insight" | "action" | "experiment" | "identity";
  title: string;
  date: string;
  pillar?: string;
  topic?: string;
  connection?: string;
}

interface WeavePattern {
  theme: string;
  description: string;
  strength: number;
  nodes: WeaveNode[];
}

interface WeaveViewProps {
  insights: Array<{
    id: string;
    title: string;
    content: string;
    topic_id: string | null;
    created_at: string;
    topics: { name: string; color: string | null } | null;
  }>;
  actions: Array<{
    id: string;
    action_text: string;
    pillar: string | null;
    action_date: string;
  }>;
  experiments: Array<{
    id: string;
    title: string;
    status: string;
    identity_shift_target: string | null;
  }>;
  identitySeed: string;
}

export function WeaveView({ insights, actions, experiments, identitySeed }: WeaveViewProps) {
  // Extract identity keywords for pattern matching
  const identityKeywords = useMemo(() => {
    if (!identitySeed) return [];
    return identitySeed
      .toLowerCase()
      .split(/[\s,.\n]+/)
      .filter(w => w.length > 3)
      .slice(0, 30);
  }, [identitySeed]);

  // Find weave patterns - connections between different types
  const patterns = useMemo(() => {
    const foundPatterns: WeavePattern[] = [];
    
    // Pattern 1: Topics appearing across insights and actions
    const topicActionMap = new Map<string, { insights: typeof insights; actions: typeof actions }>();
    
    insights.forEach(insight => {
      const topic = insight.topics?.name?.toLowerCase() || "";
      if (topic) {
        if (!topicActionMap.has(topic)) {
          topicActionMap.set(topic, { insights: [], actions: [] });
        }
        topicActionMap.get(topic)!.insights.push(insight);
      }
    });
    
    actions.forEach(action => {
      const actionWords = action.action_text.toLowerCase();
      topicActionMap.forEach((data, topic) => {
        if (actionWords.includes(topic) || topic.split(" ").some(w => actionWords.includes(w))) {
          data.actions.push(action);
        }
      });
    });
    
    // Create patterns from topics that span both insights and actions
    topicActionMap.forEach((data, topic) => {
      if (data.insights.length > 0 && data.actions.length > 0) {
        foundPatterns.push({
          theme: topic.charAt(0).toUpperCase() + topic.slice(1),
          description: `${data.insights.length} insights → ${data.actions.length} actions`,
          strength: Math.min(100, (data.insights.length + data.actions.length) * 15),
          nodes: [
            ...data.insights.slice(0, 2).map(i => ({
              id: i.id,
              type: "insight" as const,
              title: i.title,
              date: i.created_at,
              topic: i.topics?.name
            })),
            ...data.actions.slice(0, 2).map(a => ({
              id: a.id,
              type: "action" as const,
              title: a.action_text,
              date: a.action_date,
              pillar: a.pillar || undefined
            }))
          ]
        });
      }
    });
    
    // Pattern 2: Identity keywords showing up in experiments
    experiments.forEach(exp => {
      const expWords = (exp.title + " " + (exp.identity_shift_target || "")).toLowerCase();
      const matchedKeywords = identityKeywords.filter(kw => expWords.includes(kw));
      
      if (matchedKeywords.length > 0) {
        foundPatterns.push({
          theme: "Identity Alignment",
          description: `"${exp.title}" reflects who you're becoming`,
          strength: Math.min(100, matchedKeywords.length * 25),
          nodes: [{
            id: exp.id,
            type: "experiment",
            title: exp.title,
            date: new Date().toISOString(),
            connection: matchedKeywords.slice(0, 3).join(", ")
          }]
        });
      }
    });
    
    // Pattern 3: Pillar consistency
    const pillarCounts: Record<string, number> = {};
    actions.forEach(a => {
      if (a.pillar) {
        pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      }
    });
    
    const dominantPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];
    if (dominantPillar && dominantPillar[1] >= 3) {
      foundPatterns.push({
        theme: `${dominantPillar[0]} Focus`,
        description: `${dominantPillar[1]} actions this week`,
        strength: Math.min(100, dominantPillar[1] * 20),
        nodes: actions
          .filter(a => a.pillar === dominantPillar[0])
          .slice(0, 3)
          .map(a => ({
            id: a.id,
            type: "action" as const,
            title: a.action_text,
            date: a.action_date,
            pillar: a.pillar || undefined
          }))
      });
    }
    
    return foundPatterns.sort((a, b) => b.strength - a.strength).slice(0, 5);
  }, [insights, actions, experiments, identityKeywords]);

  // Calculate overall weave score
  const weaveScore = useMemo(() => {
    if (patterns.length === 0) return 0;
    const avgStrength = patterns.reduce((sum, p) => sum + p.strength, 0) / patterns.length;
    const diversityBonus = Math.min(30, patterns.length * 10);
    return Math.min(100, Math.round(avgStrength * 0.7 + diversityBonus));
  }, [patterns]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "insight": return <Lightbulb className="h-3 w-3" />;
      case "action": return <Target className="h-3 w-3" />;
      case "experiment": return <Beaker className="h-3 w-3" />;
      default: return <Brain className="h-3 w-3" />;
    }
  };

  if (patterns.length === 0) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="relative w-16 h-16 mx-auto">
          <motion.div 
            className="absolute inset-0 rounded-full border-2 border-dashed border-muted-foreground/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-3 rounded-full bg-muted/30 flex items-center justify-center">
            <Link2 className="h-5 w-5 text-muted-foreground/40" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">No patterns woven yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Capture insights, complete actions, and run experiments.<br/>
            Weave will find the connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Weave Score */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 border border-primary/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
              Weave Strength
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-foreground">{weaveScore}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>
          <div className="relative w-14 h-14">
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="4"
              />
              <motion.circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${weaveScore * 1.5} 150`}
                initial={{ strokeDasharray: "0 150" }}
                animate={{ strokeDasharray: `${weaveScore * 1.5} 150` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          {weaveScore < 30 && "Keep capturing and acting. Connections will emerge."}
          {weaveScore >= 30 && weaveScore < 60 && "Patterns are forming. Your themes are becoming clear."}
          {weaveScore >= 60 && weaveScore < 80 && "Strong alignment between what you learn and do."}
          {weaveScore >= 80 && "Exceptional integration. You're living your identity."}
        </p>
      </div>

      {/* Active Patterns */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Repeat className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Active Patterns
          </p>
        </div>
        
        <div className="space-y-3">
          {patterns.map((pattern, idx) => (
            <motion.div
              key={`${pattern.theme}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{pattern.theme}</p>
                <div className="flex items-center gap-1">
                  <div 
                    className="h-1.5 rounded-full bg-primary/30 w-12"
                  >
                    <motion.div 
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${pattern.strength}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.1 }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{pattern.description}</p>
              
              {/* Connected nodes visualization */}
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {pattern.nodes.map((node, nodeIdx) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-background/60 border border-border/40"
                  >
                    {getNodeIcon(node.type)}
                    <span className="text-muted-foreground truncate max-w-[100px]">
                      {node.title.slice(0, 20)}{node.title.length > 20 ? "…" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Insight */}
      <div className="p-3 rounded-lg border border-dashed border-primary/20 bg-primary/5">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Weave insight:</span>{" "}
            {patterns.length === 1 && "You have one emerging pattern. Keep building on it."}
            {patterns.length === 2 && "Two patterns are forming. They may connect soon."}
            {patterns.length >= 3 && "Multiple threads are weaving together. Your system is working."}
          </p>
        </div>
      </div>
    </div>
  );
}