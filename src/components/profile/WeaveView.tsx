import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link2, Sparkles, TrendingUp, Repeat, Brain, Target, Lightbulb, Beaker, AlertTriangle, Calendar, Zap } from "lucide-react";

interface WeaveNode {
  id: string;
  type: "insight" | "action" | "experiment" | "identity" | "warning";
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
  patternType: "connection" | "focus" | "imbalance" | "recurring" | "experiment-insight";
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

const ALL_PILLARS = ["Business", "Body", "Mind", "Relationships", "Content", "Play"];

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
    
    // Pattern 1: Topics appearing across insights and actions (Learning → Doing)
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
        if (actionWords.includes(topic) || topic.split(" ").some(w => w.length > 3 && actionWords.includes(w))) {
          data.actions.push(action);
        }
      });
    });
    
    // Create patterns from topics that span both insights and actions
    topicActionMap.forEach((data, topic) => {
      if (data.insights.length > 0 && data.actions.length > 0) {
        foundPatterns.push({
          theme: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Loop`,
          description: `${data.insights.length} insights → ${data.actions.length} actions taken`,
          strength: Math.min(100, (data.insights.length + data.actions.length) * 12),
          patternType: "connection",
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
    
    // Pattern 2: Experiment ↔ Insight connections
    experiments.forEach(exp => {
      const expWords = (exp.title + " " + (exp.identity_shift_target || "")).toLowerCase();
      
      // Find insights that relate to this experiment
      const relatedInsights = insights.filter(insight => {
        const insightWords = (insight.title + " " + insight.content).toLowerCase();
        const topicName = insight.topics?.name?.toLowerCase() || "";
        
        // Check for keyword overlap
        const expKeywords = expWords.split(/\s+/).filter(w => w.length > 3);
        return expKeywords.some(kw => insightWords.includes(kw) || topicName.includes(kw));
      });
      
      if (relatedInsights.length >= 2) {
        foundPatterns.push({
          theme: "Experiment Fuel",
          description: `"${exp.title}" is backed by ${relatedInsights.length} insights`,
          strength: Math.min(100, relatedInsights.length * 20 + 30),
          patternType: "experiment-insight",
          nodes: [
            {
              id: exp.id,
              type: "experiment" as const,
              title: exp.title,
              date: new Date().toISOString()
            },
            ...relatedInsights.slice(0, 3).map(i => ({
              id: i.id,
              type: "insight" as const,
              title: i.title,
              date: i.created_at
            }))
          ]
        });
      }
    });
    
    // Pattern 3: Identity alignment in experiments
    experiments.forEach(exp => {
      const expWords = (exp.title + " " + (exp.identity_shift_target || "")).toLowerCase();
      const matchedKeywords = identityKeywords.filter(kw => expWords.includes(kw));
      
      if (matchedKeywords.length >= 2) {
        foundPatterns.push({
          theme: "Identity Alignment",
          description: `"${exp.title}" reflects: ${matchedKeywords.slice(0, 3).join(", ")}`,
          strength: Math.min(100, matchedKeywords.length * 25),
          patternType: "connection",
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
    
    // Pattern 4: Pillar focus (dominant pillar)
    const pillarCounts: Record<string, number> = {};
    actions.forEach(a => {
      if (a.pillar) {
        pillarCounts[a.pillar] = (pillarCounts[a.pillar] || 0) + 1;
      }
    });
    
    const sortedPillars = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1]);
    const dominantPillar = sortedPillars[0];
    
    if (dominantPillar && dominantPillar[1] >= 3) {
      foundPatterns.push({
        theme: `${dominantPillar[0]} Momentum`,
        description: `${dominantPillar[1]} actions this week—building traction`,
        strength: Math.min(100, dominantPillar[1] * 18),
        patternType: "focus",
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
    
    // Pattern 5: Pillar Imbalance Detection
    const activePillars = Object.keys(pillarCounts);
    const missingPillars = ALL_PILLARS.filter(p => !activePillars.includes(p));
    const totalActions = actions.length;
    
    // Only show imbalance if user has meaningful action history
    if (totalActions >= 5 && missingPillars.length >= 2) {
      foundPatterns.push({
        theme: "Pillar Gap",
        description: `${missingPillars.slice(0, 3).join(", ")} need attention`,
        strength: Math.min(80, missingPillars.length * 15),
        patternType: "imbalance",
        nodes: missingPillars.slice(0, 3).map((pillar, idx) => ({
          id: `missing-${pillar}`,
          type: "warning" as const,
          title: pillar,
          date: new Date().toISOString()
        }))
      });
    }
    
    // Pattern 6: Recurring Weekly Themes (topics appearing in multiple weeks)
    const weeklyTopics = new Map<string, Set<string>>();
    
    insights.forEach(insight => {
      const topic = insight.topics?.name;
      if (!topic) return;
      
      const weekKey = getWeekKey(new Date(insight.created_at));
      if (!weeklyTopics.has(topic)) {
        weeklyTopics.set(topic, new Set());
      }
      weeklyTopics.get(topic)!.add(weekKey);
    });
    
    // Find topics that appear in 2+ weeks
    const recurringTopics = Array.from(weeklyTopics.entries())
      .filter(([_, weeks]) => weeks.size >= 2)
      .sort((a, b) => b[1].size - a[1].size);
    
    if (recurringTopics.length > 0) {
      const [topTopic, weeks] = recurringTopics[0];
      const topicInsights = insights.filter(i => i.topics?.name === topTopic);
      
      foundPatterns.push({
        theme: "Recurring Theme",
        description: `"${topTopic}" spans ${weeks.size} weeks—a core thread`,
        strength: Math.min(100, weeks.size * 25 + topicInsights.length * 5),
        patternType: "recurring",
        nodes: topicInsights.slice(0, 3).map(i => ({
          id: i.id,
          type: "insight" as const,
          title: i.title,
          date: i.created_at,
          topic: i.topics?.name
        }))
      });
    }
    
    // Pattern 7: Action variety within dominant pillar
    if (dominantPillar && dominantPillar[1] >= 4) {
      const pillarActions = actions.filter(a => a.pillar === dominantPillar[0]);
      const uniqueActionTypes = new Set(pillarActions.map(a => 
        a.action_text.toLowerCase().split(" ").slice(0, 2).join(" ")
      ));
      
      if (uniqueActionTypes.size >= 3) {
        foundPatterns.push({
          theme: "Deep Practice",
          description: `${uniqueActionTypes.size} different approaches in ${dominantPillar[0]}`,
          strength: Math.min(90, uniqueActionTypes.size * 20),
          patternType: "focus",
          nodes: pillarActions.slice(0, 4).map(a => ({
            id: a.id,
            type: "action" as const,
            title: a.action_text,
            date: a.action_date,
            pillar: a.pillar || undefined
          }))
        });
      }
    }
    
    // Deduplicate similar patterns (keep highest strength)
    const deduped: WeavePattern[] = [];
    const seenThemes = new Set<string>();
    
    foundPatterns
      .sort((a, b) => b.strength - a.strength)
      .forEach(p => {
        const key = p.theme.toLowerCase().replace(/\s+/g, "");
        if (!seenThemes.has(key)) {
          seenThemes.add(key);
          deduped.push(p);
        }
      });
    
    return deduped.slice(0, 6);
  }, [insights, actions, experiments, identityKeywords]);

  // Calculate overall weave score
  const weaveScore = useMemo(() => {
    if (patterns.length === 0) return 0;
    
    // Weight by pattern type
    const weightedSum = patterns.reduce((sum, p) => {
      const typeWeight = p.patternType === "imbalance" ? 0.5 : 1;
      return sum + (p.strength * typeWeight);
    }, 0);
    
    const avgStrength = weightedSum / patterns.length;
    const diversityBonus = Math.min(25, patterns.length * 8);
    const connectionBonus = patterns.filter(p => 
      p.patternType === "connection" || p.patternType === "experiment-insight"
    ).length * 5;
    
    return Math.min(100, Math.round(avgStrength * 0.6 + diversityBonus + connectionBonus));
  }, [patterns]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "insight": return <Lightbulb className="h-3 w-3" />;
      case "action": return <Target className="h-3 w-3" />;
      case "experiment": return <Beaker className="h-3 w-3" />;
      case "warning": return <AlertTriangle className="h-3 w-3" />;
      default: return <Brain className="h-3 w-3" />;
    }
  };

  const getPatternIcon = (patternType: string) => {
    switch (patternType) {
      case "connection": return <Link2 className="h-3.5 w-3.5" />;
      case "focus": return <Target className="h-3.5 w-3.5" />;
      case "imbalance": return <AlertTriangle className="h-3.5 w-3.5" />;
      case "recurring": return <Calendar className="h-3.5 w-3.5" />;
      case "experiment-insight": return <Zap className="h-3.5 w-3.5" />;
      default: return <Repeat className="h-3.5 w-3.5" />;
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
            Active Patterns ({patterns.length})
          </p>
        </div>
        
        <div className="space-y-3">
          {patterns.map((pattern, idx) => (
            <motion.div
              key={`${pattern.theme}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`p-3 rounded-lg border space-y-2 ${
                pattern.patternType === "imbalance" 
                  ? "bg-destructive/5 border-destructive/20" 
                  : "bg-muted/20 border-border/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={pattern.patternType === "imbalance" ? "text-destructive" : "text-primary"}>
                    {getPatternIcon(pattern.patternType)}
                  </span>
                  <p className="text-sm font-medium text-foreground">{pattern.theme}</p>
                </div>
                <div className="flex items-center gap-1">
                  <div className={`h-1.5 rounded-full w-12 ${
                    pattern.patternType === "imbalance" ? "bg-destructive/20" : "bg-primary/30"
                  }`}>
                    <motion.div 
                      className={`h-full rounded-full ${
                        pattern.patternType === "imbalance" ? "bg-destructive" : "bg-primary"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pattern.strength}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.08 }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{pattern.description}</p>
              
              {/* Connected nodes visualization */}
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {pattern.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${
                      node.type === "warning" 
                        ? "bg-destructive/10 border-destructive/30 text-destructive" 
                        : "bg-background/60 border-border/40 text-muted-foreground"
                    }`}
                  >
                    {getNodeIcon(node.type)}
                    <span className="truncate max-w-[100px]">
                      {node.title.slice(0, 20)}{node.title.length > 20 ? "…" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dynamic Insight based on patterns */}
      <div className="p-3 rounded-lg border border-dashed border-primary/20 bg-primary/5">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Weave insight:</span>{" "}
            {generateInsight(patterns)}
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper: Get week key for grouping
function getWeekKey(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber}`;
}

// Helper: Generate contextual insight
function generateInsight(patterns: WeavePattern[]): string {
  const hasImbalance = patterns.some(p => p.patternType === "imbalance");
  const hasExperimentInsight = patterns.some(p => p.patternType === "experiment-insight");
  const hasRecurring = patterns.some(p => p.patternType === "recurring");
  const connectionCount = patterns.filter(p => p.patternType === "connection").length;
  
  if (hasImbalance && patterns.length <= 2) {
    return "Some pillars are quiet. Small actions there could unlock new patterns.";
  }
  
  if (hasExperimentInsight && hasRecurring) {
    return "Your experiments are connected to recurring themes. This is compound growth.";
  }
  
  if (hasRecurring && connectionCount >= 2) {
    return "Core themes are emerging across weeks. You're building real depth.";
  }
  
  if (connectionCount >= 2) {
    return "Multiple loops are active: learning → doing → learning. The system is working.";
  }
  
  if (patterns.length === 1) {
    return "One pattern is emerging. Keep building on it—more connections will form.";
  }
  
  if (patterns.length >= 4) {
    return "Rich pattern density. Your actions, insights, and experiments are weaving together.";
  }
  
  return "Patterns are forming. Each action and insight strengthens the weave.";
}